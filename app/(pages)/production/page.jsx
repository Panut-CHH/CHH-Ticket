"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { ClipboardList, CheckCircle2, Clock3, Coins, Search, ArrowUpDown, AlertCircle, ArrowUp, ArrowDown, CheckCircle, Clock, XCircle, Filter, X, Building2, User, Settings2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { canPerformActions, hasPageAccess } from "@/utils/rolePermissions";

const STORE_STATUSES = [
  { value: 'เบิกของแล้ว', label: 'itemsWithdrawn', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400', icon: CheckCircle2 },
  { value: 'รอของ', label: 'waitingForItems', color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400', icon: XCircle },
];

export default function ProductionPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canAction = canPerformActions(user?.roles || user?.role);
  const canViewProductionDetail = hasPageAccess(user?.roles || user?.role, '/production');

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
  const hasStorageRole = hasRole('Storage');
  const hasViewerRole = hasRole('Viewer');
  const hasSupervisorProductionRole = hasRole('Supervisor Production');
  const hasSupervisorPaintingRole = hasRole('Supervisor Painting');
  const canUpdateStoreStatus = isAdmin || hasRole('Storage') || hasRole('SuperAdmin');

  // Load ERP tickets and merge with DB station assignments
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadError, setLoadError] = useState("");
  
  // Batch data
  const [batches, setBatches] = useState([]);
  // Global gate: hide tickets when no stations exist yet
  const [hasAnyStations, setHasAnyStations] = useState(true);
  
  // All technicians from users table
  const [allTechnicians, setAllTechnicians] = useState([]);
  
  // Tab state for completed/incomplete tickets
  // Initialize from URL parameter if present, otherwise default to 'incomplete'
  const initialTab = searchParams.get('tab') === 'completed' ? 'completed' : 'incomplete';
  const [activeTab, setActiveTab] = useState(initialTab); // 'completed' or 'incomplete'

  // Search / Filter / Sort state
  // Initialize from URL parameters to persist filters when navigating back
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState(new Set());
  const [selectedPriorities, setSelectedPriorities] = useState(new Set());
  const [selectedStoreStatuses, setSelectedStoreStatuses] = useState(new Set());
  const [selectedStation, setSelectedStation] = useState(searchParams.get('station') || ""); // Filter by station name
  const [selectedTechnician, setSelectedTechnician] = useState(searchParams.get('technician') || ""); // Filter by technician name
  const [selectedProject, setSelectedProject] = useState(searchParams.get('project') || ""); // Filter by project name
  const [hasDueDateOnly, setHasDueDateOnly] = useState(false);
  const [sortKey, setSortKey] = useState('dueDate'); // 'dueDate' | 'priority' | 'value' | 'id' | 'status' | 'storeStatus'
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'
  const [expandedGroups, setExpandedGroups] = useState(new Set()); // Track which project groups are expanded
  const [updatingStatus, setUpdatingStatus] = useState(new Set());

  // Function to update URL params when filters change
  const updateURLParams = (updates) => {
    isUpdatingFromURL.current = true; // Mark that we're updating URL
    const params = new URLSearchParams(searchParams.toString());
    
    // Update tab
    if (updates.tab !== undefined) {
      if (updates.tab) {
        params.set('tab', updates.tab);
      } else {
        params.delete('tab');
      }
    }
    
    // Update station filter
    if (updates.station !== undefined) {
      if (updates.station) {
        params.set('station', updates.station);
      } else {
        params.delete('station');
      }
    }
    
    // Update technician filter
    if (updates.technician !== undefined) {
      if (updates.technician) {
        params.set('technician', updates.technician);
      } else {
        params.delete('technician');
      }
    }
    
    // Update project filter
    if (updates.project !== undefined) {
      if (updates.project) {
        params.set('project', updates.project);
      } else {
        params.delete('project');
      }
    }
    
    // Update URL without reloading page
    router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  };

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

  // Function to load all technicians from users table and ticket_assignments
  const loadAllTechnicians = async () => {
    try {
      const technicianNames = new Set();
      
      // Method 1: Load from users table with production-related roles
      try {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, name, role, roles, status')
          .eq('status', 'active')
          .order('name', { ascending: true });
        
        if (!usersError && Array.isArray(usersData)) {
          usersData.forEach(user => {
            // Check if user has production-related role
            const userRoles = user.roles || (user.role ? [user.role] : []);
            const hasProductionRole = userRoles.some(r => {
              const role = String(r).toLowerCase();
              return role === 'production' || role === 'painting' || role === 'packing' || 
                     role === 'cnc' || role === 'storage' || role === 'viewer';
            });
            
            if (hasProductionRole && user.name && user.name.trim()) {
              technicianNames.add(user.name.trim());
            }
          });
        }
      } catch (e) {
        console.warn('Failed to load technicians from users table:', e);
      }
      
      // Method 2: Also load from ticket_assignments to catch any technicians that might be missing
      try {
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('ticket_assignments')
          .select(`
            technician_id,
            users(name)
          `);
        
        if (!assignmentError && Array.isArray(assignmentData)) {
          assignmentData.forEach(assignment => {
            if (assignment.users?.name && assignment.users.name.trim()) {
              technicianNames.add(assignment.users.name.trim());
            }
          });
        }
      } catch (e) {
        console.warn('Failed to load technicians from ticket_assignments:', e);
      }
      
      setAllTechnicians(Array.from(technicianNames).sort());
    } catch (err) {
      console.error('Failed to load technicians:', err);
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
        .select('no, source_no, project_id, description, description_2, due_date, priority, customer_name, quantity, pass_quantity, store_status')
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
          customerName: t.customer_name || '',
          storeStatus: t.store_status || null
        };
      });
      
      // DB-first: ไม่ต้องสร้าง rework tickets แยก เพราะ baseMapped ครอบคลุมอยู่แล้ว

      // 3) Load station flows and assignments from DB
      // Filter flows ตาม ticket_no ที่มีอยู่จริงเพื่อลดข้อมูลที่ต้องโหลด
      // ใช้ pagination และแบ่ง queries เมื่อ ticket numbers เยอะเกินไป (Supabase .in() limit ~1000)
      let flows = [];
      {
        if (allTicketNumbers.length === 0) {
          flows = [];
        } else {
          let allFlows = [];
          const maxInQuery = 500; // ใช้ 500 เพื่อความปลอดภัย (Supabase .in() limit ~1000)
          let flowError = null;
          
          // แบ่ง ticket numbers เป็น chunks
          for (let i = 0; i < allTicketNumbers.length; i += maxInQuery) {
            const ticketChunk = allTicketNumbers.slice(i, i + maxInQuery);
            
            let from = 0;
            const pageSize = 1000;
            let hasMore = true;
            
            while (hasMore) {
              const { data: flowsPage, error: error } = await supabase
                .from('ticket_station_flow')
                .select(`
                  *,
                  stations (
                    name_th,
                    code
                  )
                `)
                .in('ticket_no', ticketChunk)
                .order('step_order', { ascending: true })
                .range(from, from + pageSize - 1);
              
              if (error) {
                flowError = error;
                hasMore = false;
                break;
              }
              
              if (flowsPage && flowsPage.length > 0) {
                allFlows = allFlows.concat(flowsPage);
                from += pageSize;
                hasMore = flowsPage.length === pageSize;
              } else {
                hasMore = false;
              }
            }
            
            if (flowError) break;
          }
          
          if (flowError) {
            console.error('[PRODUCTION] Failed to load station flows:', flowError);
            flows = [];
          } else {
            flows = allFlows;
            console.log(`[PRODUCTION] Loaded ${flows.length} flows for ${allTicketNumbers.length} tickets (filtered by ticket_no)`);
          }
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

        // เรียง ticketFlows ตาม step_order เพื่อให้ roadmap เรียงลำดับถูกต้อง
        const sortedTicketFlows = [...ticketFlows].sort((a, b) => {
          const orderA = Number(a.step_order) || 0;
          const orderB = Number(b.step_order) || 0;
          return orderA - orderB;
        });
        
        console.log(`[PRODUCTION] Ticket ${ticketNo} sorted flows:`, sortedTicketFlows.map(f => ({
          step_order: f.step_order,
          station: f.stations?.name_th,
          status: f.status
        })));
        
        const roadmap = sortedTicketFlows.map(flow => ({
          step: flow.stations?.name_th || '',
          status: flow.status || 'pending',
          technician: assignmentMap[`${flow.ticket_no}-${flow.station_id}-${flow.step_order}`] || '',
          step_order: flow.step_order // เก็บ step_order ไว้ใน roadmap เพื่อใช้ในการตรวจสอบ
        }));

        console.log(`[PRODUCTION] Ticket ${ticketNo} roadmap:`, roadmap.map(r => ({ step: r.step, status: r.status, step_order: r.step_order })));

        // Build stations with price for amount calc
        const stations = sortedTicketFlows.map(flow => ({
          name: flow.stations?.name_th || '',
          technician: assignmentMap[`${flow.ticket_no}-${flow.station_id}-${flow.step_order}`] || '',
          priceType: flow.price_type || 'flat',
          price: Number(flow.price) || 0,
          status: flow.status || 'pending'
        }));

        const currentFlow = sortedTicketFlows.find(f => f.status === 'current');
        let assignee = currentFlow ? (assignmentMap[`${currentFlow.ticket_no}-${currentFlow.station_id}-${currentFlow.step_order}`] || '') : '';
        if (!assignee) {
          assignee = assignmentMap[`${sortedTicketFlows[0].ticket_no}-${sortedTicketFlows[0].station_id}-${sortedTicketFlows[0].step_order}`] || '';
        }

        const status = calculateTicketStatus(stations, roadmap, sortedTicketFlows);
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
          customerName: dbTicket?.customer_name || t.customerName,
          storeStatus: dbTicket?.store_status || t.storeStatus
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

  // Track if we're updating from URL to prevent loops
  const isUpdatingFromURL = useRef(false);
  
  // Sync activeTab and filters with URL parameter changes
  useEffect(() => {
    // Only sync if we're not currently updating URL (to prevent loops)
    if (isUpdatingFromURL.current) {
      isUpdatingFromURL.current = false;
      return;
    }
    
    const tabParam = searchParams.get('tab');
    if (tabParam === 'completed' || tabParam === 'incomplete') {
      if (tabParam !== activeTab) {
        setActiveTab(tabParam);
      }
    }
    
    // Sync filters from URL params (only update if different to avoid loops)
    const stationParam = searchParams.get('station') || '';
    const technicianParam = searchParams.get('technician') || '';
    const projectParam = searchParams.get('project') || '';
    
    if (stationParam !== selectedStation) {
      setSelectedStation(stationParam);
    }
    if (technicianParam !== selectedTechnician) {
      setSelectedTechnician(technicianParam);
    }
    if (projectParam !== selectedProject) {
      setSelectedProject(projectParam);
    }
  }, [searchParams]);

  // Initial load
  useEffect(() => {
    loadTickets();
    loadBatchData();
    loadAllTechnicians();
    
    // Restore search params from sessionStorage if URL doesn't have them
    // This handles cases where user navigates back via browser back button
    if (typeof window !== 'undefined') {
      const savedParams = sessionStorage.getItem('productionPageParams');
      if (savedParams && !searchParams.toString()) {
        // Only restore if current URL has no params
        router.replace(`/production?${savedParams}`, { scroll: false });
        sessionStorage.removeItem('productionPageParams');
      }
    }
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

  function calculateTicketStatus(stations, roadmap, ticketFlows = []) {
    if (!Array.isArray(stations) || stations.length === 0) return "Pending";
    const hasAssigned = stations.some(s => (s.technician || '').trim() !== '');
    if (!hasAssigned) return "Pending";
    
    const ticketNo = ticketFlows[0]?.ticket_no || roadmap[0]?.step_order || 'unknown';
    
    // เช็คจาก ticketFlows ก่อน (เป็น source of truth)
    if (Array.isArray(ticketFlows) && ticketFlows.length > 0) {
      // เรียง ticketFlows ตาม step_order
      const sortedFlows = [...ticketFlows].sort((a, b) => {
        const orderA = Number(a.step_order) || 0;
        const orderB = Number(b.step_order) || 0;
        return orderA - orderB;
      });
      
      console.log(`[PRODUCTION] Ticket ${ticketNo}: Checking ${sortedFlows.length} flows:`, 
        sortedFlows.map(f => `order ${f.step_order} (${f.stations?.name_th}) = ${f.status}`));
      
      // เช็คว่ามี step ที่กำลังทำอยู่หรือไม่
      const hasCurrent = sortedFlows.some(flow => {
        const flowStatus = (flow.status || 'pending').toLowerCase();
        return flowStatus === 'current';
      });
      if (hasCurrent) {
        console.log(`[PRODUCTION] Ticket ${ticketNo}: Has current step, status: In Progress`);
        return "In Progress";
      }
      
      // เช็คว่ามี step ไหนที่ยังไม่ completed (pending หรือ current)
      const incompleteSteps = sortedFlows.filter(flow => {
        const flowStatus = (flow.status || 'pending').toLowerCase();
        return flowStatus !== 'completed';
      });
      
      if (incompleteSteps.length > 0) {
        console.log(`[PRODUCTION] ⚠️ Ticket ${ticketNo}: ${incompleteSteps.length}/${sortedFlows.length} steps not completed:`, 
          incompleteSteps.map(f => `order ${f.step_order} (${f.stations?.name_th}) = ${f.status}`));
        return "In Progress";
      }
      
      // ถ้าทุก step เป็น completed ให้ตรวจสอบว่า step สุดท้าย (step_order สูงสุด) เป็น completed
      const maxStepOrder = Math.max(...sortedFlows.map(f => Number(f.step_order) || 0));
      const lastFlow = sortedFlows.find(f => Number(f.step_order) === maxStepOrder);
      if (lastFlow) {
        const lastFlowStatus = (lastFlow.status || 'pending').toLowerCase();
        if (lastFlowStatus === 'completed') {
          console.log(`[PRODUCTION] ✅ Ticket ${ticketNo}: All ${sortedFlows.length} steps completed (last: order ${maxStepOrder}, ${lastFlow.stations?.name_th}), status: Finish`);
          return "Finish";
        } else {
          console.log(`[PRODUCTION] ⚠️ Ticket ${ticketNo}: Last step (order ${maxStepOrder}, ${lastFlow.stations?.name_th}) not completed, status: ${lastFlowStatus}`);
          return "In Progress";
        }
      }
    }
    
    // Fallback: เช็คจาก roadmap (กรณีที่ ticketFlows ไม่มีข้อมูล)
    if (Array.isArray(roadmap) && roadmap.length > 0) {
      const hasCurrent = roadmap.some(step => step.status === 'current');
      if (hasCurrent) {
        console.log(`[PRODUCTION] Ticket ${ticketNo}: Has current step in roadmap, status: In Progress`);
        return "In Progress";
      }
      
      // เช็คว่ามี step ไหนที่ยังไม่ completed
      const incompleteSteps = roadmap.filter(step => {
        const stepStatus = (step.status || 'pending').toLowerCase();
        return stepStatus !== 'completed';
      });
      
      if (incompleteSteps.length > 0) {
        console.log(`[PRODUCTION] ⚠️ Ticket ${ticketNo}: ${incompleteSteps.length}/${roadmap.length} roadmap steps not completed:`, 
          incompleteSteps.map(s => `${s.step} = ${s.status}`));
        return "In Progress";
      }
      
      // ถ้าทุก step ใน roadmap เป็น completed แต่ไม่มี ticketFlows ให้ verify
      // ยังไม่ถือว่าเสร็จเพราะอาจมี step อื่นที่ยังไม่ถูกเพิ่มใน roadmap
      console.log(`[PRODUCTION] ⚠️ Ticket ${ticketNo}: All roadmap steps completed but no ticketFlows to verify, status: In Progress`);
      return "In Progress";
    }
    
    console.log(`[PRODUCTION] Ticket ${ticketNo}: Default status: Released`);
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

  const getStatusDisplay = (status) => {
    if (!status) return null;
    const statusObj = STORE_STATUSES.find(s => s.value === status);
    if (!statusObj) return null;
    const IconComponent = statusObj.icon;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm ${statusObj.color}`}>
        <IconComponent className="w-3.5 h-3.5" />
        {t(statusObj.label, language)}
      </span>
    );
  };

  const updateStoreStatus = async (ticketId, newStatus) => {
    if (!canUpdateStoreStatus) {
      alert(language === 'th' ? 'คุณไม่มีสิทธิ์ในการอัปเดตสถานะ' : 'You do not have permission to update status');
      return;
    }

    setUpdatingStatus(prev => new Set(prev).add(ticketId));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/store-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({ store_status: newStatus }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update store status');
      }

      await loadTickets();
    } catch (error) {
      console.error('Error updating store status:', error);
      alert(language === 'th' 
        ? `ไม่สามารถอัปเดตสถานะได้: ${error.message}` 
        : `Failed to update status: ${error.message}`);
    } finally {
      setUpdatingStatus(prev => {
        const next = new Set(prev);
        next.delete(ticketId);
        return next;
      });
    }
  };

  const myTickets = useMemo(() => {
    if (!myName) return [];
    let filtered = [];
    if (isAdmin || hasStorageRole || hasViewerRole || hasSupervisorProductionRole || hasSupervisorPaintingRole) {
      // Admins, Storage, Viewer, Supervisor Production, and Supervisor Painting see all tickets
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
  }, [myName, myNameLower, tickets, isAdmin, hasCNCRole, hasPackingRole, hasStorageRole, hasViewerRole, hasSupervisorProductionRole, hasSupervisorPaintingRole, user]);

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
      // Only "สี" (paint) station goes to colorPrice
      // All other stations including "ประกอบวงกบ" (frame assembly) and "ประกอบชุดชาร์ป" (sharp set assembly) go to productionPrice
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
        // All non-color stations go to productionPrice, including:
        // - ประกอบวงกบ (frame assembly)
        // - ประกอบชุดชาร์ป (sharp set assembly)
        // - อัดบาน (press)
        // - and all other production stations
        productionPrice += stationTotal;
      }
    });
    
    const total = productionPrice + colorPrice;
    return total;
  };

  const priorityRank = (p) => {
    if (!p) return 4; // No priority - lowest
    const priority = p.toString().toLowerCase().trim();
    
    // High priority variations
    if (priority === "high priority" || priority === "high") return 0;
    
    // Medium priority variations
    if (priority === "medium priority" || priority === "medium") return 1;
    
    // Low priority variations
    if (priority === "low priority" || priority === "low") return 2;
    
    // No priority set (Thai)
    if (priority === "ยังไม่ได้กำหนด priority" || priority.includes("ไม่ได้กำหนด")) return 3;
    
    // Unknown/other - put at end
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

  // Get all unique station names from tickets (current or next step)
  // Use 'tickets' instead of 'myTickets' to show all available stations in the system
  const availableStations = useMemo(() => {
    const stations = new Set();
    tickets.forEach(ticket => {
      const roadmap = Array.isArray(ticket.roadmap) ? ticket.roadmap : [];
      // Get current step
      const currentStep = roadmap.find(step => step.status === 'current');
      if (currentStep?.step) {
        stations.add(currentStep.step);
      }
      // Get next pending step
      const nextPendingStep = roadmap.find(step => step.status === 'pending');
      if (nextPendingStep?.step) {
        stations.add(nextPendingStep.step);
      }
    });
    return Array.from(stations).sort();
  }, [tickets]);

  // Get all unique technician names - combine from users table and tickets
  // Priority: Use allTechnicians from users table, then add any from tickets that might be missing
  const availableTechnicians = useMemo(() => {
    const technicians = new Set();
    
    // First, add all technicians from users table
    allTechnicians.forEach(tech => technicians.add(tech));
    
    // Then, also add technicians from tickets (in case some are in tickets but not in users table with proper role)
    tickets.forEach(ticket => {
      const roadmap = Array.isArray(ticket.roadmap) ? ticket.roadmap : [];
      // Get current step technician
      const currentStep = roadmap.find(step => step.status === 'current');
      if (currentStep?.technician) {
        // Handle comma-separated technicians
        const techs = currentStep.technician.split(',').map(t => t.trim()).filter(t => t);
        techs.forEach(tech => technicians.add(tech));
      }
      // Get next pending step technician
      const nextPendingStep = roadmap.find(step => step.status === 'pending');
      if (nextPendingStep?.technician) {
        // Handle comma-separated technicians
        const techs = nextPendingStep.technician.split(',').map(t => t.trim()).filter(t => t);
        techs.forEach(tech => technicians.add(tech));
      }
      // Also check assignee field
      if (ticket.assignee && ticket.assignee !== '-') {
        const techs = ticket.assignee.split(',').map(t => t.trim()).filter(t => t);
        techs.forEach(tech => technicians.add(tech));
      }
    });
    
    return Array.from(technicians).sort();
  }, [allTechnicians, tickets]);

  // Get all unique project names from tickets
  // Use 'tickets' instead of 'myTickets' to show all available projects in the system
  const availableProjects = useMemo(() => {
    const projects = new Set();
    tickets.forEach(ticket => {
      if (ticket.projectName && ticket.projectName.trim()) {
        projects.add(ticket.projectName);
      }
    });
    return Array.from(projects).sort();
  }, [tickets]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStatuses.size > 0) count += 1;
    if (selectedPriorities.size > 0) count += 1;
    if (selectedStoreStatuses.size > 0) count += 1;
    if (selectedStation) count += 1;
    if (selectedTechnician) count += 1;
    if (selectedProject) count += 1;
    if (hasDueDateOnly) count += 1;
    return count;
  }, [selectedStatuses, selectedPriorities, selectedStoreStatuses, selectedStation, selectedTechnician, selectedProject, hasDueDateOnly]);

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
    if (selectedStoreStatuses.size > 0) {
      // ถ้าเลือก filter store status และ ticket ไม่มี store status หรือไม่ตรงกับที่เลือก ให้ filter ออก
      const ticketStoreStatus = t.storeStatus || 'ยังไม่มีสถานะ';
      if (!selectedStoreStatuses.has(ticketStoreStatus)) return false;
    }
    if (selectedStation) {
      // Filter by station name (current or next step)
      const roadmap = Array.isArray(t.roadmap) ? t.roadmap : [];
      const currentStep = roadmap.find(step => step.status === 'current');
      const nextPendingStep = roadmap.find(step => step.status === 'pending');
      const currentStation = currentStep?.step || '';
      const nextStation = nextPendingStep?.step || '';
      // Check if selected station matches current or next station
      if (currentStation !== selectedStation && nextStation !== selectedStation) {
        return false;
      }
    }
    if (selectedTechnician) {
      // Filter by technician name (only current or next pending step, not all steps)
      const roadmap = Array.isArray(t.roadmap) ? t.roadmap : [];
      const currentStep = roadmap.find(step => step.status === 'current');
      const nextPendingStep = roadmap.find(step => step.status === 'pending');
      
      // Get technicians from current step only
      const currentTechnicians = currentStep?.technician 
        ? currentStep.technician.split(',').map(tech => tech.trim()).filter(tech => tech)
        : [];
      
      // Get technicians from next pending step only
      const nextTechnicians = nextPendingStep?.technician
        ? nextPendingStep.technician.split(',').map(tech => tech.trim()).filter(tech => tech)
        : [];
      
      // Only check current and next pending steps (not assignee or other steps)
      const relevantTechnicians = [...currentTechnicians, ...nextTechnicians];
      
      // Check if selected technician matches any of the relevant technicians
      if (relevantTechnicians.length === 0 || !relevantTechnicians.some(tech => tech === selectedTechnician)) {
        return false;
      }
    }
    if (selectedProject) {
      // Filter by project name
      const ticketProjectName = t.projectName || '';
      if (ticketProjectName !== selectedProject) {
        return false;
      }
    }
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
          // Put items without dueDate at the end
          const aHasDate = !!a.dueDate;
          const bHasDate = !!b.dueDate;
          if (!aHasDate && !bHasDate) return 0;
          if (!aHasDate) return 1; // a goes to end
          if (!bHasDate) return -1; // b goes to end
          av = new Date(a.dueDate).getTime();
          bv = new Date(b.dueDate).getTime();
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
          // Create status rank for consistent sorting
          const statusRank = (s) => {
            const status = (s || '').toString();
            if (status === 'Pending') return 0;
            if (status === 'Released') return 1;
            if (status === 'In Progress') return 2;
            if (status === 'Finish') return 3;
            return 4; // Unknown status
          };
          av = statusRank(a.status);
          bv = statusRank(b.status);
          break;
        }
        case 'storeStatus': {
          // Create store status rank for sorting
          const storeStatusRank = (s) => {
          if (!s || s === null) return 3; // ไม่มีสถานะ - ไว้ท้ายสุด
          const status = String(s);
          if (status === 'เบิกของแล้ว') return 0;
          if (status === 'รอของ') return 1;
          return 2; // Unknown store status
          };
          av = storeStatusRank(a.storeStatus);
          bv = storeStatusRank(b.storeStatus);
          break;
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
  }, [filteredTickets, searchTerm, selectedStatuses, selectedPriorities, selectedStation, selectedTechnician, selectedProject, hasDueDateOnly, sortKey, sortDir]);

  // Group tickets by project name
  const groupedTickets = useMemo(() => {
    const groups = new Map();
    
    displayedTickets.forEach(ticket => {
      const projectName = ticket.projectName || (language === 'th' ? 'ไม่มีชื่อโครงการ' : 'No Project Name');
      if (!groups.has(projectName)) {
        groups.set(projectName, []);
      }
      groups.get(projectName).push(ticket);
    });
    
    // Convert to array of { projectName, tickets } objects
    return Array.from(groups.entries()).map(([projectName, tickets]) => ({
      projectName,
      tickets
    })).sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [displayedTickets, language]);

  // Toggle group expansion
  const toggleGroup = (projectName) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectName)) {
        newSet.delete(projectName);
      } else {
        newSet.add(projectName);
      }
      return newSet;
    });
  };

  const stats = useMemo(() => {
    const total = myTickets.length;
    
    // Calculate due soon count (within 7 days from today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(today.getDate() + 7);
    
    const dueSoonCount = myTickets.filter((t) => {
      if (!t.dueDate) return false;
      const dueDate = new Date(t.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today && dueDate <= sevenDaysLater;
    }).length;
    
    // Calculate high priority count (exclude finished tickets)
    const highPriorityCount = myTickets.filter((t) => {
      const priority = (t.priority || "").toString();
      const status = (t.status || "").toString();
      const isHighPriority = priority === "High Priority" || priority.toLowerCase() === "high";
      const isFinished = status === "Finish" || status === "Finished";
      return isHighPriority && !isFinished;
    }).length;
    
    return { 
      total,
      dueSoonCount,
      highPriorityCount
    };
  }, [myTickets]);

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
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('ticketsDueSoon', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-500">{stats.dueSoonCount}</div>
                  <Clock3 className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm stat-card">
                <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('highPriorityTickets', language)}</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-500">{stats.highPriorityCount}</div>
                  <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="mt-6 sm:mt-8">
              <div className="flex gap-2 sm:gap-3 border-b border-gray-200 dark:border-slate-700 overflow-x-auto pb-1 -mx-2 px-2 sm:mx-0 sm:px-0">
                <button
                  onClick={() => {
                    setActiveTab('incomplete');
                    updateURLParams({ tab: 'incomplete' });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const url = `${window.location.pathname}?tab=incomplete`;
                    window.open(url, '_blank');
                  }}
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
                  onClick={() => {
                    setActiveTab('completed');
                    updateURLParams({ tab: 'completed' });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const url = `${window.location.pathname}?tab=completed`;
                    window.open(url, '_blank');
                  }}
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
            <div className="mt-4 sm:mt-6 space-y-4">
              {/* Search Bar - Full width on mobile */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-sm sm:text-base text-gray-900 dark:text-gray-100 shadow-sm"
                  placeholder={t('searchTickets', language)}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Filters and Sort - Improved responsive layout */}
              <div className="space-y-3">
                {/* Filter Row 1: Station, Technician, Project */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Station Filter */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <Settings2 className={`w-4 h-4 ${selectedStation ? 'text-blue-500' : 'text-gray-400'}`} />
                    </div>
                    <select
                      value={selectedStation}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedStation(value);
                        updateURLParams({ station: value });
                      }}
                      title={availableStations.length > 5 ? (language === 'th' ? 'สามารถเลื่อนดูรายชื่อสถานีทั้งหมดได้ (Scroll ได้)' : 'You can scroll to see all stations') : ''}
                      className={`w-full pl-10 pr-10 py-3 bg-white dark:bg-slate-800 border rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none cursor-pointer shadow-sm ${
                        selectedStation 
                          ? 'border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/20' 
                          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <option value="">{language === 'th' ? '📍 สถานี' : '📍 Station'}</option>
                      {availableStations.map(station => (
                        <option key={station} value={station}>{station}</option>
                      ))}
                    </select>
                    {selectedStation && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStation("");
                          updateURLParams({ station: "" });
                        }}
                        className="absolute inset-y-0 right-0 pr-10 flex items-center pointer-events-auto z-10"
                      >
                        <X className="w-4 h-4 text-gray-400 hover:text-red-500 transition-colors" />
                      </button>
                    )}
                    <div className="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Technician Filter */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <User className={`w-4 h-4 ${selectedTechnician ? 'text-blue-500' : 'text-gray-400'}`} />
                    </div>
                    <select
                      value={selectedTechnician}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedTechnician(value);
                        updateURLParams({ technician: value });
                      }}
                      title={availableTechnicians.length > 5 ? (language === 'th' ? 'สามารถเลื่อนดูรายชื่อช่างทั้งหมดได้ (Scroll ได้)' : 'You can scroll to see all technicians') : ''}
                      className={`w-full pl-10 pr-10 py-3 bg-white dark:bg-slate-800 border rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none cursor-pointer shadow-sm ${
                        selectedTechnician 
                          ? 'border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/20' 
                          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <option value="">{language === 'th' ? '👤 ช่าง' : '👤 Tech'}</option>
                      {availableTechnicians.map(technician => (
                        <option key={technician} value={technician}>{technician}</option>
                      ))}
                    </select>
                    {selectedTechnician && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTechnician("");
                          updateURLParams({ technician: "" });
                        }}
                        className="absolute inset-y-0 right-0 pr-10 flex items-center pointer-events-auto z-10"
                      >
                        <X className="w-4 h-4 text-gray-400 hover:text-red-500 transition-colors" />
                      </button>
                    )}
                    <div className="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Project Filter */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <Building2 className={`w-4 h-4 ${selectedProject ? 'text-blue-500' : 'text-gray-400'}`} />
                    </div>
                    <select
                      value={selectedProject}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedProject(value);
                        updateURLParams({ project: value });
                      }}
                      title={availableProjects.length > 5 ? (language === 'th' ? 'สามารถเลื่อนดูรายชื่อโครงการทั้งหมดได้ (Scroll ได้)' : 'You can scroll to see all projects') : ''}
                      className={`w-full pl-10 pr-10 py-3 bg-white dark:bg-slate-800 border rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none cursor-pointer shadow-sm ${
                        selectedProject 
                          ? 'border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/20' 
                          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <option value="">{language === 'th' ? '🏢 โครงการ' : '🏢 Project'}</option>
                      {availableProjects.map(project => (
                        <option key={project} value={project}>{project}</option>
                      ))}
                    </select>
                    {selectedProject && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProject("");
                          updateURLParams({ project: "" });
                        }}
                        className="absolute inset-y-0 right-0 pr-10 flex items-center pointer-events-auto z-10"
                      >
                        <X className="w-4 h-4 text-gray-400 hover:text-red-500 transition-colors" />
                      </button>
                    )}
                    <div className="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Sort Row 2: Sort Key, Sort Direction, Clear Button */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Sort Key */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <ArrowUpDown className="w-4 h-4 text-gray-400" />
                    </div>
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value)}
                      className="w-full pl-10 pr-8 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 shadow-sm"
                    >
                      <option value="dueDate">{language === 'th' ? '📅 กำหนดส่ง' : '📅 Due'}</option>
                      <option value="priority">{language === 'th' ? '⚡ ความสำคัญ' : '⚡ Priority'}</option>
                      <option value="value">{language === 'th' ? '💰 มูลค่า' : '💰 Value'}</option>
                      <option value="id">{language === 'th' ? '🔢 เลขตั๋ว' : '🔢 ID'}</option>
                      <option value="status">{language === 'th' ? '📊 สถานะ' : '📊 Status'}</option>
                      <option value="storeStatus">{language === 'th' ? '📦 Store' : '📦 Store'}</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Sort Direction */}
                  <button
                    onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                    className={`w-full px-4 py-3 bg-white dark:bg-slate-800 border rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2 shadow-sm ${
                      sortDir === 'asc' 
                        ? 'text-blue-600 dark:text-blue-400 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                        : 'text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700'
                    }`}
                    title={language === 'th' ? (sortDir === 'asc' ? 'เรียงจากน้อยไปมาก (คลิกเพื่อเปลี่ยน)' : 'เรียงจากมากไปน้อย (คลิกเพื่อเปลี่ยน)') : (sortDir === 'asc' ? 'Ascending (click to change)' : 'Descending (click to change)')}
                  >
                    {sortDir === 'asc' ? (
                      <ArrowUp className="w-5 h-5" />
                    ) : (
                      <ArrowDown className="w-5 h-5" />
                    )}
                    <span className="text-sm">
                      {sortDir === 'asc' ? (language === 'th' ? 'น้อย→มาก' : 'A→Z') : (language === 'th' ? 'มาก→น้อย' : 'Z→A')}
                    </span>
                  </button>

                  {/* Clear All Filters Button */}
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => {
                        setSelectedStation("");
                        setSelectedTechnician("");
                        setSelectedProject("");
                        setSearchTerm("");
                        setSelectedStatuses(new Set());
                        setSelectedPriorities(new Set());
                        setSelectedStoreStatuses(new Set());
                        setHasDueDateOnly(false);
                        // Clear URL params for filters
                        updateURLParams({ station: "", technician: "", project: "" });
                      }}
                      className="w-full px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all flex items-center justify-center gap-2 text-sm font-medium shadow-sm"
                    >
                      <X className="w-4 h-4" />
                      <span>{language === 'th' ? 'ล้างทั้งหมด' : 'Clear All'}</span>
                      {activeFilterCount > 0 && (
                        <span className="px-2 py-0.5 bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300 rounded-full text-xs font-semibold">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                  )}
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

              {groupedTickets.map((group) => {
                const isExpanded = expandedGroups.has(group.projectName);
                
                return (
                  <div key={group.projectName} className="space-y-2">
                    {/* Group Header - Clickable to expand/collapse */}
                    <button
                      onClick={() => toggleGroup(group.projectName)}
                      className="w-full flex items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        )}
                        <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <div className="text-left flex-1">
                          <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {group.projectName}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-600 dark:bg-blue-500 text-white rounded-lg text-xs sm:text-sm font-semibold shadow-sm min-w-[2.5rem]">
                          {group.tickets.length}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                          {language === 'th' ? 'ตั๋ว' : 'tickets'}
                        </span>
                      </div>
                    </button>

                    {/* Group Tickets - Only show when expanded */}
                    {isExpanded && (
                      <div className="space-y-3 sm:space-y-4 pl-4 sm:pl-6 border-l-2 border-blue-200 dark:border-blue-800">
                        {group.tickets.map((ticket) => {
                const total = sumTicketAmount(ticket);
                const cleanedId = (ticket.id || "").replace(/^#/, "");
                
                // Get batches for this ticket
                const ticketBatches = batches.filter(batch => batch.ticket_no === ticket.id);
                
                // Find current station and assigned technician
                const roadmap = Array.isArray(ticket.roadmap) ? ticket.roadmap : [];
                const currentStep = roadmap.find(step => step.status === 'current');
                const currentStation = currentStep?.step || null;
                const currentTechnician = currentStep?.technician || null;
                
                // If no current step, find first pending step
                const firstPendingStep = roadmap.find(step => step.status === 'pending');
                const pendingStation = firstPendingStep?.step || null;
                const pendingTechnician = firstPendingStep?.technician || null;
                const isUpdatingStatus = updatingStatus.has(ticket.id);
                
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

                        {/* Current Station and Assigned Technician Info - Minimal */}
                        {(currentStation || pendingStation) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {currentStation ? (
                              <>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100/80 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] sm:text-xs font-medium border border-amber-200/50 dark:border-amber-800/50 hover:bg-amber-200/80 dark:hover:bg-amber-900/40 transition-colors duration-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse"></span>
                                  {language === 'th' ? 'สถานี:' : 'Station:'} {currentStation}
                                </span>
                                {currentTechnician && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-[10px] sm:text-xs font-medium border border-blue-200/50 dark:border-blue-800/50 hover:bg-blue-100/80 dark:hover:bg-blue-900/30 transition-colors duration-200">
                                    <span className="text-[8px]">👤</span>
                                    {currentTechnician}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100/80 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 text-[10px] sm:text-xs font-medium border border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-200/80 dark:hover:bg-gray-700/50 transition-colors duration-200">
                                  {language === 'th' ? 'ถัดไป:' : 'Next:'} {pendingStation}
                                </span>
                                {pendingTechnician && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-[10px] sm:text-xs font-medium border border-blue-200/50 dark:border-blue-800/50 hover:bg-blue-100/80 dark:hover:bg-blue-900/30 transition-colors duration-200">
                                    <span className="text-[8px]">👤</span>
                                    {pendingTechnician}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        )}

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
                          {/* Store status pill */}
                          {getStatusDisplay(ticket.storeStatus)}
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
                      <div className="shrink-0 flex flex-col items-stretch gap-2 w-full md:w-auto">
                        <button
                          onClick={() => {
                            if (canViewProductionDetail) {
                              // Store current search params before navigating to detail
                              const currentParams = searchParams.toString();
                              if (currentParams) {
                                sessionStorage.setItem('productionPageParams', currentParams);
                              }
                              router.push(`/production/${encodeURIComponent(cleanedId)}`);
                            }
                          }}
                          onContextMenu={(e) => {
                            if (canViewProductionDetail) {
                              e.preventDefault();
                              window.open(`/production/${encodeURIComponent(cleanedId)}`, '_blank');
                            }
                          }}
                          disabled={!canViewProductionDetail}
                          className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium w-full md:w-auto ${
                            canViewProductionDetail 
                              ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer' 
                              : 'bg-gray-400 text-white opacity-50 cursor-not-allowed'
                          }`}
                        >
                          {t('detailsMore', language)}
                        </button>
                        {canUpdateStoreStatus && (
                          <div className="flex flex-wrap gap-1.5 w-full">
                            {STORE_STATUSES.map((statusOption) => {
                              const IconComponent = statusOption.icon;
                              const isSelected = ticket.storeStatus === statusOption.value;

                              return (
                                <button
                                  key={statusOption.value}
                                  onClick={() => {
                                    if (!isUpdatingStatus) {
                                      const newStatus = isSelected ? null : statusOption.value;
                                      updateStoreStatus(ticket.id, newStatus);
                                    }
                                  }}
                                  disabled={isUpdatingStatus}
                                  className={`
                                    flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-sm
                                    ${isSelected
                                      ? `${statusOption.color} ring-1 ring-offset-1 ring-offset-white dark:ring-offset-slate-800`
                                      : 'bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                                    }
                                    ${isUpdatingStatus ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:translate-y-[-1px] active:translate-y-[1px]'}
                                  `}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <IconComponent className="w-4 h-4" />
                                    {t(statusOption.label, language)}
                                  </span>
                                  {isSelected && <X className="w-3.5 h-3.5 opacity-75" />}
                                </button>
                              );
                            })}
                            {ticket.storeStatus && (
                              <button
                                onClick={() => !isUpdatingStatus && updateStoreStatus(ticket.id, null)}
                                disabled={isUpdatingStatus}
                                className={`
                                  px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-sm bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600 border border-transparent hover:border-gray-300 dark:hover:border-slate-500
                                  ${isUpdatingStatus ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:translate-y-[-1px] active:translate-y-[1px]'}
                                `}
                              >
                                <XCircle className="w-4 h-4 inline mr-1.5" />
                                {language === 'th' ? 'ล้างสถานะ' : 'Clear'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                        );
                      })}
                      </div>
                    )}
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

