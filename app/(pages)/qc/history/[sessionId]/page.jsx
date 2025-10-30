"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function QCHistoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.sessionId;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]);
  const [stationName, setStationName] = useState('');
  const [targetStationName, setTargetStationName] = useState('');
  const [inspectorName, setInspectorName] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { data: s } = await supabase
          .from('qc_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();
        setSession(s || null);

        const { data: r } = await supabase
          .from('qc_rows')
          .select('*')
          .eq('session_id', sessionId)
          .order('id', { ascending: true });
        setRows(r || []);

        if (s?.station_id) {
          const { data: st } = await supabase
            .from('stations')
            .select('name_th, code')
            .eq('id', s.station_id)
            .maybeSingle();
          setStationName(st?.name_th || st?.code || '');
        }
        // compute target station (previous step before QC) using qc_task_uuid
        if (s?.ticket_no && s?.qc_task_uuid) {
          const { data: flows } = await supabase
            .from('ticket_station_flow')
            .select('step_order, qc_task_uuid, stations(name_th, code)')
            .eq('ticket_no', s.ticket_no)
            .order('step_order', { ascending: true });
          const idx = (flows || []).findIndex(f => f.qc_task_uuid === s.qc_task_uuid);
          if (idx > 0) {
            const prev = flows[idx - 1];
            setTargetStationName(prev?.stations?.name_th || prev?.stations?.code || '');
          }
        }
        if (s?.inspector_id) {
          const { data: u } = await supabase
            .from('users')
            .select('name, email')
            .eq('id', s.inspector_id)
            .maybeSingle();
          setInspectorName(u?.name || u?.email || s?.inspector || '');
        } else {
          setInspectorName(s?.inspector || '');
        }
      } finally {
        setLoading(false);
      }
    };
    if (sessionId) load();
  }, [sessionId]);

  const grouped = useMemo(() => (rows || []).reduce((acc, r) => {
    const key = r.project || '-';
    acc[key] = acc[key] || [];
    acc[key].push(r);
    return acc;
  }, {}), [rows]);

  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-gray-50 dark:bg-slate-900">
      <div className="max-w-5xl mx-auto">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">รายละเอียดประวัติการตรวจ</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/qc')} className="px-3 py-1.5 rounded-md border bg-white dark:bg-slate-800 dark:border-slate-700 text-sm">กลับไปรายการ</button>
            <button onClick={() => window.open(`/qc/report/${encodeURIComponent(sessionId)}`, '_blank')} className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm">พิมพ์/บันทึก PDF</button>
          </div>
        </div>

        {loading && <div className="p-3 text-sm">กำลังโหลด...</div>}
        {!loading && session && (
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div><span className="font-medium">ตั๋ว:</span> {session.ticket_no}</div>
                <div><span className="font-medium">สถานี:</span> {targetStationName || stationName || session.station || '-'}</div>
                <div><span className="font-medium">QC Task UUID:</span> {session.qc_task_uuid || '-'}</div>
              </div>
              <div>
                <div><span className="font-medium">ผู้ตรวจ:</span> {inspectorName || '-'}</div>
                <div><span className="font-medium">วันเวลา:</span> {new Date(session.created_at).toLocaleString()}</div>
                <div><span className="font-medium">หมายเหตุ:</span> {session.remark || '-'}</div>
              </div>
            </div>

            <div className="p-4">
              {Object.entries(grouped).map(([group, list]) => (
                <div key={group} className="mb-4">
                  <div className="font-semibold mb-2">หมวด: {group}</div>
                  <table className="w-full text-sm border border-gray-300 dark:border-slate-600">
                    <thead className="bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-200">
                      <tr>
                        <th className="border px-2 py-1 text-left w-1/2">รายการ</th>
                        <th className="border px-2 py-1 text-center w-14">ผ่าน</th>
                        <th className="border px-2 py-1 text-right w-20">จำนวน</th>
                        <th className="border px-2 py-1 text-left w-[40%]">สาเหตุ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => (
                        <tr key={r.id}>
                          <td className="border px-2 py-1 w-1/2">{r.production_no}</td>
                          <td className="border px-2 py-1 text-center w-14">{r.pass === true ? '✔' : r.pass === false ? '✘' : '-'}</td>
                          <td className="border px-2 py-1 text-right w-20">{r.actual_qty ?? '-'}</td>
                          <td className="border px-2 py-1 w-[40%]">{r.note || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



