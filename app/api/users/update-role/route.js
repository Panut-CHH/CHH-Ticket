import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseServer';

export async function POST(request) {
  try {
    const { email, role } = await request.json();
    
    if (!email || !role) {
      return NextResponse.json({ error: 'Email and role are required' }, { status: 400 });
    }

    // First, get the user by email
    const { data: users, error: fetchError } = await supabase.auth.admin.listUsers();
    
    if (fetchError) {
      console.error('Error fetching users:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user metadata with role
    const { data, error } = await supabase.auth.admin.updateUserById(
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

    return NextResponse.json({ 
      success: true, 
      message: `User role updated to ${role}`,
      data 
    });

  } catch (error) {
    console.error('Error in update role API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
