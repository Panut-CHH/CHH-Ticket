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
  const myNameLower = myName.toLowerCase();

  // Load ERP tickets and merge with DB station assignments
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadError, setLoadError] = useState("");
  
  // Batch and rework data
  const [batches, setBatches] = useState([]);
  const [reworkOrders, setReworkOrders] = useState([]);

  // Function to load batches and rework orders
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

      // Load rework orders
      const { data: reworkData, error: reworkError } = await supabase
        .from('rework_orders')
        .select(`
          *,
          users!rework_orders_created_by_fkey(name),
          stations(name_th, code)
        `)
        .order('created_at', { ascending: false });
      
      if (reworkError) throw reworkError;
      setReworkOrders(reworkData || []);
    } catch (error) {
      console.error('Error loading batch data:', error);
    }
  };

  // Function to load tickets (reusable for initial load and realtime updates)
  const loadTickets = async () => {
    try {
      setLoadingTickets(true);
      setLoadError("");

      // 1) Load tickets to get RPD numbers from ticket no
      const { data: ticketData, error: ticketError } = await supabase
        .from('ticket')
        .select('no,source_no,project_id')
        .order('created_at', { ascending: false });
      if (ticketError) throw ticketError;

      // ดึงทั้งตั๋วหลักและ rework tickets
      const allTicketNumbers = (ticketData || [])
        .map(t => t?.no)
        .filter(v => typeof v === 'string' && v.trim().length > 0 && v !== 'N/A');
      
      // รวม RPD numbers ที่ต้องการ
      const rpdNumbers = [...new Set(allTicketNumbers)];
      if (rpdNumbers.length === 0) {
        setTickets([]);
        return;
      }

      // 2) Fetch ERP batch
      const resp = await fetch('/api/erp/production-orders/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rpdNumbers })
      });
      if (!resp.ok) throw new Error(`Failed ERP batch: ${resp.status}`);
      const json = await resp.json();
      const results = Array.isArray(json?.data) ? json.data : [];

      // Build project map for extra fields using ticket data
      const projectMap = new Map();
      (ticketData || []).forEach(t => {
        if (t.no && t.no !== 'N/A') {
          projectMap.set(t.no, {
            projectCode: t.source_no || t.no,
            projectName: t.source_no || t.no
          });
        }
      });

      const erpMapped = results
        .filter(r => r && r.success && r.data)
        .map(r => mapErpRecordToTicket(r.data, projectMap));
      
      // สำหรับตั๋ว Rework ที่ไม่มีใน ERP ให้สร้าง ticket object จาก DB
      const reworkTickets = (ticketData || [])
        .filter(t => t.no && t.no.includes('-RW'))
        .map(t => ({
          id: t.no,
          title: `Rework: ${t.source_no || 'Unknown'}`,
          priority: "High",
          priorityClass: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
          status: "In Progress",
          statusClass: "text-purple-600",
          assignee: "-",
          time: "",
          route: t.source_no || t.no,
          routeClass: "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400",
          dueDate: "",
          quantity: 0,
          rpd: t.no,
          itemCode: t.source_no || "",
          projectCode: t.source_no || "",
          projectName: `Rework Ticket ${t.no}`,
          stations: [],
          isRework: true,
          parentTicketNo: t.source_no
        }));
      
      console.log('[PRODUCTION] Rework tickets from DB:', reworkTickets);

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

      // Load tickets from DB for priority and customer info
      let dbTickets = [];
      {
        const { data, error } = await supabase
          .from('ticket')
          .select('no, source_no, priority, customer_name')
          .order('no', { ascending: false });
        if (!error && Array.isArray(data)) {
          dbTickets = data;
        }
      }

      console.log('[PRODUCTION] Loaded flows:', flows?.length);

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

      // ดึงข้อมูล rework_roadmap เพื่อหา technician สำหรับ rework tickets
      let reworkRoadmaps = [];
      let reworkOrderMap = {}; // Map rework_order_id -> ticket_no
      
      try {
        // ดึง rework_orders ก่อน
        const { data: reworkOrdersData, error: reworkOrdersError } = await supabase
          .from('rework_orders')
          .select('id, ticket_no');
        
        if (!reworkOrdersError && Array.isArray(reworkOrdersData)) {
          reworkOrdersData.forEach(ro => {
            reworkOrderMap[ro.id] = ro.ticket_no;
          });
        }

        // ดึง rework_roadmap
        const { data: roadmapData, error: roadmapError } = await supabase
          .from('rework_roadmap')
          .select(`
            rework_order_id,
            station_id,
            step_order,
            assigned_technician_id,
            station_name,
            users(name)
          `);
        
        if (!roadmapError && Array.isArray(roadmapData)) {
          // เพิ่ม ticket_no เข้าไปในข้อมูล
          reworkRoadmaps = roadmapData.map(roadmap => ({
            ...roadmap,
            ticket_no: reworkOrderMap[roadmap.rework_order_id]
          }));
        }
      } catch (e) {
        console.warn('Error loading rework_roadmap:', e);
      }

      console.log('[PRODUCTION] Loaded rework roadmaps:', reworkRoadmaps?.length);

      console.log('[PRODUCTION] Loaded assignments:', assignments?.length);

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

      // เพิ่มข้อมูลจาก rework_roadmap สำหรับ rework tickets
      // ใช้ rework_order_id แทน ticket_no เพราะ rework_roadmap ไม่มี ticket_no ของ rework ticket
      reworkRoadmaps.forEach(roadmap => {
        const reworkOrderId = roadmap.rework_order_id;
        const stationId = roadmap.station_id;
        const stepOrder = roadmap.step_order;
        const techName = roadmap.users?.name || '';
        
        if (reworkOrderId && stationId && techName) {
          // ใช้ key pattern เดียวกับ ticket_station_flow สำหรับ rework tickets
          // format: rework_order_id-station_id-step_order
          const key = `${reworkOrderId}-${stationId}-${stepOrder || 0}`;
          assignmentMap[key] = techName;
        }
      });

      console.log('[PRODUCTION] Assignment map:', assignmentMap);

      // 4) Merge flows/assignments into ERP tickets
      const merged = erpMapped.map((t) => {
        const ticketNo = String(t.id || t.rpd).replace('#','');
        const ticketFlows = flows.filter(f => f.ticket_no === ticketNo);
        
        // Find corresponding DB ticket for priority and customer info
        const dbTicket = dbTickets.find(db => db.no === ticketNo);
        
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

        // Use priority from Supabase if available
        let priority = t.priority;
        let priorityClass = t.priorityClass;
        if (dbTicket && dbTicket.priority) {
          priority = dbTicket.priority === "High" ? "High Priority" : 
                    dbTicket.priority === "Low" ? "Low Priority" : "Medium Priority";
          if (priority === "High Priority") {
            priorityClass = "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
          } else if (priority === "Medium Priority") {
            priorityClass = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
          } else if (priority === "Low Priority") {
            priorityClass = "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
          } else {
            priorityClass = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
          }
        }

        return { 
          ...t, 
          roadmap, 
          stations, 
          assignee: assignee || '-', 
          status, 
          statusClass,
          priority,
          priorityClass,
          customerName: dbTicket?.customer_name || t.customerName
        };
      });
      
      // 5) เพิ่ม rework tickets พร้อม flows
      const reworkMerged = reworkTickets.map(t => {
        const ticketFlows = flows.filter(f => f.ticket_no === t.id && f.is_rework_ticket);
        
        // Build stations for rework ticket
        // ใช้ rework_order_id แทน ticket_no เพื่อ match กับ assignmentMap ที่สร้างจาก rework_roadmap
        const stations = ticketFlows
          .map(f => {
            const techKey = f.rework_order_id 
              ? `${f.rework_order_id}-${f.station_id}-${f.step_order}` 
              : `${f.ticket_no}-${f.station_id}-${f.step_order}`;
            return {
              name: f.stations?.name_th || 'Unknown',
              technician: assignmentMap[techKey] || '-',
              priceType: f.price_type || 'flat',
              price: Number(f.price) || 0,
              status: f.status || 'pending'
            };
          });
        
        const roadmap = ticketFlows.map(f => {
          const techKey = f.rework_order_id 
            ? `${f.rework_order_id}-${f.station_id}-${f.step_order}` 
            : `${f.ticket_no}-${f.station_id}-${f.step_order}`;
          return {
            step: f.stations?.name_th || '',
            status: f.status || 'pending',
            technician: assignmentMap[techKey] || ''
          };
        });
        
        // Determine status
        const currentFlow = flows.find(f => f.ticket_no === t.id && f.status === 'current' && f.is_rework_ticket);
        const completedCount = flows.filter(f => f.ticket_no === t.id && f.status === 'completed' && f.is_rework_ticket).length;
        
        let status = 'In Progress';
        let statusClass = 'text-purple-600';
        
        if (completedCount === stations.length && stations.length > 0) {
          status = 'Finish';
          statusClass = 'text-emerald-600';
        }
        
        return {
          ...t,
          stations,
          roadmap,
          status,
          statusClass
        };
      });

      console.log('[PRODUCTION] Merged tickets:', merged.length);
      console.log('[PRODUCTION] Rework tickets:', reworkMerged.length);
      
      // รวมตั๋วหลักและ rework tickets
      const allTickets = [...merged, ...reworkMerged];
      setTickets(allTickets);
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
          table: 'rework_orders'
        },
        async (payload) => {
          console.log('[PRODUCTION REALTIME] Rework order change:', payload);
          await new Promise(resolve => setTimeout(resolve, 300));
          loadBatchData();
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

  function mapErpRecordToTicket(record, projectMap = new Map()) {
    const rec = record && record.data ? record.data : record;
    const id = rec?.No || rec?.no || rec?.RPD_No || rec?.rpdNo || rec?.orderNumber || rec?.Order_No || rec?.No_ || rec?.id;
    const quantity = Number(rec?.Quantity ?? rec?.quantity ?? 0);
    const dueDate = rec?.Delivery_Date || rec?.deliveryDate || rec?.Ending_Date_Time || rec?.Ending_Date || rec?.Due_Date || "";
    const itemCode = rec?.Source_No || rec?.Item_No || rec?.itemCode || rec?.Item_Code || rec?.Source_Item || "";
    const description = rec?.Description || rec?.description || "";
    const description2 = rec?.Description_2 || rec?.description2 || "";
    const erpProjectCode = rec?.Shortcut_Dimension_2_Code || rec?.Project_Code || rec?.projectCode || rec?.Project || "";
    const route = rec?.Routing_No || rec?.Routing || rec?.Route || "";
    const rpdNo = String(id || "").trim();
    const projectInfo = projectMap.get(rpdNo) || {};
    const projectCode = projectInfo.projectCode || erpProjectCode;
    const projectName = projectInfo.projectName || erpProjectCode;
    return {
      id: rpdNo,
      title: description,
      priority: "ยังไม่ได้กำหนด Priority",
      priorityClass: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
      status: "Pending",
      statusClass: "text-blue-600",
      assignee: "-",
      time: "",
      route: itemCode || route,
      routeClass: "bg-blue-100 text-blue-800",
      dueDate: dueDate || "",
      quantity: quantity || 0,
      rpd: rpdNo,
      itemCode,
      projectCode,
      projectName,
      description,
      description2,
      stations: [],
      roadmap: [],
    };
  }

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
    const filtered = tickets.filter((t) => {
      // ถ้าเป็น rework ticket ให้เช็ค technician จาก stations
      if (t.isRework || (t.id && t.id.includes('-RW'))) {
        const stations = Array.isArray(t.stations) ? t.stations : [];
        const hasAssigned = stations.some((s) => {
          const techName = ((s.technician || "").toString()).toLowerCase();
          return techName.includes(myNameLower) && techName !== '-' && techName !== 'ยังไม่ได้มอบหมาย' && techName !== 'not assigned';
        });
        if (hasAssigned) {
          console.log('[PRODUCTION] Including rework ticket (assigned):', t.id);
          return true;
        }
        return false;
      }
      
      // สำหรับตั๋วปกติ เช็ค assignee หรือ technician
      const assigneeLower = ((t.assignee || "").toString()).toLowerCase();
      if (assigneeLower.includes(myNameLower)) return true;
      const stations = Array.isArray(t.stations) ? t.stations : [];
      return stations.some((s) => ((s.technician || "").toString()).toLowerCase().includes(myNameLower));
    });
    
    console.log('[PRODUCTION] My name:', myName);
    console.log('[PRODUCTION] Total tickets:', tickets.length);
    console.log('[PRODUCTION] My tickets:', filtered.length);
    
    return filtered;
  }, [myName, myNameLower, tickets]);

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
    
    // Batch and rework statistics
    const myBatches = batches.filter(batch => {
      const batchTicket = tickets.find(t => t.id === batch.ticket_no);
      if (!batchTicket) return false;
      const assigneeLower = ((batchTicket.assignee || "").toString()).toLowerCase();
      if (assigneeLower.includes(myNameLower)) return true;
      const stations = Array.isArray(batchTicket.stations) ? batchTicket.stations : [];
      return stations.some((s) => ((s.technician || "").toString()).toLowerCase().includes(myNameLower));
    });
    
    const reworkCount = reworkOrders.filter(rework => {
      const reworkTicket = tickets.find(t => t.id === rework.ticket_no);
      if (!reworkTicket) return false;
      const assigneeLower = ((reworkTicket.assignee || "").toString()).toLowerCase();
      if (assigneeLower.includes(myNameLower)) return true;
      const stations = Array.isArray(reworkTicket.stations) ? reworkTicket.stations : [];
      return stations.some((s) => ((s.technician || "").toString()).toLowerCase().includes(myNameLower));
    }).length;
    
    return { 
      total, 
      done, 
      pending, 
      totalAmount, 
      doneAmount, 
      pendingAmount,
      batchCount: myBatches.length,
      reworkCount
    };
  }, [myTickets, batches, reworkOrders, myNameLower, tickets]);

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
              
              {/* Batch and Rework Statistics */}
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{language === 'th' ? 'Batches ที่รับผิดชอบ' : 'Active Batches'}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-lg sm:text-xl font-semibold text-blue-600">{stats.batchCount}</div>
                  <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-600">B</span>
                  </div>
                </div>
              </div>
              
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{language === 'th' ? 'Rework Orders' : 'Rework Orders'}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-lg sm:text-xl font-semibold text-orange-600">{stats.reworkCount}</div>
                  <div className="w-6 h-6 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-orange-600">R</span>
                  </div>
                </div>
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
              {myTickets.length === 0 && !loadingTickets && (
                <div className="p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-800 dark:text-yellow-300 text-sm sm:text-base">{language === 'th' ? 'ยังไม่มีตั๋วที่มอบหมายให้คุณ' : 'No tickets assigned to you yet'}</div>
              )}

              {myTickets.map((ticket) => {
                const total = sumTicketAmount(ticket);
                const cleanedId = (ticket.id || "").replace(/^#/, "");
                
                // ตรวจสอบว่าเป็นตั๋ว Rework หรือไม่
                const isReworkTicket = (ticket.id || '').includes('-RW');
                const parentTicketNo = ticket.source_no || '';
                
                // Get batches for this ticket
                const ticketBatches = batches.filter(batch => batch.ticket_no === ticket.id);
                const ticketReworkOrders = reworkOrders.filter(rework => rework.ticket_no === ticket.id);
                
                return (
                  <div key={ticket.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                          <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">{ticket.id}</div>
                          
                          {/* Rework Badge */}
                          {isReworkTicket && (
                            <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400 flex items-center gap-1">
                              <span>🔄</span> Rework
                            </span>
                          )}
                          
                          {ticket.route && <span className={`text-xs px-2 py-1 rounded-full ${ticket.routeClass}`}>{ticket.route}</span>}
                          <span className={`text-xs px-2 py-1 rounded-full ${ticket.priorityClass}`}>{ticket.priority}</span>
                          <span className={`text-xs sm:text-sm ${ticket.statusClass}`}>{ticket.status}</span>
                          
                          {/* Batch Status Indicators */}
                          {ticketBatches.length > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                              {ticketBatches.length} {language === 'th' ? 'Batch' : 'Batch'}
                            </span>
                          )}
                          
                          {ticketReworkOrders.length > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400">
                              {ticketReworkOrders.length} {language === 'th' ? 'Rework' : 'Rework'}
                            </span>
                          )}
                        </div>
                        <div className="text-gray-700 dark:text-gray-300 mt-1 truncate text-sm sm:text-base">{ticket.title}</div>
                        
                        {/* Link to Parent Ticket for Rework */}
                        {isReworkTicket && parentTicketNo && (
                          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                            🔗 {language === 'th' ? 'ตั๋วหลัก:' : 'Parent Ticket:'} {parentTicketNo}
                          </div>
                        )}
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

