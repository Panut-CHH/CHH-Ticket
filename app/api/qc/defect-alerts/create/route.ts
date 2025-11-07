import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      ticket_no,
      station_id,
      station_name,
      session_id,
      qc_task_uuid,
      defect_qty,
      created_by
    } = body || {};

    if (!ticket_no || !session_id || !Number.isFinite(Number(defect_qty))) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // upsert by session_id to prevent duplicates
    const { data, error } = await supabaseServer
      .from('qc_defect_alerts')
      .upsert({
        ticket_no,
        station_id: station_id || null,
        station_name: station_name || null,
        session_id,
        qc_task_uuid: qc_task_uuid || null,
        defect_qty: Number(defect_qty) || 0,
        status: 'open',
        created_by: created_by || null
      }, { onConflict: 'session_id' })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('[QC DEFECT ALERTS CREATE] error:', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to create alert' }, { status: 500 });
  }
}


