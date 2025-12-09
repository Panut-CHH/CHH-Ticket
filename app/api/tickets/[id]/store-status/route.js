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
    const { store_status } = body;

    if (!ticketId) {
      return NextResponse.json({ success: false, error: 'Ticket ID is required' }, { status: 400 });
    }

    // Validate store_status value
    const validStatuses = ['เบิกของแล้ว', 'เบิกไม่ครบ', 'รอของ', null];
    if (store_status !== null && !validStatuses.includes(store_status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid store_status. Must be one of: เบิกของแล้ว, เบิกไม่ครบ, รอของ, or null' },
        { status: 400 }
      );
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
      return NextResponse.json({ success: false, error: 'Forbidden - Admin/SuperAdmin only' }, { status: 403 });
    }

    // Update store_status in ticket table
    const { error: updateError } = await supabase
      .from('ticket')
      .update({ store_status: store_status || null })
      .eq('no', ticketId);

    if (updateError) {
      console.error('[STORE STATUS API] Error updating store_status:', updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    await logApiCall(
      request,
      'update',
      'ticket',
      ticketId,
      { store_status },
      'success',
      null,
      user ? { id: user.id, email: user.email } : null
    );

    return NextResponse.json({
      success: true,
      message: 'Store status updated successfully',
      data: { ticket_no: ticketId, store_status }
    });
  } catch (error) {
    console.error('[STORE STATUS API] Error:', error);
    await logError(error, { action: 'update', entityType: 'ticket', entityId: ticketId }, request);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

