import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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
 * POST /api/stations/create
 * สร้างสถานีใหม่
 * 
 * Body:
 * {
 *   name_th: string,
 *   name_en?: string,
 *   department?: string,
 *   estimated_hours?: number
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { name_th, name_en, department, estimated_hours } = body;

    console.log('[API CREATE STATION] Received request:', { name_th, name_en, department });

    // Validate inputs
    if (!name_th || !name_th.trim()) {
      return NextResponse.json(
        { success: false, error: 'Station name (Thai) is required' },
        { status: 400 }
      );
    }

    // Check if station already exists
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('stations')
      .select('id, name_th')
      .eq('name_th', name_th.trim())
      .maybeSingle();

    if (checkError) {
      console.error('[API CREATE STATION] Error checking existing:', checkError);
      // Continue anyway
    }

    if (existing) {
      console.log('[API CREATE STATION] Station already exists:', existing);
      return NextResponse.json({
        success: true,
        data: existing,
        message: 'Station already exists',
        existed: true
      });
    }

    // Generate station code (ST + number)
    const { data: maxStation } = await supabaseAdmin
      .from('stations')
      .select('code')
      .order('code', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextNumber = 1;
    if (maxStation?.code) {
      const match = maxStation.code.match(/ST(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }
    const code = `ST${String(nextNumber).padStart(3, '0')}`;

    // Create new station
    const { data: newStation, error: insertError } = await supabaseAdmin
      .from('stations')
      .insert({
        code,
        name_th: name_th.trim(),
        name_en: name_en?.trim() || null,
        department: department?.trim() || null,
        estimated_hours: estimated_hours || 0,
        is_active: true,
        sort_order: nextNumber
      })
      .select()
      .single();

    if (insertError) {
      console.error('[API CREATE STATION] Error creating station:', insertError);
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    console.log('[API CREATE STATION] Successfully created:', newStation);

    return NextResponse.json({
      success: true,
      data: newStation,
      message: 'Station created successfully',
      existed: false
    });

  } catch (error) {
    console.error('[API CREATE STATION] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

