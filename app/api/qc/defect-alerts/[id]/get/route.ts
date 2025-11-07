import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";

export async function GET(request: Request, context: any) {
  try {
    const params = await context.params;
    const id = params?.id;
    const { data, error } = await supabaseServer
      .from('qc_defect_alerts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('[QC DEFECT ALERTS GET] error:', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to get alert' }, { status: 500 });
  }
}


