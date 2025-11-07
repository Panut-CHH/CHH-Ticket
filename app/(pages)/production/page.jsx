"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { ClipboardList, CheckCircle2, Clock3, Coins } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";

export default function ProductionPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();

  const myName = (user?.name || user?.email || "").trim();
  const myRole = (user?.role || '').toLowerCase();
  const isAdmin = myRole === 'admin' || myRole === 'superadmin';
  const myNameLower = myName.toLowerCase();

  // Load ERP tickets and merge with DB station assignments
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadError, setLoadError] = useState("");
  
  // Batch data
  const [batches, setBatches] = useState([]);
  // Global gate: hide tickets when no stations exist yet
  const [hasAnyStations, setHasAnyStations] = useState(true);
  
  // Tab state for completed/incomplete tickets
  const [activeTab, setActiveTab] = useState('incomplete'); // 'completed' or 'incomplete'

  // Function to load batches
  const loadBatchData = async () => {
    try {
      // Load batches
      const { data: batchData, error: batchError } = await supabase
        .from('ticket_batches')
        .select(`
          *,
          stations(name_th, code),
          qc_sessions(form_type, inspector)
        `)
        .order('created_at', { ascending: false });
      
      if (batchError) throw batchError;
      setBatches(batchData || []);
    } catch (error) {
      console.error('Error loading batch data:', error);
    }
  };

  // Function to load tickets (DB-first)
  const loadTickets = async () => {
    try {
      setLoadingTickets(true);
      setLoadError("");

      // Gate: if no stations configured, do not show tickets
      try {
        const { count, error: stationCountError } = await supabase
          .from('stations')
          .select('id', { count: 'exact', head: true });
        if (!stationCountError) {
          const hasStations = (typeof count === 'number' ? count : 0) > 0;
          setHasAnyStations(hasStations);
          if (!hasStations) {
            setTickets([]);
            return; // Stop loading tickets until stations are created
          }
        }
      } catch {}

      // 1) Load tickets from DB (base info)
      const { data: ticketData, error: ticketError } = await supabase
        .from('ticket')
        .select('no, source_no, project_id, description, description_2, due_date, priority, customer_name, quantity, pass_quantity')
        .order('created_at', { ascending: false });
      if (ticketError) throw ticketError;

      // ดึงตั๋วทั้งหมด
      const allTicketNumbers = (ticketData || [])
        .map(t => t?.no)
        .filter(v => typeof v === 'string' && v.trim().length > 0 && v !== 'N/A');
      
      if (allTicketNumbers.length === 0) {
        setTickets([]);
        return;
      }
      // 2) Map DB tickets to base ticket objects (DB-first)
      const baseMapped = (ticketData || []).map(t => {
        const id = (t.no || '').replace('#','');
        const displayQty = (typeof t.pass_quantity === 'number' && t.pass_quantity !== null)
          ? t.pass_quantity
          : (t.quantity || 0);
        return {
          id,
          title: t.description || '',
          priority: t.priority || 'ยังไม่ได้กำหนด Priority',
          priorityClass: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
          status: 'Pending',
          statusClass: 'text-blue-600',
          assignee: '-',
          time: '',
          route: t.source_no || id,
          routeClass: 'bg-blue-100 text-blue-800',
          dueDate: t.due_date || '',
          quantity: displayQty,
          rpd: id,
          itemCode: t.source_no || '',
          projectCode: t.source_no || id,
          projectName: t.description || id,
          description: t.description || '',
          description2: t.description_2 || '',
          stations: [],
          roadmap: [],
          customerName: t.customer_name || ''
        };
      });
      
      // DB-first: ไม่ต้องสร้าง rework tickets แยก เพราะ baseMapped ครอบคลุมอยู่แล้ว

      // 3) Load station flows and assignments from DB
      let flows = [];
      {
        const { data, error } = await supabase
          .from('ticket_station_flow')
          .select(`
            *,
            stations (
              name_th,
              code
            )
          `)
          .order('step_order', { ascending: true });
        if (!error && Array.isArray(data)) {
          flows = data;
        }
      }

      // console.log('[PRODUCTION] Loaded flows:', flows?.length);

      // assignments
      let assignments = [];
      try {
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('ticket_assignments')
          .select(`
            ticket_no,
            station_id,
            step_order,
            technician_id,
            users(name)
          `);
        if (!assignmentError && Array.isArray(assignmentData)) {
          assignments = assignmentData;
        } else {
            const { data: simpleData } = await supabase
              .from('ticket_assignments')
              .select('ticket_no, station_id, step_order, technician_id');
          if (Array.isArray(simpleData) && simpleData.length > 0) {
            const technicianIds = [...new Set(simpleData.map(a => a.technician_id))];
            const { data: userData } = await supabase
              .from('users')
              .select('id, name')
              .in('id', technicianIds);
            assignments = simpleData.map(a => ({
              ...a,
              users: (userData || []).find(u => u.id === a.technician_id) || null
            }));
          }
        }
      } catch {}

      // console.log('[PRODUCTION] Loaded assignments:', assignments?.length);

      // Build assignment map for quick lookup (handle multiple technicians per station)
      // ใช้ step_order เพื่อให้แต่ละ step แยกกัน
      const assignmentMap = {};
      assignments.forEach(a => {
        const key = `${a.ticket_no}-${a.station_id}-${a.step_order || 0}`;
        const techName = a.users?.name || '';
        if (techName) {
          if (assignmentMap[key]) {
            // Multiple technicians for same station, combine names
            if (!assignmentMap[key].includes(techName)) {
              assignmentMap[key] = assignmentMap[key] + ', ' + techName;
            }
          } else {
            assignmentMap[key] = techName;
          }
        }
      });

      // (Rework roadmap augmentation removed)

      console.log('[PRODUCTION] Assignment map:', assignmentMap);

      // 4) Merge flows/assignments into DB tickets
      const merged = baseMapped.map((t) => {
        const ticketNo = String(t.id || t.rpd).replace('#','');
        const ticketFlows = flows.filter(f => f.ticket_no === ticketNo);
        
        // Find corresponding DB ticket for extra fields
        const dbTicket = (ticketData || []).find(db => db.no === ticketNo);
        
        console.log(`[PRODUCTION] Ticket ${ticketNo}: found ${ticketFlows.length} flows`);
        
        if (ticketFlows.length === 0) {
          return { ...t, status: 'Pending', statusClass: 'text-blue-600', stations: [], roadmap: [] };
        }

        const roadmap = ticketFlows.map(flow => ({
          step: flow.stations?.name_th || '',
          status: flow.status || 'pending',
          technician: assignmentMap[`${flow.ticket_no}-${flow.station_id}-${flow.step_order}`] || ''
        }));

        console.log(`[PRODUCTION] Ticket ${ticketNo} roadmap:`, roadmap);

        // Build stations with price for amount calc
        const stations = ticketFlows.map(flow => ({
          name: flow.stations?.name_th || '',
          technician: assignmentMap[`${flow.ticket_no}-${flow.station_id}-${flow.step_order}`] || '',
          priceType: flow.price_type || 'flat',
          price: Number(flow.price) || 0,
          status: flow.status || 'pending'
        }));

        const currentFlow = ticketFlows.find(f => f.status === 'current');
        let assignee = currentFlow ? (assignmentMap[`${currentFlow.ticket_no}-${currentFlow.station_id}-${currentFlow.step_order}`] || '') : '';
        if (!assignee) {
          assignee = assignmentMap[`${ticketFlows[0].ticket_no}-${ticketFlows[0].station_id}-${ticketFlows[0].step_order}`] || '';
        }

        const status = calculateTicketStatus(stations, roadmap);
        const statusClass = getStatusClass(status);

        return { 
          ...t, 
          roadmap, 
          stations, 
          assignee: assignee || '-', 
          status, 
          statusClass,
          priority: t.priority,
          priorityClass: t.priorityClass,
          customerName: dbTicket?.customer_name || t.customerName
        };
      });
      
      // รวมเฉพาะ merged และซ่อนตั๋วที่ยังไม่มีสถานี/flow เลย
      const visible = merged.filter(mt => Array.isArray(mt.roadmap) && mt.roadmap.length > 0);
      setTickets(visible);
    } catch (e) {
      setLoadError(e?.message || 'Failed to load tickets');
    } finally {
      setLoadingTickets(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadTickets();
    loadBatchData();
  }, []);

  // Realtime subscription for ticket updates: flows + assignments
  useEffect(() => {
    console.log('[PRODUCTION] Setting up realtime subscription...');
    
    const channel = supabase
      .channel('production-ticket-flows')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'ticket_station_flow'
        },
        async (payload) => {
          console.log('[PRODUCTION REALTIME] Change detected:', payload);
          // Add small delay to ensure DB propagation
          await new Promise(resolve => setTimeout(resolve, 300));
          console.log('[PRODUCTION REALTIME] Reloading tickets after flow change...');
          loadTickets();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_assignments'
        },
        async (payload) => {
          console.log('[PRODUCTION REALTIME] Assignment change:', payload);
          // Add small delay to ensure DB propagation
          await new Promise(resolve => setTimeout(resolve, 300));
          console.log('[PRODUCTION REALTIME] Reloading tickets after assignment change...');
          loadTickets();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_batches'
        },
        async (payload) => {
          console.log('[PRODUCTION REALTIME] Batch change:', payload);
          await new Promise(resolve => setTimeout(resolve, 300));
          loadBatchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket'
        },
        async () => {
          await new Promise(resolve => setTimeout(resolve, 300));
          loadTickets();
        }
      )
      .subscribe((status) => {
        console.log('[PRODUCTION] Realtime subscription status:', status);
      });

    return () => {
      console.log('[PRODUCTION] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, []);

  // ERP mapping removed (DB-first approach)

  function calculateTicketStatus(stations, roadmap) {
    if (!Array.isArray(stations) || stations.length === 0) return "Pending";
    const hasAssigned = stations.some(s => (s.technician || '').trim() !== '');
    if (!hasAssigned) return "Pending";
    if (Array.isArray(roadmap) && roadmap.length > 0) {
      const allCompleted = roadmap.every(step => step.status === 'completed');
      const hasCurrent = roadmap.some(step => step.status === 'current');
      if (allCompleted) return "Finish";
      if (hasCurrent) return "In Progress";
    }
    return "Released";
  }

  function getStatusClass(status) {
    switch (status) {
      case "Pending":
        return "text-blue-600";
      case "Released":
        return "text-green-600";
      case "In Progress":
        return "text-amber-600";
      case "Finish":
        return "text-emerald-600";
      default:
        return "text-gray-600";
    }
  }

  const myTickets = useMemo(() => {
    if (!myName) return [];
    let filtered = [];
    if (isAdmin) {
      // Admins see all tickets
      filtered = tickets;
    } else {
      filtered = tickets.filter((t) => {
        // เช็ค assignee หรือ technician
        const assigneeLower = ((t.assignee || "").toString()).toLowerCase();
        if (assigneeLower.includes(myNameLower)) return true;
        const stations = Array.isArray(t.stations) ? t.stations : [];
        return stations.some((s) => ((s.technician || "").toString()).toLowerCase().includes(myNameLower));
      });
    }
    
    console.log('[PRODUCTION] My name:', myName);
    console.log('[PRODUCTION] Total tickets:', tickets.length);
    console.log('[PRODUCTION] My tickets:', filtered.length);
    
    return filtered;
  }, [myName, myNameLower, tickets, isAdmin]);

  // Filter tickets by tab (completed vs incomplete)
  const filteredTickets = useMemo(() => {
    if (activeTab === 'completed') {
      return myTickets.filter((t) => (t.status || "") === "Finish");
    } else {
      // incomplete: Pending, Released, In Progress
      return myTickets.filter((t) => (t.status || "") !== "Finish");
    }
  }, [myTickets, activeTab]);

  const sumTicketAmount = (ticket) => {
    const steps = Array.isArray(ticket.stations) ? ticket.stations : [];
    return steps.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  };

  const stats = useMemo(() => {
    const total = myTickets.length;
    const done = myTickets.filter((t) => (t.status || "") === "Finish").length;
    const pending = total - done;
    const totalAmount = myTickets.reduce((s, t) => s + sumTicketAmount(t), 0);
    const doneAmount = myTickets
      .filter((t) => (t.status || "") === "Finish")
      .reduce((s, t) => s + sumTicketAmount(t), 0);
    const pendingAmount = totalAmount - doneAmount;
    
    // Batch statistics
    const myBatches = batches.filter(batch => {
      const batchTicket = tickets.find(t => t.id === batch.ticket_no);
      if (!batchTicket) return false;
      const assigneeLower = ((batchTicket.assignee || "").toString()).toLowerCase();
      if (assigneeLower.includes(myNameLower)) return true;
      const stations = Array.isArray(batchTicket.stations) ? batchTicket.stations : [];
      return stations.some((s) => ((s.technician || "").toString()).toLowerCase().includes(myNameLower));
    });
    
    return { 
      total, 
      done, 
      pending, 
      totalAmount, 
      doneAmount, 
      pendingAmount,
      batchCount: myBatches.length
    };
  }, [myTickets, batches, myNameLower, tickets]);

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/production">
        <div className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8 animate-fadeInUp">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">{t('myWork', language)}</h1>
        <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t('myWorkDesc', language)}</p>

        {!myName && (
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300 text-sm sm:text-base">
            {language === 'th' ? 'ไม่พบชื่อผู้ใช้สำหรับการกรองตั๋ว กรุณาเข้าสู่ระบบด้วยบัญชีช่าง' : 'User name not found for ticket filtering. Please login with technician account'}
          </div>
        )}

        {myName && (
          <>
            <div className="mt-4 sm:mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('allTickets', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</div>
                  <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('completed', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xl sm:text-2xl font-bold text-emerald-600">{stats.done}</div>
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('pending', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xl sm:text-2xl font-bold text-amber-600">{stats.pending}</div>
                  <Clock3 className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
                </div>
              </div>

              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm md:col-span-2 lg:col-span-1">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('totalValueInHand', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">{stats.totalAmount.toLocaleString()} {language === 'th' ? 'บาท' : 'Baht'}</div>
                  <Coins className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('valueCompleted', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-lg sm:text-xl font-semibold text-emerald-700">{stats.doneAmount.toLocaleString()} {language === 'th' ? 'บาท' : 'Baht'}</div>
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('valuePending', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-lg sm:text-xl font-semibold text-amber-700">{stats.pendingAmount.toLocaleString()} {language === 'th' ? 'บาท' : 'Baht'}</div>
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="mt-6 sm:mt-8">
              <div className="flex gap-2 sm:gap-3 border-b border-gray-200 dark:border-slate-700">
                <button
                  onClick={() => setActiveTab('incomplete')}
                  className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition-all duration-200 border-b-2 ${
                    activeTab === 'incomplete'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock3 className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>{language === 'th' ? 'ตั๋วที่ยังไม่เสร็จ' : 'Incomplete Tickets'}</span>
                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                      activeTab === 'incomplete'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {myTickets.filter((t) => (t.status || "") !== "Finish").length}
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('completed')}
                  className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium transition-all duration-200 border-b-2 ${
                    activeTab === 'completed'
                      ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>{language === 'th' ? 'ตั๋วที่เสร็จแล้ว' : 'Completed Tickets'}</span>
                    <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                      activeTab === 'completed'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {myTickets.filter((t) => (t.status || "") === "Finish").length}
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div className="mt-6 sm:mt-8 space-y-3 sm:space-y-4">
              {loadingTickets && (
                <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-800 dark:text-blue-300 text-sm sm:text-base">
                  {language === 'th' ? 'กำลังโหลดตั๋วของคุณจาก ERP/ฐานข้อมูล...' : 'Loading your tickets from ERP/DB...'}
                </div>
              )}
              {!!loadError && (
                <div className="p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm sm:text-base">
                  {loadError}
                </div>
              )}
              {filteredTickets.length === 0 && !loadingTickets && (
                <>
                  {!hasAnyStations ? (
                    <div className="p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-800 dark:text-yellow-300 text-sm sm:text-base">
                      {language === 'th' ? 'ยังไม่ได้เพิ่มสถานีใด ๆ กรุณาเพิ่มสถานีในเมนูตั้งค่าก่อน จึงจะแสดงตั๋วในหน้า Production' : 'No stations configured yet. Please add stations in Settings to see tickets.'}
                    </div>
                  ) : (
                    <div className="p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-800 dark:text-yellow-300 text-sm sm:text-base">
                      {language === 'th' 
                        ? (activeTab === 'completed' 
                          ? 'ยังไม่มีตั๋วที่เสร็จแล้ว' 
                          : 'ยังไม่มีตั๋วที่ยังไม่เสร็จ')
                        : (activeTab === 'completed'
                          ? 'No completed tickets yet'
                          : 'No incomplete tickets yet')}
                    </div>
                  )}
                </>
              )}

              {filteredTickets.map((ticket) => {
                const total = sumTicketAmount(ticket);
                const cleanedId = (ticket.id || "").replace(/^#/, "");
                
                // Get batches for this ticket
                const ticketBatches = batches.filter(batch => batch.ticket_no === ticket.id);
                
                return (
                  <div key={ticket.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                          <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">{ticket.id}</div>
                          
                          {ticket.route && <span className={`text-xs px-2 py-1 rounded-full ${ticket.routeClass}`}>{ticket.route}</span>}
                          <span className={`text-xs px-2 py-1 rounded-full ${ticket.priorityClass}`}>{ticket.priority}</span>
                          <span className={`text-xs sm:text-sm ${ticket.statusClass}`}>{ticket.status}</span>
                          
                          {/* Batch Status Indicators */}
                          {ticketBatches.length > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                              {ticketBatches.length} {language === 'th' ? 'Batch' : 'Batch'}
                            </span>
                          )}
                          
                          
                        </div>
                        <div className="text-gray-700 dark:text-gray-300 mt-1 truncate text-sm sm:text-base">{ticket.title}</div>
                        
                        
                        <div className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('ticketValue', language)}: <span className="font-medium text-gray-900 dark:text-gray-100">{total.toLocaleString()} {language === 'th' ? 'บาท' : 'Baht'}</span></div>
                        
                        {/* Batch Details */}
                        {ticketBatches.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {ticketBatches.map((batch, index) => (
                              <div key={batch.id} className="flex items-center gap-2 text-xs">
                                <span className={`px-2 py-1 rounded-full ${
                                  batch.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                                  batch.status === 'rework' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                                  batch.status === 'waiting_merge' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400' :
                                  'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                                }`}>
                                  {batch.batch_name} ({batch.quantity} {language === 'th' ? 'ชิ้น' : 'pcs'})
                                </span>
                                <span className="text-gray-500 dark:text-gray-400">
                                  {batch.stations?.name_th || batch.stations?.code || 'Unknown Station'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/production/${encodeURIComponent(cleanedId)}`)}
                          className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs sm:text-sm font-medium w-full md:w-auto"
                        >
                          {t('detailsMore', language)}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}

