"use client";

import React, { useEffect, useMemo, useState } from "react";
import { FileText, ArrowLeft } from "lucide-react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useLanguage } from "@/contexts/LanguageContext";

export default function QCDefectsHistoryPage() {
  const { language } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [station, setStation] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'resolved', pageSize: String(pageSize), page: String(page), q });
      const resp = await fetch(`/api/qc/defect-alerts/list?${params.toString()}`);
      const json = await resp.json();
      const rows = Array.isArray(json.data) ? json.data : [];
      setItems(rows);
      if (Number.isFinite(json.count)) setTotal(json.count);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, pageSize]);

  // Client-side filters: station and date range
  const stations = useMemo(() => {
    const set = new Set();
    (items||[]).forEach(i => { if (i.station_name) set.add(i.station_name); });
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let arr = items || [];
    if (station) arr = arr.filter(i => (i.station_name||'') === station);
    if (from) arr = arr.filter(i => new Date(i.created_at) >= new Date(from + 'T00:00:00'));
    if (to) arr = arr.filter(i => new Date(i.created_at) <= new Date(to + 'T23:59:59'));
    if (q) {
      const qq = q.toLowerCase();
      arr = arr.filter(i =>
        (i.ticket_no||'').toLowerCase().includes(qq) ||
        (i.station_name||'').toLowerCase().includes(qq) ||
        (i.rpd_ref||'').toLowerCase().includes(qq) ||
        (i.nc_note||'').toLowerCase().includes(qq)
      );
    }
    return arr;
  }, [items, station, from, to, q]);

  const stats = useMemo(() => {
    const totalDefects = filtered.reduce((s,i)=> s + (Number(i.defect_qty)||0), 0);
    const tickets = new Set(filtered.map(i=>i.ticket_no)).size;
    return { count: filtered.length, totalDefects, tickets };
  }, [filtered]);

  function exportCsv() {
    const headers = ['created_at','ticket_no','station_name','defect_qty','rpd_ref','nc_note'];
    const lines = [headers.join(',')].concat(
      filtered.map(i => headers.map(h => {
        const val = i[h] ?? '';
        const s = typeof val === 'string' ? val.replace(/"/g,'""') : String(val);
        return '"'+s+'"';
      }).join(','))
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'qc_defects_history.csv'; a.click();
    setTimeout(()=> URL.revokeObjectURL(url), 500);
  }

  return (
    <ProtectedRoute>
      <div className="p-4 md:p-6">
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="inline-flex items-center gap-2 px-2 py-1 rounded-md border bg-white hover:bg-gray-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-sm">
              <ArrowLeft className="w-4 h-4" /> {language==='th'?'ย้อนกลับ':'Back'}
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{language === 'th' ? 'ประวัติ QC ไม่ผ่าน' : 'QC Defects History'}</h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="px-3 py-1 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200">{language==='th'?'จำนวน':'Count'}: <b>{stats.count}</b></div>
            <div className="px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300">Defects: <b>{stats.totalDefects}</b></div>
            <div className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">Tickets: <b>{stats.tickets}</b></div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-3 grid grid-cols-1 md:grid-cols-5 gap-2">
          <input value={q} onChange={(e)=>{setQ(e.target.value)}} placeholder={language==='th'?'ค้นหา (ตั๋ว/สถานี/RPD/NC)':'Search'} className="border rounded px-2 py-1 md:col-span-2" />
          <select value={station} onChange={(e)=>setStation(e.target.value)} className="border rounded px-2 py-1">
            <option value="">{language==='th'?'ทุกสถานี':'All stations'}</option>
            {stations.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="border rounded px-2 py-1" />
          <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="border rounded px-2 py-1" />
          <div className="flex gap-2 md:col-span-5">
            <button onClick={()=>{ setPage(1); load(); }} className="px-3 py-1 border rounded">{language==='th'?'รีเฟรช':'Refresh'}</button>
            <button onClick={exportCsv} className="px-3 py-1 border rounded bg-gray-50">Export CSV</button>
          </div>
        </div>

        <div className="overflow-x-auto bg-white dark:bg-slate-800 border rounded-lg shadow-sm">
          <table className="min-w-full">
            <thead className="sticky top-0 bg-white/80 dark:bg-slate-900/60 backdrop-blur border-b">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">วันที่</th>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">ตั๋ว</th>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">สถานี</th>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">ไม่ผ่าน (ชิ้น)</th>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">RPD</th>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">NC</th>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-3 py-6 text-center text-sm text-gray-500" colSpan={7}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="px-3 py-6 text-center text-sm text-gray-500" colSpan={7}>{language==='th'?'ไม่พบข้อมูล':'No data'}</td></tr>
              ) : filtered.map((it, idx) => {
                const qty = Number(it.defect_qty) || 0;
                const qtyBadge = qty >= 20
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  : qty >= 10
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                    : qty >= 5
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                      : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-200';
                const rowAccent = qty >= 20
                  ? 'before:bg-red-400'
                  : qty >= 10
                    ? 'before:bg-orange-400'
                    : qty >= 5
                      ? 'before:bg-amber-400'
                      : 'before:bg-gray-200';
                return (
                <tr key={it.id} className={`relative ${idx % 2 ? 'bg-gray-50/50 dark:bg-slate-900/10' : ''} hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors`}> 
                  <td className={`px-3 py-2 align-top`}> 
                    <div className="text-[11px] text-gray-500">{new Date(it.created_at).toLocaleDateString('th-TH')}</div>
                    <div className="text-[11px] text-gray-400">{new Date(it.created_at).toLocaleTimeString('th-TH')}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 text-gray-800 dark:text-gray-100 shadow-sm">{it.ticket_no}</span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-800 dark:text-blue-300 shadow-sm">{it.station_name || '-'}</span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold shadow-sm ${qtyBadge}`}>{qty}</span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {it.rpd_ref ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-mono bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 shadow-sm">{it.rpd_ref}</span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top max-w-[420px]">
                    <div className="text-xs text-gray-600 dark:text-gray-300 truncate" title={it.nc_note || ''}>{it.nc_note || '-'}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {it.session_id && (
                      <a href={`/qc/report/${encodeURIComponent(it.session_id)}`} target="_blank" className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm">
                        <FileText className="w-3.5 h-3.5" /> {language==='th'?'รายงาน':'Report'}
                      </a>
                    )}
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-3 flex items-center justify-between text-sm">
          <div className="text-gray-600">{language==='th'?'ทั้งสิ้น':'Total'} {total} {language==='th'?'รายการ':'rows'}</div>
          <div className="flex items-center gap-2">
            <button onClick={()=> setPage(p=> Math.max(1, p-1))} disabled={page<=1} className={`px-3 py-1 border rounded ${page<=1?'opacity-50 cursor-not-allowed':''}`}>Prev</button>
            <div>{page}</div>
            <button onClick={()=> setPage(p=> p + 1)} disabled={page*pageSize >= total} className={`px-3 py-1 border rounded ${(page*pageSize>=total)?'opacity-50 cursor-not-allowed':''}`}>Next</button>
            <select value={pageSize} onChange={(e)=>{setPageSize(Number(e.target.value)); setPage(1);}} className="border rounded px-2 py-1">
              {[10,20,50,100].map(n=> <option key={n} value={n}>{n}/page</option>)}
            </select>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}


