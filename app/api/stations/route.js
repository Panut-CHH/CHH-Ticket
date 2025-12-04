import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logApiCall, logError } from '@/utils/activityLogger';

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
      .select('id, name_th, code, allowed_roles')
      .order('name_th', { ascending: true });

    if (error) {
      console.error('[API] Error fetching stations:', error);
      throw error;
    }

    const response = NextResponse.json({
      success: true,
      data: stations || []
    });
    await logApiCall(request, 'read', 'station', null, { count: stations?.length || 0 }, 'success', null);
    return response;

  } catch (error) {
    console.error('[API] Error in stations list:', error);
    await logError(error, { action: 'read', entityType: 'station' }, request);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
