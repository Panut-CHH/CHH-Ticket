import { supabaseServer } from "@/utils/supabaseServer";

/**
 * สร้าง Rework Order
 */
export async function createReworkOrder(data) {
  try {
    const admin = supabaseServer;
    
    const {
      ticketNo,
      batchId,
      quantity,
      severity,
      failedAtStationId,
      reason,
      notes,
      createdBy,
      roadmap
    } = data;

    // 1. สร้าง rework order
    const { data: reworkOrder, error: reworkOrderError } = await admin
      .from('rework_orders')
      .insert({
        ticket_no: ticketNo,
        batch_id: batchId,
        quantity: quantity,
        severity: severity || 'major',
        failed_at_station_id: failedAtStationId,
        reason: reason,
        notes: notes,
        created_by: createdBy,
        approval_status: 'pending',
        status: 'pending'
      })
      .select()
      .single();

    if (reworkOrderError) {
      throw new Error(`Failed to create rework order: ${reworkOrderError.message}`);
    }

    // 2. สร้าง roadmap ถ้ามี
    if (roadmap && roadmap.length > 0) {
      const roadmapData = roadmap.map((step, index) => ({
        rework_order_id: reworkOrder.id,
        station_id: step.stationId || null,
        station_name: step.stationName,
        step_order: index + 1,
        assigned_technician_id: step.assignedTechnicianId || null,
        estimated_hours: step.estimatedHours || null,
        notes: step.notes || null
      }));

      const { error: roadmapError } = await admin
        .from('rework_roadmap')
        .insert(roadmapData);

      if (roadmapError) {
        console.warn('Failed to create roadmap:', roadmapError);
      }
    }

    return reworkOrder;
  } catch (error) {
    console.error('Error in createReworkOrder:', error);
    throw error;
  }
}

/**
 * อนุมัติ Rework Order
 */
export async function approveReworkOrder(reworkOrderId, adminId) {
  try {
    const admin = supabaseServer;

    // 1. ดึงข้อมูล rework order พร้อม roadmap
    const { data: reworkOrder, error: reworkOrderError } = await admin
      .from('rework_orders')
      .select(`
        *,
        rework_roadmap(*)
      `)
      .eq('id', reworkOrderId)
      .single();

    if (reworkOrderError || !reworkOrder) {
      throw new Error('Rework order not found');
    }

    // 2. อัปเดตสถานะ rework order
    const { error: updateError } = await admin
      .from('rework_orders')
      .update({
        approval_status: 'approved',
        status: 'in_progress',
        approved_by: adminId,
        approved_at: new Date().toISOString()
      })
      .eq('id', reworkOrderId);

    if (updateError) {
      throw new Error(`Failed to approve rework order: ${updateError.message}`);
    }

    // 3. สร้าง ticket_station_flow entries สำหรับ roadmap
    if (reworkOrder.rework_roadmap && reworkOrder.rework_roadmap.length > 0) {
      const flowData = reworkOrder.rework_roadmap.map(step => ({
        ticket_no: reworkOrder.ticket_no,
        station_id: step.station_id,
        step_order: step.step_order,
        status: 'pending',
        batch_id: reworkOrder.batch_id,
        rework_order_id: reworkOrderId,
        is_rework_path: true,
        original_step_order: step.step_order
      }));

      const { error: flowError } = await admin
        .from('ticket_station_flow')
        .insert(flowData);

      if (flowError) {
        console.warn('Failed to create rework flows:', flowError);
      }
    }

    // 4. อัปเดต batch status
    await admin
      .from('ticket_batches')
      .update({
        status: 'rework',
        current_station_id: reworkOrder.rework_roadmap?.[0]?.station_id || null
      })
      .eq('id', reworkOrder.batch_id);

    return reworkOrder;
  } catch (error) {
    console.error('Error in approveReworkOrder:', error);
    throw error;
  }
}

/**
 * ปฏิเสธ Rework Order
 */
export async function rejectReworkOrder(reworkOrderId, adminId, reason) {
  try {
    const admin = supabaseServer;

    // 1. ดึงข้อมูล rework order
    const { data: reworkOrder, error: reworkOrderError } = await admin
      .from('rework_orders')
      .select('*')
      .eq('id', reworkOrderId)
      .single();

    if (reworkOrderError || !reworkOrder) {
      throw new Error('Rework order not found');
    }

    // 2. อัปเดตสถานะ rework order
    const { error: updateError } = await admin
      .from('rework_orders')
      .update({
        approval_status: 'rejected',
        status: 'cancelled',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        notes: reason
      })
      .eq('id', reworkOrderId);

    if (updateError) {
      throw new Error(`Failed to reject rework order: ${updateError.message}`);
    }

    // 3. อัปเดต batch status กลับเป็น in_progress
    await admin
      .from('ticket_batches')
      .update({
        status: 'in_progress'
      })
      .eq('id', reworkOrder.batch_id);

    return reworkOrder;
  } catch (error) {
    console.error('Error in rejectReworkOrder:', error);
    throw error;
  }
}

/**
 * สร้าง Flows สำหรับ Rework
 */
export async function createReworkFlows(reworkOrderId) {
  try {
    const admin = supabaseServer;

    // ดึงข้อมูล rework order พร้อม roadmap
    const { data: reworkOrder, error: reworkOrderError } = await admin
      .from('rework_orders')
      .select(`
        *,
        rework_roadmap(*)
      `)
      .eq('id', reworkOrderId)
      .single();

    if (reworkOrderError || !reworkOrder) {
      throw new Error('Rework order not found');
    }

    // สร้าง ticket_station_flow entries
    if (reworkOrder.rework_roadmap && reworkOrder.rework_roadmap.length > 0) {
      const flowData = reworkOrder.rework_roadmap.map(step => ({
        ticket_no: reworkOrder.ticket_no,
        station_id: step.station_id,
        step_order: step.step_order,
        status: 'pending',
        batch_id: reworkOrder.batch_id,
        rework_order_id: reworkOrderId,
        is_rework_path: true,
        original_step_order: step.step_order
      }));

      const { data: flows, error: flowError } = await admin
        .from('ticket_station_flow')
        .insert(flowData)
        .select();

      if (flowError) {
        throw new Error(`Failed to create rework flows: ${flowError.message}`);
      }

      return flows;
    }

    return [];
  } catch (error) {
    console.error('Error in createReworkFlows:', error);
    throw error;
  }
}

/**
 * ดึงความคืบหน้า Rework
 */
export async function getReworkProgress(reworkOrderId) {
  try {
    const admin = supabaseServer;

    const { data: reworkOrder, error: reworkOrderError } = await admin
      .from('rework_orders')
      .select(`
        *,
        rework_roadmap(
          *,
          stations(name_th, code),
          users(name)
        ),
        ticket_batches(*)
      `)
      .eq('id', reworkOrderId)
      .single();

    if (reworkOrderError || !reworkOrder) {
      throw new Error('Rework order not found');
    }

    // คำนวณความคืบหน้า
    const totalSteps = reworkOrder.rework_roadmap?.length || 0;
    const completedSteps = reworkOrder.rework_roadmap?.filter(step => 
      step.status === 'completed'
    ).length || 0;

    const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    return {
      ...reworkOrder,
      progress: {
        totalSteps,
        completedSteps,
        progressPercentage: Math.round(progressPercentage)
      }
    };
  } catch (error) {
    console.error('Error in getReworkProgress:', error);
    throw error;
  }
}

/**
 * ดึงรายการ Rework Orders ที่รออนุมัติ
 */
export async function getPendingReworkOrders() {
  try {
    const admin = supabaseServer;

    const { data: reworkOrders, error } = await admin
      .from('rework_orders')
      .select(`
        *,
        rework_roadmap(
          *,
          stations(name_th, code),
          users(name)
        ),
        ticket_batches(*),
        users!rework_orders_created_by_fkey(name)
      `)
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch pending rework orders: ${error.message}`);
    }

    return reworkOrders || [];
  } catch (error) {
    console.error('Error in getPendingReworkOrders:', error);
    throw error;
  }
}





