import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";

export async function POST(request, context) {
  try {
    const params = await context.params;
    const mergeRequestId = params?.id;
    const body = await request.json();
    const { approvedBy, notes } = body;

    console.log('=== Batch Merge Approve API ===');
    console.log('Merge Request ID:', mergeRequestId);
    console.log('Approved By:', approvedBy);

    if (!mergeRequestId || !approvedBy) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const admin = supabaseServer;

    // 1. ตรวจสอบว่า merge request มีอยู่จริง
    const { data: mergeRequest, error: mergeRequestError } = await admin
      .from('batch_merge_requests')
      .select('*')
      .eq('id', mergeRequestId)
      .single();

    if (mergeRequestError || !mergeRequest) {
      console.error('Merge request not found:', mergeRequestError);
      return NextResponse.json({ error: "Merge request not found" }, { status: 404 });
    }

    // 2. อัปเดตสถานะ merge request เป็น approved
    const { error: updateError } = await admin
      .from('batch_merge_requests')
      .update({
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        notes: notes
      })
      .eq('id', mergeRequestId);

    if (updateError) {
      console.error('Error updating merge request:', updateError);
      return NextResponse.json({ error: "Failed to approve merge request" }, { status: 500 });
    }

    // 3. ดึงข้อมูล batches ที่จะรวม
    const { data: batches, error: batchesError } = await admin
      .from('ticket_batches')
      .select('*')
      .in('id', mergeRequest.source_batch_ids)
      .eq('ticket_no', mergeRequest.ticket_no);

    if (batchesError || !batches) {
      console.error('Error fetching batches:', batchesError);
      return NextResponse.json({ error: "Failed to fetch batches for merge" }, { status: 500 });
    }

    // 4. คำนวณจำนวนรวม
    const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);

    // 5. สร้าง batch ใหม่ที่รวมแล้ว
    const { data: mergedBatch, error: mergedBatchError } = await admin
      .from('ticket_batches')
      .insert({
        ticket_no: mergeRequest.ticket_no,
        batch_name: 'Merged Batch',
        quantity: totalQuantity,
        current_station_id: mergeRequest.target_station_id,
        status: 'in_progress'
      })
      .select()
      .single();

    if (mergedBatchError) {
      console.error('Error creating merged batch:', mergedBatchError);
      return NextResponse.json({ error: "Failed to create merged batch" }, { status: 500 });
    }

    // 6. อัปเดต ticket_station_flow ให้ใช้ batch ใหม่
    const { error: flowUpdateError } = await admin
      .from('ticket_station_flow')
      .update({
        batch_id: mergedBatch.id
      })
      .in('batch_id', mergeRequest.source_batch_ids);

    if (flowUpdateError) {
      console.error('Error updating flows:', flowUpdateError);
    }

    // 7. อัปเดตสถานะ batches เดิมเป็น completed
    const { error: batchStatusError } = await admin
      .from('ticket_batches')
      .update({
        status: 'completed'
      })
      .in('id', mergeRequest.source_batch_ids);

    if (batchStatusError) {
      console.error('Error updating batch status:', batchStatusError);
    }

    // 8. ส่ง Notification
    try {
      const { error: notificationError } = await admin
        .from('notifications')
        .insert({
          type: 'batch_merged',
          title: 'Batch ได้รับการรวมแล้ว',
          message: `Batch สำหรับตั๋ว ${mergeRequest.ticket_no} ได้รับการรวมแล้ว (${totalQuantity} ชิ้น)`,
          ticket_no: mergeRequest.ticket_no
        });

      if (notificationError) {
        console.warn('Failed to create notification:', notificationError);
      }
    } catch (notificationErr) {
      console.warn('Notification error:', notificationErr);
    }

    return NextResponse.json({
      success: true,
      message: "Batch merge approved successfully",
      data: {
        mergeRequestId,
        mergedBatchId: mergedBatch.id,
        totalQuantity,
        sourceBatchIds: mergeRequest.source_batch_ids
      }
    });

  } catch (error) {
    console.error('Batch Merge Approve API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





