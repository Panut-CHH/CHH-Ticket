import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    // สร้าง Supabase client จาก Authorization header
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({
        authenticated: false,
        message: 'No token found'
      });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({
        authenticated: false,
        error: error?.message
      });
    }

    // ดึงข้อมูลจากตาราง users
    const { data: userRecord } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    // Support both old format (role) and new format (roles)
    const userRoles = userRecord?.roles || (userRecord?.role ? [userRecord.role] : []);
    const hasAdminRole = userRoles.some(r => r === 'SuperAdmin' || r === 'Admin');
    
    return NextResponse.json({
      authenticated: true,
      authUser: {
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role,
        roles: user.user_metadata?.roles || (user.user_metadata?.role ? [user.user_metadata.role] : [])
      },
      databaseUser: userRecord,
      matched: userRecord?.id === user.id,
      canWrite: userRecord && hasAdminRole
    });

  } catch (error) {
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}

