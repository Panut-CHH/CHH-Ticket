"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { Search, CheckCircle2, Clock, Tag, Ticket as TicketIcon, AlertTriangle, Activity } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { supabase } from "@/utils/supabaseClient";

// แปลงข้อมูล ERP เป็น ticket object (ยกมาจากหน้า Tickets)
function mapErpRecordToTicket(record, projectMap = new Map()) {
  const rec = record && record.data ? record.data : record;
  const id = rec?.No || rec?.no || rec?.RPD_No || rec?.rpdNo || rec?.orderNumber || rec?.Order_No || rec?.No_ || rec?.id;
  const quantity = Number(rec?.Quantity ?? rec?.quantity ?? 0);
  const dueDate = rec?.Delivery_Date || rec?.deliveryDate || rec?.Ending_Date_Time || rec?.Ending_Date || rec?.Due_Date || "";
  const itemCode = rec?.Source_No || rec?.Item_No || rec?.itemCode || rec?.Item_Code || rec?.Source_Item || "";
  const description = rec?.Description || rec?.description || "";
  const description2 = rec?.Description_2 || rec?.description2 || "";
  const erpProjectCode = rec?.Shortcut_Dimension_2_Code || rec?.Project_Code || rec?.projectCode || rec?.Project || "";
  const shortcutDimension1 = rec?.Shortcut_Dimension_1_Code || "";
  const startingDateTime = rec?.Starting_Date_Time || rec?.Start_Date || "";
  const endingDateTime = rec?.Ending_Date_Time || rec?.End_Date || "";
  const route = rec?.Routing_No || rec?.Routing || rec?.Route || "";

  const rpdNo = String(id || "").trim();
  const projectInfo = projectMap.get(rpdNo);
  const projectCode = projectInfo?.projectCode || erpProjectCode;
  const projectName = projectInfo?.projectName || erpProjectCode;

  const priority = projectInfo?.priority || rec?.Priority || rec?.priority || "ยังไม่ได้กำหนด Priority";
  const priorityLower = String(priority || '').toLowerCase();
  const priorityClass =
    priorityLower.includes('high') || priorityLower.includes('สูง')
      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
      : priorityLower.includes('medium') || priorityLower.includes('กลาง')
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      : priorityLower.includes('low') || priorityLower.includes('ต่ำ')
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
      : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";

  const roadmap = Array.isArray(rec?.Operations)
    ? rec.Operations.map(op => ({ step: op?.Description || op?.description || op?.Operation_No || "", status: "pending" }))
    : [];

  const status = "Pending";
  const statusClass = "text-blue-600";

  return {
    id: rpdNo,
    title: description,
    priority,
    priorityClass,
    status,
    statusClass,
    assignee: "-",
    time: "",
    route,
    routeClass: "bg-blue-100 text-blue-800",
    dueDate: dueDate || "",
    quantity: quantity || 0,
    rpd: rpdNo,
    itemCode,
    projectCode,
    projectName,
    description,
    description2,
    shortcutDimension1,
    shortcutDimension2: projectCode,
    locationCode: rec?.Location_Code || rec?.Location || "",
    startingDateTime,
    endingDateTime,
    bwkRemainingConsumption: Number(rec?.BWK_Remaining_Consumption || 0),
    searchDescription: rec?.Search_Description || rec?.Search || description,
    erpCode: projectCode ? `ERP-${projectCode}` : "",
    projectId: projectCode,
    customerName: rec?.Customer_Name || rec?.customerName || "",
    bom: Array.isArray(rec?.BOM) ? rec.BOM : [],
    stations: Array.isArray(rec?.Stations) ? rec.Stations : [],
    roadmap,
  };
}

export default function QCPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  // Fixed design style: chip
  const [designMode, setDesignMode] = useState("chip");

  // Lock style to chip (ignore query/localStorage)
  useEffect(() => { setDesignMode('chip'); }, []);
  const [qcResults, setQcResults] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [allQcTickets, setAllQcTickets] = useState([]);
  const [archivedTickets, setArchivedTickets] = useState([]);
  const [assignmentMapState, setAssignmentMapState] = useState({}); // key: `${ticket_no}-${station_id}` -> technician name
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'archive'

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("qcResults") : null;
      setQcResults(raw ? JSON.parse(raw) : []);
    } catch {
      setQcResults([]);
    }
  }, []);

  // โหลดข้อมูลจริงจาก ERP + Supabase (อิง logic จากหน้า Tickets)
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

        // 1) โหลดตั๋วเพื่อ map RPD → project info
        const { data: tickets } = await supabase
          .from('ticket')
          .select('no,source_no,project_id,priority')
          .order('created_at', { ascending: false });

        const projectMap = new Map();
        (tickets || []).forEach(t => {
          if (t?.no) projectMap.set(String(t.no), { projectName: t.source_no || t.no, priority: t.priority });
        });

        // 2) เรียก ERP batch จาก ticket numbers
        const rpdNumbers = (tickets || []).map(t => t?.no).filter(Boolean);
        let erpTickets = [];
        if (rpdNumbers.length) {
          const resp = await fetch('/api/erp/production-orders/batch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rpdNumbers })
          });
          const json = await resp.json();
          const results = Array.isArray(json?.data) ? json.data : [];
          erpTickets = results.filter(r => r && r.success && r.data).map(r => mapErpRecordToTicket(r.data, projectMap));
        }

        // 2.1) เพิ่มตั๋ว Rework ที่ไม่มีใน ERP จาก DB โดยตรง
        const reworkTickets = (tickets || [])
          .filter(t => t?.no && String(t.no).includes('-RW'))
          .map(t => ({
            id: t.no,
            title: `Rework: ${t.source_no || ''}`,
            priority: 'ยังไม่ได้กำหนด Priority',
            priorityClass: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
            status: 'Released',
            statusClass: 'text-purple-600',
            assignee: '-',
            time: '',
            route: t.source_no || t.no,
            routeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
            dueDate: '',
            quantity: 0,
            rpd: t.no,
            itemCode: t.source_no || '',
            projectCode: t.source_no || '',
            projectName: `Rework Ticket ${t.no}`,
            stations: [],
            isRework: true,
            parentTicketNo: t.source_no
          }));

        // 3) โหลด station flows เพื่อหา current/next เป็น QC
        const { data: flows } = await supabase
          .from('ticket_station_flow')
          .select(`*, stations(name_th, code)`) 
          .order('step_order', { ascending: true });

        const flowByTicket = new Map();
        (flows || []).forEach(f => {
          const key = String(f.ticket_no || '').replace('#','');
          if (!flowByTicket.has(key)) flowByTicket.set(key, []);
          flowByTicket.get(key).push(f);
        });

        // โหลดการมอบหมายช่างของแต่ละสถานี
        let assignmentMap = {};
        try {
          const { data: assignments } = await supabase
            .from('ticket_assignments')
            .select(`ticket_no, station_id, users!ticket_assignments_technician_id_fkey(name)`);
          (assignments || []).forEach(a => {
            const k = `${String(a.ticket_no || '').replace('#','')}-${a.station_id}`;
            const tech = a?.users?.name || '';
            if (tech) assignmentMap[k] = tech;
          });
        } catch {}

        const allTicketsBase = [...erpTickets, ...reworkTickets];
        const merged = allTicketsBase.map(t => {
          const ticketId = String(t.id || t.rpd).replace('#','');
          const ticketFlows = flowByTicket.get(ticketId) || [];
          if (ticketFlows.length > 0) {
            const roadmap = ticketFlows.map(flow => ({
              step: flow.stations?.name_th || '',
              status: flow.status || 'pending',
              stationId: flow.station_id,
              stepOrder: flow.step_order,
              updatedAt: flow.updated_at || flow.created_at,
              qcTaskUuid: flow.qc_task_uuid || null
            }));
            return { ...t, roadmap };
          }
          return t;
        });

        setTickets(merged);
        setAssignmentMapState(assignmentMap);

        const qcCandidates = merged.filter(t => {
          const steps = Array.isArray(t.roadmap) ? t.roadmap : [];
          if (steps.length === 0) return false;
          // เลือก "ขั้นแรกที่ยังไม่เสร็จ" โดย treat rework เป็นเสร็จแล้ว (ให้ไหลต่อได้)
          const firstActiveIdx = steps.findIndex(s => !['completed','rework'].includes((s.status || 'pending')));
          if (firstActiveIdx < 0) return false;
          const stepName = String(steps[firstActiveIdx]?.step || '').toUpperCase();
          const stepStatus = steps[firstActiveIdx]?.status || 'pending';
          // แสดงเฉพาะเมื่อขั้นแรกที่ยังไม่เสร็จเป็น QC และสถานะ pending/current เท่านั้น
          return stepName.includes('QC') && (stepStatus === 'pending' || stepStatus === 'current');
        });

        // Archive: tickets ที่ QC เป็น completed แล้ว
        const qcArchived = merged.filter(t => {
          const steps = Array.isArray(t.roadmap) ? t.roadmap : [];
          if (steps.length === 0) return false;
          const qcSteps = steps.filter(s => String(s.step || '').toUpperCase().includes('QC'));
          if (qcSteps.length === 0) return false;
          // Archive เมื่อตำแหน่ง QC ทุกจุดถูกทำเสร็จแล้วทั้งหมด
          return qcSteps.every(s => (s.status || 'pending') === 'completed');
        });

        setAllQcTickets(qcCandidates);
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

  // Realtime: อัปเดตคิว QC ทันทีเมื่อมีการเปลี่ยนแปลงสถานะหรือบันทึก QC
  useEffect(() => {
    const channel = supabase
      .channel('qc-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_station_flow' }, async () => {
        // หน่วงเล็กน้อยเพื่อให้ DB commit เสร็จสมบูรณ์
        setTimeout(() => { load(); }, 250);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qc_sessions' }, async () => {
        setTimeout(() => { load(); }, 250);
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [load]);

  const qcTickets = useMemo(() => {
    return allQcTickets.filter((t) => {
      const matchesSearch = (String(t.id) + (t.title || "")).toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    }).map((t)=>{
      // คำนวณเวลาเข้าถึง QC จาก "ขั้นแรกที่ยังไม่เสร็จ" ถ้าเป็น QC (treat rework = completed)
      const steps = Array.isArray(t.roadmap) ? t.roadmap : [];
      const firstActiveIdx = steps.findIndex(s => !['completed','rework'].includes((s.status || 'pending')));
      const active = firstActiveIdx >= 0 ? steps[firstActiveIdx] : null;
      const arrival = active?.updatedAt ? new Date(active.updatedAt).getTime() : null;
      return { ...t, _qcArrivalTs: arrival };
    }).sort((a,b)=>{
      const A = a._qcArrivalTs ?? Number.MAX_SAFE_INTEGER;
      const B = b._qcArrivalTs ?? Number.MAX_SAFE_INTEGER;
      return A - B; // เก่าอยู่บน
    });
  }, [searchTerm, allQcTickets]);

  const ticketsToShow = useMemo(() => {
    if (!showPendingOnly) return qcTickets;
    return qcTickets.filter((t) => t.status !== "เสร็จสิ้น");
  }, [qcTickets, showPendingOnly]);

  // Metrics
  const waitingCount = allQcTickets.length;
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

  const goodCount = useMemo(() => qcResults.filter((r) => r.result === "pass").length, [qcResults]);
  const badCount = useMemo(() => qcResults.filter((r) => r.result === "fail").length, [qcResults]);
  const totalQcDone = goodCount + badCount;
  const passRate = totalQcDone > 0 ? Math.round((goodCount / totalQcDone) * 100) : 0;

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/qc">
        <div className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8 animate-fadeInUp">
      <header className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 dark:text-gray-100">{t('qcQueue', language)}</h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 dark:text-gray-400 mt-2">{t('qcQueueDesc', language)}</p>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'queue' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300'}`}
        >{language === 'th' ? 'คิวที่ต้องตรวจ' : 'QC Queue'}</button>
        <button
          onClick={() => setActiveTab('archive')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'archive' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300'}`}
        >{language === 'th' ? 'เก็บเอกสาร (ตรวจเสร็จ)' : 'Archive (Completed)'}</button>
      </div>

      {loading && (
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-300">กำลังโหลดข้อมูลจริงจาก ERP และฐานข้อมูล…</div>
      )}
      {!!error && (
        <div className="mb-4 text-sm text-red-600">{error}</div>
      )}

      {/* Summary widgets (only queue tab) */}
      {activeTab === 'queue' && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm">
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1 sm:mb-2">{t('workAwaitingInspection', language)}</div>
          <div className="flex items-center justify-between">
            <div className="text-lg sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">{waitingCount}</div>
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <TicketIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm">
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1 sm:mb-2">{t('nearDueDate', language)}</div>
          <div className="flex items-center justify-between">
            <div className="text-lg sm:text-2xl font-semibold text-amber-700">{dueSoonTickets.length}</div>
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm">
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1 sm:mb-2">{t('goodVsDefective', language)}</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs sm:text-sm text-emerald-700">{t('good', language)}: {goodCount}</div>
              <div className="text-xs sm:text-sm text-red-600">{t('defective', language)}: {badCount}</div>
            </div>
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm">
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1 sm:mb-2">{t('kpiInDevelopment', language)}</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">{passRate}%</div>
              <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{t('allPassed', language)} {goodCount}/{totalQcDone}</div>
            </div>
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
        </div>
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
        <div className="text-gray-800 dark:text-gray-200 font-medium mb-2 sm:mb-3 text-sm sm:text-base">{t('workAwaitingByTechnician', language)}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(() => {
            const groups = ticketsToShow.reduce((acc, t) => {
              const key = t.assignee || "ไม่ระบุ";
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
      <div className="flex flex-col sm:flex-row gap-3 mb-4 sm:mb-6">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={language === 'th' ? 'ค้นหาด้วยเลขตั๋วหรือชื่อ' : 'Search by ticket number or name'}
            className="w-full pl-9 sm:pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm sm:text-base"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 cursor-pointer select-none">
          <input type="checkbox" checked={showPendingOnly} onChange={(e) => setShowPendingOnly(e.target.checked)} />
          {language === 'th' ? 'แสดงเฉพาะที่ยังไม่เสร็จสิ้น' : 'Show only incomplete'}
        </label>
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
                      const techName = prev ? assignmentMapState[`${String(ticket.id).replace('#','')}-${prev.stationId}`] : '';
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
      ) : (
      // Archive list
      <div className="space-y-3">
        {archivedTickets.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8 sm:py-10 text-sm sm:text-base">{language === 'th' ? 'ยังไม่มีตั๋วที่ตรวจเสร็จ' : 'No completed QC records'}</div>
        ) : (
          archivedTickets.map((ticket) => (
            <div key={ticket.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <TicketIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">{ticket.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${ticket.routeClass}`}>{ticket.route}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">{language === 'th' ? 'ตรวจเสร็จแล้ว' : 'QC Completed'}</span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">{ticket.title}</div>
                  </div>
                </div>
                <Link href={`/qc/${String(ticket.id).replace('#','')}`} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-gray-200 rounded-lg text-xs sm:text-sm w-full md:w-auto text-center">
                  {language === 'th' ? 'ดูประวัติ QC' : 'View QC History'}
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
      )}
      </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}
