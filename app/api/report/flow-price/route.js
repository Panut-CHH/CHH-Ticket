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
 * POST /api/report/flow-price
 * อัปเดต price และ price_type ใน ticket_station_flow
 * ใช้สำหรับแก้ไขราคาค่าแรงในหน้ารายงาน (รอจ่าย)
 * การอัปเดตนี้จะ sync กับทุกหน้าที่อ่านจาก ticket_station_flow (production, ticket)
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { ticket_no, station_id, step_order, price, price_type, user_id } = body || {};

    if (!ticket_no || !station_id || step_order === undefined || price === undefined || !user_id) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const newPrice = Number(price);
    if (isNaN(newPrice) || newPrice < 0) {
      return NextResponse.json({ success: false, error: 'Invalid price value' }, { status: 400 });
    }

    const allowedPriceTypes = ['flat', 'per_piece', 'per_hour'];
    const normalizedType = allowedPriceTypes.includes(price_type) ? price_type : 'flat';

    // ตรวจสิทธิ์
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('users')
      .select('role, roles')
      .eq('id', user_id)
      .maybeSingle();

    if (userErr || !userRow || !isAdminOrManager(userRow.roles || userRow.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // อัปเดต ticket_station_flow
    const { data, error } = await supabaseAdmin
      .from('ticket_station_flow')
      .update({
        price: newPrice,
        price_type: normalizedType,
        updated_at: new Date().toISOString()
      })
      .eq('ticket_no', ticket_no)
      .eq('station_id', station_id)
      .eq('step_order', step_order)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[FLOW PRICE] update error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('[FLOW PRICE] unexpected error:', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
