'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';

export default function QCHistoryLog({ ticketNo }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const rows = Array.isArray(s.qc_rows) ? s.qc_rows : [];
        const pass = rows.filter(r => r.pass === true).length;
        const fail = rows.filter(r => r.pass === false).length;
        return (
          <div key={s.id} className="p-3 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium text-gray-900 dark:text-gray-100">
                {new Date(s.inspected_date || s.created_at).toLocaleString('th-TH')}
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                {s.form_type || '-'} @ {s.station || '-'}
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              ผู้ตรวจ: {s.inspector || '-'} | ผ่าน {pass} | ไม่ผ่าน {fail}
            </div>
            {s.remark && (
              <div className="mt-1 text-xs text-gray-700 dark:text-gray-300">หมายเหตุ: {s.remark}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}


