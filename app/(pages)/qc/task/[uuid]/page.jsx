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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const loadTask = async () => {
      try {
        setLoading(true);
        setNotFound(false);
        
        if (!taskUuid) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('ticket_station_flow')
          .select('ticket_no, stations(name_th, code), status')
          .eq('qc_task_uuid', taskUuid)
          .single();
        
        if (error) {
          // Check for 406 or not found errors
          if (error.status === 406 || error.code === 'PGRST116' || error.message?.includes('No rows') || error.message?.includes('Not Acceptable')) {
            console.warn('QC task not found:', taskUuid);
            setNotFound(true);
            setTicketNo("");
          } else {
            throw error;
          }
        } else if (data) {
          setTicketNo(data.ticket_no);
          setStationName(data.stations?.name_th || data.stations?.code || 'QC');
          setNotFound(false);
        } else {
          setNotFound(true);
          setTicketNo("");
        }
      } catch (e) {
        console.error('Load QC task failed:', e);
        // Check for 406 or not found errors in catch block
        if (e?.status === 406 || e?.code === 'PGRST116' || e?.message?.includes('No rows') || e?.message?.includes('Not Acceptable')) {
          setNotFound(true);
          setTicketNo("");
        }
      } finally {
        setLoading(false);
      }
    };
    
    if (taskUuid) {
      loadTask();
    } else {
      setLoading(false);
      setNotFound(true);
    }
  }, [taskUuid]);

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/qc">
        {loading ? (
          <div className="min-h-screen p-4 flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">
                {language === 'th' ? 'กำลังโหลดข้อมูล...' : 'Loading...'}
              </p>
            </div>
          </div>
        ) : notFound || !ticketNo ? (
          <div className="min-h-screen p-4 flex items-start justify-center pt-16">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 max-w-md border border-red-200 dark:border-red-800 text-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {language === 'th' ? 'ไม่พบ QC Task' : 'QC Task Not Found'}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {language === 'th' 
                  ? `ไม่พบ QC Task ที่ระบุ อาจถูกลบหรือไม่มีอยู่แล้ว` 
                  : `The specified QC task was not found. It may have been deleted or does not exist.`}
              </p>
              <Link
                href="/qc"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                {language === 'th' ? 'กลับไปหน้า QC' : 'Back to QC Page'}
              </Link>
            </div>
          </div>
        ) : (
          <QCMainForm params={{ id: ticketNo }} forceTicketId={ticketNo} forceQcTaskUuid={taskUuid} />
        )}
      </RoleGuard>
    </ProtectedRoute>
  );
}
