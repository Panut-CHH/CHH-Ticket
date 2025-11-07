import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logApiCall, logError } from '@/utils/activityLogger';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service key is not configured');
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function POST(request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await request.json();
    const { name, email, password, role } = body;

    // 1. สร้าง user ใน auth.users ก่อน
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // ยืนยัน email ทันที
      user_metadata: {
        full_name: name,
        role: role
      }
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      return NextResponse.json(
        { success: false, error: authError.message },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    // 2. สร้าง record ใน public.users โดยใช้ ID เดียวกัน
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId, // ใช้ ID จาก auth.users
        name: name,
        email: email,
        role: role,
        status: 'active'
      });

    if (dbError) {
      // ถ้าเพิ่มใน public.users ไม่ได้ ให้ลบ user ใน auth.users ออกด้วย
      await supabaseAdmin.auth.admin.deleteUser(userId);
      console.error('Error creating user in database:', dbError);
      return NextResponse.json(
        { success: false, error: dbError.message },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: 'User created successfully',
      userId: userId
    });
    await logApiCall(request, 'create', 'user', userId, { email, role }, 'success', null);
    return response;

  } catch (error) {
    console.error('Error in create user API:', error);
    await logError(error, { action: 'create', entityType: 'user' }, request);
    return NextResponse.json(
      { success: false, error: error.message.includes('service key') ? 'Server misconfiguration: service key missing' : error.message },
      { status: error.message.includes('service key') ? 500 : 500 }
    );
  }
}

