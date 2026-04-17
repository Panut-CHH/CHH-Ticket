'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';

export default function QCHistoryLog({ ticketNo }) {
  const [sessions, setSessions] = useState([]);
  const [flowMap, setFlowMap] = useState({ byStep: {}, byStationId: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        setError('');

        // Load QC sessions with rows + station linkage fields
        // Pagination เผื่อ production scale (>1000 rows)
        const sessionsAll = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data: page, error } = await supabase
            .from('qc_sessions')
            .select(`
              id,
              ticket_no,
              form_type,
              station,
              station_id,
              step_order,
              qc_task_uuid,
              inspector,
              inspected_date,
              remark,
              created_at,
              qc_station:stations!station_id(name_th, code),
              qc_rows(id, pass, note, actual_qty)
            `)
            .eq('ticket_no', ticketNo)
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1);

          if (error) throw error;
          if (page && page.length > 0) {
            sessionsAll.push(...page);
            hasMore = page.length === pageSize;
            from += pageSize;
          } else {
            hasMore = false;
          }
        }

        // Load ticket_station_flow เพื่อ map QC step -> สถานีก่อนหน้า
        const flowsAll = [];
        {
          let fFrom = 0;
          let fHasMore = true;
          while (fHasMore) {
            const { data: fPage, error: fErr } = await supabase
              .from('ticket_station_flow')
              .select('step_order, station_id, stations(name_th, code)')
              .eq('ticket_no', ticketNo)
              .order('step_order', { ascending: true })
              .range(fFrom, fFrom + pageSize - 1);
            if (fErr) throw fErr;
            if (fPage && fPage.length > 0) {
              flowsAll.push(...fPage);
              fHasMore = fPage.length === pageSize;
              fFrom += pageSize;
            } else {
              fHasMore = false;
            }
          }
        }

        // สร้าง map: step_order -> { qcName, prevName } + stationsById fallback
        const map = {};
        const stationsById = {};
        for (let i = 0; i < flowsAll.length; i++) {
          const f = flowsAll[i];
          const prev = i > 0 ? flowsAll[i - 1] : null;
          const name = f.stations?.name_th || f.stations?.code || null;
          map[f.step_order] = {
            qcName: name,
            prevName: prev?.stations?.name_th || prev?.stations?.code || null,
            stepOrder: f.step_order
          };
          if (f.station_id) stationsById[f.station_id] = name;
        }

        if (!mounted) return;
        setSessions(sessionsAll);
        setFlowMap({ byStep: map, byStationId: stationsById });
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load QC history');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (ticketNo) load();
    return () => { mounted = false; };
  }, [ticketNo]);

  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">กำลังโหลดประวัติ QC...</div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">{error}</div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">ยังไม่มีประวัติการตรวจสอบ</div>
    );
  }

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // format วันที่แบบ full datetime (ใช้ created_at ซึ่งเป็น timestamptz)
  const fmtDateTime = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('th-TH', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // คำนวณสถานีที่ถูกตรวจสำหรับ 1 session
  const resolveInspectedStation = (s) => {
    const flowInfo = s.step_order != null ? flowMap.byStep?.[s.step_order] : null;
    const selfStationName = flowInfo?.qcName
      || (s.station_id ? flowMap.byStationId?.[s.station_id] : null)
      || s.qc_station?.name_th
      || s.qc_station?.code
      || null;
    const isSelfQc = selfStationName && /^qc$/i.test(selfStationName);
    return isSelfQc
      ? (flowInfo?.prevName || (s.station && !/^qc$/i.test(s.station) ? s.station : null))
      : (selfStationName || (s.station && !/^qc$/i.test(s.station) ? s.station : null));
  };

  // Group sessions by qc_task_uuid (fallback: step_order + inspected_date)
  const groups = (() => {
    const map = new Map();
    for (const s of sessions) {
      const key = s.qc_task_uuid || `fallback:${s.step_order || 'x'}:${s.inspected_date || s.created_at}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          qcTaskUuid: s.qc_task_uuid || null,
          stepOrder: s.step_order,
          inspectedStation: resolveInspectedStation(s),
          formType: s.form_type,
          sessions: []
        });
      }
      map.get(key).sessions.push(s);
    }
    // เรียง rounds ภายในกลุ่ม (เก่าไปใหม่ เพื่อให้ numbering รอบที่ 1,2,3 ตาม chronology)
    for (const g of map.values()) {
      g.sessions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    // เรียงกลุ่มตาม session ล่าสุด (ใหม่สุดขึ้นก่อน)
    return Array.from(map.values()).sort((a, b) => {
      const la = a.sessions[a.sessions.length - 1]?.created_at || 0;
      const lb = b.sessions[b.sessions.length - 1]?.created_at || 0;
      return new Date(lb) - new Date(la);
    });
  })();

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        // Summary ของ group
        const allRows = g.sessions.flatMap(s => Array.isArray(s.qc_rows) ? s.qc_rows : []);
        const passTotal = allRows.filter(r => r.pass === true).length;
        const failTotal = allRows.filter(r => r.pass === false).length;
        const defectQtyTotal = allRows.filter(r => r.pass === false).reduce((sum, r) => sum + (Number(r.actual_qty) || 0), 0);
        const roundsTotal = g.sessions.length;
        const latestSession = g.sessions[g.sessions.length - 1];
        const firstSession = g.sessions[0];
        const inspectorsSet = new Set(g.sessions.map(s => s.inspector).filter(Boolean));
        const inspectorsLabel = Array.from(inspectorsSet).join(', ') || '-';
        const isOpen = !!expanded[g.key];
        const stepLabel = g.stepOrder != null ? `ขั้นที่ ${g.stepOrder}` : null;

        return (
          <div key={g.key} className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            <button onClick={() => toggle(g.key)} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-slate-700 gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {fmtDateTime(latestSession?.created_at)}
                  {roundsTotal > 1 && firstSession?.created_at !== latestSession?.created_at && (
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                      (เริ่ม {fmtDateTime(firstSession?.created_at)})
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span>{g.formType || '-'}</span>
                  <span className="text-gray-400">·</span>
                  <span>ตรวจ</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-medium">
                    {g.inspectedStation || '-'}
                  </span>
                  {stepLabel && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      {stepLabel}
                    </span>
                  )}
                  {roundsTotal > 1 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 font-medium">
                      {roundsTotal} รอบ
                    </span>
                  )}
                  <span className="text-gray-400">·</span>
                  <span>ผู้ตรวจ: {inspectorsLabel}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs flex-shrink-0">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300">ผ่าน {passTotal}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300">ไม่ผ่าน {failTotal}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">Defect {defectQtyTotal}</span>
                <span className={`ml-2 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-3">
                {g.sessions.map((s, rIdx) => {
                  const rows = Array.isArray(s.qc_rows) ? s.qc_rows : [];
                  const pass = rows.filter(r => r.pass === true).length;
                  const fail = rows.filter(r => r.pass === false).length;
                  const defectQty = rows.filter(r => r.pass === false).reduce((sum, r) => sum + (Number(r.actual_qty) || 0), 0);
                  return (
                    <div key={s.id} className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 overflow-hidden">
                      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-gray-200 dark:border-slate-700 flex-wrap">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 font-semibold">
                            รอบที่ {rIdx + 1}/{roundsTotal}
                          </span>
                          <span className="text-gray-600 dark:text-gray-300">{fmtDateTime(s.created_at)}</span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-600 dark:text-gray-300">{s.inspector || '-'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300">ผ่าน {pass}</span>
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300">ไม่ผ่าน {fail}</span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">Defect {defectQty}</span>
                        </div>
                      </div>
                      {s.remark && (
                        <div className="px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 bg-yellow-50 dark:bg-yellow-900/10">
                          หมายเหตุ: {s.remark}
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-t border-gray-200 dark:border-slate-700 text-xs">
                          <thead className="bg-gray-100 dark:bg-slate-800">
                            <tr>
                              <th className="px-2 py-1 border">ลำดับ</th>
                              <th className="px-2 py-1 border">ผล</th>
                              <th className="px-2 py-1 border">จำนวน</th>
                              <th className="px-2 py-1 border">หมายเหตุ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.length === 0 ? (
                              <tr><td className="px-2 py-2 text-center text-gray-500" colSpan={4}>ไม่มีรายละเอียด</td></tr>
                            ) : rows.map((r, idx) => (
                              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                                <td className="px-2 py-1 border">{idx + 1}</td>
                                <td className={`px-2 py-1 border font-medium ${r.pass ? 'text-green-600' : 'text-red-600'}`}>{r.pass ? 'ผ่าน' : 'ไม่ผ่าน'}</td>
                                <td className="px-2 py-1 border">{Number(r.actual_qty || 0).toLocaleString()}</td>
                                <td className="px-2 py-1 border">{r.note || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


