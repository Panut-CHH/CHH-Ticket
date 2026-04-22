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

export async function GET() {
  try {
    // Paginated fetch — supply catalog อาจเกิน 1000 รายการในโรงงานใหญ่
    const data = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data: page, error } = await supabaseAdmin
        .from('supply_items')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('name')
        .range(from, from + pageSize - 1);

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
      const { name, category, unit, price } = body;
      if (!name || price === undefined) {
        return NextResponse.json({ success: false, error: 'Missing name or price' }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin
        .from('supply_items')
        .insert({
          name,
          category: category || 'อื่นๆ',
          unit: unit || 'ชิ้น',
          price: Number(price) || 0,
          is_custom: true,
          created_by: user_id
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, data });
    }

    if (action === 'update') {
      const { id, name, category, unit, price } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
      }
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (category !== undefined) updates.category = category;
      if (unit !== undefined) updates.unit = unit;
      if (price !== undefined) updates.price = Number(price);

      const { data, error } = await supabaseAdmin
        .from('supply_items')
        .update(updates)
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
      const { data, error } = await supabaseAdmin
        .from('supply_items')
        .update({ is_active: false })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
