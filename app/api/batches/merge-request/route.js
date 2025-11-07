import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      ticketNo,
      sourceBatchIds,
      targetStationId,
      requestedBy,
      notes
    } = body;

    console.log('=== Batch Merge Request API ===');
    console.log('Ticket No:', ticketNo);
    console.log('Source Batch IDs:', sourceBatchIds);
    console.log('Target Station ID:', targetStationId);
    console.log('Requested By:', requestedBy);

    if (!ticketNo || !sourceBatchIds || !Array.isArray(sourceBatchIds) || sourceBatchIds.length < 2) {
      return NextResponse.json({ error: "Missing required fields or insufficient batches to merge" }, { status: 400 });
    }

    const admin = supabaseServer;

    // 1. ตรวจสอบว่า batches มีอยู่จริงและอยู่ในสถานะที่สามารถรวมได้
    const { data: batches, error: batchesError } = await admin
      .from('ticket_batches')
      .select('*')
      .in('id', sourceBatchIds)
      .eq('ticket_no', ticketNo);

    if (batchesError || !batches || batches.length !== sourceBatchIds.length) {
      console.error('Error fetching batches:', batchesError);
      return NextResponse.json({ error: "Invalid batches or batches not found" }, { status: 400 });
    }

    // ตรวจสอบสถานะของ batches
    const canMerge = batches.every(batch => 
      ['completed', 'in_progress'].includes(batch.status)
    );

    if (!canMerge) {
      return NextResponse.json({ error: "Some batches are not in mergeable status" }, { status: 400 });
    }

    // 2. สร้าง batch merge request
    const { data: mergeRequest, error: mergeRequestError } = await admin
      .from('batch_merge_requests')
      .insert({
        ticket_no: ticketNo,
        source_batch_ids: sourceBatchIds,
        target_station_id: targetStationId,
        requested_by: requestedBy,
        notes: notes,
        status: 'pending'
      })
      .select()
      .single();

    if (mergeRequestError) {
      console.error('Error creating merge request:', mergeRequestError);
      return NextResponse.json({ error: "Failed to create merge request" }, { status: 500 });
    }

    // 3. ส่ง Notification ไปหา Admin
    try {
      const { createApprovalRequiredNotification } = await import('@/utils/notificationManager');
      await createApprovalRequiredNotification(
        requestedBy,
        'batch_merge_requested',
        'คำขอรวม Batch',
        `มีคำขอรวม Batch สำหรับตั๋ว ${ticketNo} รออนุมัติ (${sourceBatchIds.length} batches)`,
        ticketNo,
        { source_batch_ids: sourceBatchIds, target_station_id: targetStationId }
      );
    } catch (notificationErr) {
      console.warn('Notification error:', notificationErr);
    }

    return NextResponse.json({
      success: true,
      message: "Batch merge request created successfully",
      data: {
        mergeRequestId: mergeRequest.id,
        ticketNo,
        sourceBatchIds,
        targetStationId
      }
    });

  } catch (error) {
    console.error('Batch Merge Request API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





