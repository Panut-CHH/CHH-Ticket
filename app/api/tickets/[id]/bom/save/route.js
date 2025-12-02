import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logApiCall, logError } from '@/utils/activityLogger';

async function createSupabaseClient(request) {
  const cookieStore = cookies();
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: bearerToken ? { headers: { Authorization: `Bearer ${bearerToken}` } } : undefined,
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

export async function POST(request, { params }) {
  const ticketId = params?.id;
  try {
    const body = await request.json();
    const bom = Array.isArray(body?.bom) ? body.bom : [];

    if (!ticketId) {
      return NextResponse.json({ success: false, error: 'ticket id required' }, { status: 400 });
    }

    const supabase = await createSupabaseClient(request);

    // Auth check: Admin/SuperAdmin only
    let user = null;
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : null;
    if (bearerToken) {
      const { data: userData } = await supabase.auth.getUser(bearerToken);
      user = userData?.user ?? null;
    } else {
      const { data: userData } = await supabase.auth.getUser();
      user = userData?.user ?? null;
    }
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { data: userRecord } = await supabase
      .from('users')
      .select('role, roles')
      .eq('id', user.id)
      .single();
    // Support both old format (role) and new format (roles)
    const userRoles = userRecord?.roles || (userRecord?.role ? [userRecord.role] : []);
    const hasAdminRole = userRoles.some(r => r === 'Admin' || r === 'SuperAdmin');
    if (!userRecord || !hasAdminRole) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Replace-all upsert: delete existing then insert new
    const { error: delError } = await supabase
      .from('ticket_bom')
      .delete()
      .eq('ticket_no', ticketId);
    if (delError) {
      return NextResponse.json({ success: false, error: delError.message }, { status: 500 });
    }

      const rows = bom
        .filter(r => r && String(r.material_name || '').trim() !== '')
        .map(r => ({
          ticket_no: ticketId,
          material_name: String(r.material_name).trim(),
          quantity: Number(r.quantity) || 0,
          unit: (r.unit && String(r.unit).trim()) || 'PCS'
        }));

    if (rows.length > 0) {
      const { error: insError } = await supabase
        .from('ticket_bom')
        .insert(rows);
      if (insError) {
        return NextResponse.json({ success: false, error: insError.message }, { status: 500 });
      }
    }

    await logApiCall(request, 'update', 'ticket_bom', ticketId, { count: rows.length }, 'success', null, user ? { id: user.id, email: user.email } : null);
    return NextResponse.json({ success: true, message: 'BOM saved' });
  } catch (error) {
    await logError(error, { action: 'update', entityType: 'ticket_bom', entityId: ticketId }, request);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


