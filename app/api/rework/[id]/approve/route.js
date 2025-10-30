import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";

export async function POST(request, context) {
  try {
    const params = await context.params;
    const reworkOrderId = params?.id;
    const body = await request.json();
    const { approvedBy, notes } = body;

    console.log('=== Rework Approve API ===');
    console.log('Rework Order ID:', reworkOrderId);
    console.log('Approved By:', approvedBy);

    if (!reworkOrderId || !approvedBy) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const admin = supabaseServer;

    // 1. ตรวจสอบว่า rework order มีอยู่จริง
    const { data: reworkOrder, error: reworkOrderError } = await admin
      .from('rework_orders')
      .select(`
        *,
        ticket_batches!inner(*),
        rework_roadmap(*)
      `)
      .eq('id', reworkOrderId)
      .single();

    if (reworkOrderError || !reworkOrder) {
      console.error('Rework order not found:', reworkOrderError);
      return NextResponse.json({ error: "Rework order not found" }, { status: 404 });
    }

    // 2. อัปเดตสถานะ rework order เป็น approved
    const { error: updateError } = await admin
      .from('rework_orders')
      .update({
        approval_status: 'approved',
        status: 'in_progress',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        notes: notes
      })
      .eq('id', reworkOrderId);

    if (updateError) {
      console.error('Error updating rework order:', updateError);
      return NextResponse.json({ error: "Failed to approve rework order" }, { status: 500 });
    }

    // 3. คำนวณ root ticket (สุดสาย) เพื่อผูกกับ rework order ทั้งสาย
    let rootTicketNo = reworkOrder.ticket_no;
    try {
      let currentNo = reworkOrder.ticket_no;
      let guard = 0;
      while (currentNo && currentNo.includes('-RW') && guard < 10) {
        const { data: t } = await admin.from('ticket').select('no, source_no').eq('no', currentNo).single();
        if (!t || !t.source_no || t.source_no === currentNo) break;
        currentNo = t.source_no;
        guard++;
      }
      rootTicketNo = currentNo || reworkOrder.ticket_no;
    } catch (e) {
      console.warn('Failed to resolve root ticket (non-fatal):', e?.message);
      rootTicketNo = reworkOrder.ticket_no;
    }

    // พยายามอัปเดต root_ticket_no (ถ้าไม่มีคอลัมน์จะข้าม)
    try {
      await admin
        .from('rework_orders')
        .update({ root_ticket_no: rootTicketNo })
        .eq('id', reworkOrderId);
    } catch (e) {
      console.warn('Optional: root_ticket_no column missing or update failed');
    }

    // 4. สร้าง Rework Ticket ใหม่
    if (!reworkOrder.rework_roadmap || reworkOrder.rework_roadmap.length === 0) {
      console.warn('No roadmap found for rework order');
      return NextResponse.json({ error: "No roadmap found" }, { status: 400 });
    }

    // 3.1 ดึงข้อมูลตั๋วเดิม
    const { data: originalTicket, error: ticketError } = await admin
      .from('ticket')
      .select('*')
      .eq('no', reworkOrder.ticket_no)
      .single();

    if (ticketError || !originalTicket) {
      console.error('Original ticket not found:', ticketError);
      return NextResponse.json({ error: "Original ticket not found" }, { status: 404 });
    }

    // 4.2 สร้าง Rework Ticket Number
    const reworkTicketNo = `${reworkOrder.ticket_no}-RW${Date.now().toString().slice(-6)}`;
    console.log('Creating rework ticket:', reworkTicketNo);

    // 4.3 สร้างตั๋วใหม่สำหรับ Rework
    const { data: reworkTicket, error: reworkTicketError } = await admin
      .from('ticket')
      .insert({
        no: reworkTicketNo,
        source_no: reworkOrder.ticket_no,
        quantity: reworkOrder.quantity,
        description: `Rework: ${originalTicket.description}`,
        description_2: originalTicket.description_2,
        priority: 'High',
        status: 'In Progress',
        customer_name: originalTicket.customer_name,
        due_date: originalTicket.due_date,
        project_id: originalTicket.project_id
      })
      .select()
      .single();

    if (reworkTicketError) {
      console.error('Error creating rework ticket:', reworkTicketError);
      return NextResponse.json({ error: "Failed to create rework ticket", details: reworkTicketError.message }, { status: 500 });
    }

    console.log('Rework ticket created:', reworkTicket);

    // 4.4 สร้าง ticket_station_flow สำหรับ Rework Ticket
    // เปลี่ยนให้ทุก station เริ่มต้นเป็น pending (ไม่ใช่ current)
    const flowData = reworkOrder.rework_roadmap.map((step, index) => ({
      ticket_no: reworkTicketNo,
      station_id: step.station_id,
      step_order: step.step_order || (index + 1),
      status: 'pending', // เปลี่ยนจาก 'current' เป็น 'pending' ทุก station
      batch_id: reworkOrder.batch_id,
      rework_order_id: reworkOrderId,
      is_rework_path: true,
      is_rework_ticket: true, // ตั้งค่าเป็น true สำหรับ rework ticket
      original_step_order: step.step_order || (index + 1)
    }));
    
    console.log('Flow data to insert:', flowData);

    const { error: flowError } = await admin
      .from('ticket_station_flow')
      .insert(flowData);

    if (flowError) {
      console.error('Error creating rework flows:', flowError);
      return NextResponse.json({ error: "Failed to create rework flows", details: flowError.message }, { status: 500 });
    }
    
    console.log('Successfully created rework flows');

    // 4.5 อัปเดต ticket_batches
    const { error: batchUpdateError } = await admin
      .from('ticket_batches')
      .update({
        rework_ticket_no: reworkTicketNo,
        parent_ticket_no: reworkOrder.ticket_no,
        status: 'rework',
        current_station_id: reworkOrder.rework_roadmap?.[0]?.station_id || null
      })
      .eq('id', reworkOrder.batch_id);

    if (batchUpdateError) {
      console.error('Error updating batch:', batchUpdateError);
    }

    // 5. ส่ง Notification ไปหาช่างที่ได้รับมอบหมาย
    const technicianIds = reworkOrder.rework_roadmap
      ?.map(step => step.assigned_technician_id)
      .filter(id => id);

    if (technicianIds && technicianIds.length > 0) {
      const notifications = technicianIds.map(technicianId => ({
        user_id: technicianId,
        type: 'rework_assigned',
        title: 'ได้รับมอบหมายงาน Rework',
        message: `คุณได้รับมอบหมายงาน Rework สำหรับตั๋ว ${reworkOrder.ticket_no}`,
        ticket_no: reworkOrder.ticket_no,
        qc_session_id: reworkOrder.qc_session_id
      }));

      const { error: notificationError } = await admin
        .from('notifications')
        .insert(notifications);

      if (notificationError) {
        console.warn('Failed to create technician notifications:', notificationError);
      }
    }

    // 6. ส่ง Notification ไปหา QC Inspector
    try {
      const { error: qcNotificationError } = await admin
        .from('notifications')
        .insert({
          user_id: reworkOrder.created_by,
          type: 'rework_approved',
          title: 'Rework Order ได้รับอนุมัติ',
          message: `Rework order สำหรับตั๋ว ${reworkOrder.ticket_no} ได้รับอนุมัติแล้ว`,
          ticket_no: reworkOrder.ticket_no,
          qc_session_id: reworkOrder.qc_session_id
        });

      if (qcNotificationError) {
        console.warn('Failed to create QC notification:', qcNotificationError);
      }
    } catch (notificationErr) {
      console.warn('QC Notification error:', notificationErr);
    }

    return NextResponse.json({
      success: true,
      message: "Rework order approved successfully",
      data: {
        reworkOrderId,
        batchId: reworkOrder.batch_id,
        reworkTicketNo: reworkTicketNo,
        flowsCreated: reworkOrder.rework_roadmap?.length || 0
      }
    });

  } catch (error) {
    console.error('Rework Approve API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}




