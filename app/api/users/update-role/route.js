import { NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServer';
import { logApiCall, logError } from '@/utils/activityLogger';

export async function POST(request) {
  try {
    const { email, role } = await request.json();
    
    if (!email || !role) {
      return NextResponse.json({ error: 'Email and role are required' }, { status: 400 });
    }

    // First, get the user by email
    const { data: users, error: fetchError } = await supabaseServer.auth.admin.listUsers();
    
    if (fetchError) {
      console.error('Error fetching users:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user metadata with role
    const { data, error } = await supabaseServer.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: { 
          ...user.user_metadata,
          role: role 
        }
      }
    );

    if (error) {
      console.error('Error updating user role:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const response = NextResponse.json({ 
      success: true, 
      message: `User role updated to ${role}`,
      data 
    });
    await logApiCall(request, 'update', 'user_role', user.id, { email, role }, 'success', null);
    return response;

  } catch (error) {
    console.error('Error in update role API:', error);
    await logError(error, { action: 'update', entityType: 'user_role' }, request);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
