"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import QCMainForm from "@/app/(pages)/qc/[id]/page.jsx";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/utils/supabaseClient";

export default function QCTaskPage({ params }) {
  const router = useRouter();
  const { language } = useLanguage();
  const { user } = useAuth();
  const resolved = React.use(params);
  const taskUuid = String(resolved?.uuid || "");

  const [ticketNo, setTicketNo] = useState("");
  const [stationName, setStationName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadTask = async () => {
      try {
        const { data, error } = await supabase
          .from('ticket_station_flow')
          .select('ticket_no, stations(name_th, code), status')
          .eq('qc_task_uuid', taskUuid)
          .single();
        if (!error && data) {
          setTicketNo(data.ticket_no);
          setStationName(data.stations?.name_th || data.stations?.code || 'QC');
        }
      } catch {}
    };
    if (taskUuid) loadTask();
  }, [taskUuid]);

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/qc">
        {/* ใช้ฟอร์มหลักแต่ส่ง qcTaskUuid ผ่าน query */}
        {ticketNo ? (
          <QCMainForm params={{ id: ticketNo }} forceTicketId={ticketNo} forceQcTaskUuid={taskUuid} />
        ) : (
          <div className="p-4 max-w-3xl mx-auto text-sm text-gray-600">กำลังโหลด...</div>
        )}
      </RoleGuard>
    </ProtectedRoute>
  );
}
