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
    const technician_id = searchParams.get('technician_id');
    const payment_round = searchParams.get('payment_round');

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

    // Paginated fetch — deductions สะสมข้ามหลาย payment rounds อาจเกิน 1000 แถว
    const data = [];
    {
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        let query = supabaseAdmin
          .from('misc_deductions')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (technician_id) query = query.eq('technician_id', technician_id);
        if (payment_round) query = query.eq('payment_round', payment_round);

        const { data: page, error } = await query;
        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        if (page && page.length > 0) {
          data.push(...page);
          from += pageSize;
          hasMore = page.length === pageSize;
        } else {
          hasMore = false;
        }
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, user_id } = body || {};

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

    if (action === 'create') {
      const { technician_id, technician_name, description, quantity, price, payment_round } = body;
      if (!technician_id || !description || !payment_round) {
        return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
      }
      const qty = Number(quantity) || 1;
      const prc = Number(price) || 0;
      const { data, error } = await supabaseAdmin
        .from('misc_deductions')
        .insert({
          technician_id,
          technician_name: technician_name || '-',
          description,
          quantity: qty,
          price: prc,
          total_amount: qty * prc,
          payment_round,
          created_by: user_id,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, data });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
      }
      const { error } = await supabaseAdmin
        .from('misc_deductions')
        .delete()
        .eq('id', id);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
