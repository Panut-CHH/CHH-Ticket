"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  ChevronLeft, RefreshCw, Download, CheckCircle2, AlertTriangle,
  ClipboardList, Wrench, Users, Building2, Clock
} from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { supabase } from "@/utils/supabaseClient";

// --- helpers ---------------------------------------------------------------

// Format Date as YYYY-MM-DD in LOCAL time (avoids UTC shifting in +7 tz)
function toYmd(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// Parse YYYY-MM-DD as LOCAL midnight (so start/endOfDay work naturally)
function parseYmd(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }

// Supabase pagination helper — production factory scale: never assume <1000 rows
async function paginateSelect(buildQuery, pageSize = 1000) {
  let all = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = buildQuery().range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = data || [];
    all = all.concat(chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// chunk IN() filter to avoid huge URLs / Supabase limits
async function paginateInSelect(ids, buildQueryForChunk, chunkSize = 200) {
  if (!ids || ids.length === 0) return [];
  const unique = Array.from(new Set(ids));
  let all = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const chunkRows = await paginateSelect(() => buildQueryForChunk(chunk));
    all = all.concat(chunkRows);
  }
  return all;
}

function isStructureName(name) {
  return /ประกอบโครง/.test(String(name || ''));
}

function fmtPct(numer, denom) {
  if (!denom) return '0%';
  return `${((numer / denom) * 100).toFixed(1)}%`;
}

// --- main component --------------------------------------------------------

function QCKpiContent() {
  // --- filters ---
  const today = useMemo(() => startOfDay(new Date()), []);
  const [fromDate, setFromDate] = useState(() => toYmd(addDays(today, -6))); // 7 days
  const [toDate, setToDate]     = useState(() => toYmd(today));
  const [slaHours, setSlaHours] = useState(4);
  const [activePreset, setActivePreset] = useState('7d');
  const [stationFilterId, setStationFilterId] = useState(''); // filter by prev-station
  const [inspectorFilterId, setInspectorFilterId] = useState('');

  // --- data ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionsEnriched, setSessionsEnriched] = useState([]); // [{ ... per session, actual_qty, prev_station_id, prev_station_name, arrival_at, elapsed_hours, inspector_id, inspector_name }]
  const [pendingByPrev, setPendingByPrev] = useState([]); // [{ prev_station_id, prev_station_name, qty }]
  const [stationsList, setStationsList] = useState([]);
  const [inspectorsList, setInspectorsList] = useState([]);

  const applyPreset = (key) => {
    const now = startOfDay(new Date());
    let f = now, t = now;
    if (key === 'today')   { f = now; t = now; }
    if (key === '7d')      { f = addDays(now, -6); t = now; }
    if (key === '30d')     { f = addDays(now, -29); t = now; }
    if (key === 'month')   { f = new Date(now.getFullYear(), now.getMonth(), 1); t = now; }
    setFromDate(toYmd(f));
    setToDate(toYmd(t));
    setActivePreset(key);
  };

  // --- data loader ---
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const fromDt = parseYmd(fromDate);
      const toDt   = parseYmd(toDate);
      if (!fromDt || !toDt) {
        setError('กรุณาเลือกช่วงเวลาที่ถูกต้อง');
        setLoading(false);
        return;
      }
      const fromIso = startOfDay(fromDt).toISOString();
      const toIso   = endOfDay(toDt).toISOString();

      // 1) sessions in range
      const sessions = await paginateSelect(() =>
        supabase
          .from('qc_sessions')
          .select('id, ticket_no, station_id, step_order, qc_task_uuid, inspector_id, inspector, created_at, completed_at')
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
      );

      if (sessions.length === 0) {
        setSessionsEnriched([]);
        // still compute backlog (not date-bounded)
        await loadBacklog();
        return;
      }

      // 2) qc_rows for actual_qty (SUM by session)
      const sessionIds = sessions.map(s => s.id);
      const rows = await paginateInSelect(sessionIds, (chunk) =>
        supabase.from('qc_rows')
          .select('id, session_id, sample_qty, actual_qty, pass')
          .in('session_id', chunk)
          .order('id', { ascending: true })
      );
      const qtyBySession = {};
      (rows || []).forEach(r => {
        const key = r.session_id;
        if (!qtyBySession[key]) qtyBySession[key] = 0;
        // use actual_qty (inspected); fallback to sample_qty
        const q = (typeof r.actual_qty === 'number' ? r.actual_qty :
                  (typeof r.sample_qty === 'number' ? r.sample_qty : 0));
        qtyBySession[key] += q || 0;
      });

      // 3) flows for the related tickets (to resolve prev-station & arrival_at)
      const ticketNos = sessions.map(s => s.ticket_no).filter(Boolean);
      const flows = await paginateInSelect(ticketNos, (chunk) =>
        supabase.from('ticket_station_flow')
          .select('id, ticket_no, station_id, step_order, status, started_at, completed_at, updated_at, qc_task_uuid, stations(name_th, code)')
          .in('ticket_no', chunk)
          .order('step_order', { ascending: true })
          .order('id', { ascending: true })
      );
      const flowByTicket = {};
      (flows || []).forEach(f => {
        const k = String(f.ticket_no);
        if (!flowByTicket[k]) flowByTicket[k] = [];
        flowByTicket[k].push(f);
      });

      // 4) look up all distinct station_ids and inspector_ids for labels
      const allStationIds = new Set();
      (flows || []).forEach(f => { if (f.station_id) allStationIds.add(f.station_id); });
      sessions.forEach(s => { if (s.station_id) allStationIds.add(s.station_id); });
      const inspectorIds = Array.from(new Set(sessions.map(s => s.inspector_id).filter(Boolean)));

      const [stationsAll, usersRes] = await Promise.all([
        paginateSelect(() =>
          supabase.from('stations').select('id, name_th, name_en, code').order('name_th')
        ),
        inspectorIds.length > 0
          ? paginateInSelect(inspectorIds, (chunk) =>
              supabase.from('users').select('id, name, email').in('id', chunk))
          : Promise.resolve([]),
      ]);
      const stationMap = {};
      (stationsAll || []).forEach(s => { stationMap[s.id] = s; });
      const userMap = {};
      (usersRes || []).forEach(u => { userMap[u.id] = u; });
      setStationsList(stationsAll || []);

      // 5) enrich each session
      const enriched = sessions.map(s => {
        const list = flowByTicket[String(s.ticket_no)] || [];
        // find QC step: match by qc_task_uuid first, fallback to (station_id, step_order)
        let qcIdx = list.findIndex(f => s.qc_task_uuid && f.qc_task_uuid === s.qc_task_uuid);
        if (qcIdx < 0 && s.step_order) {
          qcIdx = list.findIndex(f => f.step_order === s.step_order && f.station_id === s.station_id);
        }
        const prev = qcIdx > 0 ? list[qcIdx - 1] : null;
        const prevStation = prev?.station_id ? stationMap[prev.station_id] : null;
        const prevName = prev?.stations?.name_th || prevStation?.name_th || prev?.stations?.code || '-';
        const prevStationId = prev?.station_id || null;
        const arrivalAtRaw = prev?.completed_at || prev?.updated_at || null;
        const arrivalAt = arrivalAtRaw ? new Date(arrivalAtRaw) : null;
        const inspectedAt = new Date(s.created_at);
        const elapsedHours = arrivalAt
          ? Math.max(0, (inspectedAt.getTime() - arrivalAt.getTime()) / 3600000)
          : null;
        const qty = qtyBySession[s.id] || 0;
        const inspector = s.inspector_id ? (userMap[s.inspector_id]?.name || userMap[s.inspector_id]?.email) : null;
        return {
          sessionId: s.id,
          ticketNo: s.ticket_no,
          createdAt: s.created_at,
          qty,
          prevStationId,
          prevStationName: prevName,
          isStructure: isStructureName(prevName),
          arrivalAt: arrivalAtRaw,
          elapsedHours,
          inspectorId: s.inspector_id || null,
          inspectorName: inspector || s.inspector || '-',
        };
      });
      setSessionsEnriched(enriched);

      // inspector list for filter (sorted unique)
      const inspSet = {};
      enriched.forEach(e => {
        if (e.inspectorId) inspSet[e.inspectorId] = e.inspectorName;
      });
      setInspectorsList(Object.entries(inspSet).map(([id, name]) => ({ id, name })).sort((a,b)=>a.name.localeCompare(b.name)));

      // 6) backlog (ค้างตรวจ) — independent of date range; shows current pending QC
      await loadBacklog(stationMap);
    } catch (e) {
      console.error('[QC KPI] load failed', e);
      setError(e?.message || 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  const loadBacklog = useCallback(async (stationMapArg) => {
    // Pending QC steps: status != completed, step name contains QC, remaining > 0
    const qcFlows = await paginateSelect(() =>
      supabase.from('ticket_station_flow')
        .select('id, ticket_no, station_id, step_order, status, available_qty, completed_qty, stations(name_th, code)')
        .neq('status', 'completed')
        .order('ticket_no', { ascending: true })
        .order('step_order', { ascending: true })
        .order('id', { ascending: true })
    );
    const qcOnly = (qcFlows || []).filter(f => {
      const name = String(f.stations?.name_th || f.stations?.code || '').toUpperCase();
      if (!name.includes('QC')) return false;
      const remaining = (f.available_qty ?? 0) - (f.completed_qty ?? 0);
      return remaining > 0;
    });

    if (qcOnly.length === 0) { setPendingByPrev([]); return; }

    // need prev step for each pending QC row
    const ticketNos = Array.from(new Set(qcOnly.map(f => f.ticket_no)));
    const allFlowsForPrev = await paginateInSelect(ticketNos, (chunk) =>
      supabase.from('ticket_station_flow')
        .select('id, ticket_no, station_id, step_order, stations(name_th, code)')
        .in('ticket_no', chunk)
        .order('step_order', { ascending: true })
        .order('id', { ascending: true })
    );
    const byTicket = {};
    (allFlowsForPrev || []).forEach(f => {
      const k = String(f.ticket_no);
      if (!byTicket[k]) byTicket[k] = [];
      byTicket[k].push(f);
    });

    const groups = {};
    qcOnly.forEach(f => {
      const list = byTicket[String(f.ticket_no)] || [];
      const idx = list.findIndex(x => x.step_order === f.step_order && x.station_id === f.station_id);
      const prev = idx > 0 ? list[idx - 1] : null;
      const prevName = prev?.stations?.name_th || prev?.stations?.code || 'ไม่ระบุสถานี';
      const prevId = prev?.station_id || null;
      const remaining = (f.available_qty ?? 0) - (f.completed_qty ?? 0);
      const key = prevId || `_${prevName}`;
      if (!groups[key]) groups[key] = { prev_station_id: prevId, prev_station_name: prevName, qty: 0 };
      groups[key].qty += remaining;
    });
    setPendingByPrev(Object.values(groups).sort((a,b) => b.qty - a.qty));
  }, []);

  useEffect(() => { load(); }, [load]);

  // --- filtered view (apply station/inspector filters) ---
  const view = useMemo(() => {
    let s = sessionsEnriched;
    if (stationFilterId) s = s.filter(e => String(e.prevStationId || '') === String(stationFilterId));
    if (inspectorFilterId) s = s.filter(e => String(e.inspectorId || '') === String(inspectorFilterId));
    return s;
  }, [sessionsEnriched, stationFilterId, inspectorFilterId]);

  // --- aggregations ---
  const summary = useMemo(() => {
    let total = 0, onTime = 0, late = 0, unknown = 0, structure = 0;
    view.forEach(e => {
      total += e.qty;
      if (e.elapsedHours == null) unknown += e.qty;
      else if (e.elapsedHours <= slaHours) onTime += e.qty;
      else late += e.qty;
      if (e.isStructure) structure += e.qty;
    });
    const pendingTotal = (stationFilterId
      ? pendingByPrev.filter(p => String(p.prev_station_id || '') === String(stationFilterId))
      : pendingByPrev
    ).reduce((s, p) => s + (p.qty || 0), 0);
    return { total, onTime, late, unknown, structure, pendingTotal };
  }, [view, slaHours, pendingByPrev, stationFilterId]);

  const byStation = useMemo(() => {
    const map = {};
    view.forEach(e => {
      const key = e.prevStationId || `_${e.prevStationName}`;
      if (!map[key]) map[key] = {
        prev_station_id: e.prevStationId,
        prev_station_name: e.prevStationName,
        total: 0, onTime: 0, late: 0, unknown: 0,
      };
      const g = map[key];
      g.total += e.qty;
      if (e.elapsedHours == null) g.unknown += e.qty;
      else if (e.elapsedHours <= slaHours) g.onTime += e.qty;
      else g.late += e.qty;
    });
    // attach pending from pendingByPrev
    pendingByPrev.forEach(p => {
      const key = p.prev_station_id || `_${p.prev_station_name}`;
      if (!map[key]) map[key] = {
        prev_station_id: p.prev_station_id,
        prev_station_name: p.prev_station_name,
        total: 0, onTime: 0, late: 0, unknown: 0,
      };
      map[key].pending = p.qty;
    });
    Object.values(map).forEach(g => { if (g.pending == null) g.pending = 0; });
    return Object.values(map).sort((a,b) => b.total - a.total);
  }, [view, slaHours, pendingByPrev]);

  const byInspector = useMemo(() => {
    const map = {};
    view.forEach(e => {
      const key = e.inspectorId || `_${e.inspectorName}`;
      if (!map[key]) map[key] = {
        inspector_id: e.inspectorId,
        inspector_name: e.inspectorName,
        total: 0, onTime: 0, late: 0, unknown: 0, structure: 0,
      };
      const g = map[key];
      g.total += e.qty;
      if (e.elapsedHours == null) g.unknown += e.qty;
      else if (e.elapsedHours <= slaHours) g.onTime += e.qty;
      else g.late += e.qty;
      if (e.isStructure) g.structure += e.qty;
    });
    return Object.values(map).sort((a,b) => b.total - a.total);
  }, [view, slaHours]);

  // --- CSV export ---
  const exportCsv = () => {
    const header = ['type','name','total','on_time','late','unknown','pending','structure'];
    const rows = [];
    byStation.forEach(g => rows.push(['station', g.prev_station_name, g.total, g.onTime, g.late, g.unknown, g.pending, '']));
    byInspector.forEach(g => rows.push(['inspector', g.inspector_name, g.total, g.onTime, g.late, g.unknown, '', g.structure]));
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(["\ufeff", csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `qc_kpi_${fromDate}_${toDate}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8 animate-fadeInUp">
      {/* Header */}
      <header className="mb-4 sm:mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/qc" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 inline-flex items-center gap-1 text-sm">
              <ChevronLeft className="w-4 h-4" /> กลับหน้า QC
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">QC KPI Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">สรุปประสิทธิภาพการตรวจของ QC — แยกสถานีและผู้ตรวจ</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
          <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">ตั้งแต่</label>
            <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setActivePreset('custom'); }}
              className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">ถึง</label>
            <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setActivePreset('custom'); }}
              className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">SLA (ชั่วโมง)</label>
            <input type="number" min={0.5} step={0.5} value={slaHours} onChange={(e) => setSlaHours(Math.max(0.1, Number(e.target.value) || 0))}
              className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Quick range</label>
            <div className="flex gap-1 flex-wrap">
              {[
                ['today','วันนี้'],['7d','7 วัน'],['30d','30 วัน'],['month','เดือนนี้'],
              ].map(([k, label]) => (
                <button key={k} onClick={() => applyPreset(k)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium ${activePreset === k ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600'}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">สถานี (ก่อน QC)</label>
            <select value={stationFilterId} onChange={(e) => setStationFilterId(e.target.value)}
              className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700 text-sm">
              <option value="">ทุกสถานี</option>
              {stationsList.map(s => (
                <option key={s.id} value={s.id}>{s.name_th || s.name_en || s.code}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">ผู้ตรวจ</label>
            <select value={inspectorFilterId} onChange={(e) => setInspectorFilterId(e.target.value)}
              className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700 text-sm">
              <option value="">ทุกคน</option>
              {inspectorsList.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {!!error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <SummaryCard
          icon={ClipboardList}
          iconClass="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
          title="ต้องตรวจทั้งหมด"
          value={summary.total.toLocaleString()}
          unit="ชิ้น"
          extra={`ค้างตรวจปัจจุบัน: ${summary.pendingTotal.toLocaleString()} ชิ้น`}
        />
        <SummaryCard
          icon={CheckCircle2}
          iconClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          title="ตรวจทันเวลา"
          value={summary.onTime.toLocaleString()}
          unit="ชิ้น"
          extra={fmtPct(summary.onTime, summary.total)}
        />
        <SummaryCard
          icon={AlertTriangle}
          iconClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          title="ตรวจไม่ทันเวลา"
          value={summary.late.toLocaleString()}
          unit="ชิ้น"
          extra={fmtPct(summary.late, summary.total)}
        />
        <SummaryCard
          icon={Wrench}
          iconClass="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
          title="ตรวจโครงสร้าง"
          value={summary.structure.toLocaleString()}
          unit="ชิ้น"
          extra={fmtPct(summary.structure, summary.total)}
        />
      </div>

      {/* SLA note + unknown warning */}
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        <Clock className="w-3 h-3 inline mr-1" />
        นิยาม: "ตรวจทัน" = สร้าง QC session ภายใน {slaHours} ชม. หลังสถานีก่อนหน้าส่งถึง QC (นับเป็นชั่วโมงจริง ไม่ตัดช่วงพัก/วันหยุด)
        {summary.unknown > 0 && (
          <span className="ml-2 text-amber-600 dark:text-amber-400">
            · {summary.unknown.toLocaleString()} ชิ้น ไม่มีข้อมูลเวลามาถึง (ไม่นับใน on-time/late)
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="mb-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 text-sm text-gray-600 dark:text-gray-300 text-center">
          <RefreshCw className="w-4 h-4 animate-spin inline mr-2" /> กำลังโหลดข้อมูล...
        </div>
      )}

      {/* By station */}
      <SectionTable
        icon={Building2}
        title="แยกตามสถานี (ก่อน QC)"
        columns={['สถานี', 'ต้องตรวจ', 'ทัน', 'ไม่ทัน', 'ไม่มีเวลา', 'อัตราทัน', 'ค้างตรวจ']}
        rows={byStation.map(g => [
          <RowLabel key="n" label={g.prev_station_name} isStructure={isStructureName(g.prev_station_name)} />,
          g.total.toLocaleString(),
          <span key="o" className="text-emerald-700 dark:text-emerald-400 font-medium">{g.onTime.toLocaleString()}</span>,
          <span key="l" className="text-amber-700 dark:text-amber-400 font-medium">{g.late.toLocaleString()}</span>,
          <span key="u" className="text-gray-500">{g.unknown.toLocaleString()}</span>,
          <OnTimeBar key="b" onTime={g.onTime} total={g.onTime + g.late} />,
          <span key="p" className={`${g.pending > 0 ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-gray-400'}`}>{g.pending.toLocaleString()}</span>,
        ])}
        emptyText="ไม่มีข้อมูลในช่วงเวลานี้"
      />

      <div className="h-4" />

      {/* By inspector */}
      <SectionTable
        icon={Users}
        title="แยกตามผู้ตรวจ"
        columns={['ผู้ตรวจ', 'ต้องตรวจ', 'ทัน', 'ไม่ทัน', 'ไม่มีเวลา', 'อัตราทัน', 'โครงสร้าง']}
        rows={byInspector.map(g => [
          g.inspector_name || '-',
          g.total.toLocaleString(),
          <span key="o" className="text-emerald-700 dark:text-emerald-400 font-medium">{g.onTime.toLocaleString()}</span>,
          <span key="l" className="text-amber-700 dark:text-amber-400 font-medium">{g.late.toLocaleString()}</span>,
          <span key="u" className="text-gray-500">{g.unknown.toLocaleString()}</span>,
          <OnTimeBar key="b" onTime={g.onTime} total={g.onTime + g.late} />,
          <span key="s" className="text-purple-700 dark:text-purple-400">{g.structure.toLocaleString()}</span>,
        ])}
        emptyText="ไม่มีข้อมูลในช่วงเวลานี้"
      />
    </div>
  );
}

// --- small UI pieces -------------------------------------------------------

function SummaryCard({ icon: Icon, iconClass, title, value, unit, extra }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-slate-700 p-4 sm:p-5 bg-white dark:bg-slate-800 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] sm:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">{title}</div>
          <div className="mt-2 text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-gray-100">{value}<span className="text-sm font-normal text-gray-500 ml-1">{unit}</span></div>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {extra && <div className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300">{extra}</div>}
    </div>
  );
}

function SectionTable({ icon: Icon, title, columns, rows, emptyText }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-sm">
      <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
        <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        <div className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-100">{title}</div>
        <div className="ml-auto text-xs text-gray-400">{rows.length} รายการ</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-900/30">
              {columns.map((c, i) => (
                <th key={i} className={`px-4 py-2.5 font-medium ${i === 0 ? '' : 'text-right'}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{emptyText}</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                {r.map((cell, j) => (
                  <td key={j} className={`px-4 py-2.5 ${j === 0 ? 'text-gray-900 dark:text-gray-100' : 'text-right tabular-nums'}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OnTimeBar({ onTime, total }) {
  const pct = total > 0 ? Math.round((onTime / total) * 100) : 0;
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="inline-flex items-center gap-2 justify-end w-full">
      <div className="w-24 h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-700 dark:text-gray-300 tabular-nums w-12 text-right">{pct}%</span>
    </div>
  );
}

function RowLabel({ label, isStructure }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-gray-900 dark:text-gray-100">{label}</span>
      {isStructure && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">โครงสร้าง</span>
      )}
    </div>
  );
}

// --- page wrapper ----------------------------------------------------------

export default function QCKpiPage() {
  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/qc">
        <QCKpiContent />
      </RoleGuard>
    </ProtectedRoute>
  );
}
