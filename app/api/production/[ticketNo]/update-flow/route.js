import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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
    const { ticketNo } = params;
    const body = await request.json();
    const { action, station_id, step_order, user_id } = body;

    console.log('[API] Update flow request:', { ticketNo, action, station_id, step_order, user_id });

    // Validate inputs
    if (!ticketNo || !action || !station_id || !user_id) {
      console.error('[API] Missing required parameters:', { ticketNo, action, station_id, step_order, user_id });
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    if (!['start', 'complete'].includes(action)) {
      console.error('[API] Invalid action:', action);
      return NextResponse.json(
        { success: false, error: 'Invalid action. Must be "start" or "complete"' },
        { status: 400 }
      );
    }

    // Check if user is assigned to this station (ต้องใช้ step_order เพื่อให้แต่ละ step แยกกัน)
    console.log('[API] Checking assignment for:', { ticketNo, station_id, step_order, user_id });
    
    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('ticket_assignments')
      .select('*')
      .eq('ticket_no', ticketNo)
      .eq('station_id', station_id)
      .eq('step_order', step_order)
      .eq('technician_id', user_id)
      .single();

    if (assignmentError || !assignment) {
      console.log('[API] Assignment check failed in ticket_assignments, trying rework_roadmap fallback...');
      // Fallback สำหรับตั๋ว Rework: ตรวจใน rework_roadmap
      try {
        const { data: targetFlow } = await supabaseAdmin
          .from('ticket_station_flow')
          .select('is_rework_ticket, rework_order_id')
          .eq('ticket_no', ticketNo)
          .eq('station_id', station_id)
          .eq('step_order', step_order)
          .single();

        if (targetFlow?.is_rework_ticket && targetFlow?.rework_order_id) {
          const { data: rwAssign } = await supabaseAdmin
            .from('rework_roadmap')
            .select('assigned_technician_id')
            .eq('rework_order_id', targetFlow.rework_order_id)
            .eq('station_id', station_id)
            .eq('step_order', step_order)
            .single();

          if (rwAssign && rwAssign.assigned_technician_id === user_id) {
            console.log('[API] Fallback rework_roadmap assignment matched. Proceeding.');
          } else {
            return NextResponse.json(
              { success: false, error: 'You are not assigned to this station' },
              { status: 403 }
            );
          }
        } else {
          return NextResponse.json(
            { success: false, error: 'You are not assigned to this station' },
            { status: 403 }
          );
        }
      } catch (e) {
        console.warn('[API] Fallback rework assignment check error:', e?.message);
        return NextResponse.json(
          { success: false, error: 'You are not assigned to this station' },
          { status: 403 }
        );
      }
    }

    console.log('[API] Assignment found:', assignment);

    console.log('[API] User is assigned to station, proceeding with update');

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
      
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('ticket_station_flow')
        .update({ status: 'current' })
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

      // Create technician work session record
      console.log('[API] Creating work session with:', {
        ticket_no: ticketNo,
        station_id: station_id,
        step_order: step_order,
        technician_id: user_id,
        started_at: new Date().toISOString()
      });

      const { data: workSession, error: sessionError } = await supabaseAdmin
        .from('technician_work_sessions')
        .insert({
          ticket_no: ticketNo,
          station_id: station_id,
          step_order: step_order,
          technician_id: user_id,
          started_at: new Date().toISOString()
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

      return NextResponse.json({
        success: true,
        message: 'Step started successfully',
        data: updated,
        workSession: workSession
      });

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

      // Update technician work session record with completion data
      const { data: workSession, error: sessionError } = await supabaseAdmin
        .from('technician_work_sessions')
        .select('started_at')
        .eq('ticket_no', ticketNo)
        .eq('station_id', station_id)
        .eq('step_order', step_order)
        .eq('technician_id', user_id)
        .eq('completed_at', null) // Only update incomplete sessions
        .single();

      if (workSession && !sessionError) {
        // Calculate duration in minutes
        const startTime = new Date(workSession.started_at);
        const endTime = new Date(completedAt);
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60 * 100)) / 100; // Round to 2 decimal places

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
          .eq('technician_id', user_id)
          .eq('completed_at', null);

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

      return NextResponse.json({
        success: true,
        message: 'Step completed successfully',
        data: completed
      });
    }

  } catch (error) {
    console.error('[API] Error updating flow:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

