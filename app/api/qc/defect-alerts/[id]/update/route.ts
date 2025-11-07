import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";

export async function PATCH(request: Request, context: any) {
  try {
    const params = await context.params;
    const id = params?.id;
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });

    const body = await request.json();
    const { rpd_ref, nc_note, resolver_user_id, resolve } = body || {};

    const payload: any = {
      rpd_ref: rpd_ref ?? null,
      nc_note: nc_note ?? null,
      updated_by: resolver_user_id || null
    };

    if (resolve === true) payload.status = 'resolved';

    const { data, error } = await supabaseServer
      .from('qc_defect_alerts')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('[QC DEFECT ALERTS UPDATE] error:', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to update alert' }, { status: 500 });
  }
}


