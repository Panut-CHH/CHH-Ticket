'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';

export default function QCHistoryLog({ ticketNo }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        setError('');

        // Load QC sessions with rows
        const { data, error } = await supabase
          .from('qc_sessions')
          .select(`
            id,
            ticket_no,
            form_type,
            station,
            inspector,
            inspected_date,
            remark,
            created_at,
            qc_rows(id, pass, note, actual_qty)
          `)
          .eq('ticket_no', ticketNo)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!mounted) return;
        setSessions(Array.isArray(data) ? data : []);
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

  return (
    <div className="space-y-4">
      {sessions.map((s) => {
        const rows = Array.isArray(s.qc_rows) ? s.qc_rows : [];
        const pass = rows.filter(r => r.pass === true).length;
        const fail = rows.filter(r => r.pass === false).length;
        const defectQty = rows.filter(r => r.pass === false).reduce((sum, r) => sum + (Number(r.actual_qty) || 0), 0);
        const isOpen = !!expanded[s.id];
        return (
          <div key={s.id} className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            <button onClick={() => toggle(s.id)} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-slate-700">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {new Date(s.inspected_date || s.created_at).toLocaleString('th-TH')}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {s.form_type || '-'} @ {s.station || '-'} · ผู้ตรวจ: {s.inspector || '-'}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300">ผ่าน {pass}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300">ไม่ผ่าน {fail}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">Defect {defectQty}</span>
                <span className={`ml-2 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                {s.remark && (
                  <div className="mb-2 text-xs text-gray-700 dark:text-gray-300">หมายเหตุ: {s.remark}</div>
                )}
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 dark:border-slate-700 text-xs">
                    <thead className="bg-gray-50 dark:bg-slate-700">
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
            )}
          </div>
        );
      })}
    </div>
  );
}


