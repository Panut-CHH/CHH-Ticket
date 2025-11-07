import { NextResponse } from 'next/server';
import { deleteProjectItem } from '@/utils/projectItemsDb';
import { supabase } from '@/utils/supabaseClient';
import { logApiCall, logError } from '@/utils/activityLogger';

/**
 * DELETE /api/projects/items/[itemId]
 * ลบ Item Code (Subfolder) พร้อมไฟล์ทั้งหมด
 */
export async function DELETE(request, ctx) {
  try {
    const { itemId } = await ctx.params;

    // ดึงรายการไฟล์ก่อนลบ เพื่อลบจาก Storage
    const { data: files, error: fetchError } = await supabase
      .from('project_files')
      .select('file_path')
      .eq('project_item_id', itemId);

    if (!fetchError && files && files.length > 0) {
      // ลบไฟล์ทั้งหมดจาก Storage
      const filePaths = files.map(f => f.file_path).filter(p => p);
      
      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('project-files')
          .remove(filePaths);

        if (storageError) {
          console.warn('Error deleting files from storage:', storageError);
          // Continue even if storage deletion fails
        }
      }
    }

    // ลบ Item Code (CASCADE จะลบไฟล์ในฐานข้อมูลอัตโนมัติ)
    const result = await deleteProjectItem(itemId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      error: null
    });
    // Log delete item code
    await logApiCall(request, 'delete', 'item_code', itemId, {}, 'success', null);
    return response;

  } catch (error) {
    console.error('Error deleting project item:', error);
    await logError(error, { action: 'delete', entityType: 'item_code', entityId: (await ctx.params)?.itemId }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

