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
 * GET /api/users/list
 * Get list of users for filter dropdowns
 *
 * Query params:
 *   - includeInactive=true → คืนทั้ง active + inactive (ใช้ในหน้า settings/รายงานย้อนหลัง)
 *   - default → คืนเฉพาะ user ที่ status='active' (ใช้ใน dropdown assign / filter ตั๋วใหม่)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    let query = supabaseAdmin
      .from('users')
      .select('id, name, email, role, roles, status')
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('status', 'active');
    }

    const { data: users, error } = await query;

    if (error) {
      console.error('[API] Error fetching users:', error);
      throw error;
    }

    const response = NextResponse.json({
      success: true,
      users: users || []
    });
    await logApiCall(request, 'read', 'user', null, { count: users?.length || 0 }, 'success', null);
    return response;

  } catch (error) {
    console.error('[API] Error in users list:', error);
    await logError(error, { action: 'read', entityType: 'user' }, request);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}