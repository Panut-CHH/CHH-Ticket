import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get('user_id');
    const payment_round = searchParams.get('payment_round');
    const technician_id = searchParams.get('technician_id');

    if (!user_id) {
      return NextResponse.json({ success: false, error: 'Missing user_id' }, { status: 400 });
    }

    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('users')
      .select('role, roles')
      .eq('id', user_id)
      .maybeSingle();

    if (userErr || !userRow || !isAdminOrManager(userRow.roles || userRow.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    let query = supabaseAdmin
      .from('supply_withdrawals')
      .select('technician_id, total_amount, item_name, locked_price, quantity, payment_round');

    if (payment_round) query = query.eq('payment_round', payment_round);
    if (technician_id) query = query.eq('technician_id', technician_id);

    const { data: withdrawals, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Group by technician
    const grouped = {};
    for (const w of withdrawals) {
      if (!grouped[w.technician_id]) {
        grouped[w.technician_id] = {
          technician_id: w.technician_id,
          payment_round: w.payment_round,
          total_amount: 0,
          item_count: 0,
          items: []
        };
      }
      grouped[w.technician_id].total_amount += Number(w.total_amount) || 0;
      grouped[w.technician_id].item_count += 1;
      grouped[w.technician_id].items.push({
        item_name: w.item_name,
        locked_price: w.locked_price,
        quantity: w.quantity,
        total_amount: w.total_amount
      });
    }

    // Fetch technician names
    const techIds = Object.keys(grouped);
    let techMap = {};
    if (techIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, name')
        .in('id', techIds);
      if (users) {
        techMap = Object.fromEntries(users.map(u => [u.id, u.name]));
      }
    }

    const summary = Object.values(grouped).map(g => ({
      ...g,
      technician_name: techMap[g.technician_id] || '-'
    }));

    return NextResponse.json({ success: true, data: summary });
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
