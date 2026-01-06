"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { Search, CheckCircle2, Clock, Tag, Ticket as TicketIcon, AlertTriangle, PlayCircle } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { supabase } from "@/utils/supabaseClient";
import { loadActiveQcQueue } from "@/utils/ticketsDb";

// DB-first: no ERP mapping here

export default function QCPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  // Removed: showPendingOnly filter; queue already excludes completed items
  // Fixed design style: chip
  const [designMode, setDesignMode] = useState("chip");

  // Lock style to chip (ignore query/localStorage)
  useEffect(() => { setDesignMode('chip'); }, []);
  const [tickets, setTickets] = useState([]);
  const [allQcTickets, setAllQcTickets] = useState([]);
  const [archivedTickets, setArchivedTickets] = useState([]);
  const [assignmentMapState, setAssignmentMapState] = useState({}); // key: `${ticket_no}-${station_id}` -> technician name
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'archive' | 'history'
  // allow deep-link via ?tab=queue|archive|history
  useEffect(() => {
    try {
      const tab = (searchParams?.get?.('tab') || '').toLowerCase();
      if (['queue','archive','history'].includes(tab)) setActiveTab(tab);
    } catch {}
  }, [searchParams]);
  // History tab states
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const pageSize = 25;
  const [stations, setStations] = useState([]);
  const [historySessions, setHistorySessions] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [inspectorMap, setInspectorMap] = useState({}); // id -> display name
  const [historyFilters, setHistoryFilters] = useState({ ticketNo: '', stationId: '', from: '', to: '', inspector: '' });
  // Queue filters/sort
  const [queueSort, setQueueSort] = useState('asc'); // 'asc' old first, 'desc' new first
  const [queueFrom, setQueueFrom] = useState(''); // yyyy-mm-dd
  const [queueTo, setQueueTo] = useState(''); // yyyy-mm-dd
  const [queueStationId, setQueueStationId] = useState(''); // station id (pre-QC)
  const [queueTechnician, setQueueTechnician] = useState(''); // technician display name (pre-QC)
  // Today QC summary
  const [todayPass, setTodayPass] = useState(0);
  const [todayFail, setTodayFail] = useState(0);
  const [todaySessions, setTodaySessions] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const { tickets: merged, qcTickets, assignmentMap } = await loadActiveQcQueue();
      setTickets(merged);
      setAssignmentMapState(assignmentMap);

      // Archive: tickets ที่ QC เป็น completed แล้ว
      const qcArchived = merged.filter(t => {
        const steps = Array.isArray(t.roadmap) ? t.roadmap : [];
        if (steps.length === 0) return false;
        const qcSteps = steps.filter(s => String(s.step || '').toUpperCase().includes('QC'));
        if (qcSteps.length === 0) return false;
        return qcSteps.every(s => (s.status || 'pending') === 'completed');
      });

      setAllQcTickets(qcTickets);
      setArchivedTickets(qcArchived);
    } catch (e) {
      setError(e?.message || 'Failed to load QC data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        await load();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Load stations for filters (once)
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('stations').select('id,name_th,name_en').order('name_th');
        if (!error && Array.isArray(data)) setStations(data);
      } catch {}
    })();
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      setHistoryError("");
      
      // If filtering by station or inspector (client-side), load all data first
      // Otherwise, use pagination
      const needsClientSideFilter = historyFilters.stationId || historyFilters.inspector;
      const fromIdx = needsClientSideFilter ? 0 : (historyPage - 1) * pageSize;
      const toIdx = needsClientSideFilter ? 9999 : (fromIdx + pageSize - 1);
      
      let query = supabase
        .from('qc_sessions')
        .select('id,ticket_no,station_id,station,qc_task_uuid,created_at,inspector_id,inspector', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(fromIdx, toIdx);

      if (historyFilters.ticketNo) {
        query = query.ilike('ticket_no', `%${historyFilters.ticketNo}%`);
      }
      // Note: station filter is applied client-side after loading previous station data
      // because we need to filter by previous station (the one that sent to QC), not QC station itself
      if (historyFilters.from) {
        const fromIso = new Date(historyFilters.from).toISOString();
        query = query.gte('created_at', fromIso);
      }
      if (historyFilters.to) {
        const toDate = new Date(historyFilters.to);
        toDate.setHours(23,59,59,999);
        query = query.lte('created_at', toDate.toISOString());
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const inspectorIds = Array.from(new Set((data || []).map((d) => d.inspector_id).filter(Boolean)));
      let inspectorMapLocal = {};
      if (inspectorIds.length > 0) {
        const { data: users, error: userErr } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', inspectorIds);
        if (!userErr && Array.isArray(users)) {
          inspectorMapLocal = users.reduce((acc, u) => {
            acc[u.id] = u.name || u.email || u.id;
            return acc;
          }, {});
          setInspectorMap((prev) => ({ ...prev, ...inspectorMapLocal }));
        }
      }

      // Compute target station (previous step before QC) using flows
      const ticketNos = Array.from(new Set((data || []).map((d) => d.ticket_no))).filter(Boolean);
      let prevStationByQcTask = {}; // qc_task_uuid -> station name
      let prevStationIdByQcTask = {}; // qc_task_uuid -> station_id
      if (ticketNos.length > 0) {
        const { data: flows } = await supabase
          .from('ticket_station_flow')
          .select('ticket_no, step_order, station_id, qc_task_uuid, stations(name_th, code)')
          .in('ticket_no', ticketNos)
          .order('step_order', { ascending: true });
        const byTicket = flows?.reduce((acc, f) => {
          const key = String(f.ticket_no);
          acc[key] = acc[key] || [];
          acc[key].push(f);
          return acc;
        }, {}) || {};
        Object.values(byTicket).forEach(list => {
          // ใช้ลำดับภายในรายการ เผื่อกรณี step_order เป็น null
          for (let i = 0; i < list.length; i++) {
            const f = list[i];
            if (!f.qc_task_uuid) continue;
            const prev = i > 0 ? list[i - 1] : null;
            const name = prev?.stations?.name_th || prev?.stations?.code || null;
            if (name) prevStationByQcTask[f.qc_task_uuid] = name;
            if (prev?.station_id) prevStationIdByQcTask[f.qc_task_uuid] = prev.station_id;
          }
        });
      }

      const stationMap = stations.reduce((acc, s) => { acc[s.id] = s.name_th || s.name_en || s.id; return acc; }, {});
      let rows = (data || []).map((d) => ({
        ...d,
        station_name: prevStationByQcTask[d.qc_task_uuid] || stationMap[d.station_id] || d.station || d.station_id || '-',
        prev_station_id: prevStationIdByQcTask[d.qc_task_uuid] || null, // previous station ID for filtering
        inspector_name: inspectorMapLocal[d.inspector_id] || inspectorMap[d.inspector_id] || d.inspector || d.inspector_id || '-',
      }));

      // Filter by previous station (the station that sent to QC)
      if (historyFilters.stationId) {
        const stationIdStr = String(historyFilters.stationId).trim();
        if (stationIdStr) {
          rows = rows.filter((r) => {
            // Match by previous station_id (the station that sent to QC)
            const prevId = r.prev_station_id;
            return prevId && String(prevId) === stationIdStr;
          });
        }
      }

      // client-side filter by inspector text
      if (historyFilters.inspector) {
        const q = historyFilters.inspector.toLowerCase();
        rows = rows.filter((r) => String(r.inspector_name || '').toLowerCase().includes(q));
      }

      // Apply pagination if client-side filters are used
      const totalFiltered = rows.length;
      const paginatedRows = needsClientSideFilter 
        ? rows.slice((historyPage - 1) * pageSize, historyPage * pageSize)
        : rows;

      setHistorySessions(paginatedRows);
      // Use filtered rows count if client-side filters are applied, otherwise use DB count
      setHistoryTotal(needsClientSideFilter ? totalFiltered : (count || 0));
    } catch (e) {
      setHistoryError(e?.message || 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage, pageSize, historyFilters, stations]);

  const loadTodaySummary = useCallback(async () => {
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data: sessions, error: sessionsError } = await supabase
        .from('qc_sessions')
        .select('id')
        .gte('created_at', start.toISOString());
      if (sessionsError) throw sessionsError;
      const ids = Array.from(new Set((sessions || []).map((s) => s.id))).filter(Boolean);
      setTodaySessions(ids.length);
      if (ids.length === 0) {
        setTodayPass(0);
        setTodayFail(0);
        return;
      }
      const { data: rows, error: rowsError } = await supabase
        .from('qc_rows')
        .select('pass')
        .in('session_id', ids);
      if (rowsError) throw rowsError;
      const pass = (rows || []).filter((r) => r.pass === true).length;
      const fail = (rows || []).filter((r) => r.pass === false).length;
      setTodayPass(pass);
      setTodayFail(fail);
    } catch (e) {
      console.warn('Failed to load QC summary:', e?.message || e);
    }
  }, []);

  useEffect(() => {
    loadTodaySummary();
  }, [loadTodaySummary]);

  // Realtime: อัปเดตคิว QC ทันทีเมื่อมีการเปลี่ยนแปลงสถานะหรือบันทึก QC
  useEffect(() => {
    const channel = supabase
      .channel('qc-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_station_flow' }, async () => {
        // หน่วงเล็กน้อยเพื่อให้ DB commit เสร็จสมบูรณ์
        setTimeout(() => { load(); }, 250);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qc_sessions' }, async () => {
        setTimeout(() => {
          load();
          loadTodaySummary();
          if (activeTab === 'history') loadHistory();
        }, 250);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qc_rows' }, async () => {
        setTimeout(() => { loadTodaySummary(); }, 250);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_assignments' }, async () => {
        setTimeout(() => { load(); }, 250);
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [load, loadTodaySummary, activeTab, loadHistory]);

  const qcTickets = useMemo(() => {
    // Build date range (start-of-day, end-of-day)
    const startTs = queueFrom ? (() => { const d = new Date(queueFrom); d.setHours(0,0,0,0); return d.getTime(); })() : null;
    const endTs = queueTo ? (() => { const d = new Date(queueTo); d.setHours(23,59,59,999); return d.getTime(); })() : null;
    return allQcTickets
      .map((t) => {
        // คำนวณเวลาเข้าถึง QC จาก "ขั้นแรกที่ยังไม่เสร็จ" ถ้าเป็น QC
        const steps = Array.isArray(t.roadmap) ? t.roadmap : [];
        const firstActiveIdx = steps.findIndex(s => (s.status || 'pending') !== 'completed');
        const active = firstActiveIdx >= 0 ? steps[firstActiveIdx] : null;
        const arrival = active?.updatedAt ? new Date(active.updatedAt).getTime() : null;
        // หา QC step ปัจจุบัน (pending/current) และ previous station สำหรับการ filter
        const qcIdx = steps.findIndex(s => String(s.step || '').toUpperCase().includes('QC') && ['pending','current'].includes(s.status || 'pending'));
        const prev = qcIdx > 0 ? steps[qcIdx - 1] : null;
        const prevStationId = prev?.stationId || '';
        const prevStationName = prev?.step || '';
        const activeStatus = qcIdx >= 0 ? (steps[qcIdx]?.status || 'pending') : null;
        // Resolve technician name using assignmentMapState
        let technicianName = '';
        if (prev) {
          const idNorm = String(t.id).replace('#','');
          const keyExact = `${idNorm}-${prev.stationId}-${prev.stepOrder || 0}`;
          const keyNoOrder = `${idNorm}-${prev.stationId}-0`;
          technicianName = assignmentMapState[keyExact] || assignmentMapState[keyNoOrder] || '';
        }
        return {
          ...t,
          _qcArrivalTs: arrival,
          _prevStationId: prevStationId,
          _prevStationName: prevStationName,
          _technicianName: technicianName,
          _qcStatus: activeStatus
        };
      })
      .filter((t) => {
        const matchesSearch = (String(t.id) + (t.title || "")).toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;
        // If no date filters, include all
        if (!startTs && !endTs) return true;
        // If filtering by date, include only those with arrival timestamp
        if (!t._qcArrivalTs) return false;
        if (startTs && t._qcArrivalTs < startTs) return false;
        if (endTs && t._qcArrivalTs > endTs) return false;
        return true;
      })
      .filter((t) => {
        // Station filter (pre-QC station)
        if (queueStationId && String(t._prevStationId || '') !== String(queueStationId)) return false;
        // Technician filter
        if (queueTechnician && !String(t._technicianName || '').toLowerCase().includes(queueTechnician.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const A = a._qcArrivalTs ?? Number.MAX_SAFE_INTEGER;
        const B = b._qcArrivalTs ?? Number.MAX_SAFE_INTEGER;
        const comp = A - B; // เก่าอยู่บน
        return queueSort === 'asc' ? comp : -comp;
      });
  }, [searchTerm, allQcTickets, queueFrom, queueTo, queueSort, queueStationId, queueTechnician, assignmentMapState]);

  const ticketsToShow = useMemo(() => qcTickets, [qcTickets]);

  // Metrics
  const totalQueueCount = allQcTickets.length;
  const waitingCount = useMemo(() => qcTickets.filter((t) => (t._qcStatus || 'pending') === 'pending').length, [qcTickets]);
  const inProgressCount = useMemo(() => qcTickets.filter((t) => (t._qcStatus || 'pending') === 'current').length, [qcTickets]);
  const now = new Date();
  function daysUntil(dateStr) {
    if (!dateStr) return Infinity;
    const d = new Date(dateStr);
    return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  }
  const dueSoonThresholdDays = 3;
  const dueSoonTickets = useMemo(() => {
    return allQcTickets
      .filter((t) => t.dueDate)
      .map((t) => ({ ...t, days: daysUntil(t.dueDate) }))
      .filter((t) => t.days <= dueSoonThresholdDays && t.days >= -1)
      .sort((a, b) => a.days - b.days);
  }, [allQcTickets]);
  const overdueCount = useMemo(() => {
    return allQcTickets
      .filter((t) => t.dueDate)
      .reduce((count, ticket) => {
        const diff = daysUntil(ticket.dueDate);
        return diff < 0 ? count + 1 : count;
      }, 0);
  }, [allQcTickets]);

  const waitingPercent = totalQueueCount > 0 ? Math.round((waitingCount / totalQueueCount) * 100) : 0;
  const inProgressPercent = totalQueueCount > 0 ? Math.round((inProgressCount / totalQueueCount) * 100) : 0;
  const todayTotal = todayPass + todayFail;
  const todayPassRate = todayTotal > 0 ? Math.round((todayPass / todayTotal) * 100) : null;
  const summaryCards = useMemo(() => {
    return [
      {
        key: 'waiting',
        title: language === 'th' ? 'งานรอตรวจ' : 'Waiting for QC',
        value: waitingCount,
        subtitle: language === 'th'
          ? `ทั้งหมด ${totalQueueCount} งานในคิว`
          : `${totalQueueCount} tickets in queue`,
        extra: totalQueueCount > 0
          ? (language === 'th'
            ? `${waitingPercent}% ของงานทั้งหมดกำลังรอตรวจ`
            : `${waitingPercent}% of queue waiting`)
          : (language === 'th' ? 'ยังไม่มีงานในคิว' : 'No tickets in queue'),
        icon: TicketIcon,
        iconClass: 'bg-emerald-100 text-emerald-700',
        cardClass: 'border-emerald-200/70 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10'
      },
      {
        key: 'in-progress',
        title: language === 'th' ? 'กำลังดำเนินการ' : 'In Progress',
        value: inProgressCount,
        subtitle: language === 'th'
          ? `เริ่มตรวจแล้ว ${inProgressCount} งาน`
          : `${inProgressCount} active inspections`,
        extra: totalQueueCount > 0
          ? (language === 'th'
            ? `${inProgressPercent}% ของคิวกำลังตรวจ`
            : `${inProgressPercent}% of queue running`)
          : '',
        icon: PlayCircle,
        iconClass: 'bg-blue-100 text-blue-700',
        cardClass: 'border-blue-200/70 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/10'
      },
      {
        key: 'due-soon',
        title: language === 'th' ? 'ใกล้ Due Date' : 'Due Soon',
        value: dueSoonTickets.length,
        subtitle: language === 'th'
          ? 'ภายใน 3 วัน'
          : 'Within 3 days',
        extra: language === 'th'
          ? `เกินกำหนด ${overdueCount} งาน`
          : `${overdueCount} overdue`,
        icon: AlertTriangle,
        iconClass: 'bg-amber-100 text-amber-700',
        cardClass: 'border-amber-200/70 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10'
      },
      {
        key: 'today',
        title: language === 'th' ? 'เสร็จสิ้นวันนี้' : 'Completed Today',
        value: todaySessions,
        subtitle: language === 'th'
          ? `ผ่าน ${todayPass} • ไม่ผ่าน ${todayFail}`
          : `Pass ${todayPass} • Fail ${todayFail}`,
        extra: todayPassRate !== null
          ? (language === 'th'
            ? `อัตราผ่าน ${todayPassRate}%`
            : `Pass rate ${todayPassRate}%`)
          : (language === 'th' ? 'ยังไม่มีงานเสร็จวันนี้' : 'No inspections yet today'),
        icon: CheckCircle2,
        iconClass: 'bg-slate-200 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
        cardClass: 'border-slate-200/70 dark:border-emerald-500/30 bg-white dark:bg-slate-800'
      },
    ];
  }, [
    language,
    waitingCount,
    waitingPercent,
    totalQueueCount,
    inProgressCount,
    inProgressPercent,
    dueSoonTickets.length,
    overdueCount,
    todaySessions,
    todayPass,
    todayFail,
    todayPassRate,
  ]);

  // Load when switching to History tab or filters/page change
  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/qc">
        <div className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8 animate-fadeInUp">
      <header className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100">{t('qcQueue', language)}</h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 dark:text-gray-400 mt-2">{t('qcQueueDesc', language)}</p>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 -mx-3 sm:mx-0 px-3 sm:px-0">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap shrink-0 ${activeTab === 'queue' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300'}`}
        >{language === 'th' ? 'คิวที่ต้องตรวจ' : 'QC Queue'}</button>
        <button
          onClick={() => setActiveTab('archive')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap shrink-0 ${activeTab === 'archive' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300'}`}
        >{language === 'th' ? 'เก็บเอกสาร (ตรวจเสร็จ)' : 'Archive (Completed)'}</button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap shrink-0 ${activeTab === 'history' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300'}`}
          >{language === 'th' ? 'ประวัติการตรวจ' : 'QC History'}</button>
      </div>

      {loading && (
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-300">กำลังโหลดข้อมูลจริงจาก ERP และฐานข้อมูล…</div>
      )}
      {!!error && (
        <div className="mb-4 text-sm text-red-600">{error}</div>
      )}

      {/* Summary widgets (only queue tab) */}
      {activeTab === 'queue' && (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 ${card.cardClass}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] sm:text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {card.title}
                  </div>
                  <div className="mt-2 text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-gray-100">
                    {card.value}
                  </div>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.iconClass}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              {card.subtitle && (
                <div className="mt-3 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                  {card.subtitle}
                </div>
              )}
              {card.extra && (
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {card.extra}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* Due soon list */}
      {dueSoonTickets.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm mb-4 sm:mb-6">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200 font-medium text-sm sm:text-base">
              <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 text-amber-600" /> {t('nearDueDateSection', language)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('showItems', language)} {Math.min(5, dueSoonTickets.length)} {t('items', language)}</div>
          </div>
          <div className="divide-y divide-gray-100">
            {dueSoonTickets.slice(0, 5).map((ticket) => (
              <div key={ticket.id} className="py-2 flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="shrink-0 text-gray-900 dark:text-gray-100 font-medium">{ticket.id}</span>
                  <span className="truncate text-gray-600 dark:text-gray-400 hidden sm:inline">{ticket.title}</span>
                </div>
                <div className="shrink-0 inline-flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">{ticket.days === 0 ? (language === 'th' ? "วันนี้" : "Today") : ticket.days > 0 ? `${t('moreDays', language)} ${ticket.days} ${t('days', language)}` : `${language === 'th' ? 'เกินกำหนด' : 'Overdue'} ${Math.abs(ticket.days)} ${t('days', language)}`}</span>
                  <Link href={`/qc/${String(ticket.id).replace('#','')}`} className="text-emerald-700 hover:underline text-xs sm:text-sm">{t('inspect', language)}</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Waiting by Assignee (queue tab) */}
      {activeTab === 'queue' && (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm mb-4 sm:mb-6">
        <div className="text-gray-800 dark:text-gray-200 font-medium mb-2 sm:mb-3 text-sm sm:text-base">
          {language === 'th' ? 'งานรอตรวจ แยกตามสถานี' : 'Waiting by Station'}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(() => {
            const groups = ticketsToShow.reduce((acc, t) => {
              const key = t._prevStationName || (language === 'th' ? 'ไม่ระบุสถานี' : 'Unassigned station');
              if (!acc[key]) acc[key] = [];
              acc[key].push(t);
              return acc;
            }, {});
            const entries = Object.entries(groups);
            if (entries.length === 0) return <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{language === 'th' ? 'ไม่มีงานค้าง' : 'No pending work'}</div>;
            return entries.map(([name, list]) => (
              <div key={name} className="border border-gray-100 dark:border-slate-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100">{name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{list.length} {t('tasks', language)}</div>
                </div>
                <div className="space-y-2">
                  {list.map((ticket) => (
                    <div key={ticket.id} className="text-xs sm:text-sm flex items-center justify-between">
                      <div className="min-w-0 flex items-center gap-2 flex-1">
                        <span className="shrink-0 text-gray-800 dark:text-gray-200">{ticket.id}</span>
                        <span className="truncate text-gray-600 dark:text-gray-400 hidden sm:inline">{ticket.title}</span>
                        {ticket._technicianName && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hidden lg:inline">
                            {ticket._technicianName}
                          </span>
                        )}
                      </div>
                      <Link href={`/qc/${ticket.id.replace('#','')}`} className="text-emerald-700 hover:underline shrink-0 text-xs sm:text-sm">{t('inspect', language)}</Link>
                    </div>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      </div>
      )}

      {activeTab === 'queue' && (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-sm mb-4 sm:mb-6 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {language === 'th' ? 'กรองคิว QC' : 'Filter QC Queue'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {language === 'th' ? 'เลือกเงื่อนไขที่ต้องการเพื่อลดรายการ' : 'Refine the queue with these controls'}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {language === 'th' ? 'ค้นหา' : 'Search'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-gray-400" />
              </div>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={language === 'th' ? 'เลขตั๋วหรือชื่องาน' : 'Ticket number or name'}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 focus:bg-white dark:bg-slate-900/40 dark:focus:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {language === 'th' ? 'สถานีก่อนส่ง qc' : 'Pre-QC station'}
            </label>
            <select
              value={queueStationId}
              onChange={(e) => setQueueStationId(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 focus:bg-white dark:bg-slate-900/40 dark:focus:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm"
            >
              <option value="">{language === 'th' ? 'ทุกสถานี' : 'All stations'}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name_th || s.name_en || s.id}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {language === 'th' ? 'ชื่อช่าง' : 'Technician'}
            </label>
            <input
              value={queueTechnician}
              onChange={(e) => setQueueTechnician(e.target.value)}
              placeholder={language === 'th' ? 'พิมพ์เพื่อกรอง' : 'Type to filter'}
              className="w-full px-3 py-2.5 bg-gray-50 focus:bg-white dark:bg-slate-900/40 dark:focus:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {language === 'th' ? 'เรียงลำดับ' : 'Sort'}
            </label>
            <select
              value={queueSort}
              onChange={(e) => setQueueSort(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 focus:bg-white dark:bg-slate-900/40 dark:focus:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm"
            >
              <option value="asc">{language === 'th' ? 'เก่าก่อน' : 'Oldest first'}</option>
              <option value="desc">{language === 'th' ? 'ใหม่ก่อน' : 'Newest first'}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {language === 'th' ? 'ตั้งแต่วันที่' : 'From'}
            </label>
            <input
              type="date"
              value={queueFrom}
              onChange={(e) => setQueueFrom(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 focus:bg-white dark:bg-slate-900/40 dark:focus:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {language === 'th' ? 'ถึงวันที่' : 'To'}
            </label>
            <input
              type="date"
              value={queueTo}
              onChange={(e) => setQueueTo(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 focus:bg-white dark:bg-slate-900/40 dark:focus:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm"
            />
          </div>
        </div>
      </div>
      )}

      {activeTab === 'queue' ? (
      <div className="space-y-3">
        {ticketsToShow.map((ticket) => {
          const steps = Array.isArray(ticket.roadmap) ? ticket.roadmap : [];
          const next = steps.find((r) => r.status === "current") || steps.find((r) => r.status !== "completed");
          // ใช้ QC ตัวแรกที่ยังไม่เสร็จสิ้น (pending/current) เป็น active
          const qcIndex = steps.findIndex(s => String(s.step || '').toUpperCase().includes('QC') && ['pending','current'].includes(s.status || 'pending'));
          const isQCNow = qcIndex >= 0;
          const qcStep = isQCNow ? steps[qcIndex] : null;
          const prevStepName = qcIndex > 0 ? (steps[qcIndex - 1]?.step || '-') : '-';

          const renderQcTarget = () => {
            if (!qcStep) return null;
            const labelTh = 'สถานีที่ต้องตรวจ QC :';
            const labelEn = 'QC target station:';
            const label = language === 'th' ? labelTh : labelEn;

            const Chip = (
              <div className="mt-2 px-2 py-1 inline-flex items-center gap-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
                <span className="text-[11px] sm:text-xs font-semibold tracking-wide">{label}</span>
                <span className="text-[11px] sm:text-xs font-bold">{prevStepName}</span>
              </div>
            );
            return Chip;
          };
          return (
            <div key={ticket.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <TicketIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">{ticket.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${ticket.priorityClass}`}>{ticket.priority}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${ticket.routeClass}`}>{ticket.itemCode || '-'}</span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">{ticket.title}</div>
                    {/* แสดงสถานีที่มาตรวจ โดยอ้างอิงจากสถานีก่อนหน้า */}
                    {renderQcTarget()}
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400 shrink-0 self-center">
                  {/* Technician at previous station (the one that sent to QC) */}
                  <div className="inline-flex items-center gap-1">
                    <Tag className="w-3 h-3 sm:w-4 sm:h-4" />
                    {(() => {
                      const steps = Array.isArray(ticket.roadmap) ? ticket.roadmap : [];
                      const qcIdx = qcIndex;
                      const prev = qcIdx > 0 ? steps[qcIdx - 1] : null;
                      let techName = '';
                      if (prev) {
                        const idNorm = String(ticket.id).replace('#','');
                        const keyExact = `${idNorm}-${prev.stationId}-${prev.stepOrder || 0}`;
                        const keyNoOrder = `${idNorm}-${prev.stationId}-0`;
                        techName = assignmentMapState[keyExact] || assignmentMapState[keyNoOrder] || '';
                      }
                      return <span>{techName || '-'}</span>;
                    })()}
                  </div>
                  {/* Time arrived at QC (from QC step updatedAt) */}
                  <div className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                    {(() => {
                      const steps = Array.isArray(ticket.roadmap) ? ticket.roadmap : [];
                      const qcIdx = qcIndex;
                      const qc = qcIdx >= 0 ? steps[qcIdx] : null;
                      const ts = qc?.updatedAt ? new Date(qc.updatedAt) : null;
                      const text = ts ? ts.toLocaleString('th-TH', { hour12: false }) : '-';
                      return <span>{text}</span>;
                    })()}
                  </div>
                  {/* Desktop: Start/Continue button on far right */}
                  <Link
                    href={qcStep?.qcTaskUuid ? `/qc/task/${qcStep.qcTaskUuid}` : `/qc/${String(ticket.id).replace('#','')}`}
                    className={`ml-2 px-3 py-2 rounded-lg text-xs sm:text-sm text-center whitespace-nowrap ${
                      qcStep?.status === 'current' 
                        ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {qcStep?.status === 'current' 
                      ? (language === 'th' ? 'ดำเนินการต่อ' : 'Continue') 
                      : (language === 'th' ? 'เริ่ม QC' : 'Start QC')
                    }
                  </Link>
                </div>
              </div>

              <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                {qcStep && qcStep.status === 'current' && (
                  <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4" /> {language === 'th' ? 'กำลังตรวจสอบ' : 'In Progress'}
                  </span>
                )}
              </div>

              {/* Mobile: button full width below */}
              <div className="mt-2 sm:mt-3 flex items-center gap-2 md:hidden">
                <Link
                  href={qcStep?.qcTaskUuid ? `/qc/task/${qcStep.qcTaskUuid}` : `/qc/${String(ticket.id).replace('#','')}`}
                  className={`px-3 py-2 rounded-lg text-xs sm:text-sm w-full text-center ${
                    qcStep?.status === 'current' 
                      ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {qcStep?.status === 'current' 
                    ? (language === 'th' ? 'ดำเนินการต่อ' : 'Continue') 
                    : (language === 'th' ? 'เริ่ม QC' : 'Start QC')
                  }
                </Link>
              </div>
            </div>
          );
        })}

        {ticketsToShow.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8 sm:py-10 text-sm sm:text-base">{language === 'th' ? 'ยังไม่มีตั๋วที่ถึงขั้นตอน QC' : 'No tickets reached QC step yet'}</div>
        )}
      </div>
      ) : activeTab === 'archive' ? (
      // Archive list
      <div className="space-y-3">
        {archivedTickets.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8 sm:py-10 text-sm sm:text-base">{language === 'th' ? 'ยังไม่มีตั๋วที่ตรวจเสร็จ' : 'No completed QC records'}</div>
        ) : (
          archivedTickets.map((ticket) => (
            <div key={ticket.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 w-full sm:w-auto">
                  <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <TicketIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">{ticket.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${ticket.routeClass}`}>{ticket.route}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">{language === 'th' ? 'ตรวจเสร็จแล้ว' : 'QC Completed'}</span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">{ticket.title}</div>
                  </div>
                </div>
                <Link href={`/qc/${String(ticket.id).replace('#','')}`} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-gray-200 rounded-lg text-xs sm:text-sm w-full sm:w-auto text-center">
                  {language === 'th' ? 'ดูประวัติ QC' : 'View QC History'}
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
      ) : (
      // History tab
      <div className="space-y-3">
        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              value={historyFilters.ticketNo}
              onChange={(e) => { setHistoryPage(1); setHistoryFilters((f) => ({ ...f, ticketNo: e.target.value })); }}
              placeholder={language === 'th' ? 'เลขตั๋ว' : 'Ticket No'}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm"
            />
            <select
              value={historyFilters.stationId}
              onChange={(e) => { setHistoryPage(1); setHistoryFilters((f) => ({ ...f, stationId: e.target.value })); }}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm"
            >
              <option value="">{language === 'th' ? 'ทุกสถานี' : 'All stations'}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name_th || s.name_en || s.id}</option>
              ))}
            </select>
            <input
              type="date"
              value={historyFilters.from}
              onChange={(e) => { setHistoryPage(1); setHistoryFilters((f) => ({ ...f, from: e.target.value })); }}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm"
            />
            <input
              type="date"
              value={historyFilters.to}
              onChange={(e) => { setHistoryPage(1); setHistoryFilters((f) => ({ ...f, to: e.target.value })); }}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm"
            />
            <input
              value={historyFilters.inspector}
              onChange={(e) => { setHistoryPage(1); setHistoryFilters((f) => ({ ...f, inspector: e.target.value })); }}
              placeholder={language === 'th' ? 'ผู้ตรวจ' : 'Inspector'}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* List */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm">
          {historyLoading && (
            <div className="text-sm text-gray-500 dark:text-gray-400">{language === 'th' ? 'กำลังโหลดประวัติ…' : 'Loading history…'}</div>
          )}
          {!!historyError && (
            <div className="text-sm text-red-600">{historyError}</div>
          )}
          {!historyLoading && !historyError && historySessions.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">{language === 'th' ? 'ไม่พบประวัติ' : 'No history found'}</div>
          )}
          {!historyLoading && historySessions.length > 0 && (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-3 sm:px-0">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-slate-700">
                      <th className="py-2 pr-4">{language === 'th' ? 'เลขตั๋ว' : 'Ticket'}</th>
                      <th className="py-2 pr-4">{language === 'th' ? 'สถานี' : 'Station'}</th>
                      <th className="py-2 pr-4">{language === 'th' ? 'ผู้ตรวจ' : 'Inspector'}</th>
                      <th className="py-2 pr-4 whitespace-nowrap">{language === 'th' ? 'วันที่' : 'Date'}</th>
                      <th className="py-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {historySessions.map((s) => (
                      <tr key={s.id} className="text-gray-800 dark:text-gray-200">
                        <td className="py-2 pr-4">{s.ticket_no}</td>
                        <td className="py-2 pr-4">{s.station_name}</td>
                        <td className="py-2 pr-4">{s.inspector_name}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{new Date(s.created_at).toLocaleString('th-TH', { hour12: false })}</td>
                        <td className="py-2 text-right">
                          <Link href={`/qc/history/${s.id}`} className="text-emerald-700 hover:underline text-xs sm:text-sm">
                            {language === 'th' ? 'ดูรายละเอียด' : 'View detail'}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {!historyLoading && historyTotal > pageSize && (
            <div className="mt-3 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <button
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyPage <= 1}
                className={`px-2 py-1 rounded border ${historyPage <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >{language === 'th' ? 'ก่อนหน้า' : 'Prev'}</button>
              <div>{language === 'th' ? 'หน้า' : 'Page'} {historyPage} / {Math.max(1, Math.ceil(historyTotal / pageSize))}</div>
              <button
                onClick={() => setHistoryPage((p) => (p < Math.ceil(historyTotal / pageSize) ? p + 1 : p))}
                disabled={historyPage >= Math.ceil(historyTotal / pageSize)}
                className={`px-2 py-1 rounded border ${historyPage >= Math.ceil(historyTotal / pageSize) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >{language === 'th' ? 'ถัดไป' : 'Next'}</button>
            </div>
          )}
        </div>
      </div>
      )}
      </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}
