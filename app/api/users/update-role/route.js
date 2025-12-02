import { NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServer';
import { logApiCall, logError } from '@/utils/activityLogger';

export async function POST(request) {
  try {
    const { email, role, roles } = await request.json();
    
    if (!email || (!role && !roles)) {
      return NextResponse.json({ error: 'Email and role/roles are required' }, { status: 400 });
    }

    // Normalize roles: support both old format (role) and new format (roles)
    const userRoles = roles || (role ? [role] : []);
    const normalizedRoles = Array.isArray(userRoles) ? userRoles : [userRoles];

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

    // Update user metadata with roles
    const { data, error } = await supabaseServer.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: { 
          ...user.user_metadata,
          roles: normalizedRoles,
          role: normalizedRoles[0] // Keep for backward compatibility
        }
      }
    );

    if (error) {
      console.error('Error updating user roles:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also update public.users table
    const { error: dbError } = await supabaseServer
      .from('users')
      .update({
        roles: normalizedRoles,
        role: normalizedRoles[0] // Keep for backward compatibility
      })
      .eq('id', user.id);

    if (dbError) {
      console.error('Error updating user roles in database:', dbError);
      // Don't fail the request, just log the error
    }

    const response = NextResponse.json({ 
      success: true, 
      message: `User roles updated to ${JSON.stringify(normalizedRoles)}`,
      data 
    });
    await logApiCall(request, 'update', 'user_role', user.id, { email, roles: normalizedRoles }, 'success', null);
    return response;

  } catch (error) {
    console.error('Error in update role API:', error);
    await logError(error, { action: 'update', entityType: 'user_role' }, request);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
