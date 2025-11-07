import { NextResponse } from 'next/server';
import { deleteFile } from '@/utils/projectFilesDb';
import { logApiCall, logError } from '@/utils/activityLogger';

/**
 * DELETE /api/projects/items/[itemId]/files/[fileId]
 * ลบไฟล์ (เฉพาะไฟล์เก่า - ไม่ใช่ไฟล์ปัจจุบัน)
 */
export async function DELETE(request, ctx) {
  try {
    const { fileId } = await ctx.params;

    const result = await deleteFile(fileId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.error.includes('current file') ? 400 : 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      error: null
    });
    // Log delete project file
    await logApiCall(request, 'delete', 'project_file', fileId, {}, 'success', null);
    return response;

  } catch (error) {
    console.error('Error deleting file:', error);
    await logError(error, { action: 'delete', entityType: 'project_file', entityId: (await ctx.params)?.fileId }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

