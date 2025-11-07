import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'open';
    const q = (url.searchParams.get('q') || '').trim();
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabaseServer
      .from('qc_defect_alerts')
      .select('*', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (q) {
      // simple ilike search on ticket_no and station_name
      query = query.or(`ticket_no.ilike.%${q}%,station_name.ilike.%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [], count: count || 0 });
  } catch (e: any) {
    console.error('[QC DEFECT ALERTS LIST] error:', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to load alerts' }, { status: 500 });
  }
}


