// Utilities for loading tickets and QC queue from Supabase DB (source of truth)
import { supabase as client } from "@/utils/supabaseClient";

// Normalize ticket number id
function normalizeTicketNo(value) {
  return String(value || "").replace('#','');
}

// Build priority class for badges
function buildPriorityClass(priority) {
  const p = String(priority || '').toLowerCase();
  if (p.includes('high') || p.includes('สูง')) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  if (p.includes('medium') || p.includes('กลาง')) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  if (p.includes('low') || p.includes('ต่ำ')) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
  return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
}

// Load assignment map from ticket_assignments (and optionally rework_roadmap)
async function loadAssignmentMap() {
  const assignmentMap = {};

  // ticket_assignments -> key: `${ticket_no}-${station_id}-${step_order}` => technician name
  try {
    const { data: assignments } = await client
      .from('view_ticket_assignments_with_user')
      .select('ticket_no, station_id, step_order, technician_name');
    (assignments || []).forEach(a => {
      const id = normalizeTicketNo(a.ticket_no);
      const step = a.step_order || 0;
      const tech = a.technician_name || '';
      if (!tech) return;
      assignmentMap[`${id}-${a.station_id}-${step}`] = tech;
      assignmentMap[`${id}-${a.station_id}`] = tech;
    });
  } catch {}

  // Rework roadmap removed

  return assignmentMap;
}

// Load QC queue tickets (pending/current QC as first active step)
export async function loadActiveQcQueue() {
  // 1) Load tickets base info from DB only
  const { data: dbTickets } = await client
    .from('ticket')
    .select('no, source_no, description, priority, quantity, pass_quantity')
    .order('created_at', { ascending: false });

  const baseTickets = (dbTickets || []).map(t => {
    const id = normalizeTicketNo(t.no);
    const itemCode = t.source_no || '';
    const displayQty = typeof t.pass_quantity === 'number' && t.pass_quantity !== null
      ? t.pass_quantity
      : (t.quantity || 0);
    return {
      id,
      title: t.description || '',
      priority: t.priority || 'ยังไม่ได้กำหนด Priority',
      priorityClass: buildPriorityClass(t.priority),
      status: 'Released',
      statusClass: 'text-purple-600',
      assignee: '-',
      time: '',
      route: itemCode,
      routeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
      dueDate: '',
      quantity: displayQty,
      rpd: id,
      itemCode,
      projectCode: itemCode,
      projectName: t.description || id,
      stations: [],
    };
  });

  // 2) Load flows with pagination และ filter ตาม ticket_no ที่มีอยู่จริง
  // ใช้ pagination เพื่อให้แน่ใจว่าได้ข้อมูลทั้งหมด (Supabase default limit = 1000)
  let flows = [];
  {
    const allTicketNumbers = baseTickets.map(t => t.id).filter(v => v);
    
    if (allTicketNumbers.length > 0) {
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
          const { data: flowsPage, error: error } = await client
            .from('ticket_station_flow')
            .select(`*, stations(name_th, code)`)
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
        console.error('[QC] Failed to load station flows:', flowError);
        flows = [];
      } else {
        flows = allFlows;
        console.log(`[QC] Loaded ${flows.length} flows for ${allTicketNumbers.length} tickets (with pagination)`);
      }
    }
  }

  const flowByTicket = new Map();
  (flows || []).forEach(f => {
    const key = normalizeTicketNo(f.ticket_no);
    if (!flowByTicket.has(key)) flowByTicket.set(key, []);
    flowByTicket.get(key).push(f);
  });

  // 3) Load assignment maps
  const assignmentMap = await loadAssignmentMap();

  // 4) Merge flows into base tickets
  const merged = baseTickets.map(t => {
    const ticketFlows = flowByTicket.get(t.id) || [];
    if (ticketFlows.length > 0) {
      const roadmap = ticketFlows.map(flow => ({
        step: flow.stations?.name_th || '',
        status: flow.status || 'pending',
        stationId: flow.station_id,
        stepOrder: flow.step_order,
        updatedAt: flow.updated_at || flow.created_at,
        qcTaskUuid: flow.qc_task_uuid || null
      }));
      // derive assignee = technician at previous station of active QC step
      let assignee = t.assignee;
      try {
        const steps = roadmap;
        const firstActiveIdx = steps.findIndex(s => (s.status || 'pending') !== 'completed');
        if (firstActiveIdx >= 0) {
          const active = steps[firstActiveIdx];
          const isQC = String(active.step || '').toUpperCase().includes('QC');
          if (isQC && firstActiveIdx > 0) {
            const prev = steps[firstActiveIdx - 1];
            const idNorm = t.id;
            const keyExact = `${idNorm}-${prev.stationId}-${prev.stepOrder || 0}`;
            const keyNoOrder = `${idNorm}-${prev.stationId}`;
            assignee = assignmentMap[keyExact] || assignmentMap[keyNoOrder] || assignee;
          }
        }
      } catch {}
      return { ...t, roadmap, assignee };
    }
    return t;
  });

  // 5) Select QC candidates where the first active step is QC and status in pending/current
  const qcCandidates = merged.filter(t => {
    const steps = Array.isArray(t.roadmap) ? t.roadmap : [];
    if (steps.length === 0) return false;
    const firstActiveIdx = steps.findIndex(s => (s.status || 'pending') !== 'completed');
    if (firstActiveIdx < 0) return false;
    const stepName = String(steps[firstActiveIdx]?.step || '').toUpperCase();
    const stepStatus = steps[firstActiveIdx]?.status || 'pending';
    return stepName.includes('QC') && (stepStatus === 'pending' || stepStatus === 'current');
  });

  // 6) Compute assignee map for previous station display (QC target)
  const assignmentByPrev = {};
  try {
    (flows || []).forEach(f => {
      const key = `${normalizeTicketNo(f.ticket_no)}-${f.station_id}-${f.step_order || 0}`;
      // ticket_assignments map already computed in assignmentMap
      if (assignmentMap[key]) assignmentByPrev[key] = assignmentMap[key];
    });
  } catch {}

  // 7) Sort by arrival at QC
  const qcWithArrival = qcCandidates.map(t => {
    const steps = Array.isArray(t.roadmap) ? t.roadmap : [];
    const idx = steps.findIndex(s => (s.status || 'pending') !== 'completed');
    const active = idx >= 0 ? steps[idx] : null;
    const arrival = active?.updatedAt ? new Date(active.updatedAt).getTime() : null;
    return { ...t, _qcArrivalTs: arrival };
  }).sort((a,b) => (a._qcArrivalTs ?? Number.MAX_SAFE_INTEGER) - (b._qcArrivalTs ?? Number.MAX_SAFE_INTEGER));

  return {
    tickets: merged,
    qcTickets: qcWithArrival,
    assignmentMap,
  };
}



