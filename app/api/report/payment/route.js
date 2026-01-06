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

const formatRound = (dateInput) => {
  if (!dateInput) {
    // Default to current month/year
    const d = new Date();
    const m = d.getMonth() + 1;
    const yy = String(d.getFullYear()).slice(-2);
    return `${m}/${yy}`;
  }
  const d = new Date(dateInput);
  // Handle timezone issues - use UTC to avoid date shifting
  const year = d.getUTCFullYear();
  const yy = String(year).slice(-2);
  
  // ถ้าเป็นปี 2025 (25) ให้แสดงเป็นรอบ 1/26
  if (yy === '25' || year === 2025) {
    return '1/26';
  }
  
  const m = d.getUTCMonth() + 1;
  return `${m}/${yy}`;
};

const normalizeRoles = (roles) => {
  if (!roles) return [];
  if (Array.isArray(roles)) return roles.map((r) => String(r).toLowerCase());
  return [String(roles).toLowerCase()];
};

const isAdminOrManager = (roles) => {
  const lower = normalizeRoles(roles);
  return lower.some((r) => r === 'admin' || r === 'superadmin' || r === 'manager');
};

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      action,
      ticket_no,
      station_id,
      step_order,
      technician_id,
      payment_amount,
      quantity,
      unit,
      price_per_unit,
      project_name,
      payment_date,
      user_id
    } = body || {};

    if (!['confirm', 'cancel'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    if (!ticket_no || !station_id || !step_order || !technician_id || !user_id) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('users')
      .select('role, roles')
      .eq('id', user_id)
      .maybeSingle();

    if (userErr || !userRow || !isAdminOrManager(userRow.roles || userRow.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const paymentRound = formatRound(payment_date);
    const baseRecord = {
      ticket_no,
      station_id,
      step_order,
      technician_id,
      payment_amount: Number(payment_amount) || 0,
      quantity: typeof quantity === 'number' ? quantity : null,
      unit: unit || null,
      price_per_unit: price_per_unit !== undefined ? Number(price_per_unit) : null,
      project_name: project_name || null,
      payment_date: payment_date ? new Date(payment_date).toISOString() : new Date().toISOString(),
      payment_round: paymentRound
    };

    if (action === 'confirm') {
      const payload = {
        ...baseRecord,
        status: 'paid',
        paid_by: user_id,
        cancelled_by: null
      };
      const { data, error } = await supabaseAdmin
        .from('technician_payments')
        .upsert(payload, {
          onConflict: 'ticket_no,station_id,step_order,technician_id,payment_round'
        })
        .select()
        .maybeSingle();

      if (error) {
        console.error('[REPORT PAYMENT] confirm error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }

    if (action === 'cancel') {
      const payload = {
        ...baseRecord,
        status: 'cancelled',
        cancelled_by: user_id
      };
      const { data, error } = await supabaseAdmin
        .from('technician_payments')
        .upsert(payload, {
          onConflict: 'ticket_no,station_id,step_order,technician_id,payment_round'
        })
        .select()
        .maybeSingle();

      if (error) {
        console.error('[REPORT PAYMENT] cancel error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ success: false, error: 'Unhandled action' }, { status: 400 });
  } catch (e) {
    console.error('[REPORT PAYMENT] unexpected error:', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}

