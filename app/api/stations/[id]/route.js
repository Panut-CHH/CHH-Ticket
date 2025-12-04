import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logApiCall, logError } from '@/utils/activityLogger';

// Create Supabase admin client (bypasses RLS)
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

/**
 * PATCH /api/stations/[id]
 * อัปเดตข้อมูลสถานี (โดยเฉพาะ allowed_roles)
 * 
 * Body:
 * {
 *   allowed_roles?: string[]
 * }
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { allowed_roles } = body;

    console.log('[API UPDATE STATION] Received request:', { id, allowed_roles });

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Station ID is required' },
        { status: 400 }
      );
    }

    // Validate allowed_roles if provided
    if (allowed_roles !== undefined && allowed_roles !== null) {
      if (!Array.isArray(allowed_roles)) {
        return NextResponse.json(
          { success: false, error: 'allowed_roles must be an array' },
          { status: 400 }
        );
      }
    }

    // Prepare update data
    const updateData = {};
    if (allowed_roles !== undefined) {
      // If empty array, set to null (means show all)
      updateData.allowed_roles = (Array.isArray(allowed_roles) && allowed_roles.length > 0) ? allowed_roles : null;
    }

    // Check if station exists
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('stations')
      .select('id, name_th')
      .eq('id', id)
      .maybeSingle();

    if (checkError) {
      console.error('[API UPDATE STATION] Error checking existing:', checkError);
      return NextResponse.json(
        { success: false, error: checkError.message },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Station not found' },
        { status: 404 }
      );
    }

    // Update station
    const { data: updatedStation, error: updateError } = await supabaseAdmin
      .from('stations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[API UPDATE STATION] Error updating station:', updateError);
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    console.log('[API UPDATE STATION] Successfully updated:', updatedStation);

    const response = NextResponse.json({
      success: true,
      data: updatedStation,
      message: 'Station updated successfully'
    });
    await logApiCall(request, 'update', 'station', id, { 
      allowed_roles: updatedStation.allowed_roles
    }, 'success', null);
    return response;

  } catch (error) {
    console.error('[API UPDATE STATION] Error:', error);
    await logError(error, { action: 'update', entityType: 'station' }, request);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

