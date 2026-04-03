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

const normalizeRoles = (roles) => {
  if (!roles) return [];
  if (Array.isArray(roles)) return roles.map((r) => String(r).toLowerCase());
  return [String(roles).toLowerCase()];
};

const isAdminOrManager = (roles) => {
  const lower = normalizeRoles(roles);
  return lower.some((r) => r === 'admin' || r === 'superadmin' || r === 'manager' || r === 'hr');
};

/**
 * GET /api/report/payments
 * ดึง technician_payments ทั้งหมดด้วย service role (ไม่โดน RLS)
 * ต้องส่ง user_id ใน query เพื่อตรวจว่าเป็น admin/manager
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing user_id' }, { status: 400 });
    }

    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('users')
      .select('role, roles')
      .eq('id', userId)
      .maybeSingle();

    if (userErr || !userRow || !isAdminOrManager(userRow.roles || userRow.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Supabase default limit is 1000, fetch all by paginating
    let paymentData = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error: pageError } = await supabaseAdmin
        .from('technician_payments')
        .select('*')
        .range(from, from + pageSize - 1);
      if (pageError) {
        console.error('[REPORT PAYMENTS] fetch error:', pageError);
        return NextResponse.json({ success: false, error: pageError.message }, { status: 500 });
      }
      paymentData = paymentData.concat(page || []);
      if (!page || page.length < pageSize) break;
      from += pageSize;
    }
    const paymentError = null;

    if (paymentError) {
      console.error('[REPORT PAYMENTS] fetch error:', paymentError);
      return NextResponse.json({ success: false, error: paymentError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: paymentData || [] });
  } catch (e) {
    console.error('[REPORT PAYMENTS] unexpected error:', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
