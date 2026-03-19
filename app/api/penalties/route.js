import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * GET /api/penalties
 * ดึงรายการหักเงินทั้งหมด (สำหรับ Admin/Manager/HR)
 * Query params: status (pending/approved/rejected), technician_id, page, limit
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const technicianId = searchParams.get('technician_id');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('penalty_deductions')
      .select(`
        *,
        technician:users!penalty_deductions_technician_id_fkey(id, name, email),
        proxy_user:users!penalty_deductions_proxy_user_id_fkey(id, name, email),
        station:stations!penalty_deductions_station_id_fkey(id, name_th, code),
        approver:users!penalty_deductions_approved_by_fkey(id, name, email)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (technicianId) {
      query = query.eq('technician_id', technicianId);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('[API] Error fetching penalties:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
