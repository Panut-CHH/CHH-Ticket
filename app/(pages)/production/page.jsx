"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { ClipboardList, CheckCircle2, Clock3, Coins, Search, Filter as FilterIcon, ArrowUpDown } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { canPerformActions } from "@/utils/rolePermissions";

export default function ProductionPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();
  const canAction = canPerformActions(user?.roles || user?.role);

  const myName = (user?.name || user?.email || "").trim();
  const myRole = (user?.role || '').toLowerCase();
  const isAdmin = myRole === 'admin' || myRole === 'superadmin';
  const myNameLower = myName.toLowerCase();
  
  // Helper function to check if user has a specific role
  const hasRole = (roleName) => {
    if (!user) return false;
    const userRoles = user.roles || (user.role ? [user.role] : []);
    return userRoles.some(r => String(r).toLowerCase() === roleName.toLowerCase());
  };
  
  const hasCNCRole = hasRole('CNC');
  const hasPackingRole = hasRole('Packing');

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

  // Search / Filter / Sort state
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState(new Set());
  const [selectedPriorities, setSelectedPriorities] = useState(new Set());
  const [hasDueDateOnly, setHasDueDateOnly] = useState(false);
  const [sortKey, setSortKey] = useState('dueDate'); // 'dueDate' | 'priority' | 'value' | 'id' | 'status'
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'

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
      // 2) Load projects & project_items to map itemCode -> project name (เช่น Bristal Bangkok)
      const projectMap = new Map();
      try {
        const { data: projects, error: projectsError } = await supabase
          .from('projects')
          .select('id, item_code, project_name, description');
        if (projectsError) {
          console.warn('[PRODUCTION] Failed to load projects for projectName mapping:', projectsError.message);
        } else if (Array.isArray(projects)) {
          projects.forEach(p => {
            if (p.item_code) {
              projectMap.set(p.item_code, p);
            }
          });
        }

        // เติมจาก project_items (รองรับ item_code ที่อยู่ใน project_items)
        try {
          const { data: projectItems, error: projectItemsError } = await supabase
            .from('project_items')
            .select('project_id, item_code');
          if (!projectItemsError && Array.isArray(projectItems) && Array.isArray(projects)) {
            const projectIdMap = new Map(projects.map(p => [p.id, p]));
            projectItems.forEach(it => {
              const proj = projectIdMap.get(it.project_id);
              if (proj && it?.item_code && !projectMap.has(it.item_code)) {
                projectMap.set(it.item_code, proj);
              }
            });
          }
        } catch (e) {
          console.warn('[PRODUCTION] Failed to load project_items for projectName mapping:', e?.message);
        }
      } catch (e) {
        console.warn('[PRODUCTION] Exception while building projectMap:', e?.message);
      }

      // 3) Map DB tickets to base ticket objects (DB-first)
      const baseMapped = (ticketData || []).map(t => {
        const id = (t.no || '').replace('#','');
        const displayQty = (typeof t.pass_quantity === 'number' && t.pass_quantity !== null)
          ? t.pass_quantity
          : (t.quantity || 0);

        // ดึงชื่อโปรเจ็คจาก projectMap ตาม itemCode/source_no
        const projectFromMap = t.source_no ? projectMap.get(t.source_no) : null;
        const projectNameFromMap =
          projectFromMap?.project_name ||
          projectFromMap?.description ||
          '';

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
          // ใช้ชื่อโปรเจ็คจาก projects เป็นหลัก (เช่น Bristal Bangkok)
          projectName: projectNameFromMap || t.description || id,
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
        // เช็ค assignee หรือ technician (existing logic)
        const assigneeLower = ((t.assignee || "").toString()).toLowerCase();
        if (assigneeLower.includes(myNameLower)) return true;
        const stations = Array.isArray(t.stations) ? t.stations : [];
        if (stations.some((s) => ((s.technician || "").toString()).toLowerCase().includes(myNameLower))) {
          return true;
        }
        
        // เช็ค Role-based visibility สำหรับ CNC และ Packing (เหมือน QC)
        const roadmap = Array.isArray(t.roadmap) ? t.roadmap : [];
        
        // เช็คสถานี CNC (เหมือน QC - ไม่ต้อง assign แต่คนที่มี Role เห็นได้)
        if (hasCNCRole) {
          const hasCNCStation = roadmap.some(step => {
            const stepName = (step.step || '').toLowerCase().trim();
            const stepStatus = (step.status || 'pending').toLowerCase();
            // เช็คทั้ง "CNC" ตรงๆ และชื่อที่อาจมี "CNC" รวมอยู่ด้วย
            return (stepName === 'cnc' || stepName.includes('cnc')) && 
                   (stepStatus === 'pending' || stepStatus === 'current');
          });
          if (hasCNCStation) return true;
        }
        
        // เช็คสถานี Packing (เหมือน QC - ไม่ต้อง assign แต่คนที่มี Role เห็นได้)
        if (hasPackingRole) {
          const hasPackingStation = roadmap.some(step => {
            const stepName = (step.step || '').toLowerCase().trim();
            const stepStatus = (step.status || 'pending').toLowerCase();
            // เช็คทั้ง "Packing" ตรงๆ และชื่อที่อาจมี "Packing" หรือ "แพ็ค" รวมอยู่ด้วย
            return (stepName === 'packing' || stepName.includes('packing') || stepName.includes('แพ็ค')) && 
                   (stepStatus === 'pending' || stepStatus === 'current');
          });
          if (hasPackingStation) return true;
        }
        
        return false;
      });
    }
    
    console.log('[PRODUCTION] My name:', myName);
    console.log('[PRODUCTION] Total tickets:', tickets.length);
    console.log('[PRODUCTION] My tickets:', filtered.length);
    
    return filtered;
  }, [myName, myNameLower, tickets, isAdmin, hasCNCRole, hasPackingRole, user]);

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
    const quantity = Number(ticket.quantity) || 0;
    
    let productionPrice = 0;
    let colorPrice = 0;
    
    steps.forEach((station) => {
      const stationName = (station.name || '').toLowerCase();
      const price = Number(station.price) || 0;
      const priceType = station.priceType || 'flat';
      
      // Check if this is color station (สถานีสี)
      const isColorStation = stationName.includes('สี') || stationName.includes('color');
      
      // Calculate price based on price_type
      let stationTotal = 0;
      if (priceType === 'per_piece') {
        stationTotal = price * quantity;
      } else if (priceType === 'per_hour') {
        stationTotal = price;
      } else {
        // flat price
        stationTotal = price;
      }
      
      if (isColorStation) {
        colorPrice += stationTotal;
      } else {
        productionPrice += stationTotal;
      }
    });
    
    const total = productionPrice + colorPrice;
    return total;
  };

  const priorityRank = (p) => {
    if (p === "High Priority") return 0;
    if (p === "Medium Priority") return 1;
    if (p === "Low Priority") return 2;
    if (p === "ยังไม่ได้กำหนด Priority") return 3;
    return 4;
  };

  // สไตล์ป้าย "ความสำคัญ" ให้เด่นชัดตามระดับ
  const getPriorityChipClass = (priority) => {
    // รองรับทั้ง "High Priority" และ "High" (รวมถึงเคสอื่น ๆ จาก DB)
    const p = (priority || "").toLowerCase();
    if (p === "high priority" || p === "high") {
      return "bg-red-600 text-white shadow-[0_0_12px_rgba(220,38,38,0.6)]";
    }
    if (p === "low priority" || p === "low") {
      return "bg-emerald-600 text-white";
    }
    if (p === "medium priority" || p === "medium") {
      return "bg-white text-gray-800 border border-gray-300 dark:bg-slate-800 dark:text-gray-100 dark:border-slate-600";
    }
    // ไม่ได้กำหนด priority หรือค่าอื่น ๆ
    return "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100";
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStatuses.size > 0) count += 1;
    if (selectedPriorities.size > 0) count += 1;
    if (hasDueDateOnly) count += 1;
    return count;
  }, [selectedStatuses, selectedPriorities, hasDueDateOnly]);

  const matchSearch = (t) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (t.id || "").toLowerCase().includes(q) ||
      (t.title || "").toLowerCase().includes(q) ||
      (t.assignee || "").toLowerCase().includes(q) ||
      (t.itemCode || "").toLowerCase().includes(q) ||
      (t.projectName || "").toLowerCase().includes(q) ||
      (t.customerName || "").toLowerCase().includes(q)
    );
  };

  const passFilters = (t) => {
    if (selectedStatuses.size > 0 && !selectedStatuses.has(t.status)) return false;
    if (selectedPriorities.size > 0 && !selectedPriorities.has(t.priority)) return false;
    if (hasDueDateOnly && !t.dueDate) return false;
    return true;
  };

  const displayedTickets = useMemo(() => {
    const base = filteredTickets
      .filter(matchSearch)
      .filter(passFilters);

    const sorted = [...base].sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'dueDate': {
          av = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          bv = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          break;
        }
        case 'priority': {
          av = priorityRank(a.priority);
          bv = priorityRank(b.priority);
          break;
        }
        case 'value': {
          av = sumTicketAmount(a);
          bv = sumTicketAmount(b);
          break;
        }
        case 'status': {
          av = (a.status || '').localeCompare(b.status || '');
          bv = 0; // handled by localeCompare; we'll map to numbers
          return sortDir === 'asc' ? av : -av;
        }
        case 'id':
        default: {
          av = (a.id || '').localeCompare(b.id || '');
          bv = 0;
          return sortDir === 'asc' ? av : -av;
        }
      }
      const diff = av - bv;
      return sortDir === 'asc' ? diff : -diff;
    });

    return sorted;
  }, [filteredTickets, searchTerm, selectedStatuses, selectedPriorities, hasDueDateOnly, sortKey, sortDir]);

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
        <div className="min-h-screen container-safe px-2 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 animate-fadeInUp">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">{t('myWork', language)}</h1>
        <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t('myWorkDesc', language)}</p>

        {!myName && (
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300 text-sm sm:text-base">
            {language === 'th' ? 'ไม่พบชื่อผู้ใช้สำหรับการกรองตั๋ว กรุณาเข้าสู่ระบบด้วยบัญชีช่าง' : 'User name not found for ticket filtering. Please login with technician account'}
          </div>
        )}

        {myName && (
          <>
            <div className="production-stats-grid mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm stat-card">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('allTickets', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</div>
                  <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm stat-card">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('completed', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xl sm:text-2xl font-bold text-emerald-600">{stats.done}</div>
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm stat-card">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('pending', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xl sm:text-2xl font-bold text-amber-600">{stats.pending}</div>
                  <Clock3 className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
                </div>
              </div>

              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm md:col-span-2 lg:col-span-1 stat-card">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('totalValueInHand', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">{stats.totalAmount.toLocaleString()} {language === 'th' ? 'บาท' : 'Baht'}</div>
                  <Coins className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm stat-card">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('valueCompleted', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-lg sm:text-xl font-semibold text-emerald-700">{stats.doneAmount.toLocaleString()} {language === 'th' ? 'บาท' : 'Baht'}</div>
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm stat-card">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('valuePending', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-lg sm:text-xl font-semibold text-amber-700">{stats.pendingAmount.toLocaleString()} {language === 'th' ? 'บาท' : 'Baht'}</div>
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="mt-6 sm:mt-8">
              <div className="flex gap-2 sm:gap-3 border-b border-gray-200 dark:border-slate-700 overflow-x-auto pb-1 -mx-2 px-2 sm:mx-0 sm:px-0">
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

            {/* Search / Filter / Sort */}
            <div className="mt-4 sm:mt-6">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                {/* Search */}
                <div className="flex-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base text-gray-900 dark:text-gray-100"
                    placeholder={t('searchTickets', language)}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                {/* Filter toggle */}
                <button
                  onClick={() => setShowFilter(v => !v)}
                  className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm sm:text-base text-gray-900 dark:text-gray-100"
                >
                  <FilterIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>{t('filter', language)}</span>
                  {activeFilterCount > 0 && (
                    <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">{activeFilterCount}</span>
                  )}
                </button>
                {/* Sort controls */}
                <div className="flex flex-row items-stretch justify-between sm:justify-end gap-2">
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    className="px-3 py-2 sm:py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm sm:text-base text-gray-900 dark:text-gray-100"
                  >
                    <option value="dueDate">{language === 'th' ? 'กำหนดส่ง' : 'Due Date'}</option>
                    <option value="priority">{language === 'th' ? 'ความสำคัญ' : 'Priority'}</option>
                    <option value="value">{language === 'th' ? 'มูลค่า' : 'Value'}</option>
                    <option value="id">{language === 'th' ? 'เลขตั๋ว' : 'Ticket No.'}</option>
                    <option value="status">{language === 'th' ? 'สถานะ' : 'Status'}</option>
                  </select>
                  <button
                    onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                    className="px-3 py-2 sm:py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
                    title={language === 'th' ? (sortDir === 'asc' ? 'เรียงจากน้อยไปมาก' : 'เรียงจากมากไปน้อย') : (sortDir === 'asc' ? 'Ascending' : 'Descending')}
                  >
                    <ArrowUpDown className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300" />
                  </button>
                </div>
              </div>
              {showFilter && (
                <div className="mt-3 p-3 sm:p-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg">
                  <div className="production-filter-grid grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    {/* Status filter */}
                    <div>
                      <div className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">{language === 'th' ? 'สถานะ' : 'Status'}</div>
                      {['Pending','Released','In Progress','Finish'].map(st => (
                        <label key={st} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-1">
                          <input
                            type="checkbox"
                            checked={selectedStatuses.has(st)}
                            onChange={(e) => {
                              setSelectedStatuses(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(st); else next.delete(st);
                                return next;
                              });
                            }}
                          />
                          <span>{st}</span>
                        </label>
                      ))}
                    </div>
                    {/* Priority filter */}
                    <div>
                      <div className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">{language === 'th' ? 'ความสำคัญ' : 'Priority'}</div>
                      {['High Priority','Medium Priority','Low Priority','ยังไม่ได้กำหนด Priority'].map(pr => (
                        <label key={pr} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-1">
                          <input
                            type="checkbox"
                            checked={selectedPriorities.has(pr)}
                            onChange={(e) => {
                              setSelectedPriorities(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(pr); else next.delete(pr);
                                return next;
                              });
                            }}
                          />
                          <span>{pr}</span>
                        </label>
                      ))}
                    </div>
                    {/* Due date filter */}
                    <div>
                      <div className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">{language === 'th' ? 'วันกำหนดส่ง' : 'Due Date'}</div>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-1">
                        <input
                          type="checkbox"
                          checked={hasDueDateOnly}
                          onChange={(e) => setHasDueDateOnly(e.target.checked)}
                        />
                        <span>{language === 'th' ? 'แสดงเฉพาะที่มีวันกำหนดส่ง' : 'Only with due date'}</span>
                      </label>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
                      onClick={() => setShowFilter(false)}
                    >
                      {language === 'th' ? 'ใช้ตัวกรอง' : 'Apply'}
                    </button>
                    <button
                      className="px-3 py-2 text-sm bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-800 dark:text-gray-200 rounded"
                      onClick={() => {
                        setSelectedStatuses(new Set());
                        setSelectedPriorities(new Set());
                        setHasDueDateOnly(false);
                      }}
                    >
                      {language === 'th' ? 'ล้างค่า' : 'Clear'}
                    </button>
                  </div>
                </div>
              )}
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
              {displayedTickets.length === 0 && !loadingTickets && (
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

              {displayedTickets.map((ticket) => {
                const total = sumTicketAmount(ticket);
                const cleanedId = (ticket.id || "").replace(/^#/, "");
                
                // Get batches for this ticket
                const ticketBatches = batches.filter(batch => batch.ticket_no === ticket.id);
                
                return (
                  <div key={ticket.id} className="ticket-card bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 sm:p-5 shadow-sm hover:shadow-md transition-all">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Header row: RPD + Item Code + Project name */}
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                          <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {ticket.id}
                          </div>
                          {ticket.route && (
                            <span className={`text-xs px-2 py-1 rounded-full font-mono ${ticket.routeClass}`}>
                              {ticket.route}
                            </span>
                          )}
                          {ticket.projectName && (
                            <span className="text-xs sm:text-sm font-medium text-blue-300">
                              {ticket.projectName}
                            </span>
                          )}
                        </div>

                        {/* Meta row */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            {language === 'th' ? 'มูลค่าตั๋ว:' : 'Total price:'}{' '}
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {total.toLocaleString()} {language === 'th' ? 'บาท' : 'Baht'}
                            </span>
                          </span>
                          {ticket.dueDate && (
                            <span>
                              {language === 'th' ? 'กำหนดส่ง:' : 'Due:'}{' '}
                              <span className="font-medium text-gray-800 dark:text-gray-200">
                                {new Date(ticket.dueDate).toLocaleDateString('th-TH')}
                              </span>
                            </span>
                          )}
                          <span>
                            {language === 'th' ? 'จำนวน:' : 'Qty:'}{' '}
                            <span className="font-medium text-gray-800 dark:text-gray-200">
                              {ticket.quantity} {language === 'th' ? 'ชิ้น' : 'pcs'}
                            </span>
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] sm:text-xs ${getPriorityChipClass(ticket.priority)}`}>
                            {ticket.priority}
                          </span>
                          <span className={`inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-[11px] sm:text-xs font-medium ${ticket.statusClass}`}>
                            {ticket.status}
                          </span>
                          {/* Batch count pill */}
                          {ticketBatches.length > 0 && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] sm:text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                              {ticketBatches.length} {language === 'th' ? 'Batch' : 'Batch'}
                            </span>
                          )}
                        </div>
                        
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
                      <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                        <button
                          onClick={() => canAction && router.push(`/production/${encodeURIComponent(cleanedId)}`)}
                          disabled={!canAction}
                          className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium w-full md:w-auto ${
                            canAction 
                              ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer' 
                              : 'bg-gray-400 text-white opacity-50 cursor-not-allowed'
                          }`}
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

