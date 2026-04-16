import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * GET /api/production/[ticketNo]/transfers
 * ดึงประวัติการส่งชิ้นงานระหว่างสถานี
 */
export async function GET(request, { params }) {
  try {
    const { ticketNo } = await params;

    const { data, error } = await supabaseAdmin
      .from('station_qty_transfers')
      .select('*')
      .eq('ticket_no', ticketNo)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[API] Error fetching transfers:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
