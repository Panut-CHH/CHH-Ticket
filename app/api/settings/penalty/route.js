import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * GET /api/settings/penalty
 * ดึงค่าตั้งค่าหักเงิน
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('penalty_settings')
      .select('*')
      .order('key');

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[API] Error fetching penalty settings:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/penalty
 * อัปเดตค่าตั้งค่าหักเงิน (Admin only)
 * Body: { key: string, value: number, user_id: uuid }
 */
export async function PUT(request) {
  try {
    const body = await request.json();
    const { key, value, user_id } = body;

    if (!key || value === undefined || value === null || !user_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters (key, value, user_id)' },
        { status: 400 }
      );
    }

    // Check admin
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('role, roles')
      .eq('id', user_id)
      .maybeSingle();

    const userRoles = userRow?.roles || (userRow?.role ? [userRow.role] : []);
    const normalizedRoles = userRoles.map(r => String(r).toLowerCase());
    const isAdmin = normalizedRoles.some(r => r === 'admin' || r === 'superadmin');

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Only Admin can update penalty settings' },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('penalty_settings')
      .update({ value: Number(value), updated_by: user_id })
      .eq('key', key)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[API] Error updating penalty settings:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
