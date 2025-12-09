"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function QCReportPage() {
  const params = useParams();
  const sessionId = params?.sessionId;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]);

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
      } finally {
        setLoading(false);
      }
    };
    if (sessionId) load();
  }, [sessionId]);

  const grouped = rows.reduce((acc, r) => {
    const key = r.project || '-';
    acc[key] = acc[key] || [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="p-3 sm:p-6 print:p-0">
      <style jsx global>{`
        @media print {
          .no-print { display: none; }
          body { background: #fff; }
        }
      `}</style>

      <div className="no-print mb-4 flex justify-end">
        <button onClick={() => window.print()} className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm">พิมพ์</button>
      </div>

      <div className="max-w-4xl mx-auto bg-white text-black p-4 sm:p-6 border border-gray-200">
        <h1 className="text-lg sm:text-xl font-semibold mb-1">QC Report</h1>
        <div className="text-xs sm:text-sm text-gray-600 mb-4">Session: {sessionId}</div>

        {loading && <div className="text-sm">กำลังโหลด...</div>}
        {!loading && session && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs sm:text-sm mb-4">
              <div>
                <div><span className="font-medium">Ticket:</span> {session.ticket_no}</div>
                <div><span className="font-medium">Form:</span> {session.form_type}</div>
                <div><span className="font-medium">Inspector:</span> {session.inspector}</div>
                <div><span className="font-medium">Inspected Date:</span> {session.inspected_date}</div>
              </div>
              <div>
                <div><span className="font-medium">Station:</span> {session.station || '-'} </div>
                <div><span className="font-medium">Station ID:</span> {session.station_id || '-'} / <span className="font-medium">Step:</span> {session.step_order ?? '-'}</div>
                <div><span className="font-medium">QC Task UUID:</span> {session.qc_task_uuid || '-'}</div>
              </div>
            </div>

            <div className="mb-4 text-xs sm:text-sm">
              <div className="font-medium">หมายเหตุ:</div>
              <div className="whitespace-pre-wrap">{session.remark || '-'}</div>
            </div>

            {Object.entries(grouped).map(([project, list]) => (
              <div key={project} className="mb-4">
                <div className="font-semibold mb-2 text-sm sm:text-base">หมวด: {project}</div>
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                    <table className="w-full text-xs sm:text-sm border border-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="border px-2 py-1 text-left">รายการ</th>
                          <th className="border px-2 py-1 text-center">ผ่าน</th>
                          <th className="border px-2 py-1 text-right">จำนวน</th>
                          <th className="border px-2 py-1 text-left">สาเหตุ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => (
                          <tr key={r.id}>
                            <td className="border px-2 py-1">{r.production_no}</td>
                            <td className="border px-2 py-1 text-center">{r.pass === true ? '✔' : r.pass === false ? '✘' : '-'}</td>
                            <td className="border px-2 py-1 text-right">{r.actual_qty ?? '-'}</td>
                            <td className="border px-2 py-1">{r.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}



