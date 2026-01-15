import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { logApiCall, logError } from '@/utils/activityLogger';

// สร้าง Supabase client ที่ใช้ session ของผู้ใช้ (รองรับทั้ง Cookie และ Authorization header)
async function createSupabaseClient(request) {
  const cookieStore = cookies();

  // อ่าน Bearer token จาก Authorization header ถ้ามี
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      // ใส่ token ลงใน global headers เพื่อให้ RLS ใช้ JWT ของผู้ใช้
      global: bearerToken
        ? { headers: { Authorization: `Bearer ${bearerToken}` } }
        : undefined,
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

export async function DELETE(request, { params }) {
  const ticketId = params?.id;

  if (!ticketId) {
    return NextResponse.json(
      { success: false, error: 'ticket id is required' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createSupabaseClient(request);

    // ตรวจสอบว่า user login และมีสิทธิ์หรือไม่
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
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Please login' },
        { status: 401 }
      );
    }

    // ตรวจสอบ role (Admin/SuperAdmin เท่านั้น)
    const { data: userRecord } = await supabase
      .from('users')
      .select('role, roles')
      .eq('id', user.id)
      .single();

    const userRoles = userRecord?.roles || (userRecord?.role ? [userRecord.role] : []);
    const hasAdminRole = Array.isArray(userRoles)
      ? userRoles.some((r) => r === 'Admin' || r === 'SuperAdmin')
      : false;

    if (!userRecord || !hasAdminRole) {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin/SuperAdmin only' },
        { status: 403 }
      );
    }

    // Normalize ticket number (remove leading #)
    const normalizedId = String(ticketId || '').replace(/^#/, '');

    // ลบ station flow ที่เกี่ยวข้อง
    const { error: flowError } = await supabase
      .from('ticket_station_flow')
      .delete()
      .eq('ticket_no', normalizedId);

    if (flowError) {
      console.error('Error deleting ticket_station_flow:', flowError);
      await logError(flowError, { action: 'delete', entityType: 'ticket_station_flow', entityId: normalizedId }, request);
      return NextResponse.json(
        { success: false, error: flowError.message },
        { status: 500 }
      );
    }

    // ลบ assignments ที่เกี่ยวข้อง
    const { error: assignmentError } = await supabase
      .from('ticket_assignments')
      .delete()
      .eq('ticket_no', normalizedId);

    if (assignmentError) {
      console.error('Error deleting ticket_assignments:', assignmentError);
      await logError(assignmentError, { action: 'delete', entityType: 'ticket_assignments', entityId: normalizedId }, request);
      return NextResponse.json(
        { success: false, error: assignmentError.message },
        { status: 500 }
      );
    }

    // ลบ ticket หลัก (ticket_bom จะถูก cascade)
    const { error: ticketError } = await supabase
      .from('ticket')
      .delete()
      .eq('no', normalizedId);

    if (ticketError) {
      console.error('Error deleting ticket:', ticketError);
      await logError(ticketError, { action: 'delete', entityType: 'ticket', entityId: normalizedId }, request);
      return NextResponse.json(
        { success: false, error: ticketError.message },
        { status: 500 }
      );
    }

    // Log successful delete
    await logApiCall(
      request,
      'delete',
      'ticket',
      normalizedId,
      {},
      'success',
      null,
      user ? { id: user.id, email: user.email } : null
    );

    return NextResponse.json({
      success: true,
      message: 'Ticket deleted successfully',
      data: { ticket_no: normalizedId },
    });
  } catch (error) {
    console.error('[DELETE TICKET API] Error:', error);
    await logError(error, { action: 'delete', entityType: 'ticket', entityId: ticketId }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
