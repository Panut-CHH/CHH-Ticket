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

export async function POST(request, { params }) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { id: userId } = params;
    const body = await request.json();
    const { name, email, password, role } = body;

    // 1. Update ข้อมูลใน public.users
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .update({
        name: name,
        email: email,
        role: role,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (dbError) {
      console.error('Error updating user in database:', dbError);
      return NextResponse.json(
        { success: false, error: dbError.message },
        { status: 500 }
      );
    }

    // 2. Update ข้อมูลใน auth.users (email และ password ถ้ามี)
    const authUpdateData = {
      email: email,
      user_metadata: {
        full_name: name,
        role: role
      }
    };

    if (password && password.trim() !== '') {
      authUpdateData.password = password;
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      authUpdateData
    );

    if (authError) {
      console.error('Error updating auth user:', authError);
      // ไม่ return error เพราะอาจจะเป็น user ที่ไม่มีใน auth.users (สร้างก่อนใช้ระบบใหม่)
    }

    const response = NextResponse.json({
      success: true,
      message: 'User updated successfully'
    });
    await logApiCall(request, 'update', 'user', userId, { email, role }, 'success', null);
    return response;

  } catch (error) {
    console.error('Error in update user API:', error);
    await logError(error, { action: 'update', entityType: 'user', entityId: (await params)?.id }, request);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

