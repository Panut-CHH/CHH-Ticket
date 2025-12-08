import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/utils/supabaseServer';

// Create Supabase admin client (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * GET /api/product-units
 * ดึงรายการหน่วยสินค้าทั้งหมด (default + custom)
 */
export async function GET(request) {
  try {
    const { data: units, error } = await supabaseAdmin
      .from('product_units')
      .select('*')
      .order('is_custom', { ascending: true }) // default units ก่อน
      .order('code', { ascending: true });

    if (error) {
      console.error('Error fetching product units:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: units || []
    });
  } catch (error) {
    console.error('Error in GET product units:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/product-units
 * เพิ่มหน่วยสินค้าใหม่ (Admin และ SuperAdmin เท่านั้น)
 */
export async function POST(request) {
  try {
    // ตรวจสอบ authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Create a client with anon key to verify the token
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ตรวจสอบ role (Admin หรือ SuperAdmin)
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('role, roles')
      .eq('id', user.id)
      .maybeSingle();

    const userRoles = userRow?.roles || (userRow?.role ? [userRow.role] : []);
    const normalizedRoles = userRoles.map(r => String(r).toLowerCase());
    const isAdmin = normalizedRoles.some(r => r === 'admin' || r === 'superadmin');

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin or SuperAdmin role required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { code, name_th, name_en } = body;

    // Validate input
    if (!code || !name_th) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: code and name_th are required' },
        { status: 400 }
      );
    }

    // ตรวจสอบว่า code ซ้ำหรือไม่
    const { data: existingUnit } = await supabaseAdmin
      .from('product_units')
      .select('id')
      .eq('code', code.toUpperCase())
      .maybeSingle();

    if (existingUnit) {
      return NextResponse.json(
        { success: false, error: 'Product unit code already exists' },
        { status: 400 }
      );
    }

    // เพิ่มหน่วยสินค้าใหม่
    const { data: newUnit, error: insertError } = await supabaseAdmin
      .from('product_units')
      .insert({
        code: code.toUpperCase(),
        name_th,
        name_en: name_en || null,
        is_custom: true,
        created_by: user.id
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting product unit:', insertError);
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: newUnit
    });
  } catch (error) {
    console.error('Error in POST product units:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

