"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function QCHistoryListPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // เดิมเป็นหน้ารายการประวัติ แต่อัปเดต UX ให้ย้ายไปอยู่ในแท็บของหน้า /qc
  // จึง redirect มาที่ /qc?tab=history เพื่อรักษาลิงก์เดิมที่อาจถูกบุ๊กมาร์กไว้
  useEffect(() => {
    try { router.replace('/qc?tab=history'); } catch {}
  }, [router]);

  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [pageCount, setPageCount] = useState(1);

  const ticketNo = (searchParams.get('ticket_no') || '').trim();
  const stationId = (searchParams.get('station_id') || '').trim();
  const inspector = (searchParams.get('inspector') || '').trim();
  const from = (searchParams.get('from') || '').trim();
  const to = (searchParams.get('to') || '').trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = 25;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stations').select('id, name_th, code').order('name_th', { ascending: true });
      setStations(Array.isArray(data) ? data : []);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase.from('qc_sessions').select('id, ticket_no, created_at, inspector, station_id, step_order, qc_task_uuid', { count: 'exact' });
      if (ticketNo) q = q.ilike('ticket_no', `%${ticketNo}%`);
      if (stationId) q = q.eq('station_id', stationId);
      if (inspector) q = q.ilike('inspector', `%${inspector}%`);
      if (from) q = q.gte('created_at', `${from}T00:00:00Z`);
      if (to) q = q.lte('created_at', `${to}T23:59:59Z`);
      q = q.order('created_at', { ascending: false }).range((page - 1) * pageSize, (page * pageSize) - 1);
      const { data, count } = await q;
      setSessions(Array.isArray(data) ? data : []);
      setPageCount(Math.max(1, Math.ceil((count || 0) / pageSize)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [ticketNo, stationId, inspector, from, to, page]);

  const paramsObj = useMemo(() => ({ ticket_no: ticketNo, station_id: stationId, inspector, from, to, page: String(page) }), [ticketNo, stationId, inspector, from, to, page]);
  const setParam = (k, v) => {
    const sp = new URLSearchParams(paramsObj);
    if (v) sp.set(k, v); else sp.delete(k);
    if (!sp.get('page')) sp.set('page', '1');
    router.push(`/qc/history?${sp.toString()}`);
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-gray-50 dark:bg-slate-900">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">ประวัติการตรวจ QC</h1>

        {/* Filters */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <input className="px-3 py-2 border rounded bg-white dark:bg-slate-800 dark:border-slate-700 text-sm" placeholder="เลขตั๋ว" value={ticketNo} onChange={(e) => setParam('ticket_no', e.target.value)} />
          <select className="px-3 py-2 border rounded bg-white dark:bg-slate-800 dark:border-slate-700 text-sm" value={stationId} onChange={(e) => setParam('station_id', e.target.value)}>
            <option value="">สถานีทั้งหมด</option>
            {stations.map(s => (
              <option key={s.id} value={s.id}>{s.name_th || s.code || s.id}</option>
            ))}
          </select>
          <input type="date" className="px-3 py-2 border rounded bg-white dark:bg-slate-800 dark:border-slate-700 text-sm" value={from} onChange={(e) => setParam('from', e.target.value)} />
          <input type="date" className="px-3 py-2 border rounded bg-white dark:bg-slate-800 dark:border-slate-700 text-sm" value={to} onChange={(e) => setParam('to', e.target.value)} />
          <input className="px-3 py-2 border rounded bg-white dark:bg-slate-800 dark:border-slate-700 text-sm" placeholder="ผู้ตรวจ" value={inspector} onChange={(e) => setParam('inspector', e.target.value)} />
        </div>

        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <div className="grid grid-cols-12 text-xs font-medium bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
              <div className="col-span-3 p-2 border-r dark:border-slate-600">ตั๋ว</div>
              <div className="col-span-3 p-2 border-r dark:border-slate-600">สถานี</div>
              <div className="col-span-3 p-2 border-r dark:border-slate-600">วันเวลา</div>
              <div className="col-span-2 p-2 border-r dark:border-slate-600">ผู้ตรวจ</div>
              <div className="col-span-1 p-2">จัดการ</div>
            </div>
            {loading ? (
              <div className="p-4 text-sm">กำลังโหลด...</div>
            ) : sessions.length === 0 ? (
              <div className="p-4 text-sm">ไม่พบข้อมูล</div>
            ) : (
              sessions.map((s) => (
                <div key={s.id} className="grid grid-cols-12 text-sm border-t dark:border-slate-700 items-center">
                  <div className="col-span-3 p-2 break-all">{s.ticket_no}</div>
                  <div className="col-span-3 p-2 break-all">{s.station_id || '-'}</div>
                  <div className="col-span-3 p-2">{new Date(s.created_at).toLocaleString()}</div>
                  <div className="col-span-2 p-2">{s.inspector || '-'}</div>
                  <div className="col-span-1 p-2">
                    <button onClick={() => router.push(`/qc/history/${encodeURIComponent(s.id)}`)} className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs">รายละเอียด</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden">
            {loading ? (
              <div className="p-4 text-sm">กำลังโหลด...</div>
            ) : sessions.length === 0 ? (
              <div className="p-4 text-sm">ไม่พบข้อมูล</div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-slate-700">
                {sessions.map((s) => (
                  <div key={s.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{s.ticket_no}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.station_id || '-'}</div>
                      </div>
                      <button 
                        onClick={() => router.push(`/qc/history/${encodeURIComponent(s.id)}`)} 
                        className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs shrink-0 ml-2"
                      >
                        รายละเอียด
                      </button>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <div>ผู้ตรวจ: {s.inspector || '-'}</div>
                      <div className="mt-1">{new Date(s.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setParam('page', String(page - 1))} className="px-3 py-1 rounded border bg-white disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700">ก่อนหน้า</button>
          <div className="text-sm">หน้า {page} / {pageCount}</div>
          <button disabled={page >= pageCount} onClick={() => setParam('page', String(page + 1))} className="px-3 py-1 rounded border bg-white disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700">ถัดไป</button>
        </div>
      </div>
    </div>
  );
}



