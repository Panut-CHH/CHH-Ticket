import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      ticketNo,
      qcSessionId,
      passQuantity,
      failQuantity,
      severity,
      failedAtStationId,
      failed_qc_task_uuid, // new (snake) for clarity
      failedQcTaskUuid,    // new (camel) alternative key
      reason,
      notes,
      roadmap,
      createdBy
    } = body;

    console.log('=== Rework Create API ===');
    console.log('Ticket No:', ticketNo);
    console.log('Pass Qty:', passQuantity, 'Fail Qty:', failQuantity);
    console.log('Severity:', severity);
    console.log('Roadmap:', roadmap);

    // ตรวจสอบ required fields
    const missingFields = [];
    if (!ticketNo) missingFields.push('ticketNo');
    if (!qcSessionId) missingFields.push('qcSessionId');
    if (!createdBy) missingFields.push('createdBy');
    const qcTaskUuid = failed_qc_task_uuid || failedQcTaskUuid || null;
    if (Number(failQuantity) > 0 && !qcTaskUuid && !failedAtStationId) {
      // ต้องมีอย่างน้อย qc_task_uuid หรือ station_id เพื่ออ้างอิงขั้นที่ fail
      missingFields.push('failed_qc_task_uuid');
    }
    
    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields);
      console.error('Full body:', body);
      return NextResponse.json({ 
        error: `Missing required fields: ${missingFields.join(', ')}`,
        details: body 
      }, { status: 400 });
    }

    const admin = supabaseServer;

    // 1. สร้าง Batch สำหรับชิ้นงานที่ผ่าน
    let passBatchId = null;
    if (passQuantity > 0) {
      const { data: passBatch, error: passBatchError } = await admin
        .from('ticket_batches')
        .insert({
          ticket_no: ticketNo,
          batch_name: 'Batch A (ผ่าน)',
          quantity: passQuantity,
          status: 'in_progress',
          qc_session_id: qcSessionId
        })
        .select()
        .single();

      if (passBatchError) {
        console.error('Error creating pass batch:', passBatchError);
        return NextResponse.json({ error: "Failed to create pass batch" }, { status: 500 });
      }
      passBatchId = passBatch.id;
    }

    // 2. สร้าง Batch สำหรับชิ้นงานที่ไม่ผ่าน
    let failBatchId = null;
    if (failQuantity > 0) {
      const { data: failBatch, error: failBatchError } = await admin
        .from('ticket_batches')
        .insert({
          ticket_no: ticketNo,
          batch_name: 'Batch B (ไม่ผ่าน)',
          quantity: failQuantity,
          status: 'rework',
          qc_session_id: qcSessionId
        })
        .select()
        .single();

      if (failBatchError) {
        console.error('Error creating fail batch:', failBatchError);
        return NextResponse.json({ error: "Failed to create fail batch" }, { status: 500 });
      }
      failBatchId = failBatch.id;
    }

    // 3. สร้าง Rework Order
    let reworkOrderId = null;
    if (failQuantity > 0) {
      const { data: reworkOrder, error: reworkOrderError } = await admin
        .from('rework_orders')
        .insert({
          ticket_no: ticketNo,
          batch_id: failBatchId,
          quantity: failQuantity,
          severity: severity || 'major',
          failed_at_station_id: failedAtStationId,
          failed_qc_task_uuid: qcTaskUuid,
          reason: reason || 'ชิ้นงานไม่ผ่าน QC',
          notes: notes,
          created_by: createdBy,
          approval_status: 'pending',
          status: 'pending'
        })
        .select()
        .single();

      if (reworkOrderError) {
        console.error('Error creating rework order:', reworkOrderError);
        return NextResponse.json({ error: "Failed to create rework order" }, { status: 500 });
      }
      reworkOrderId = reworkOrder.id;

      // 3.1 อัปเดตสถานะสถานีที่ล้มเหลวให้เป็น rework โดยอ้างอิง qc_task_uuid ก่อน ถ้าไม่มีค่อย fallback station_id
      try {
        if (qcTaskUuid) {
          const { error: updErr1 } = await admin
            .from('ticket_station_flow')
            .update({ status: 'rework', updated_at: new Date().toISOString() })
            .eq('qc_task_uuid', qcTaskUuid);
          if (updErr1) console.warn('Failed to set rework by qc_task_uuid:', updErr1);
        } else if (failedAtStationId) {
          const { error: updErr2 } = await admin
            .from('ticket_station_flow')
            .update({ status: 'rework', updated_at: new Date().toISOString() })
            .eq('ticket_no', ticketNo)
            .eq('station_id', failedAtStationId)
            .in('status', ['current','pending']);
          if (updErr2) console.warn('Failed to set rework by station_id:', updErr2);
        }

        // เคลียร์ current อื่นของตั๋วนี้ให้เป็น pending ทั้งหมด
        const { error: clearErr } = await admin
          .from('ticket_station_flow')
          .update({ status: 'pending' })
          .eq('ticket_no', ticketNo)
          .eq('status', 'current');
        if (clearErr) console.warn('Failed to clear other current statuses:', clearErr);
      } catch (updCatch) {
        console.warn('Rework status update warning:', updCatch);
      }

      // 4. สร้าง Rework Roadmap (Custom เท่านั้น)
      if (!roadmap || roadmap.length === 0) {
        return NextResponse.json({ 
          error: "Roadmap is required for rework orders",
          details: "Please provide a custom roadmap with at least one station"
        }, { status: 400 });
      }
      
      const roadmapData = roadmap.map((step, index) => ({
        rework_order_id: reworkOrderId,
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
        console.error('Error creating roadmap:', roadmapError);
        return NextResponse.json({ error: "Failed to create roadmap" }, { status: 500 });
      }
    }

    // 5. ส่ง Notification ไปหา Admin
    try {
      const { error: notificationError } = await admin
        .from('notifications')
        .insert({
          type: 'rework_pending_approval',
          title: 'Rework Order รออนุมัติ',
          message: `Rework order สำหรับตั๋ว ${ticketNo} รออนุมัติ (${failQuantity} ชิ้น)`,
          ticket_no: ticketNo,
          qc_session_id: qcSessionId
        });

      if (notificationError) {
        console.warn('Failed to create notification:', notificationError);
      }
    } catch (notificationErr) {
      console.warn('Notification error:', notificationErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        passBatchId,
        failBatchId,
        reworkOrderId,
        message: "Rework order created successfully, awaiting admin approval"
      }
    });

  } catch (error) {
    console.error('Rework Create API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}




