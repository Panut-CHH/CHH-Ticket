import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logApiCall, logError } from '@/utils/activityLogger';
import { isSupervisor, canSupervisorActForTechnician, getSupervisorManagedRole, isSupervisorProduction, isSupervisorPainting, isProxyOperator, canActAsProxy } from '@/utils/rolePermissions';
import { sendLineNextStationNotification } from '@/utils/lineMessaging';

// Create Supabase admin client (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * POST /api/production/[ticketNo]/update-flow
 * Update station flow status (start, complete, partial_complete, or reset a step)
 *
 * Body:
 * {
 *   action: 'start' | 'complete' | 'partial_complete' | 'reset',
 *   station_id: 'uuid',
 *   step_order: number,
 *   user_id: 'uuid',
 *   qty: number  // (partial_complete only) จำนวนชิ้นที่เสร็จรอบนี้
 * }
 */
export async function POST(request, { params }) {
  try {
    const { ticketNo } = await params;
    const body = await request.json();
    const { action, station_id, step_order, user_id, qty } = body;

    console.log('[API] Update flow request:', { ticketNo, action, station_id, step_order, user_id, qty });

    // Validate inputs
    // For reset action, station_id and step_order are not required
    if (action === 'reset') {
      if (!ticketNo || !action || !user_id) {
        console.error('[API] Missing required parameters for reset:', { ticketNo, action, user_id });
        return NextResponse.json(
          { success: false, error: 'Missing required parameters' },
          { status: 400 }
        );
      }
    } else {
      if (!ticketNo || !action || !station_id || !user_id) {
        console.error('[API] Missing required parameters:', { ticketNo, action, station_id, step_order, user_id });
        return NextResponse.json(
          { success: false, error: 'Missing required parameters' },
          { status: 400 }
        );
      }
    }

    if (!['start', 'complete', 'partial_complete', 'reset'].includes(action)) {
      console.error('[API] Invalid action:', action);
      return NextResponse.json(
        { success: false, error: 'Invalid action. Must be "start", "complete", "partial_complete", or "reset"' },
        { status: 400 }
      );
    }

    // Validate qty for partial_complete
    if (action === 'partial_complete') {
      if (!qty || qty <= 0 || !Number.isInteger(qty)) {
        return NextResponse.json(
          { success: false, error: 'qty must be a positive integer for partial_complete' },
          { status: 400 }
        );
      }
    }

    // Admin bypass: allow admin/superadmin to operate any step
    // Supervisor Production bypass: allow Supervisor Production to operate any step
    let isAdmin = false;
    let isSupervisorProd = false;
    let userRoles = [];
    let normalizedRoles = [];
    try {
      const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('role, roles')
        .eq('id', user_id)
        .maybeSingle();
      // Support both old format (role) and new format (roles)
      userRoles = userRow?.roles || (userRow?.role ? [userRow.role] : []);
      normalizedRoles = userRoles.map(r => String(r).toLowerCase());
      if (normalizedRoles.some(r => r === 'admin' || r === 'superadmin')) {
        isAdmin = true;
      }
      
      // For reset action, only SuperAdmin is allowed
      if (action === 'reset') {
        const isSuperAdmin = normalizedRoles.some(r => r === 'superadmin');
        if (!isSuperAdmin) {
          return NextResponse.json(
            { success: false, error: 'Only SuperAdmin can reset tickets' },
            { status: 403 }
          );
        }
      }
      if (isSupervisorProduction(userRoles)) {
        isSupervisorProd = true;
      }
    } catch {}

    // Check if user is assigned to this station (ต้องใช้ step_order เพื่อให้แต่ละ step แยกกัน)
    console.log('[API] Checking assignment for:', { ticketNo, station_id, step_order, user_id, isAdmin });

    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('ticket_assignments')
      .select('*')
      .eq('ticket_no', ticketNo)
      .eq('station_id', station_id)
      .eq('step_order', step_order)
      .eq('technician_id', user_id)
      .single();

    // Check if user is a supervisor/proxy and can act for the assigned technician
    let canSupervisorAct = false;
    let isProxyAction = false; // Flag ว่าเป็นการกดแทนหรือไม่
    let actualTechnicianId = user_id; // Default to user_id, will be updated if acting on behalf

    if (!isAdmin && (assignmentError || !assignment)) {
      // User is not directly assigned, check if they're a supervisor or ProxyOperator
      const isProxy = isProxyOperator(userRoles);
      if (isSupervisor(userRoles) || isProxy) {
        console.log('[API] User is a supervisor/proxy, checking if they can act for assigned technician');

        // Find the actual assignment for this station/step (any technician assigned)
        const { data: actualAssignment, error: actualAssignmentError } = await supabaseAdmin
          .from('ticket_assignments')
          .select('technician_id')
          .eq('ticket_no', ticketNo)
          .eq('station_id', station_id)
          .eq('step_order', step_order)
          .maybeSingle();

        if (!actualAssignmentError && actualAssignment && actualAssignment.technician_id) {
          if (isProxy) {
            // ProxyOperator can act for ANY technician on ANY station
            canSupervisorAct = true;
            isProxyAction = true;
            actualTechnicianId = actualAssignment.technician_id;
            console.log('[API] ProxyOperator acting for technician:', {
              proxyUserId: user_id,
              technicianId: actualTechnicianId
            });
          } else {
            // Get the assigned technician's role for supervisor check
            const { data: technicianRow } = await supabaseAdmin
              .from('users')
              .select('role, roles')
              .eq('id', actualAssignment.technician_id)
              .maybeSingle();

            if (technicianRow) {
              const technicianRoles = technicianRow.roles || (technicianRow.role ? [technicianRow.role] : []);
              // Check if supervisor can act for any of the technician's roles
              canSupervisorAct = userRoles.some(supervisorRole =>
                technicianRoles.some(technicianRole =>
                  canSupervisorActForTechnician(supervisorRole, technicianRole)
                )
              );

              if (canSupervisorAct) {
                isProxyAction = true;
                actualTechnicianId = actualAssignment.technician_id;
                console.log('[API] Supervisor can act for technician:', {
                  supervisorRoles: userRoles,
                  technicianId: actualTechnicianId,
                  technicianRoles: technicianRoles
                });
              }
            }
          }
        }
      }
    }

    // Special case: allow Packing/CNC/Painting role to start/complete their respective stations even without explicit assignment
    let isPackingStation = false;
    let hasPackingRole = false;
    let isCNCStation = false;
    let hasCNCRole = false;
    let isPaintingStation = false;
    let hasSupervisorPaintingRole = false;
    try {
      const { data: stationData } = await supabaseAdmin
        .from('stations')
        .select('name_th, code')
        .eq('id', station_id)
        .maybeSingle();
      const stationName = (stationData?.name_th || stationData?.code || '').toLowerCase().trim();
      isPackingStation =
        stationName === 'packing' ||
        stationName.includes('packing') ||
        stationName.includes('แพ็ค');
      hasPackingRole = normalizedRoles.some(r =>
        r === 'packing' || r.includes('packing') || r.includes('แพ็ค')
      );
      isCNCStation = stationName === 'cnc' || stationName.includes('cnc');
      hasCNCRole = normalizedRoles.some(r => r === 'cnc' || r.includes('cnc'));
      isPaintingStation = stationName.includes('สี') || stationName.includes('color') || stationName.includes('paint');
      hasSupervisorPaintingRole = isSupervisorPainting(userRoles);
    } catch (e) {
      console.warn('[API] Failed to resolve station/role for role-based bypass:', e?.message);
    }

    // Allow Packing/CNC role to start/complete their respective stations without explicit assignment
    const allowPackingByRole = !isAdmin && !isSupervisorProd && hasPackingRole && isPackingStation;
    const allowCNCByRole = !isAdmin && !isSupervisorProd && hasCNCRole && isCNCStation;
    // Allow Supervisor Painting to start/complete painting stations without explicit assignment
    const allowPaintingByRole = !isAdmin && !isSupervisorProd && hasSupervisorPaintingRole && isPaintingStation;
    const allowRoleBasedBypass = allowPackingByRole || allowCNCByRole || allowPaintingByRole;

    // Supervisor Production can operate any station without assignment check
    // Supervisor Painting can operate painting stations without assignment check
    if (!isAdmin && !isSupervisorProd && (assignmentError || !assignment) && !canSupervisorAct && !allowRoleBasedBypass) {
      return NextResponse.json(
        { success: false, error: 'You are not assigned to this station' },
        { status: 403 }
      );
    }

    console.log('[API] Assignment check passed (admin bypass =', isAdmin, ', supervisor production bypass =', isSupervisorProd, ', supervisor painting bypass =', allowPaintingByRole, ') proceeding');

    if (action === 'start') {
      // Get all flows for this ticket
      console.log('[API] Getting flows for ticket:', ticketNo);
      
      const { data: flows } = await supabaseAdmin
        .from('ticket_station_flow')
        .select('*')
        .eq('ticket_no', ticketNo)
        .order('step_order', { ascending: true });

      console.log('[API] Found flows:', flows?.map(f => ({
        step_order: f.step_order,
        station_id: f.station_id,
        status: f.status,
        available_qty: f.available_qty,
        completed_qty: f.completed_qty
      })));

      // ตรวจสอบว่า step นี้มีชิ้นงานพร้อมทำหรือยัง (available_qty > 0)
      const targetFlow = flows?.find(f => f.station_id === station_id && f.step_order === step_order);
      if (targetFlow && targetFlow.available_qty <= 0 && targetFlow.step_order !== 1) {
        // Auto-backfill: ถ้า step ก่อนหน้า completed แล้วแต่ qty ยังไม่ถูก forward
        // (เช่น ตั๋วเก่าก่อน migration หรือ race condition ใน completeQCStation)
        const prevFlow = flows.find(f => f.step_order === step_order - 1);
        const prevAlreadyForwarded = prevFlow ? (flows || [])
          .filter(f => f.step_order > prevFlow.step_order)
          .reduce((sum, f) => sum + (Number(f.available_qty) || 0), 0) : 0;
        const recoverableQty = prevFlow && prevFlow.status === 'completed'
          ? Math.max(0, (Number(prevFlow.completed_qty) || 0) - prevAlreadyForwarded)
          : 0;

        if (recoverableQty > 0) {
          console.warn('[API] Auto-backfill available_qty:', {
            ticketNo, step_order,
            prev_completed: prevFlow.completed_qty,
            already_forwarded: prevAlreadyForwarded,
            backfilled: recoverableQty
          });
          await supabaseAdmin
            .from('ticket_station_flow')
            .update({ available_qty: recoverableQty })
            .eq('id', targetFlow.id);
          await supabaseAdmin
            .from('station_qty_transfers')
            .insert({
              ticket_no: ticketNo,
              from_step_order: prevFlow.step_order,
              to_step_order: step_order,
              quantity: recoverableQty
            });
          targetFlow.available_qty = recoverableQty;
        } else {
          return NextResponse.json(
            { success: false, error: 'ยังไม่มีชิ้นงานมาถึงสถานีนี้' },
            { status: 400 }
          );
        }
      }

      // Update to current - อนุญาตให้หลายสถานี active พร้อมกันได้ (Progress-based)
      console.log('[API] Updating flow to current:', { ticketNo, station_id, step_order });

      const startedAt = new Date().toISOString();

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('ticket_station_flow')
        .update({
          status: 'current',
          started_at: startedAt
        })
        .eq('ticket_no', ticketNo)
        .eq('station_id', station_id)
        .eq('step_order', step_order)
        .in('status', ['pending', 'in_progress'])
        .select();

      if (updateError) {
        console.error('[API] Update error:', updateError);
        throw updateError;
      }

      console.log('[API] Updated to current:', updated);

      // Check if this is the first step (step_order = 1) and update ticket.started_at
      if (step_order === 1) {
        try {
          const { data: ticketData } = await supabaseAdmin
            .from('ticket')
            .select('started_at')
            .eq('no', ticketNo)
            .single();
          
          // Only update if ticket.started_at is null (first time starting)
          if (ticketData && !ticketData.started_at) {
            await supabaseAdmin
              .from('ticket')
              .update({ started_at: startedAt })
              .eq('no', ticketNo);
            console.log('[API] Updated ticket.started_at for first step');
          }
        } catch (e) {
          console.warn('[API] Failed to update ticket.started_at:', e?.message);
        }
      }

      // actualTechnicianId is already determined above in the authorization check

      // Create technician work session record
      const proxyUserId = isProxyAction ? user_id : null;
      console.log('[API] Creating work session with:', {
        ticket_no: ticketNo,
        station_id: station_id,
        step_order: step_order,
        technician_id: actualTechnicianId,
        started_at: startedAt,
        proxy_user_id: proxyUserId
      });

      const { data: workSession, error: sessionError } = await supabaseAdmin
        .from('technician_work_sessions')
        .insert({
          ticket_no: ticketNo,
          station_id: station_id,
          step_order: step_order,
          technician_id: actualTechnicianId,
          started_at: startedAt,
          proxy_user_id: proxyUserId
        })
        .select()
        .single();

      // สร้าง penalty deduction อัตโนมัติเมื่อมีคนกดแทน (start)
      if (isProxyAction && actualTechnicianId !== user_id) {
        try {
          // ดึงค่าหักเงินจาก penalty_settings
          const { data: penaltySetting } = await supabaseAdmin
            .from('penalty_settings')
            .select('value')
            .eq('key', 'default_deduction_amount')
            .maybeSingle();
          const deductionAmount = penaltySetting?.value || 0;

          await supabaseAdmin
            .from('penalty_deductions')
            .insert({
              ticket_no: ticketNo,
              station_id: station_id,
              step_order: step_order,
              action: 'start',
              technician_id: actualTechnicianId,
              proxy_user_id: user_id,
              amount: deductionAmount,
              status: 'pending'
            });
          console.log('[API] Created penalty deduction for proxy start action:', { technicianId: actualTechnicianId, proxyUserId: user_id, amount: deductionAmount });
        } catch (penaltyErr) {
          console.warn('[API] Failed to create penalty deduction:', penaltyErr?.message);
        }
      }

      if (sessionError) {
        console.error('[API] Work session creation error:', sessionError);
        // Don't fail the entire operation, just log the error
        console.warn('[API] Continuing without work session record');
      } else {
        console.log('[API] Created work session:', workSession);
      }

      // Get station name and user info for log
      let stationName = null;
      let userName = null;
      let userEmail = null;
      try {
        const { data: stationData } = await supabaseAdmin
          .from('stations')
          .select('name_th, code')
          .eq('id', station_id)
          .single();
        stationName = stationData?.name_th || stationData?.code || null;
        
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('name, email')
          .eq('id', user_id)
          .single();
        userName = userData?.name || userData?.email || null;
        userEmail = userData?.email || null;
      } catch (e) {
        console.warn('Failed to get station/user info for log:', e?.message);
      }

      const response = NextResponse.json({
        success: true,
        message: 'Step started successfully',
        data: updated,
        workSession: workSession
      });
      await logApiCall(request, 'step_started', 'production_flow', ticketNo, {
        station_id,
        station_name: stationName,
        step_order,
        user_id,
        user_name: userName
      }, 'success', null, userEmail ? { id: user_id, email: userEmail, name: userName } : null);
      return response;

    } else if (action === 'complete' || action === 'partial_complete') {
      // ========== PROGRESS-BASED COMPLETION ==========
      // complete = ส่งชิ้นง���นที่เหลือทั้งหมด
      // partial_complete = ส่งเฉพาะจำนวนที่ระบุ (qty)

      // ดึง flow ป���จจุบันพร้อม qty data
      const { data: currentFlowData, error: flowFetchError } = await supabaseAdmin
        .from('ticket_station_flow')
        .select('*')
        .eq('ticket_no', ticketNo)
        .eq('station_id', station_id)
        .eq('step_order', step_order)
        .in('status', ['current', 'in_progress'])
        .single();

      if (flowFetchError || !currentFlowData) {
        return NextResponse.json(
          { success: false, error: 'This step is not currently in progress' },
          { status: 400 }
        );
      }

      // คำนวณจำนวนที่จะส่ง
      const remainingQty = currentFlowData.available_qty - currentFlowData.completed_qty;
      const transferQty = action === 'partial_complete' ? qty : remainingQty;

      if (transferQty <= 0) {
        return NextResponse.json(
          { success: false, error: 'ไม่มีชิ้นงานเหลือให้ส่งที่สถานีนี้' },
          { status: 400 }
        );
      }

      if (transferQty > remainingQty) {
        return NextResponse.json(
          { success: false, error: `ส่งได้สูงสุด ${remainingQty} ชิ้น (จาก available ${currentFlowData.available_qty} - completed ${currentFlowData.completed_qty})` },
          { status: 400 }
        );
      }

      const completedAt = new Date().toISOString();
      const newCompletedQty = currentFlowData.completed_qty + transferQty;
      const isFullyCompleted = newCompletedQty >= currentFlowData.total_qty;

      // อัพเดต completed_qty + status ของสถานีปัจจุบัน
      const newStatus = isFullyCompleted ? 'completed' : 'in_progress';
      const updatePayload = {
        completed_qty: newCompletedQty,
        status: newStatus,
      };
      if (isFullyCompleted) {
        updatePayload.completed_at = completedAt;
      }

      const { data: completed, error: completeError } = await supabaseAdmin
        .from('ticket_station_flow')
        .update(updatePayload)
        .eq('id', currentFlowData.id)
        .select();

      if (completeError) {
        console.error('[API] Complete error:', completeError);
        throw completeError;
      }

      console.log('[API] Updated station progress:', { newCompletedQty, totalQty: currentFlowData.total_qty, status: newStatus });

      // อัพเดต available_qty ของสถานีถัดไป + insert transfer log
      const { data: allFlows } = await supabaseAdmin
        .from('ticket_station_flow')
        .select('id, step_order, status, available_qty, completed_qty, total_qty')
        .eq('ticket_no', ticketNo)
        .order('step_order', { ascending: true });

      const nextFlow = allFlows?.find(f => f.step_order === step_order + 1);
      if (nextFlow) {
        const newAvailableQty = nextFlow.available_qty + transferQty;
        const nextStatus = nextFlow.status === 'pending' && newAvailableQty > 0 ? 'in_progress' : nextFlow.status;

        await supabaseAdmin
          .from('ticket_station_flow')
          .update({
            available_qty: newAvailableQty,
            status: nextStatus
          })
          .eq('id', nextFlow.id);

        console.log('[API] Updated next station available_qty:', { nextStepOrder: nextFlow.step_order, newAvailableQty, nextStatus });
      }

      // Insert transfer audit log
      await supabaseAdmin
        .from('station_qty_transfers')
        .insert({
          ticket_no: ticketNo,
          from_step_order: step_order,
          to_step_order: step_order + 1,
          quantity: transferQty,
          transferred_by: user_id
        });

      // ตรวจสอบว่าทุกสถานีเสร็จหมดแล้วหรือยัง
      if (allFlows && allFlows.length > 0 && isFullyCompleted) {
        // Re-check after our update
        const allCompleted = allFlows.every(f => {
          if (f.step_order === step_order) return true; // เพิ่ง update เป็น completed
          return f.status === 'completed';
        });
        const isLastStep = step_order === Math.max(...allFlows.map(f => f.step_order));

        if (allCompleted && isLastStep) {
          try {
            await supabaseAdmin
              .from('ticket')
              .update({
                status: 'Finish',
                finished_at: completedAt
              })
              .eq('no', ticketNo);
            console.log('[API] Updated ticket.finished_at - all steps completed');
          } catch (e) {
            console.warn('[API] Failed to update ticket.finished_at:', e?.message);
          }
        }
      }

      // Update technician work session record
      const actualTechnicianIdForUpdate = actualTechnicianId;

      const { data: workSession, error: sessionError } = await supabaseAdmin
        .from('technician_work_sessions')
        .select('started_at')
        .eq('ticket_no', ticketNo)
        .eq('station_id', station_id)
        .eq('step_order', step_order)
        .eq('technician_id', actualTechnicianIdForUpdate)
        .is('completed_at', null)
        .single();

      if (workSession && !sessionError) {
        const startTime = new Date(workSession.started_at);
        const endTime = new Date(completedAt);
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationMinutes = Math.round(((durationMs / 60000)) * 100) / 100;

        const completeProxyUserId = isProxyAction ? user_id : null;
        const updateData = {
          completed_at: completedAt,
          duration_minutes: durationMinutes,
          qty_completed: transferQty
        };
        if (completeProxyUserId) {
          updateData.proxy_user_id = completeProxyUserId;
        }

        const { error: updateSessionError } = await supabaseAdmin
          .from('technician_work_sessions')
          .update(updateData)
          .eq('ticket_no', ticketNo)
          .eq('station_id', station_id)
          .eq('step_order', step_order)
          .eq('technician_id', actualTechnicianIdForUpdate)
          .is('completed_at', null);

        if (updateSessionError) {
          console.error('[API] Work session update error:', updateSessionError);
        } else {
          console.log('[API] Updated work session:', { durationMinutes, qty_completed: transferQty });
        }

        // Penalty deduction สำหรับ proxy
        if (isProxyAction && actualTechnicianIdForUpdate !== user_id) {
          try {
            const { data: penaltySetting } = await supabaseAdmin
              .from('penalty_settings')
              .select('value')
              .eq('key', 'default_deduction_amount')
              .maybeSingle();
            const deductionAmount = penaltySetting?.value || 0;

            await supabaseAdmin
              .from('penalty_deductions')
              .insert({
                ticket_no: ticketNo,
                station_id: station_id,
                step_order: step_order,
                action: action === 'partial_complete' ? 'partial_complete' : 'complete',
                technician_id: actualTechnicianIdForUpdate,
                proxy_user_id: user_id,
                amount: deductionAmount,
                status: 'pending'
              });
            console.log('[API] Created penalty deduction for proxy complete action');
          } catch (penaltyErr) {
            console.warn('[API] Failed to create penalty deduction:', penaltyErr?.message);
          }
        }
      } else {
        console.warn('[API] No work session found to update or error:', sessionError?.message);
      }

      // ส่ง LINE แจ้งเตือนช่างสถานีถัดไป (ทุกครั้���ที่ส่งชิ้นงาน)
      sendLineNextStationNotification(ticketNo, step_order, transferQty).catch(err =>
        console.warn('[LINE] Next station notification failed:', err?.message)
      );

      // Get station name and user name for log
      let stationName = null;
      let userName = null;
      let userData = null;
      try {
        const { data: stationData } = await supabaseAdmin
          .from('stations')
          .select('name_th, code')
          .eq('id', station_id)
          .single();
        stationName = stationData?.name_th || stationData?.code || null;

        const { data: userDataResult } = await supabaseAdmin
          .from('users')
          .select('name, email')
          .eq('id', user_id)
          .single();
        userData = userDataResult;
        userName = userData?.name || userData?.email || null;
      } catch (e) {
        console.warn('Failed to get station/user info for log:', e?.message);
      }

      const response = NextResponse.json({
        success: true,
        message: action === 'partial_complete'
          ? `ส่ง ${transferQty} ชิ้นไปสถานีถัดไปสำเร็จ (${newCompletedQty}/${currentFlowData.total_qty})`
          : 'Step completed successfully',
        data: completed,
        transfer: { qty: transferQty, newCompletedQty, totalQty: currentFlowData.total_qty, isFullyCompleted }
      });
      await logApiCall(request, action === 'partial_complete' ? 'step_partial_complete' : 'step_completed', 'production_flow', ticketNo, {
        station_id,
        station_name: stationName,
        step_order,
        user_id,
        user_name: userName,
        qty: transferQty,
        completed_qty: newCompletedQty,
        total_qty: currentFlowData.total_qty
      }, 'success', null, userData ? { id: user_id, email: userData?.email, name: userName } : null);
      return response;

    } else if (action === 'reset') {
      // Reset all stations back to pending (start from station 1)
      console.log('[API] Resetting ticket to station 1:', ticketNo);

      // ดึง ticket quantity สำหรับ reset available_qty ของ step 1
      const { data: ticketData } = await supabaseAdmin
        .from('ticket')
        .select('quantity')
        .eq('no', ticketNo)
        .single();
      const ticketQty = ticketData?.quantity || 0;

      // 1) Reset all flows to pending and clear timestamps + qty
      const { data: resetFlows, error: resetError } = await supabaseAdmin
        .from('ticket_station_flow')
        .update({
          status: 'pending',
          started_at: null,
          completed_at: null,
          completed_qty: 0,
          available_qty: 0
        })
        .eq('ticket_no', ticketNo)
        .select();

      // Set available_qty = total_qty สำหรับ step 1 (สถานีแรกพร้อมทำทันที)
      if (resetFlows && resetFlows.length > 0) {
        const step1 = resetFlows.find(f => f.step_order === 1);
        if (step1) {
          await supabaseAdmin
            .from('ticket_station_flow')
            .update({ available_qty: ticketQty })
            .eq('id', step1.id);
        }
      }

      // ลบ transfer audit log
      await supabaseAdmin
        .from('station_qty_transfers')
        .delete()
        .eq('ticket_no', ticketNo);

      if (resetError) {
        console.error('[API] Reset flows error:', resetError);
        throw resetError;
      }

      console.log('[API] Reset flows to pending:', resetFlows?.length || 0, 'flows');

      // 2) Close all incomplete work sessions
      const { data: incompleteSessions, error: sessionsError } = await supabaseAdmin
        .from('technician_work_sessions')
        .select('id, started_at')
        .eq('ticket_no', ticketNo)
        .is('completed_at', null);

      if (!sessionsError && incompleteSessions && incompleteSessions.length > 0) {
        const now = new Date().toISOString();
        for (const session of incompleteSessions) {
          const startTime = new Date(session.started_at);
          const endTime = new Date(now);
          const durationMs = endTime.getTime() - startTime.getTime();
          const durationMinutes = Math.round(((durationMs / 60000)) * 100) / 100;

          await supabaseAdmin
            .from('technician_work_sessions')
            .update({
              completed_at: now,
              duration_minutes: durationMinutes
            })
            .eq('id', session.id);
        }
        console.log('[API] Closed', incompleteSessions.length, 'incomplete work sessions');
      }

      // 3) Reset ticket status and timestamps
      try {
        await supabaseAdmin
          .from('ticket')
          .update({
            status: 'Released',
            started_at: null,
            finished_at: null
          })
          .eq('no', ticketNo);
        console.log('[API] Reset ticket status and timestamps');
      } catch (e) {
        console.warn('[API] Failed to reset ticket status:', e?.message);
      }

      // 4) ลบ QC sessions + QC rows ของตั๋วนี้
      try {
        // ดึง session IDs ก่อนลบ
        const { data: qcSessions } = await supabaseAdmin
          .from('qc_sessions')
          .select('id')
          .eq('ticket_no', ticketNo);

        if (qcSessions && qcSessions.length > 0) {
          const sessionIds = qcSessions.map(s => s.id);
          // ลบ qc_rows
          await supabaseAdmin.from('qc_rows').delete().in('session_id', sessionIds);
          // ลบ qc_sessions
          await supabaseAdmin.from('qc_sessions').delete().eq('ticket_no', ticketNo);
          console.log('[API] Deleted', qcSessions.length, 'QC sessions and their rows');
        }

        // ลบ qc_defect_alerts
        await supabaseAdmin.from('qc_defect_alerts').delete().eq('ticket_no', ticketNo);
      } catch (e) {
        console.warn('[API] Failed to clear QC data:', e?.message);
      }

      // 5) ลบรูปถ่ายงาน (photo_url) ในทุกสถานี
      try {
        await supabaseAdmin
          .from('ticket_station_flow')
          .update({ photo_url: null })
          .eq('ticket_no', ticketNo);
        console.log('[API] Cleared photo_url for all stations');
      } catch (e) {
        console.warn('[API] Failed to clear photos:', e?.message);
      }

      // Get user info for log
      let userName = null;
      let userEmail = null;
      try {
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('name, email')
          .eq('id', user_id)
          .single();
        userName = userData?.name || userData?.email || null;
        userEmail = userData?.email || null;
      } catch (e) {
        console.warn('Failed to get user info for log:', e?.message);
      }

      const response = NextResponse.json({
        success: true,
        message: 'Ticket reset to station 1 successfully',
        data: resetFlows
      });
      await logApiCall(request, 'ticket_reset', 'production_flow', ticketNo, {
        user_id,
        user_name: userName
      }, 'success', null, userEmail ? { id: user_id, email: userEmail, name: userName } : null);
      return response;
    }

  } catch (error) {
    console.error('[API] Error updating flow:', error);
    await logError(error, { action: 'update', entityType: 'production_flow', entityId: (await params)?.ticketNo }, request);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
