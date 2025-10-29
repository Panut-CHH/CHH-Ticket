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
 * GET /api/users/list
 * Get list of users for filter dropdowns
 */
export async function GET(request) {
  try {
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, role')
      .order('name', { ascending: true });

    if (error) {
      console.error('[API] Error fetching users:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      users: users || []
    });

  } catch (error) {
    console.error('[API] Error in users list:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}