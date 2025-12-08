import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
 * DELETE /api/product-units/[id]
 * ลบหน่วยสินค้าที่ admin เพิ่มเอง (SuperAdmin เท่านั้น)
 */
export async function DELETE(request, ctx) {
  try {
    const { id } = await ctx.params;

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

    // ตรวจสอบ role (SuperAdmin เท่านั้น)
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('role, roles')
      .eq('id', user.id)
      .maybeSingle();

    const userRoles = userRow?.roles || (userRow?.role ? [userRow.role] : []);
    const normalizedRoles = userRoles.map(r => String(r).toLowerCase());
    const isSuperAdmin = normalizedRoles.some(r => r === 'superadmin');

    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: SuperAdmin role required' },
        { status: 403 }
      );
    }

    // ตรวจสอบว่าหน่วยสินค้านี้เป็น custom unit หรือไม่
    const { data: unit, error: fetchError } = await supabaseAdmin
      .from('product_units')
      .select('id, code, is_custom')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !unit) {
      return NextResponse.json(
        { success: false, error: 'Product unit not found' },
        { status: 404 }
      );
    }

    if (!unit.is_custom) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete default product units' },
        { status: 400 }
      );
    }

    // ตรวจสอบว่ามีการใช้หน่วยสินค้านี้ใน project_items หรือ projects หรือไม่
    const { count: projectItemsCount } = await supabaseAdmin
      .from('project_items')
      .select('id', { count: 'exact', head: true })
      .eq('item_unit', unit.code);

    const { count: projectsCount } = await supabaseAdmin
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('item_unit', unit.code);

    if (projectItemsCount > 0 || projectsCount > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot delete: This product unit is being used in ${projectItemsCount + projectsCount} project(s)` 
        },
        { status: 400 }
      );
    }

    // ลบหน่วยสินค้า
    const { error: deleteError } = await supabaseAdmin
      .from('product_units')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting product unit:', deleteError);
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Product unit deleted successfully'
    });
  } catch (error) {
    console.error('Error in DELETE product unit:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

