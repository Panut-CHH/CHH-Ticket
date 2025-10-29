import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";

export async function POST(request, context) {
  try {
    const params = await context.params;
    const reworkOrderId = params?.id;
    const body = await request.json();
    const { rejectedBy, reason } = body;

    console.log('=== Rework Reject API ===');
    console.log('Rework Order ID:', reworkOrderId);
    console.log('Rejected By:', rejectedBy);
    console.log('Reason:', reason);

    if (!reworkOrderId || !rejectedBy || !reason) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const admin = supabaseServer;

    // 1. ตรวจสอบว่า rework order มีอยู่จริง
    const { data: reworkOrder, error: reworkOrderError } = await admin
      .from('rework_orders')
      .select('*')
      .eq('id', reworkOrderId)
      .single();

    if (reworkOrderError || !reworkOrder) {
      console.error('Rework order not found:', reworkOrderError);
      return NextResponse.json({ error: "Rework order not found" }, { status: 404 });
    }

    // 2. อัปเดตสถานะ rework order เป็น rejected
    const { error: updateError } = await admin
      .from('rework_orders')
      .update({
        approval_status: 'rejected',
        status: 'cancelled',
        approved_by: rejectedBy,
        approved_at: new Date().toISOString(),
        notes: reason
      })
      .eq('id', reworkOrderId);

    if (updateError) {
      console.error('Error updating rework order:', updateError);
      return NextResponse.json({ error: "Failed to reject rework order" }, { status: 500 });
    }

    // 3. อัปเดต batch status กลับเป็น in_progress (ให้ไปต่อตามปกติ)
    const { error: batchUpdateError } = await admin
      .from('ticket_batches')
      .update({
        status: 'in_progress'
      })
      .eq('id', reworkOrder.batch_id);

    if (batchUpdateError) {
      console.error('Error updating batch status:', batchUpdateError);
    }

    // 4. ส่ง Notification ไปหา QC Inspector
    try {
      const { error: qcNotificationError } = await admin
        .from('notifications')
        .insert({
          user_id: reworkOrder.created_by,
          type: 'rework_rejected',
          title: 'Rework Order ถูกปฏิเสธ',
          message: `Rework order สำหรับตั๋ว ${reworkOrder.ticket_no} ถูกปฏิเสธ: ${reason}`,
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
      message: "Rework order rejected successfully",
      data: {
        reworkOrderId,
        reason
      }
    });

  } catch (error) {
    console.error('Rework Reject API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





