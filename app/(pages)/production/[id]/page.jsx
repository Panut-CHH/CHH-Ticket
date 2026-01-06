"use client";

console.log('✅ PRODUCTION DETAIL PAGE LOADED - File version with price calculation');

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, Circle, Play, Check, Calendar, Package, Coins, ArrowLeft, FileText, Loader2, Info, Printer, X } from "lucide-react";
import DocumentViewer from "@/components/DocumentViewer";
import Modal from "@/components/Modal";
import { supabase } from "@/utils/supabaseClient";
import { isSupervisor, canSupervisorActForTechnician, canPerformActionsInProduction, isSupervisorProduction, isSupervisorPainting } from "@/utils/rolePermissions";

function DetailCard({ ticket, onDone, onStart, me, isAdmin = false, batches = [], userId = null, userRoles = [] }) {
  console.log('🚀 [DetailCard] Component RENDERED');
  // Debug: Check ticket data
  console.log('[DetailCard] Ticket received:', ticket ? { id: ticket.id, hasStations: !!ticket.stations, stationsLength: ticket.stations?.length } : 'null');
  
  // ใช้ userId สำหรับการเปรียบเทียบ (ถ้ามี)
  if (!ticket || !ticket.roadmap) {
    console.log('[DetailCard] Ticket or roadmap is missing');
    return null;
  }
  
  const currentIndex = ticket.roadmap.findIndex((s) => s.status === "current");
  const nextIndex = currentIndex >= 0 ? currentIndex + 1 : -1;
  const currentStep = currentIndex >= 0 ? ticket.roadmap[currentIndex]?.step : null;
  const nextStep = nextIndex >= 0 ? ticket.roadmap[nextIndex]?.step : null;
  const isCompletedLike = (status) => status === "completed";
  const isFinished = currentIndex === -1 && ticket.roadmap.every((s) => isCompletedLike(s.status));
  const hasPending = ticket.roadmap.some((s) => !isCompletedLike(s.status));
  const canStart = !currentStep && hasPending && !isFinished;
  const firstPendingIndex = ticket.roadmap.findIndex((s) => !isCompletedLike(s.status));
  const firstPendingStep = firstPendingIndex >= 0 ? ticket.roadmap[firstPendingIndex]?.step : null;

  // Get assigned technician from stations array
  const stations = Array.isArray(ticket.stations) ? ticket.stations : [];
  const currentStationData = currentIndex >= 0 ? stations[currentIndex] : null;
  const firstPendingStationData = firstPendingIndex >= 0 ? stations[firstPendingIndex] : null;
  
  const currentTechnician = currentStationData?.technician || "";
  const firstPendingTechnician = firstPendingStationData?.technician || "";
  
  // Store assignments for supervisor checks (must be declared before useCallback)
  const [assignments, setAssignments] = useState([]);
  
  // Helper: exact-match against comma-separated names (case-insensitive)
  const isUserAssigned = (technicianList, meName) => {
    if (!technicianList || !meName) return false;
    const meNorm = String(meName).trim().toLowerCase();
    return String(technicianList)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .some((name) => name === meNorm);
  };
  
  // Check if supervisor can act for assigned technician
  const canSupervisorActForStep = useCallback((stepIndex, stationData) => {
    if (!isSupervisor(userRoles) || !stationData || stepIndex < 0) return false;
    
    const stationId = stationData.station_id || stationData.id;
    if (!stationId) return false;
    
    const ticketNo = ticket.id.replace('#', '');
    const stepOrder = stepIndex + 1;
    
    // Find assignment for this step
    const assignment = assignments.find(a => 
      a.ticket_no === ticketNo &&
      a.station_id === stationId &&
      a.step_order === stepOrder
    );
    
    if (!assignment || !assignment.technician) return false;
    
    // Check if assigned technician has role that supervisor manages
    const technicianRoles = assignment.technician.roles || (assignment.technician.role ? [assignment.technician.role] : []);
    return userRoles.some(supervisorRole => 
      technicianRoles.some(technicianRole => 
        canSupervisorActForTechnician(supervisorRole, technicianRole)
      )
    );
  }, [userRoles, assignments, ticket.id]);

  // Role helpers (Packing and CNC can act on their respective stations even if not explicitly assigned)
  const hasPackingRole = Array.isArray(userRoles)
    ? userRoles.some(role => {
        const r = String(role).toLowerCase().trim();
        return r === 'packing' || r.includes('packing') || r.includes('แพ็ค');
      })
    : false;
  const hasCNCRole = Array.isArray(userRoles)
    ? userRoles.some(role => {
        const r = String(role).toLowerCase().trim();
        return r === 'cnc' || r.includes('cnc');
      })
    : false;
  const isFirstPendingPackingStep = (() => {
    const name = (firstPendingStep || '').toLowerCase().trim();
    return name === 'packing' || name.includes('packing') || (firstPendingStep || '').includes('แพ็ค');
  })();
  const isCurrentPackingStep = (() => {
    const name = (currentStep || '').toLowerCase().trim();
    return name === 'packing' || name.includes('packing') || (currentStep || '').includes('แพ็ค');
  })();
  const isFirstPendingCNCStep = (() => {
    const name = (firstPendingStep || '').toLowerCase().trim();
    return name === 'cnc' || name.includes('cnc');
  })();
  const isCurrentCNCStep = (() => {
    const name = (currentStep || '').toLowerCase().trim();
    return name === 'cnc' || name.includes('cnc');
  })();
  const isFirstPendingPaintingStep = (() => {
    const name = (firstPendingStep || '').toLowerCase().trim();
    return name.includes('สี') || name.includes('color') || name.includes('paint');
  })();
  const isCurrentPaintingStep = (() => {
    const name = (currentStep || '').toLowerCase().trim();
    return name.includes('สี') || name.includes('color') || name.includes('paint');
  })();

  // Check if user has Supervisor Production role (can act on all stations)
  const hasSupervisorProductionRole = isSupervisorProduction(userRoles);
  // Check if user has Supervisor Painting role (can act on painting stations)
  const hasSupervisorPaintingRole = isSupervisorPainting(userRoles);
  
  // Check if current user is assigned to the step (including supervisor delegation)
  const isAssignedToCurrentBase = isAdmin || 
    hasSupervisorProductionRole ||
    (hasSupervisorPaintingRole && isCurrentPaintingStep) ||
    isUserAssigned(currentTechnician, me) || 
    canSupervisorActForStep(currentIndex, currentStationData);
  const isAssignedToPendingBase = isAdmin || 
    hasSupervisorProductionRole ||
    (hasSupervisorPaintingRole && isFirstPendingPaintingStep) ||
    isUserAssigned(firstPendingTechnician, me) || 
    canSupervisorActForStep(firstPendingIndex, firstPendingStationData);
  // Allow Packing/CNC role to start/complete their respective stations without explicit assignment
  const isAssignedToCurrent = isAssignedToCurrentBase || 
    (hasPackingRole && isCurrentPackingStep) || 
    (hasCNCRole && isCurrentCNCStep);
  const isAssignedToPending = isAssignedToPendingBase || 
    (hasPackingRole && isFirstPendingPackingStep) || 
    (hasCNCRole && isFirstPendingCNCStep);

  // Check if user can perform actions in production (Storage role cannot)
  const canActionInProduction = canPerformActionsInProduction(userRoles);

  // QC gating flags
  const isPendingQC = (firstPendingStep || "").toUpperCase().includes("QC");
  const isCurrentQC = (currentStep || "").toUpperCase().includes("QC");

  // Cooldown to prevent repeated clicks
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const isCoolingDown = cooldownUntil > now;

  useEffect(() => {
    if (cooldownUntil > now) {
      const timer = setInterval(() => {
        setNow(Date.now());
      }, 100);
      return () => clearInterval(timer);
    }
  }, [cooldownUntil, now]);

  // Work session data from database
  const [workSessions, setWorkSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [savingStart, setSavingStart] = useState(false);
  // Store ticket flows for duration calculation
  const [ticketFlows, setTicketFlows] = useState([]);
  // Store QC sessions for final step completion time
  const [qcSessions, setQcSessions] = useState([]);
  // Store activity logs to find who started QC
  const [activityLogs, setActivityLogs] = useState([]);

  // Load work sessions and assignments from database
  const loadWorkSessions = useCallback(async () => {
    if (!ticket.id) return;
    
    try {
      setLoadingSessions(true);
      const ticketNo = ticket.id.replace('#', '');
      
      // Load work sessions
      const { data: sessions, error } = await supabase
        .from('technician_work_sessions')
        .select(`
          *,
          stations (
            id,
            name_th,
            code
          ),
          users (
            id,
            name,
            email
          )
        `)
        .eq('ticket_no', ticketNo)
        .order('started_at', { ascending: true });
      
      // Load assignments for supervisor checks
      try {
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('ticket_assignments')
          .select(`
            ticket_no,
            station_id,
            step_order,
            technician_id
          `)
          .eq('ticket_no', ticketNo);
        
        if (!assignmentError && assignmentData && assignmentData.length > 0) {
          // Load technician roles separately
          const technicianIds = [...new Set(assignmentData.map(a => a.technician_id))];
          const { data: technicianData } = await supabase
            .from('users')
            .select('id, role, roles')
            .in('id', technicianIds);
          
          // Merge assignment data with technician roles
          const assignmentsWithRoles = assignmentData.map(assignment => ({
            ...assignment,
            technician: technicianData?.find(t => t.id === assignment.technician_id) || null
          }));
          
          setAssignments(assignmentsWithRoles);
        } else {
          setAssignments([]);
        }
      } catch (e) {
        console.warn('Failed to load assignments:', e);
        setAssignments([]);
      }

      if (error) {
        console.error('Error loading work sessions:', error);
      } else {
        console.log('[DEBUG] Loaded work sessions:', sessions?.length || 0, 'sessions');
        setWorkSessions(sessions || []);
      }
      
      // Also load ticket flows for duration calculation fallback
      const { data: flows, error: flowsError } = await supabase
        .from('ticket_station_flow')
        .select(`
          started_at, 
          completed_at, 
          step_order, 
          qc_task_uuid,
          stations (
            id,
            name_th,
            code
          )
        `)
        .eq('ticket_no', ticketNo)
        .order('step_order', { ascending: true });
      
      if (!flowsError && flows) {
        console.log('[DEBUG] Loaded ticket flows:', flows?.length || 0, 'flows');
        setTicketFlows(flows || []);
      }
      
      // Load activity logs to find who started QC (for steps with started_at)
      // Temporarily disabled due to 400 error - will fix schema later
      try {
        // Skip activity_logs query for now to avoid 400 error
        setActivityLogs([]);
      } catch (e) {
        console.warn('Failed to load activity logs:', e);
        setActivityLogs([]);
      }
      
      // Load QC sessions to get actual completion time for QC steps
      try {
        const { data: qcSess, error: qcError } = await supabase
          .from('qc_sessions')
          .select(`
            id, 
            ticket_no, 
            created_at, 
            completed_at, 
            inspected_date, 
            qc_task_uuid, 
            step_order,
            inspector,
            inspector_id
          `)
          .eq('ticket_no', ticketNo)
          .order('step_order', { ascending: true });
        
        if (qcError) {
          console.warn('[DEBUG] Failed to load QC sessions (non-critical):', qcError.message);
          setQcSessions([]);
        } else if (qcSess) {
          console.log('[DEBUG] Loaded QC sessions:', qcSess?.length || 0, 'sessions');
          setQcSessions(qcSess || []);
        }
      } catch (e) {
        console.warn('Failed to load QC sessions:', e);
        setQcSessions([]);
      }
    } catch (e) {
      console.error('Failed to load work sessions:', e);
    } finally {
      setLoadingSessions(false);
    }
  }, [ticket.id]);

  useEffect(() => {
    loadWorkSessions();
  }, [loadWorkSessions]);


  function onStartClick() {
    if (!canStart || isCoolingDown || !isAssignedToPending) return;
    onStart(ticket.id);
    setCooldownUntil(Date.now() + 2000);
    setSavingStart(true);
    
    // Reload work sessions after starting
    setTimeout(() => {
      loadWorkSessions();
    }, 1000);
  }

  function onDoneClick() {
    if (isCoolingDown || !isAssignedToCurrent) return;
    // Allow DONE if there's a current step
    if (currentIndex === -1) return;
    onDone(ticket.id);
    setCooldownUntil(Date.now() + 2000);
    setSavingStart(false);
    
    // Reload work sessions after completing
    setTimeout(() => {
      loadWorkSessions();
    }, 1000);
  }

  const canDone = currentIndex >= 0 && !isFinished && isAssignedToCurrent && !isCurrentQC;

  // Get current work session data
  const currentSession = workSessions.find(session => {
    // Find session that matches current station and is not completed
    const currentStation = ticket.roadmap[currentIndex];
    if (!currentStation) return false;
    
    // Match by station name and technician, and not completed
    return session.stations?.name_th === currentStation.step && 
           session.completed_at === null &&
           session.users?.name === currentTechnician;
  });
  // Auto-hide saving indicator once a live current session is detected
  useEffect(() => {
    if (savingStart && currentSession) {
      setSavingStart(false);
    }
  }, [savingStart, currentSession]);

  // Debug logging
  if (!currentSession && workSessions.length > 0) {
    console.log('[DEBUG] No current session found. Station:', ticket.roadmap[currentIndex]?.step, 'Technician:', currentTechnician);
  }

  const startedAt = currentSession?.started_at;
  const doneAt = currentSession?.completed_at;
  const durationMinutes = currentSession?.duration_minutes;

  const formatTime = (ts) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString('th-TH');
  };
  
  const formatDateTime = (ts) => {
    if (!ts) return "-";
    const date = new Date(ts);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} : ${hours}:${minutes}`;
  };
  
  const formatDuration = (minutes) => {
    if (!minutes) return "-";
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins}น. ${secs}วิ.`;
  };

  // Calculate total duration for finished ticket
  const calculateTotalDuration = useMemo(() => {
    // Check if ticket is finished (both from roadmap and status)
    const ticketFinished = ticket.status === "Finish" || ticket.status === "Finished" || isFinished;
    
    if (!ticketFinished) {
      console.log('[DURATION] Ticket is not finished');
      return null;
    }
    
    console.log('[DURATION] Calculating duration for finished ticket');
    
    if (!ticketFlows || ticketFlows.length === 0) {
      console.log('[DURATION] No ticket flows available');
      return null;
    }
    
    // Sort flows by step_order to get first and last step
    const sortedFlows = [...ticketFlows].sort((a, b) => a.step_order - b.step_order);
    const firstStep = sortedFlows[0];
    const lastStep = sortedFlows[sortedFlows.length - 1];
    
    console.log('[DURATION] First step:', firstStep?.step_order, 'Last step:', lastStep?.step_order);
    
    // Get start time from first step
    let firstStarted = null;
    
    // Try to get from ticket_station_flow.started_at first
    if (firstStep?.started_at) {
      firstStarted = firstStep.started_at;
    } else {
      // Fallback: find work session for first step
      const firstStepWorkSession = workSessions?.find(s => s.step_order === firstStep?.step_order);
      if (firstStepWorkSession?.started_at) {
        firstStarted = firstStepWorkSession.started_at;
      } else {
        // Fallback: use earliest work session
        const earliestSession = workSessions?.length > 0
          ? workSessions.reduce((earliest, session) => {
              if (!earliest) return session;
              return new Date(session.started_at) < new Date(earliest.started_at) ? session : earliest;
            }, null)
          : null;
        if (earliestSession?.started_at) {
          firstStarted = earliestSession.started_at;
        }
      }
    }
    
    // Get end time from last step
    let lastCompleted = null;
    
    // Try to get from ticket_station_flow.completed_at first
    if (lastStep?.completed_at) {
      lastCompleted = lastStep.completed_at;
    } else if (lastStep?.qc_task_uuid) {
      // If last step is QC and has no completed_at, use QC session
      const qcSession = qcSessions?.find(qs => qs.qc_task_uuid === lastStep.qc_task_uuid);
      if (qcSession) {
        // Use completed_at from QC session (actual time when QC was completed)
        if (qcSession.completed_at) {
          lastCompleted = qcSession.completed_at;
        } else if (qcSession.created_at) {
          // Fallback to created_at if completed_at not set yet
          lastCompleted = qcSession.created_at;
        } else if (qcSession.inspected_date) {
          // If only inspected_date exists, use end of that day
          lastCompleted = new Date(qcSession.inspected_date + 'T23:59:59').toISOString();
        }
      }
    } else {
      // Fallback: find work session for last step
      const lastStepWorkSession = workSessions?.find(s => s.step_order === lastStep?.step_order);
      if (lastStepWorkSession?.completed_at) {
        lastCompleted = lastStepWorkSession.completed_at;
      } else {
        // Fallback: use latest completion time from all flows
        const allCompleted = ticketFlows
          .map(flow => {
            if (flow.completed_at) {
              return flow.completed_at;
            }
            if (flow.qc_task_uuid) {
              const qcSess = qcSessions?.find(qs => qs.qc_task_uuid === flow.qc_task_uuid);
              return qcSess?.completed_at || qcSess?.created_at || null;
            }
            return null;
          })
          .filter(time => time !== null);
        
        if (allCompleted.length > 0) {
          lastCompleted = allCompleted.reduce((latest, time) => {
            if (!latest) return time;
            return new Date(time) > new Date(latest) ? time : latest;
          }, null);
        }
      }
    }
    
    if (!firstStarted || !lastCompleted) {
      console.log('[DURATION] Missing start or end time:', { firstStarted, lastCompleted });
      return null;
    }
    
    const totalMs = new Date(lastCompleted) - new Date(firstStarted);
    const totalMinutes = totalMs / (1000 * 60);
    
    console.log('[DURATION] Calculated:', {
      startTime: firstStarted,
      endTime: lastCompleted,
      totalMinutes,
      firstStep: firstStep?.step_order,
      lastStep: lastStep?.step_order
    });
    
    return {
      startTime: firstStarted,
      endTime: lastCompleted,
      totalMinutes: totalMinutes
    };
  }, [isFinished, ticket.status, workSessions, ticketFlows, qcSessions]);

  const myEarnings = useMemo(() => {
    if (!ticket) return 0;
    
    const steps = Array.isArray(ticket.stations) ? ticket.stations : [];
    
    // ใช้ userId สำหรับการเปรียบเทียบ (ถ้ามี) ไม่งั้นใช้ชื่อ
    const filtered = steps.filter((s) => {
      if (userId && Array.isArray(s.technicianIds) && s.technicianIds.length > 0) {
        // เปรียบเทียบด้วย ID (แนะนำ)
        const isAssigned = s.technicianIds.includes(userId);
        console.log('[MY_EARNINGS] Station', s.name, '- Technician IDs:', s.technicianIds, '- My ID:', userId, '- Assigned:', isAssigned);
        return isAssigned;
      } else {
        // Fallback: เปรียบเทียบด้วยชื่อ
        const assigned = isUserAssigned(s.technician, me);
        console.log('[MY_EARNINGS] Station', s.name, '- Technician:', s.technician, '- Me:', me, '- Assigned:', assigned);
        return assigned;
      }
    });
    
    const total = filtered.reduce((sum, s) => {
      const price = Number(s.price) || 0;
      return sum + price;
    }, 0);
    
    console.log('[MY_EARNINGS] Filtered stations count:', filtered.length, 'Total earnings:', total);
    
    return total;
  }, [ticket.stations, me, userId]);

  const totalLabor = useMemo(() => {
    const steps = Array.isArray(ticket.stations) ? ticket.stations : [];
    return steps.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  }, [ticket.stations]);

  // Calculate production price and color price from stations
  const priceCalculation = useMemo(() => {
    console.log('💰 [PRICE_CALC] START - Ticket exists:', !!ticket);
    if (!ticket) {
      console.log('💰 [PRICE_CALC] No ticket data');
      return { productionPrice: 0, colorPrice: 0, total: 0 };
    }
    
    const steps = Array.isArray(ticket.stations) ? ticket.stations : [];
    const quantity = Number(ticket.quantity) || 0;
    
    console.log('💰 [PRICE_CALC] Ticket ID:', ticket.id);
    console.log('💰 [PRICE_CALC] Stations data:', steps);
    console.log('💰 [PRICE_CALC] Stations length:', steps.length);
    console.log('💰 [PRICE_CALC] Quantity:', quantity);
    
    let productionPrice = 0;
    let colorPrice = 0;
    
    steps.forEach((station) => {
      const stationName = (station.name || '').toLowerCase();
      const price = Number(station.price) || 0;
      const priceType = station.priceType || 'flat';
      
      console.log('[PRICE_CALC] Station:', stationName, 'Price:', price, 'Type:', priceType);
      
      // Check if this is color station (สถานีสี)
      const isColorStation = stationName.includes('สี') || stationName.includes('color');
      
      // Calculate price based on price_type
      let stationTotal = 0;
      if (priceType === 'per_piece') {
        stationTotal = price * quantity;
      } else if (priceType === 'per_hour') {
        // For per_hour, we'll use the price as is (assuming it's already calculated)
        stationTotal = price;
      } else {
        // flat price
        stationTotal = price;
      }
      
      if (isColorStation) {
        colorPrice += stationTotal;
        console.log('[PRICE_CALC] Added to colorPrice:', stationTotal, 'Total colorPrice:', colorPrice);
      } else {
        productionPrice += stationTotal;
        console.log('[PRICE_CALC] Added to productionPrice:', stationTotal, 'Total productionPrice:', productionPrice);
      }
    });
    
    const total = productionPrice + colorPrice;
    
    console.log('[PRICE_CALC] Final calculation:', { productionPrice, colorPrice, total });
    
    return {
      productionPrice,
      colorPrice,
      total
    };
  }, [ticket.stations, ticket.quantity]);

  const bomItems = Array.isArray(ticket.bom) ? ticket.bom : [];

  // ERP document per ticket
  const storageKey = `ticket_doc_${(ticket.id || "").replace('#','')}`;
  const [uploadedDoc, setUploadedDoc] = useState(null);
  const [isDocOpen, setIsDocOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setUploadedDoc(JSON.parse(saved));
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  return (
    <div className="ticket-card bg-white dark:bg-slate-800 dark:bg-slate-800 rounded-2xl shadow-sm p-4 sm:p-6 border border-gray-200 dark:border-slate-700 dark:border-slate-700">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          <div className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">ตั๋ว</div>
          <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{ticket.id}</div>
          {ticket.route && <span className={`text-xs px-2 py-1 rounded-full font-medium ${ticket.routeClass}`}>{ticket.route}</span>}
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${ticket.priorityClass}`}>{ticket.priority}</span>
        </div>
        <div className="flex flex-wrap items-start gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
          {ticket.dueDate && (
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>กำหนดส่ง: <span className="font-medium text-gray-800 dark:text-gray-200">{ticket.dueDate}</span></span>
            </div>
          )}
          <div>ผู้รับผิดชอบ: <span className="font-medium text-gray-800 dark:text-gray-200">{ticket.assignee}</span></div>
          {typeof ticket.quantity === 'number' ? (
            <div>จำนวนที่ต้องผลิต: <span className="font-medium text-gray-800 dark:text-gray-200">{ticket.quantity.toLocaleString()} ชิ้น</span></div>
          ) : null}
        </div>
      </div>

      {/* Ticket Description */}
      {ticket.title && (
        <div className="mb-4 sm:mb-6">
          <div className="inline-flex items-start gap-2 sm:gap-3 px-4 sm:px-5 py-3 sm:py-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200/50 dark:border-blue-800/50 shadow-sm">
            <Info className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-gray-800 dark:text-gray-200 text-sm sm:text-base break-words leading-relaxed">
              {ticket.title}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
        <div className="md:col-span-2">
          {/* ERP Document Button - Top */}
          <div className="mb-4">
            <button 
              onClick={() => setIsDocOpen(true)} 
              disabled={!ticket.projectDoc}
              className={`w-full px-6 py-3 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 shadow-sm ${ticket.projectDoc ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800' : 'bg-gray-100 dark:bg-slate-600 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-gray-200 dark:border-slate-700'}`}
            >
              <FileText className="w-5 h-5" />
              {ticket.projectDoc ? `ดูเอกสาร: ${ticket.projectDoc.file_name}` : 'ไม่มีเอกสาร'}
            </button>
          </div>

          {/* View File Modal - Minimal fullscreen-like */}
          <Modal 
            open={isDocOpen} 
            onClose={() => setIsDocOpen(false)} 
            hideHeader
            maxWidth="max-w-7xl"
            maxHeight="max-h-[88vh]"
          >
            {ticket.projectDoc?.file_url ? (
              <div className="relative w-full h-full p-0">
                {/* Close button and Print button */}
                <div className="absolute top-3 right-3 z-10 flex gap-2">
                  {/* Print button - only show for images */}
                  {ticket.projectDoc.file_type !== 'pdf' && (
                    <button
                      onClick={() => {
                        // Create a new window with the image and print
                        const printWindow = window.open('', '_blank');
                        if (printWindow) {
                          printWindow.document.write(`
                            <html>
                              <head>
                                <title>${ticket.projectDoc.file_name}</title>
                                <style>
                                  @media print {
                                    body { margin: 0; padding: 0; }
                                    img { max-width: 100%; height: auto; }
                                  }
                                  body {
                                    display: flex;
                                    justify-content: center;
                                    align-items: center;
                                    min-height: 100vh;
                                    margin: 0;
                                    padding: 20px;
                                  }
                                  img {
                                    max-width: 100%;
                                    max-height: 100vh;
                                    object-fit: contain;
                                  }
                                </style>
                              </head>
                              <body>
                                <img src="${ticket.projectDoc.file_url}" alt="${ticket.projectDoc.file_name}" />
                                <script>
                                  window.onload = function() {
                                    window.print();
                                  };
                                </script>
                              </body>
                            </html>
                          `);
                          printWindow.document.close();
                        }
                      }}
                      className="px-3 py-1.5 bg-black/60 text-white rounded-md hover:bg-black/70 transition-colors inline-flex items-center gap-2"
                      title="พิมพ์ภาพ"
                    >
                      <Printer className="w-4 h-4" />
                      <span className="hidden sm:inline">พิมพ์</span>
                    </button>
                  )}
                  {/* Close button */}
                  <button
                    onClick={() => setIsDocOpen(false)}
                    className="px-3 py-1.5 bg-black/60 text-white rounded-md hover:bg-black/70 transition-colors inline-flex items-center gap-2"
                    title="ปิด"
                  >
                    <X className="w-4 h-4" />
                    <span className="hidden sm:inline">ปิด</span>
                  </button>
                </div>

                {/* Content */}
                <div className="w-full h-full">
                  {ticket.projectDoc.file_type === 'pdf' ? (
                    <iframe
                      src={`${ticket.projectDoc.file_url}#toolbar=0&navpanes=0&scrollbar=0`}
                      className="w-full h-[82vh]"
                      title={ticket.projectDoc.file_name}
                    />
                  ) : (
                    <div className="w-full h-[82vh] flex items-center justify-center bg-black/5 dark:bg-black/20">
                      <img
                        src={ticket.projectDoc.file_url}
                        alt={ticket.projectDoc.file_name}
                        className="max-h-full max-w-full object-contain rounded"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-96 text-gray-500 dark:text-gray-400">
                <div className="text-center">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium mb-2">ไม่มีไฟล์เอกสารในโฟลเดอร์นี้</p>
                  <p className="text-sm">กรุณาอัปโหลดไฟล์เอกสารในหน้า Project</p>
                </div>
              </div>
            )}
          </Modal>

          <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-700 border border-gray-100 dark:border-slate-600">
            {(isFinished || ticket.status === "Finish") ? (
              <>
                <div className="text-gray-600 dark:text-gray-400 dark:text-gray-500 mb-3">สถานะตั๋วใบนี้ : <span className="font-medium text-emerald-700 dark:text-emerald-400">เสร็จสิ้นแล้ว</span></div>
                {!calculateTotalDuration ? (
                  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <div>เริ่มต้น : -</div>
                    <div>สิ้นสุด : -</div>
                    <div>ใช้เวลาไปทั้งหมด : -</div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="text-gray-600 dark:text-gray-400">เริ่มต้น : <span className="font-medium text-gray-900 dark:text-gray-100">{formatDateTime(calculateTotalDuration.startTime)}</span></div>
                    <div className="text-gray-600 dark:text-gray-400">สิ้นสุด : <span className="font-medium text-gray-900 dark:text-gray-100">{formatDateTime(calculateTotalDuration.endTime)}</span></div>
                    <div className="text-gray-600 dark:text-gray-400">ใช้เวลาไปทั้งหมด : <span className="font-medium text-emerald-700 dark:text-emerald-400">{formatDuration(calculateTotalDuration.totalMinutes)}</span></div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-gray-600 dark:text-gray-400 dark:text-gray-500 mb-1">ขั้นตอนปัจจุบัน</div>
                {(() => {
                  const headerStepName = currentIndex >= 0 ? (currentStep || "-") : (firstPendingStep || "-");
                  const headerStatusText = currentIndex >= 0 ? "กำลังทำ" : "ยังไม่เริ่ม";
                  return (
                    <>
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{headerStepName}</div>
                      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">สถานะ: <span className={`font-medium ${headerStatusText === 'กำลังทำ' ? 'text-amber-700' : 'text-gray-700 dark:text-gray-300'}`}>{headerStatusText}</span></div>
                    </>
                  );
                })()}
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">ถัดไป: <span className="text-gray-800 dark:text-gray-200 font-medium">{nextStep || "รอเริ่มงาน"}</span></div>
              </>
            )}
          </div>

          <div className="mt-4">
            {isPendingQC && !isAssignedToPending && !isAdmin && (
              <div className="mb-3 p-3 rounded-lg border bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-300 text-sm">
                ขั้นตอนปัจจุบันเป็น QC กรุณารอให้ทีม QC ตรวจสอบให้เสร็จก่อนจึงจะเริ่มขั้นตอนถัดไปได้
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-stretch gap-3">
              <button
                onClick={onStartClick}
                disabled={!canStart || isFinished || isCoolingDown || !isAssignedToPending || isPendingQC || !canActionInProduction}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-white font-semibold transition-colors ${
                  !canStart || isFinished || isCoolingDown || !isAssignedToPending || isPendingQC || !canActionInProduction
                    ? "bg-gray-400 text-gray-600 dark:bg-gray-600 dark:text-gray-400 cursor-not-allowed" 
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                <Play className="w-5 h-5" /> เริ่มทำขั้นตอน {firstPendingStep || "-"}
              </button>
              <button
                onClick={onDoneClick}
                disabled={!canDone || isCoolingDown || !canActionInProduction}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-white font-semibold transition-colors ${!canDone || isCoolingDown || !canActionInProduction ? "bg-gray-300 text-gray-500 dark:text-gray-400 dark:text-gray-500 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}
              >
                <Check className="w-5 h-5" /> DONE (ทำขั้นตอนนี้เสร็จแล้ว)
              </button>
            </div>
            
            {/* Warning message when user is not assigned to current step or cannot perform actions */}
              {!canActionInProduction && (
                <div className="mt-3 p-3 rounded-lg border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300 text-sm">
                  ℹ️ คุณสามารถดูรายละเอียดได้แต่ไม่สามารถเริ่มต้นหรือทำเสร็จสถานีได้ 
                </div>
              )}
              {canActionInProduction && !isAssignedToPending && firstPendingStep && !isPendingQC && !isAdmin && (
                <div className="mt-3 p-3 rounded-lg border bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-300 text-sm">
                  ⚠️ คุณไม่ได้รับมอบหมายให้ทำในสถานีนี้
                </div>
              )}
          </div>

          {isFinished && (
            <div className="mt-2 text-center text-sm text-emerald-700 font-medium">งานเสร็จสิ้น</div>
          )}


          <div className="mt-6">
            <div className="flex gap-3 overflow-x-auto roadmap-scroll pb-2 pr-4 -mx-1 px-1 sm:mx-0 sm:px-0">
              {ticket.roadmap.map((step, index) => {
                const stationData = stations[index];
                const isQCStep = (step.step || "").toUpperCase().includes("QC");
                const techName = isQCStep ? "-" : (stationData?.technician || "ยังไม่ได้มอบหมาย");
                const isMyStation = !isQCStep && stationData?.technician && me && stationData.technician.includes(me);
                const showReworkCount = false;
                return (
                  <div key={index} className={`min-w-[220px] rounded-xl border p-4 shadow-sm ${
                    step.status === 'current' ? 'border-amber-300 bg-amber-50' : 
                    step.status === 'completed' ? 'border-emerald-200 bg-emerald-50' : 
                    false ? 'border-orange-300 bg-orange-50' :
                    'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                  }`}>
                    <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">ขั้นที่ {index + 1}</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{step.step}</div>
                    <div className={`mt-3 h-2 rounded-full ${
                      step.status === 'completed' ? 'bg-emerald-500' : 
                      step.status === 'current' ? 'bg-amber-500 animate-pulse' : 
                      false ? 'bg-orange-500' :
                      'bg-gray-200'
                    }`} />
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500">สถานะ: <span className={`font-medium ${
                      step.status === 'current' ? 'text-amber-700' : 
                      step.status === 'completed' ? 'text-emerald-700' : 
                      false ? 'text-orange-700' :
                      'text-gray-600 dark:text-gray-400 dark:text-gray-500'
                    }`}>{step.status}</span></div>
                    {/* แสดงจำนวน defect เมื่อเป็น QC step ที่เสร็จแล้วและมี defect */}
                    {isQCStep && step.status === 'completed' && step.qc_task_uuid && ticket.defectCounts?.[step.qc_task_uuid] > 0 && (
                      <div className="mt-1 text-[11px] text-red-700 dark:text-red-400 font-medium">
                        Defect: {ticket.defectCounts[step.qc_task_uuid]} ชิ้น
                      </div>
                    )}
                    {!isQCStep && (
                      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500">
                        ช่าง: <span className={`font-medium ${isMyStation ? 'text-blue-700' : 'text-gray-900 dark:text-gray-100'}`}>{techName}</span>
                        {isMyStation && <span className="ml-1 text-blue-600">✓</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex-shrink-0 w-6" aria-hidden="true" />
            </div>
            <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 dark:text-gray-500 select-none">
              <span>เลื่อนไปทางขวาเพื่อดูทั้งหมด</span>
              <span className="animate-pulse">→</span>
            </div>
          </div>

          
        </div>

        <div className="space-y-3">
          {/* Current technician (hide time summary – tracked in reports) */}
          {currentTechnician && currentIndex >= 0 && !isCurrentQC && (
            <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-600">
              <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">ช่างประจำสถานีปัจจุบัน</div>
              <div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{currentTechnician}</div>
              {savingStart && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  ระบบกำลังบันทึกเวลาการทำงานของคุณ
                </div>
              )}
            </div>
          )}

          {/* Historical Stations Section */}
          {(() => {
            // Build history from completed roadmap steps + work sessions + ticket flows + QC sessions
            // Roadmap and flows are both ordered by step_order, so index should match
            const completedSteps = (ticket.roadmap || [])
              .map((step, index) => {
                if (step.status !== 'completed') return null;
                
                const stationData = stations[index];
                const stepName = step.step;
                const isQCStep = (stepName || '').toUpperCase().includes('QC');
                
                // Get flow data by index (roadmap and flows are in same order)
                // Since roadmap is created from flows.map(), roadmap[index] = flows[index]
                const flowData = ticketFlows && ticketFlows.length > index 
                  ? ticketFlows[index] 
                  : null;
                
                // For QC steps, use qc_sessions instead of work_sessions
                let matchingQCSession = null;
                if (isQCStep && qcSessions && qcSessions.length > 0) {
                  // Match QC session by qc_task_uuid or step_order
                  if (step.qc_task_uuid) {
                    matchingQCSession = qcSessions.find(qs => qs.qc_task_uuid === step.qc_task_uuid);
                  }
                  // Fallback: match by step_order or index
                  if (!matchingQCSession) {
                    const stepOrder = flowData?.step_order ?? index;
                    matchingQCSession = qcSessions.find(qs => 
                      qs.step_order === stepOrder || qs.step_order === index || qs.step_order === index + 1
                    );
                  }
                }
                
                // Find matching work session by step_order or station name (for non-QC steps)
                let matchingSession = null;
                if (!isQCStep && workSessions && workSessions.length > 0) {
                  // Get step_order from flowData if available
                  const stepOrder = flowData?.step_order ?? index;
                  // Try to match by step_order first
                  matchingSession = workSessions.find(session => {
                    if (session.step_order !== undefined) {
                      // Match by step_order (try both 0-based and 1-based)
                      return (session.step_order === stepOrder || session.step_order === stepOrder + 1) && session.completed_at;
                    }
                    // Fallback: match by station name
                    const sessionStationName = session.stations?.name_th;
                    return sessionStationName === stepName && session.completed_at;
                  });
                }
                
                // Get technician name
                let technicianName = '';
                if (isQCStep) {
                  // For QC: find who started QC from activity logs or work sessions
                  // First try to find from work sessions (if someone started QC via normal flow)
                  if (matchingSession) {
                    technicianName = matchingSession.users?.name || matchingSession.users?.email || '';
                  }
                  
                  // If not found, try to find from activity logs (qc_started action)
                  if (!technicianName && activityLogs && activityLogs.length > 0) {
                    // Match by step_order from metadata or find the most recent QC start
                    const stepOrder = flowData?.step_order ?? index;
                    const matchingLog = activityLogs.find(log => {
                      const logStepOrder = log.metadata?.step_order;
                      return logStepOrder === stepOrder || logStepOrder === index || logStepOrder === index + 1;
                    }) || activityLogs[activityLogs.length - 1]; // Fallback to most recent
                    
                    if (matchingLog && matchingLog.user_data) {
                      technicianName = matchingLog.user_data.name || matchingLog.user_data.email || '';
                    }
                  }
                  
                  // Last fallback: use inspector from QC session
                  if (!technicianName && matchingQCSession) {
                    if (matchingQCSession.users && Array.isArray(matchingQCSession.users) && matchingQCSession.users.length > 0) {
                      technicianName = matchingQCSession.users[0].name || matchingQCSession.users[0].email || '';
                    } else if (matchingQCSession.users && matchingQCSession.users.name) {
                      technicianName = matchingQCSession.users.name || matchingQCSession.users.email || '';
                    } else if (matchingQCSession.inspector) {
                      technicianName = matchingQCSession.inspector;
                    }
                  }
                } else {
                  // For non-QC: use technician from station data or work session
                  technicianName = stationData?.technician || '';
                  if (!technicianName && matchingSession) {
                    technicianName = matchingSession.users?.name || matchingSession.users?.email || '';
                  }
                }
                
                // Get start/end times
                let startedAt = null;
                let completedAt = null;
                if (isQCStep) {
                  // For QC: prioritize started_at from flow (when QC was started), then work session, then QC session created_at
                  startedAt = flowData?.started_at || matchingSession?.started_at || matchingQCSession?.created_at || null;
                  completedAt = matchingQCSession?.completed_at || matchingQCSession?.inspected_date || flowData?.completed_at || null;
                } else {
                  // For non-QC: prefer work session, then flow
                  startedAt = matchingSession?.started_at || flowData?.started_at || null;
                  completedAt = matchingSession?.completed_at || flowData?.completed_at || null;
                }
                
                // Calculate duration
                let duration = null;
                if (isQCStep && matchingQCSession && startedAt && completedAt) {
                  const ms = new Date(completedAt) - new Date(startedAt);
                  duration = ms / (1000 * 60); // Convert to minutes
                } else if (matchingSession?.duration_minutes) {
                  duration = matchingSession.duration_minutes;
                } else if (startedAt && completedAt) {
                  const ms = new Date(completedAt) - new Date(startedAt);
                  duration = ms / (1000 * 60); // Convert to minutes
                }
                
                return {
                  stepName,
                  technicianName,
                  startedAt,
                  completedAt,
                  duration
                };
              })
              .filter(item => item !== null);
            
            return completedSteps.length > 0 && (
              <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-600">
                <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-3">ประวัติสถานีที่ผ่านมา</div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {completedSteps.map((item, idx) => (
                    <div key={`${item.stepName}-${idx}`} className="p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {item.stepName}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        ช่าง: {item.technicianName || 'ยังไม่ได้ระบุ'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500">
                        เริ่ม: {formatTime(item.startedAt)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500">
                        สิ้นสุด: {formatTime(item.completedAt)}
                      </div>
                      {item.duration && (
                        <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          ใช้เวลา: {formatDuration(item.duration)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-600">
            <div className="space-y-2">
              <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-2">ราคารวม</div>
              {priceCalculation.total === 0 && Array.isArray(ticket.stations) && ticket.stations.length > 0 ? (
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ ยังไม่ได้กำหนดราคาในแต่ละสถานี กรุณาไปกำหนดราคาในหน้า Ticket Edit
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">รวมทั้งสิ้น</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 inline-flex items-center gap-1">
                  <Coins className="w-4 h-4 text-emerald-600" />
                  {priceCalculation.total.toLocaleString()} บาท
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">ราคาผลิต</span>
                <span className="text-sm text-gray-800 dark:text-gray-200">
                  {priceCalculation.productionPrice.toLocaleString()} บาท
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">ราคาสี</span>
                <span className="text-sm text-gray-800 dark:text-gray-200">
                  {priceCalculation.colorPrice.toLocaleString()} บาท
                </span>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-600">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">
              <Package className="w-4 h-4" />
              BOM รายการเบิก
            </div>
            <div className="mt-2 space-y-2">
              {bomItems.length === 0 && <div className="text-sm text-gray-400 dark:text-gray-500">ไม่มีรายการ</div>}
              {bomItems.slice(0,5).map((it, idx) => (
                <div key={idx} className="text-sm flex items-center justify-between">
                  <div className="truncate">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">{it.code}</span> — <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">{it.name}</span>
                  </div>
                  <div className="shrink-0 text-gray-700 dark:text-gray-300">{it.qty} {it.unit}</div>
                </div>
              ))}
              {bomItems.length > 5 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">และอีก {bomItems.length - 5} รายการ…</div>
              )}
            </div>
          </div>
          
          {/* Batch Information removed per request */}
          
          {/* Rework orders section removed */}
        </div>
      </div>
    </div>
  );
}

export default function ProductionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const myName = (user?.name || user?.email || "").trim();
  const ticketId = `${params?.id || ""}`;

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  
  // Batch data
  const [batches, setBatches] = useState([]);
  const [isClosed, setIsClosed] = useState(false);

  // Function to load batch data
  const loadBatchData = useCallback(async () => {
    try {
      // Load batches for this ticket
      const { data: batchData, error: batchError } = await supabase
        .from('ticket_batches')
        .select(`
          *,
          stations(name_th, code),
          qc_sessions(form_type, inspector)
        `)
        .eq('ticket_no', ticketId)
        .order('created_at', { ascending: false });
      
      if (batchError) throw batchError;
      setBatches(batchData || []);
    } catch (error) {
      console.error('Error loading batch data:', error);
    }
  }, [ticketId]);

  // Evaluate Closed badge when ticket changes
  useEffect(() => {
    try {
      if (!ticket) return;
      setIsClosed(ticket.status === 'Finish');
    } catch {}
  }, [ticket, ticketId]);

  // Function to reload ticket data from DB
  const reloadTicketData = useCallback(async () => {
    console.log('🚀 [RELOAD] reloadTicketData STARTED for ticket:', ticketId);
    try {
      let erpTicket;
      {
        // DB-first: โหลดตั๋วปกติจากฐานข้อมูล
        const { data: dbTicket, error: dbError } = await supabase
          .from('ticket')
          .select('*')
          .eq('no', ticketId)
          .single();
        if (dbError || !dbTicket) throw new Error('ไม่พบข้อมูลตั๋วในฐานข้อมูล');

        erpTicket = {
          id: dbTicket.no,
          title: dbTicket.description || dbTicket.no,
          quantity: dbTicket.quantity || 0,
          itemCode: dbTicket.source_no || dbTicket.no,
          description: dbTicket.description || '',
          description2: dbTicket.description_2 || '',
          dueDate: dbTicket.due_date || '',
          priority: dbTicket.priority || 'Medium',
          status: dbTicket.status || 'Released',
          projectCode: dbTicket.source_no || '',
          projectName: dbTicket.description || dbTicket.no,
          isRework: false,
          parentTicketNo: null
        };
      }

      // 2) Load station flows for this ticket from DB
      const { data: flows, error: flowError } = await supabase
        .from('ticket_station_flow')
        .select(`
          *,
          stations (
            name_th,
            code
          )
        `)
        .eq('ticket_no', ticketId)
        .order('step_order', { ascending: true });
      
      console.log('🔍 [RELOAD] Raw flows from DB:', flows?.map(f => ({
        station: f.stations?.name_th,
        status: f.status,
        station_id: f.station_id,
        price: f.price,
        price_type: f.price_type,
        is_rework_ticket: f.is_rework_ticket
      })));
      console.log('💰 [RELOAD] PRICE CHECK - First flow price:', flows?.[0]?.price, 'Type:', flows?.[0]?.price_type);
      console.log('💰 [RELOAD] PRICE CHECK - All prices:', flows?.map(f => ({ station: f.stations?.name_th, price: f.price, type: f.price_type })));
      console.log('[RELOAD] Price details:', flows?.map(f => ({
        station: f.stations?.name_th,
        price: f.price,
        price_type: f.price_type,
        price_value: Number(f.price) || 0
      })));
      // Log full flow object to see all fields
      if (flows && flows.length > 0) {
        console.log('[RELOAD] First flow full object:', flows[0]);
        console.log('[RELOAD] All flow prices:', flows.map(f => ({ 
          station: f.stations?.name_th, 
          raw_price: f.price, 
          price_type: f.price_type,
          has_price: f.price !== null && f.price !== undefined
        })));
      }
      
      if (flowError) {
        console.warn('Load flows error:', flowError.message);
      }

      // 3) Load ticket data from DB for priority, quantity and customer info
      let dbTicket = null;
      try {
        const { data: ticketData, error: ticketError } = await supabase
          .from('ticket')
          .select('no, priority, customer_name, quantity, initial_quantity, pass_quantity')
          .eq('no', ticketId)
          .single();
        if (!ticketError && ticketData) {
          dbTicket = ticketData;
        }
      } catch (e) {
        console.warn('Load ticket data error:', e.message);
      }

      // 3.5) Load project document from DB
      let projectDoc = null;
      try {
        // First get project_item_id from project_items table
        // ใช้ limit(1) เพื่อหลีกเลี่ยง 406 (Not Acceptable) หากมีหลายแถวที่ item_code ซ้ำกัน
        const { data: projectItems, error: projectItemError } = await supabase
          .from('project_items')
          .select('id')
          .eq('item_code', erpTicket.itemCode)
          .limit(1);
        const projectItemData = Array.isArray(projectItems) && projectItems.length > 0 ? projectItems[0] : null;
        
        if (!projectItemError && projectItemData) {
          // Then get file from project_files table
          const { data: projectFileData, error: projectFileError } = await supabase
            .from('project_files')
            .select('file_name, file_url, file_path, uploaded_at, file_size, file_type')
            .eq('project_item_id', projectItemData.id)
            .eq('is_current', true)
            .maybeSingle();
          
          if (!projectFileError && projectFileData) {
            projectDoc = projectFileData;
          } else if (projectFileError) {
            console.warn('Load project file error:', projectFileError);
          }
        }
      } catch (e) {
        console.warn('Load project document error:', e.message);
      }

      // 4) Load assignments (technicians)
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
          `)
          .eq('ticket_no', ticketId);
        if (!assignmentError && Array.isArray(assignmentData)) {
          assignments = assignmentData;
        } else {
            const { data: simpleData } = await supabase
              .from('ticket_assignments')
              .select('ticket_no, station_id, step_order, technician_id')
              .eq('ticket_no', ticketId);
          if (Array.isArray(simpleData) && simpleData.length > 0) {
            const techIds = [...new Set(simpleData.map(a => a.technician_id))];
            const { data: userData } = await supabase
              .from('users')
              .select('id,name')
              .in('id', techIds);
            assignments = simpleData.map(a => ({
              ...a,
              users: (userData || []).find(u => u.id === a.technician_id) || null
            }));
          }
      }
    } catch {}

    // 4.5) Load BOM from DB
    let dbBom = [];
    try {
      const { data: bomData, error: bomError } = await supabase
        .from('ticket_bom')
        .select('material_name, quantity, unit')
        .eq('ticket_no', ticketId)
        .order('created_at', { ascending: true });
      if (!bomError && Array.isArray(bomData)) {
        dbBom = bomData;
      }
    } catch (e) {
      console.warn('Load BOM error:', e?.message || e);
    }

    // (Rework roadmap fallback removed)

      // 4.6) Load QC defect counts for each QC step
      const defectCounts = {}; // Map: qc_task_uuid -> total defect quantity
      try {
        const { data: qcSessions, error: qcError } = await supabase
          .from('qc_sessions')
          .select('id, qc_task_uuid')
          .eq('ticket_no', ticketId);
        
        if (!qcError && Array.isArray(qcSessions) && qcSessions.length > 0) {
          const sessionIds = qcSessions.map(s => s.id);
          
          // ดึง qc_rows ที่ pass = false เพื่อนับ defect
          const { data: qcRows, error: rowsError } = await supabase
            .from('qc_rows')
            .select('session_id, actual_qty, pass')
            .in('session_id', sessionIds)
            .eq('pass', false);
          
          if (!rowsError && Array.isArray(qcRows)) {
            // Group by session_id and sum defect quantities
            const defectsBySession = {};
            qcRows.forEach(row => {
              const qty = Number(row.actual_qty) || 0;
              defectsBySession[row.session_id] = (defectsBySession[row.session_id] || 0) + qty;
            });
            
            // Map session_id -> qc_task_uuid
            qcSessions.forEach(session => {
              if (session.qc_task_uuid && defectsBySession[session.id]) {
                defectCounts[session.qc_task_uuid] = (defectCounts[session.qc_task_uuid] || 0) + defectsBySession[session.id];
              }
            });
          }
        }
      } catch (e) {
        console.warn('Load defect counts error:', e?.message || e);
      }

      // 5) Merge flows + assignments
      const merged = mergeFlowsIntoTicket(erpTicket, Array.isArray(flows) ? flows : [], assignments);
      
      // Add defect counts to merged ticket
      merged.defectCounts = defectCounts;
      
      // Apply priority/quantity from Supabase if available
      if (dbTicket && dbTicket.priority) {
        merged.priority = dbTicket.priority === "High" ? "High Priority" : 
                         dbTicket.priority === "Low" ? "Low Priority" : "Medium Priority";
        if (merged.priority === "High Priority") {
          merged.priorityClass = "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
        } else if (merged.priority === "Medium Priority") {
          merged.priorityClass = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
        } else if (merged.priority === "Low Priority") {
          merged.priorityClass = "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
        } else {
          merged.priorityClass = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
        }
      }
      if (dbTicket && typeof dbTicket.quantity === 'number') {
        // displayCount = COALESCE(pass_quantity, quantity)
        const passQ = (typeof dbTicket.pass_quantity === 'number' && dbTicket.pass_quantity !== null)
          ? dbTicket.pass_quantity
          : dbTicket.quantity;
        merged.quantity = passQ;
      }
      if (dbTicket && typeof dbTicket.initial_quantity === 'number') {
        merged.initialQuantity = dbTicket.initial_quantity;
      }
      
      // Add project document info
      if (projectDoc) {
        merged.projectDoc = projectDoc;
      }
      
      // Override BOM with DB result if available
      if (Array.isArray(dbBom)) {
        merged.bom = dbBom.map(b => ({ code: '-', name: b.material_name || '-', qty: Number(b.quantity) || 0, unit: b.unit || 'PCS', issued: 0 }));
      }

      return merged;
    } catch (e) {
      console.error('Reload failed:', e);
      throw e;
    }
  }, [ticketId]);

  useEffect(() => {
    let active = true;
    async function loadDetail() {
      try {
        setLoading(true);
        setError("");
        const merged = await reloadTicketData();
        if (active) setTicket(merged);
        // Also load batch data
        if (active) await loadBatchData();
      } catch (e) {
        console.error('Load detail failed:', e);
        if (active) setError(e?.message || 'Failed to load ticket detail');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDetail();
    return () => { active = false; };
  }, [ticketId, reloadTicketData, loadBatchData]);

  // Realtime subscription for this specific ticket: flows + assignments
  useEffect(() => {
    if (!ticketId) return;

    console.log('[DETAIL] Setting up realtime subscription for ticket:', ticketId);
    
    const channel = supabase
      .channel(`ticket-detail-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'ticket_station_flow',
          filter: `ticket_no=eq.${ticketId}` // Only listen to changes for this ticket
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 FLOW CHANGE DETECTED for ticket:', ticketId);
          console.log('[DETAIL REALTIME] Payload:', payload);
          // Reload ticket data when flows change
          try {
            // Add small delay to ensure DB propagation
            await new Promise(resolve => setTimeout(resolve, 300));
            console.log('[DETAIL REALTIME] Reloading after flow change...');
            const refreshed = await reloadTicketData();
            console.log('[DETAIL REALTIME] Reloaded ticket status:', refreshed.status);
            console.log('[DETAIL REALTIME] Reloaded roadmap:', refreshed.roadmap?.map(r => ({ step: r.step, status: r.status })));
            // Force re-render by creating new object reference
            setTicket({ ...refreshed, _refreshKey: Date.now() });
            await loadBatchData();
            console.log('[DETAIL REALTIME] ✅ UI updated successfully');
          } catch (e) {
            console.error('[DETAIL REALTIME] Failed to reload:', e);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_assignments',
          filter: `ticket_no=eq.${ticketId}`
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 ASSIGNMENT CHANGE DETECTED for ticket:', ticketId);
          console.log('[DETAIL REALTIME] Assignment Payload:', payload);
          try {
            // Add small delay to ensure DB propagation
            await new Promise(resolve => setTimeout(resolve, 300));
            console.log('[DETAIL REALTIME] Reloading after assignment change...');
            const refreshed = await reloadTicketData();
            console.log('[DETAIL REALTIME] Reloaded ticket status:', refreshed.status);
            console.log('[DETAIL REALTIME] Reloaded roadmap:', refreshed.roadmap?.map(r => ({ step: r.step, status: r.status })));
            // Force re-render by creating new object reference
            setTicket({ ...refreshed, _refreshKey: Date.now() });
            console.log('[DETAIL REALTIME] ✅ UI updated successfully (assignments)');
          } catch (e) {
            console.error('[DETAIL REALTIME] Failed to reload (assignments):', e);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'technician_work_sessions',
          filter: `ticket_no=eq.${ticketId}`
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 WORK SESSION CHANGE DETECTED for ticket:', ticketId);
          console.log('[DETAIL REALTIME] Work Session Payload:', payload);
          try {
            // Reload work sessions data
            await loadWorkSessions();
            console.log('[DETAIL REALTIME] ✅ Work sessions updated successfully');
          } catch (e) {
            console.error('[DETAIL REALTIME] Failed to reload work sessions:', e);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_batches',
          filter: `ticket_no=eq.${ticketId}`
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 BATCH CHANGE DETECTED for ticket:', ticketId);
          await new Promise(resolve => setTimeout(resolve, 300));
          await loadBatchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qc_sessions',
          filter: `ticket_no=eq.${ticketId}`
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 QC SESSION CHANGE DETECTED for ticket:', ticketId);
          await new Promise(resolve => setTimeout(resolve, 300));
          try {
            const refreshed = await reloadTicketData();
            setTicket({ ...refreshed, _refreshKey: Date.now() });
          } catch (e) { console.warn('Reload after QC session change failed:', e); }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qc_rows'
        },
        async (payload) => {
          // Check if this row belongs to a session for this ticket
          if (payload.new?.session_id || payload.old?.session_id) {
            const sessionId = payload.new?.session_id || payload.old?.session_id;
            try {
              const { data: session } = await supabase
                .from('qc_sessions')
                .select('ticket_no')
                .eq('id', sessionId)
                .single();
              if (session && session.ticket_no === ticketId) {
                console.log('[DETAIL REALTIME] 🔥 QC ROW CHANGE DETECTED for ticket:', ticketId);
                await new Promise(resolve => setTimeout(resolve, 300));
                const refreshed = await reloadTicketData();
                setTicket({ ...refreshed, _refreshKey: Date.now() });
              }
            } catch (e) { console.warn('Check QC row session failed:', e); }
          }
        }
      )
      // (Rework realtime listeners removed)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket',
          filter: `no=eq.${ticketId}`
        },
        async () => {
          try {
            await new Promise(resolve => setTimeout(resolve, 300));
            const refreshed = await reloadTicketData();
            setTicket({ ...refreshed, _refreshKey: Date.now() });
          } catch {}
        }
      )
      .subscribe((status) => {
        console.log('[DETAIL] Realtime subscription status:', status);
      });

    // Fallback: Listen to ALL changes (in case filtered subscription doesn't work)
    const fallbackChannel = supabase
      .channel(`ticket-detail-fallback-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_station_flow'
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 FALLBACK: FLOW CHANGE DETECTED');
          console.log('[DETAIL REALTIME] Fallback Payload:', payload);
          
          // Check if this change is for our ticket
          if (payload.new?.ticket_no === ticketId || payload.old?.ticket_no === ticketId) {
            console.log('[DETAIL REALTIME] ✅ FALLBACK: This change is for our ticket!');
            try {
              await new Promise(resolve => setTimeout(resolve, 300));
              console.log('[DETAIL REALTIME] FALLBACK: Reloading after change...');
              const refreshed = await reloadTicketData();
              console.log('[DETAIL REALTIME] FALLBACK: Reloaded ticket status:', refreshed.status);
              setTicket({ ...refreshed, _refreshKey: Date.now() });
              await loadBatchData();
              console.log('[DETAIL REALTIME] ✅ FALLBACK: UI updated successfully');
            } catch (e) {
              console.error('[DETAIL REALTIME] FALLBACK: Failed to reload:', e);
            }
          } else {
            console.log('[DETAIL REALTIME] ⚠️ FALLBACK: This change is for different ticket:', payload.new?.ticket_no || payload.old?.ticket_no);
          }
        }
      )
      .subscribe((status) => {
        console.log('[DETAIL] Fallback subscription status:', status);
      });

    return () => {
      console.log('[DETAIL] Cleaning up realtime subscriptions');
      supabase.removeChannel(channel);
      supabase.removeChannel(fallbackChannel);
    };
  }, [ticketId, reloadTicketData]);

  // Polling fallback (every 5 seconds) in case realtime doesn't work
  useEffect(() => {
    if (!ticketId) return;

    console.log('[DETAIL] Setting up polling fallback...');
    
    const pollInterval = setInterval(async () => {
      try {
        const refreshed = await reloadTicketData();
        
        // Check if data has changed by comparing with current ticket
        if (ticket && JSON.stringify(refreshed.roadmap) !== JSON.stringify(ticket.roadmap)) {
          setTicket({ ...refreshed, _refreshKey: Date.now() });
        }
      } catch (e) {
        console.error('[POLLING] Failed to poll:', e);
      }
    }, 5000); // Poll every 5 seconds

    return () => {
      console.log('[DETAIL] Cleaning up polling fallback');
      clearInterval(pollInterval);
    };
  }, [ticketId, reloadTicketData, ticket]);

  // Server-Sent Events (SSE) fallback for realtime updates
  useEffect(() => {
    if (!ticketId) return;

    console.log('[SSE] Setting up SSE connection for ticket:', ticketId);
    
    const eventSource = new EventSource(`/api/production/${ticketId}/events`);
    
    eventSource.onopen = () => {
      console.log('[SSE] ✅ Connection opened');
    };

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'flow_change' || data.type === 'assignment_change') {
          console.log('[REALTIME] Data updated, refreshing...');
          const refreshed = await reloadTicketData();
          setTicket({ ...refreshed, _refreshKey: Date.now() });
        }
      } catch (e) {
        console.error('[REALTIME] Failed to parse event:', e);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
    };

    return () => {
      console.log('[SSE] Cleaning up SSE connection');
      eventSource.close();
    };
  }, [ticketId, reloadTicketData]);

  function mapErpToTicket(record) {
    const rec = record && record.data ? record.data : record;
    const id = rec?.No || rec?.no || rec?.RPD_No || rec?.rpdNo || rec?.orderNumber || rec?.Order_No || rec?.No_ || rec?.id;
    const rpdNo = String(id || "").trim();
    const quantity = Number(rec?.Quantity ?? rec?.quantity ?? 0);
    const dueDate = rec?.Delivery_Date || rec?.deliveryDate || rec?.Ending_Date_Time || rec?.Ending_Date || rec?.Due_Date || "";
    const itemCode = rec?.Source_No || rec?.Item_No || rec?.itemCode || rec?.Item_Code || rec?.Source_Item || "";
    const description = rec?.Description || rec?.description || "";
    const description2 = rec?.Description_2 || rec?.description2 || "";
    const route = rec?.Routing_No || rec?.Routing || rec?.Route || "";
    const roadmap = Array.isArray(rec?.Operations)
      ? rec.Operations.map(op => ({ step: op?.Description || op?.description || op?.Operation_No || "", status: "pending" }))
      : [];
    return {
      id: rpdNo,
      title: description,
      priority: "ยังไม่ได้กำหนด Priority",
      priorityClass: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
      status: "Pending",
      statusClass: "text-blue-600",
      assignee: "-",
      dueDate: dueDate || "",
      quantity: quantity || 0,
      rpd: rpdNo,
      itemCode,
      description,
      description2,
      route: itemCode || route,
      routeClass: "bg-blue-100 text-blue-800",
      bom: Array.isArray(rec?.BOM) ? rec.BOM : [],
      stations: [],
      roadmap,
    };
  }

  function mergeFlowsIntoTicket(base, flows, assignments) {
    console.log('🚀 [MERGE] mergeFlowsIntoTicket STARTED');
    if (!flows || flows.length === 0) return base;
    
    console.log('[MERGE] Merging flows:', flows.map(f => ({
      station: f.stations?.name_th,
      status: f.status,
      step_order: f.step_order
    })));
    
    const assignmentMap = {};
    (assignments || []).forEach(a => {
      const key = `${a.ticket_no}-${a.station_id}-${a.step_order || 0}`;
      const techName = a.users?.name || '';
      // ถ้ามีช่างหลายคนในสถานีเดียวกัน ให้รวมชื่อด้วย comma
      if (assignmentMap[key]) {
        // เช็คว่าชื่อซ้ำหรือไม่ (case-insensitive)
        const existingNames = assignmentMap[key].split(',').map(n => n.trim().toLowerCase());
        const newNameLower = techName.trim().toLowerCase();
        if (!existingNames.includes(newNameLower) && techName) {
          assignmentMap[key] = `${assignmentMap[key]}, ${techName}`;
        }
      } else if (techName) {
        assignmentMap[key] = techName;
      }
    });
    
    console.log('[MERGE] Assignment map:', assignmentMap);
    
    const roadmap = flows.map(flow => {
      const techKey = `${flow.ticket_no}-${flow.station_id}-${flow.step_order}`;
      return {
        step: flow.stations?.name_th || '',
        status: flow.status || 'pending',
        technician: assignmentMap[techKey] || '',
        qc_task_uuid: flow.qc_task_uuid || null
      };
    });
    
    console.log('[MERGE] Created roadmap:', roadmap);
    
        // สร้าง map สำหรับ technician_id
    const assignmentIdMap = {};
    (assignments || []).forEach(a => {
      const key = `${a.ticket_no}-${a.station_id}-${a.step_order || 0}`;
      if (!assignmentIdMap[key]) {
        assignmentIdMap[key] = [];
      }
      if (a.technician_id) {
        assignmentIdMap[key].push(a.technician_id);
      }
    });
    
    const stations = flows.map(flow => {
      const techKey = `${flow.ticket_no}-${flow.station_id}-${flow.step_order}`;
      const stationData = {
        name: flow.stations?.name_th || '',
        technician: assignmentMap[techKey] || '',
        technicianIds: assignmentIdMap[techKey] || [], // เก็บ array ของ technician IDs
        priceType: flow.price_type || 'flat',
        price: Number(flow.price) || 0,
        status: flow.status || 'pending',
        stationId: flow.station_id
      };
      console.log('🔍 [MERGE] Station data:', {
        name: stationData.name,
        price: stationData.price,
        priceType: stationData.priceType,
        raw_price: flow.price
      });
      return stationData;
    });
    console.log('💰 [MERGE] ALL STATIONS WITH PRICES:', stations.map(s => ({ name: s.name, price: s.price, type: s.priceType })));
    
    const currentFlow = flows.find(f => f.status === 'current');
    console.log('[MERGE] Current flow found:', currentFlow ? currentFlow.stations?.name_th : 'none');
    
    let assignee = '';
    if (currentFlow) {
      const techKey = `${currentFlow.ticket_no}-${currentFlow.station_id}-${currentFlow.step_order}`;
      assignee = assignmentMap[techKey] || '';
    }
    if (!assignee && flows.length > 0) {
      const firstFlow = flows[0];
      const techKey = `${firstFlow.ticket_no}-${firstFlow.station_id}-${firstFlow.step_order}`;
      assignee = assignmentMap[techKey] || '';
    }
    
    const status = calculateTicketStatus(stations, roadmap);
    console.log('[MERGE] Calculated status:', status);
    console.log('[MERGE] Stations with prices:', stations.map(s => ({
      name: s.name,
      price: s.price,
      priceType: s.priceType
    })));
    
    const statusClass = getStatusClass(status);
    return { ...base, roadmap, stations, assignee: assignee || '-', status, statusClass };
  }

  function calculateTicketStatus(stations, roadmap) {
    console.log('[CALC] Calculating status with roadmap:', roadmap?.map(r => ({ step: r.step, status: r.status })));
    
    if (!Array.isArray(stations) || stations.length === 0) {
      console.log('[CALC] No stations, returning Pending');
      return "Pending";
    }
    
    const hasAssigned = stations.some(s => (s.technician || '').trim() !== '');
    if (!hasAssigned) {
      console.log('[CALC] No assigned technicians, returning Pending');
      return "Pending";
    }
    
    if (Array.isArray(roadmap) && roadmap.length > 0) {
      const allCompleted = roadmap.every(step => step.status === 'completed');
      const hasCurrent = roadmap.some(step => step.status === 'current');
      
      console.log('[CALC] allCompleted:', allCompleted, 'hasCurrent:', hasCurrent);
      
      if (allCompleted) return "Finish";
      if (hasCurrent) return "In Progress";
    }
    
    console.log('[CALC] Returning Released (default)');
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

  async function handleDone(id) {
    if (actionBusy) return;
    setActionBusy(true);

    // Update UI optimistically
    setTicket((t) => {
      if (!t || t.id !== id) return t;
      const roadmap = t.roadmap.map((s) => ({ ...s }));
      const currentIndex = roadmap.findIndex((s) => s.status === "current");
      if (currentIndex === -1) return t;
      roadmap[currentIndex].status = "completed";
      const allCompleted = roadmap.every((s) => s.status === "completed");
      if (allCompleted) {
        return { ...t, roadmap, status: "Finish", statusClass: "text-emerald-600" };
      }
      const nextPendingIndex = roadmap.findIndex((s) => s.status !== "completed");
      const nextPendingStep = nextPendingIndex >= 0 ? roadmap[nextPendingIndex]?.step || "" : "";
      const waitingForQC = (nextPendingStep || "").toUpperCase().includes("QC");
      if (waitingForQC) {
        return { ...t, roadmap, status: "รอ QC ตรวจ", statusClass: "text-indigo-700" };
      }
      return { ...t, roadmap, status: "Released", statusClass: "text-green-600" };
    });

    // Persist to database via API
    try {
      // Get current flow's station_id from ticket roadmap
      const currentRoadmap = ticket?.roadmap?.find(r => r.status === 'current');
      if (!currentRoadmap) {
        console.warn('[DONE] No current step found in UI');
        setActionBusy(false);
        return;
      }

      // Load flows with step_order and status, then use the actual current step
      const { data: flows } = await supabase
        .from('ticket_station_flow')
        .select('station_id, step_order, status, stations(name_th)')
        .eq('ticket_no', ticketId)
        .order('step_order', { ascending: true });

      // Prefer DB truth: the one marked as current
      let currentStationFlow = Array.isArray(flows)
        ? flows.find(f => f.status === 'current')
        : null;
      // Fallback: match by name (in case realtime lag), choose the earliest pending/current
      if (!currentStationFlow && Array.isArray(flows)) {
        currentStationFlow = flows.find(f => f.stations?.name_th === currentRoadmap.step && (f.status === 'current' || f.status === 'pending')) || null;
      }

      if (!currentStationFlow) {
        console.warn('[DONE] Could not find station_id for current step');
        setActionBusy(false);
        return;
      }

      console.log('[DONE] Calling API to complete station:', currentStationFlow.station_id, 'step_order:', currentStationFlow.step_order);

      const apiResponse = await fetch(`/api/production/${ticketId}/update-flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          station_id: currentStationFlow.station_id,
          step_order: currentStationFlow.step_order,
          user_id: user?.id
        })
      });

      const apiResult = await apiResponse.json();
      console.log('[DONE] API response:', apiResult);

      if (!apiResponse.ok || !apiResult.success) {
        console.error('[DONE] API error:', apiResult.error);
        alert(apiResult.error || 'ไม่สามารถทำขั้นตอนให้เสร็จได้');
        setActionBusy(false);
        return;
      }

      // Reload ticket data from DB
      const refreshed = await reloadTicketData();
      // Force re-render by creating new object reference
      setTicket({ ...refreshed, _refreshKey: Date.now() });

    } catch (e) {
      console.error('[DONE] Failed to persist DONE:', e);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (e?.message || 'Unknown error'));
      // Reload to restore correct state
      try {
        const refreshed = await reloadTicketData();
        setTicket({ ...refreshed, _refreshKey: Date.now() });
      } catch {}
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStart(id) {
    if (actionBusy) {
      console.log('[START] Already busy, skipping');
      return;
    }
    
    console.log('[START] Starting handleStart for ticket:', id);
    setActionBusy(true);

    // Guard: do NOT allow starting when first pending is QC (must start from QC page)
    if (ticket && Array.isArray(ticket.roadmap)) {
      const fp = ticket.roadmap.find((s) => s.status !== 'completed');
      const isQC = (fp?.step || '').toUpperCase().includes('QC');
      if (isQC) {
        alert('ขั้นตอน QC ต้องเริ่มจากหน้า QC เท่านั้น');
        setActionBusy(false);
        return;
      }
    }

    // Update UI optimistically (non-QC only)
    setTicket((t) => {
      if (!t || t.id !== id) {
        console.log('[START] Ticket mismatch or null, skipping UI update');
        return t;
      }
      const roadmap = t.roadmap.map((s) => ({ ...s }));
      const hasCurrent = roadmap.some((s) => s.status === 'current');
      if (hasCurrent) {
        console.log('[START] Already has current step in UI');
        return t;
      }
      const firstPending = roadmap.findIndex((s) => s.status !== 'completed');
      if (firstPending !== -1) {
        // Double-check prevent QC from being set as current in UI
        const isQC = (roadmap[firstPending]?.step || '').toUpperCase().includes('QC');
        if (isQC) return t;
        console.log('[START] Setting step', firstPending, 'to current in UI');
        roadmap[firstPending].status = 'current';
        return { ...t, roadmap, status: 'In Progress', statusClass: 'text-amber-600' };
      }
      return t;
    });

    // Persist to database
    try {
      console.log('[START] Fetching flows from DB for ticket:', ticketId);
      
      // 1) Get flows from DB
      const { data: flows, error: flowError } = await supabase
        .from('ticket_station_flow')
        .select(`
          *,
          stations (
            name_th
          )
        `)
        .eq('ticket_no', ticketId)
        .order('step_order', { ascending: true });

      if (flowError) {
        console.error('[START] Error fetching flows:', flowError);
        throw flowError;
      }

      if (!flows || flows.length === 0) {
        console.warn('[START] No flows found in DB for ticket:', ticketId);
        alert('ไม่พบข้อมูลสถานีในฐานข้อมูล กรุณาให้ Admin เพิ่มสถานีให้ตั๋วนี้ก่อน');
        setActionBusy(false);
        return;
      }

      console.log('[START] Found flows:', flows.map(f => ({
        step_order: f.step_order,
        station: f.stations?.name_th,
        status: f.status
      })));

      // 2) Check if there's already a current step
      const currentFlow = flows.find(f => f.status === 'current');
      if (currentFlow) {
        console.log('[START] Already have current step in DB:', currentFlow.stations?.name_th);
        alert('มีขั้นตอนที่กำลังทำอยู่แล้ว กรุณาทำให้เสร็จก่อน');
        setActionBusy(false);
        // Reload to sync UI with DB
        const refreshed = await reloadTicketData();
        setTicket({ ...refreshed, _refreshKey: Date.now() });
        return;
      }

      // 3) Find first pending step that's not QC
      const firstPending = flows.find(f => {
        const isQC = (f.stations?.name_th || '').toUpperCase().includes('QC');
        return f.status === 'pending' && !isQC;
      });

      if (!firstPending) {
        console.log('[START] No eligible pending step found');
        alert('ไม่พบขั้นตอนที่สามารถเริ่มได้ (อาจเป็น QC หรือเสร็จสิ้นแล้ว)');
        setActionBusy(false);
        return;
      }

      console.log('[START] Found first pending step:', {
        step_order: firstPending.step_order,
        station: firstPending.stations?.name_th,
        station_id: firstPending.station_id
      });

      // 4) Update to current via API
      console.log('[START] Calling API to update station', firstPending.station_id, 'to current');
      
      const apiResponse = await fetch(`/api/production/${ticketId}/update-flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          station_id: firstPending.station_id,
          step_order: firstPending.step_order,
          user_id: user?.id
        })
      });

      console.log('[START] API request details:', {
        url: `/api/production/${ticketId}/update-flow`,
        ticketId,
        station_id: firstPending.station_id,
        step_order: firstPending.step_order,
        user_id: user?.id
      });

      const apiResult = await apiResponse.json();
      console.log('[START] API response:', apiResult);

      if (!apiResponse.ok || !apiResult.success) {
        console.error('[START] API error:', apiResult.error);
        alert(apiResult.error || 'ไม่สามารถเริ่มขั้นตอนได้');
        setActionBusy(false);
        return;
      }

      console.log('[START] Successfully updated to current, waiting before reload');

      // Wait a bit for DB to propagate changes
      await new Promise(resolve => setTimeout(resolve, 200));

      // 5) Reload ticket data from DB
      console.log('[START] Reloading data from DB...');
      const refreshed = await reloadTicketData();
      console.log('[START] Reloaded ticket, new status:', refreshed.status);
      console.log('[START] Reloaded roadmap:', refreshed.roadmap?.map(r => ({ step: r.step, status: r.status })));
      setTicket(refreshed);

    } catch (e) {
      console.error('[START] Failed to persist START:', e);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (e?.message || 'Unknown error'));
      // Reload to restore correct state
      try {
        const refreshed = await reloadTicketData();
        setTicket({ ...refreshed, _refreshKey: Date.now() });
      } catch {}
    } finally {
      console.log('[START] Finished handleStart, clearing busy flag');
      setActionBusy(false);
    }
  }

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/production">
        <div className="min-h-screen container-safe px-2 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button 
            onClick={() => router.push('/production')} 
            onContextMenu={(e) => {
              e.preventDefault();
              window.open('/production', '_blank');
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-sm text-gray-900 dark:text-gray-100"
          >
            <ArrowLeft className="w-4 h-4" /> กลับหน้า Production
          </button>
          {isClosed && (
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-100 text-emerald-800 text-sm border border-emerald-200">
              ✅ Closed
            </span>
          )}
        </div>

        {loading && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-800 dark:text-blue-300">กำลังโหลดข้อมูลตั๋ว...</div>
        )}

        {!!error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">{error}</div>
        )}

        {!loading && !error && !ticket && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">ไม่พบตั๋ว {ticketId}</div>
        )}

        {ticket && !loading && (
          <DetailCard 
            ticket={ticket} 
            onDone={handleDone} 
            onStart={handleStart} 
            me={myName}
            isAdmin={(user?.roles || (user?.role ? [user.role] : [])).some(r => r.toLowerCase() === 'admin' || r.toLowerCase() === 'superadmin')}
            userId={user?.id || null}
            batches={batches}
            userRoles={user?.roles || (user?.role ? [user.role] : [])}
          />
        )}
      </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}


