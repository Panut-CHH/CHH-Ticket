import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logApiCall, logError } from '@/utils/activityLogger';
import { isSupervisor, canSupervisorActForTechnician, getSupervisorManagedRole, isSupervisorProduction, isSupervisorPainting } from '@/utils/rolePermissions';

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
 * Update station flow status (start or complete a step)
 * 
 * Body:
 * {
 *   action: 'start' | 'complete',
 *   station_id: 'uuid',
 *   user_id: 'uuid'
 * }
 */
export async function POST(request, { params }) {
  try {
    const { ticketNo } = await params;
    const body = await request.json();
    const { action, station_id, step_order, user_id } = body;

    console.log('[API] Update flow request:', { ticketNo, action, station_id, step_order, user_id });

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

    if (!['start', 'complete', 'reset'].includes(action)) {
      console.error('[API] Invalid action:', action);
      return NextResponse.json(
        { success: false, error: 'Invalid action. Must be "start", "complete", or "reset"' },
        { status: 400 }
      );
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

    // Check if user is a supervisor and can act for the assigned technician
    let canSupervisorAct = false;
    let actualTechnicianId = user_id; // Default to user_id, will be updated if supervisor acts
    
    if (!isAdmin && (assignmentError || !assignment)) {
      // User is not directly assigned, check if they're a supervisor
      if (isSupervisor(userRoles)) {
        console.log('[API] User is a supervisor, checking if they can act for assigned technician');
        
        // Find the actual assignment for this station/step (any technician assigned)
        const { data: actualAssignment, error: actualAssignmentError } = await supabaseAdmin
          .from('ticket_assignments')
          .select('technician_id')
          .eq('ticket_no', ticketNo)
          .eq('station_id', station_id)
          .eq('step_order', step_order)
          .maybeSingle();

        if (!actualAssignmentError && actualAssignment && actualAssignment.technician_id) {
          // Get the assigned technician's role
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
        status: f.status
      })));

      // Check if there's already a current step
      const currentFlow = flows?.find(f => f.status === 'current');
      if (currentFlow) {
        console.log('[API] Already have current step:', currentFlow);
        return NextResponse.json(
          { success: false, error: 'There is already a step in progress' },
          { status: 400 }
        );
      }

      // Update to current - ใช้ step_order เพื่อให้แต่ละ step แยกกัน
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
        .eq('status', 'pending')
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
      console.log('[API] Creating work session with:', {
        ticket_no: ticketNo,
        station_id: station_id,
        step_order: step_order,
        technician_id: actualTechnicianId,
        started_at: startedAt,
        supervisor_id: canSupervisorAct ? user_id : null
      });

      const { data: workSession, error: sessionError } = await supabaseAdmin
        .from('technician_work_sessions')
        .insert({
          ticket_no: ticketNo,
          station_id: station_id,
          step_order: step_order,
          technician_id: actualTechnicianId,
          started_at: startedAt
        })
        .select()
        .single();

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

    } else if (action === 'complete') {
      // Mark current step as completed - ใช้ step_order เพื่อให้แต่ละ step แยกกัน
      const completedAt = new Date().toISOString();
      
      const { data: completed, error: completeError } = await supabaseAdmin
        .from('ticket_station_flow')
        .update({ 
          status: 'completed',
          completed_at: completedAt
        })
        .eq('ticket_no', ticketNo)
        .eq('station_id', station_id)
        .eq('step_order', step_order)
        .eq('status', 'current')
        .select();

      if (completeError) {
        console.error('[API] Complete error:', completeError);
        throw completeError;
      }

      if (!completed || completed.length === 0) {
        return NextResponse.json(
          { success: false, error: 'This step is not currently in progress' },
          { status: 400 }
        );
      }

      console.log('[API] Marked as completed:', completed);

      // Check if this is the last step and all steps are completed
      const { data: allFlows } = await supabaseAdmin
        .from('ticket_station_flow')
        .select('step_order, status')
        .eq('ticket_no', ticketNo)
        .order('step_order', { ascending: true });
      
      if (allFlows && allFlows.length > 0) {
        const allCompleted = allFlows.every(f => f.status === 'completed');
        const isLastStep = step_order === Math.max(...allFlows.map(f => f.step_order));
        
        if (allCompleted && isLastStep) {
          // All steps completed - update ticket.finished_at
          try {
            await supabaseAdmin
              .from('ticket')
              .update({ 
                status: 'Finished',
                finished_at: completedAt
              })
              .eq('no', ticketNo);
            console.log('[API] Updated ticket.finished_at - all steps completed');
          } catch (e) {
            console.warn('[API] Failed to update ticket.finished_at:', e?.message);
          }
        }
      }

      // actualTechnicianId is already determined above in the authorization check
      const actualTechnicianIdForUpdate = actualTechnicianId;

      // Update technician work session record with completion data
      const { data: workSession, error: sessionError } = await supabaseAdmin
        .from('technician_work_sessions')
        .select('started_at')
        .eq('ticket_no', ticketNo)
        .eq('station_id', station_id)
        .eq('step_order', step_order)
        .eq('technician_id', actualTechnicianIdForUpdate)
        .is('completed_at', null) // Only update incomplete sessions
        .single();

      if (workSession && !sessionError) {
        // Calculate duration in minutes
        const startTime = new Date(workSession.started_at);
        const endTime = new Date(completedAt);
        const durationMs = endTime.getTime() - startTime.getTime();
        // Convert ms -> minutes and round to 2 decimals
        const durationMinutes = Math.round(((durationMs / 60000)) * 100) / 100;

        // Update the work session with completion data
        const { error: updateSessionError } = await supabaseAdmin
          .from('technician_work_sessions')
          .update({
            completed_at: completedAt,
            duration_minutes: durationMinutes
          })
          .eq('ticket_no', ticketNo)
          .eq('station_id', station_id)
          .eq('step_order', step_order)
          .eq('technician_id', actualTechnicianIdForUpdate)
          .is('completed_at', null);

        if (updateSessionError) {
          console.error('[API] Work session update error:', updateSessionError);
          // Don't fail the entire operation, just log the error
          console.warn('[API] Continuing without work session update');
        } else {
          console.log('[API] Updated work session with completion data:', { durationMinutes });
        }
      } else {
        console.warn('[API] No work session found to update or error:', sessionError?.message);
      }

      // ไม่ auto-start ขั้นตอนถัดไป - ให้ช่างกด Start เอง
      // เพื่อให้มีเวลาพักหรือเตรียมตัวก่อนเริ่มงานใหม่

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
        message: 'Step completed successfully',
        data: completed
      });
      await logApiCall(request, 'step_completed', 'production_flow', ticketNo, {
        station_id,
        station_name: stationName,
        step_order,
        user_id,
        user_name: userName
      }, 'success', null, userData ? { id: user_id, email: userData?.email, name: userName } : null);
      return response;

    } else if (action === 'reset') {
      // Reset all stations back to pending (start from station 1)
      console.log('[API] Resetting ticket to station 1:', ticketNo);
      
      // 1) Reset all flows to pending and clear timestamps
      const { data: resetFlows, error: resetError } = await supabaseAdmin
        .from('ticket_station_flow')
        .update({ 
          status: 'pending',
          started_at: null,
          completed_at: null
        })
        .eq('ticket_no', ticketNo)
        .select();

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
