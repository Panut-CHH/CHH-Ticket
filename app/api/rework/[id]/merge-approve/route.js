import { NextResponse } from "next/server";
import { supabaseServer as admin } from "@/utils/supabaseServer";

// Approve merging reworked quantity back to parent ticket's pass_quantity
// POST /api/rework/:id/merge-approve { approvedBy, notes }
export async function POST(request, context) {
  try {
    const params = await context.params;
    const reworkOrderId = params?.id;
    const body = await request.json();
    const { approvedBy, notes } = body || {};

    if (!reworkOrderId || !approvedBy) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1) Load rework order
    const { data: reworkOrder, error: orderError } = await admin
      .from('rework_orders')
      .select('*')
      .eq('id', reworkOrderId)
      .single();

    if (orderError || !reworkOrder) {
      return NextResponse.json({ error: "Rework order not found" }, { status: 404 });
    }

    // 2) Find rework ticket number from ticket_batches (set during rework approve)
    const { data: batch, error: batchError } = await admin
      .from('ticket_batches')
      .select('rework_ticket_no')
      .eq('id', reworkOrder.batch_id)
      .single();

    if (batchError) {
      return NextResponse.json({ error: "Failed to load rework batch" }, { status: 500 });
    }

    const reworkTicketNo = batch?.rework_ticket_no;

    // 3) Determine quantity to merge: prefer rework ticket pass_quantity else quantity
    let mergeQty = reworkOrder.quantity || 0;
    if (reworkTicketNo) {
      const { data: reworkTicket } = await admin
        .from('ticket')
        .select('pass_quantity, quantity, status')
        .eq('no', reworkTicketNo)
        .single();
      if (reworkTicket) {
        const pq = typeof reworkTicket.pass_quantity === 'number' ? reworkTicket.pass_quantity : null;
        mergeQty = typeof pq === 'number' && pq !== null ? pq : (reworkTicket.quantity || 0);
      }
    }

    // 4) Update parent ticket pass_quantity = COALESCE(pass_quantity,0) + mergeQty
    const { data: parent } = await admin
      .from('ticket')
      .select('pass_quantity')
      .eq('no', reworkOrder.ticket_no)
      .single();
    const currentPass = typeof parent?.pass_quantity === 'number' ? parent.pass_quantity : 0;
    const newPass = currentPass + (Number(mergeQty) || 0);

    const { error: parentUpdateError } = await admin
      .from('ticket')
      .update({ pass_quantity: newPass })
      .eq('no', reworkOrder.ticket_no);

    if (parentUpdateError) {
      return NextResponse.json({ error: "Failed to update parent ticket" }, { status: 500 });
    }

    // 5) Mark rework order as merged (with timestamp)
    try {
      await admin
        .from('rework_orders')
        .update({ status: 'merged', approval_status: 'approved', approved_by: approvedBy, merged_at: new Date().toISOString(), notes })
        .eq('id', reworkOrderId);
    } catch (e) {
      // fallback: if merged_at column not exists
      await admin
        .from('rework_orders')
        .update({ status: 'merged', approval_status: 'approved', approved_by: approvedBy, notes })
        .eq('id', reworkOrderId);
    }

    // 6) Optionally close rework ticket
    if (reworkTicketNo) {
      await admin
        .from('ticket')
        .update({ status: 'Finished' })
        .eq('no', reworkTicketNo);
    }

    // 7) Auto-finish parent if it has no pending/current steps left
    try {
      const { data: flows } = await admin
        .from('ticket_station_flow')
        .select('status')
        .eq('ticket_no', reworkOrder.ticket_no);
      const list = Array.isArray(flows) ? flows : [];
      const hasActive = list.some(f => (f.status || 'pending') === 'pending' || (f.status || 'pending') === 'current');
      if (!hasActive) {
        await admin
          .from('ticket')
          .update({ status: 'Finished' })
          .eq('no', reworkOrder.ticket_no);
      }
    } catch {}

    // 8) Notify
    try {
      await admin.from('notifications').insert({
        type: 'batch_merged',
        title: 'รวมผล Rework กลับตั๋วหลักแล้ว',
        message: `เพิ่ม pass_quantity ${mergeQty} ชิ้นให้ตั๋ว ${reworkOrder.ticket_no}`,
        ticket_no: reworkOrder.ticket_no
      });
    } catch {}

    return NextResponse.json({
      success: true,
      data: {
        parent_ticket_no: reworkOrder.ticket_no,
        rework_ticket_no: reworkTicketNo,
        merged_quantity: mergeQty,
        new_pass_quantity: newPass
      }
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}


