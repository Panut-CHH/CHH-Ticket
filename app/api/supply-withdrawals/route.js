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

    // Paginated fetch — withdrawals สะสมยาวข้ามหลาย payment rounds อาจเกิน 1000 แถว
    const data = [];
    {
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        let query = supabaseAdmin
          .from('supply_withdrawals')
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

    // Fetch technician names
    const techIds = [...new Set(data.map(d => d.technician_id))];
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

    const enriched = data.map(row => ({
      ...row,
      technician_name: techMap[row.technician_id] || '-'
    }));

    return NextResponse.json({ success: true, data: enriched });
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
      const { technician_id, payment_round, items } = body;
      if (!technician_id || !payment_round || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
      }

      // Fetch supply items to get current prices (for locking)
      const itemIds = items.map(i => i.supply_item_id);
      const { data: supplyItems, error: siErr } = await supabaseAdmin
        .from('supply_items')
        .select('id, name, category, unit, price')
        .in('id', itemIds);

      if (siErr) {
        return NextResponse.json({ success: false, error: siErr.message }, { status: 500 });
      }

      const itemMap = Object.fromEntries(supplyItems.map(si => [si.id, si]));

      const records = items
        .filter(i => Number(i.quantity) > 0 && itemMap[i.supply_item_id])
        .map(i => {
          const si = itemMap[i.supply_item_id];
          const qty = Number(i.quantity);
          return {
            supply_item_id: si.id,
            technician_id,
            item_name: si.name,
            item_category: si.category,
            unit: si.unit,
            locked_price: si.price,
            quantity: qty,
            total_amount: si.price * qty,
            payment_round,
            created_by: user_id
          };
        });

      if (records.length === 0) {
        return NextResponse.json({ success: false, error: 'No items with quantity > 0' }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from('supply_withdrawals')
        .insert(records)
        .select();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }

    if (action === 'update') {
      const { id, quantity } = body;
      if (!id || quantity === undefined) {
        return NextResponse.json({ success: false, error: 'Missing id or quantity' }, { status: 400 });
      }

      // Get existing record to use locked_price
      const { data: existing, error: exErr } = await supabaseAdmin
        .from('supply_withdrawals')
        .select('locked_price')
        .eq('id', id)
        .single();

      if (exErr || !existing) {
        return NextResponse.json({ success: false, error: 'Record not found' }, { status: 404 });
      }

      const qty = Number(quantity);
      const { data, error } = await supabaseAdmin
        .from('supply_withdrawals')
        .update({
          quantity: qty,
          total_amount: existing.locked_price * qty
        })
        .eq('id', id)
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
        .from('supply_withdrawals')
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
