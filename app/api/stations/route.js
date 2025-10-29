import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Create Supabase admin client (bypasses RLS)
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
 * GET /api/stations
 * Get list of stations for filter dropdowns
 */
export async function GET(request) {
  try {
    const { data: stations, error } = await supabaseAdmin
      .from('stations')
      .select('id, name_th, code')
      .order('name_th', { ascending: true });

    if (error) {
      console.error('[API] Error fetching stations:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: stations || []
    });

  } catch (error) {
    console.error('[API] Error in stations list:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
