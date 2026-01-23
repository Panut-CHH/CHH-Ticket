import { NextResponse } from 'next/server';
import { uploadFile } from '@/utils/projectFilesDb';
import { supabaseServer } from '@/utils/supabaseServer';
import { logApiCall, logError } from '@/utils/activityLogger';

/**
 * POST /api/projects/items/[itemId]/upload-complete
 * บันทึกข้อมูลไฟล์ที่อัปโหลดแล้วลง DB (ไฟล์อัปโหลดตรงไป Supabase แล้ว)
 */
export async function POST(request, ctx) {
  try {
    const { itemId } = await ctx.params;
    const body = await request.json();
    
    const { filePath, fileName, fileSize, fileType, uploadedBy } = body;

    if (!filePath || !fileName || !fileSize || !fileType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields', data: null },
        { status: 400 }
      );
    }

    // Get public URL
    const { data: urlData } = supabaseServer.storage
      .from('project-files')
      .getPublicUrl(filePath);

    // Extract original filename (remove timestamp prefix)
    const originalFileName = fileName.replace(/^\d+_/, '');

    // Save to database using the function (auto-sets is_current)
    const result = await uploadFile({
      projectItemId: itemId,
      fileName: originalFileName, // Keep original filename for display
      filePath: filePath,
      fileUrl: urlData.publicUrl,
      fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
      fileType: fileType.split('/').pop().toLowerCase(),
      uploadedBy: uploadedBy || null
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, data: null },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      data: { id: result.data.id },
      error: null
    });
    
    // Log file upload
    await logApiCall(request, 'create', 'project_file', result.data?.id, {
      project_item_id: itemId,
      file_name: originalFileName,
      file_path: filePath,
      file_type: fileType.split('/').pop().toLowerCase(),
      file_size: fileSize
    }, 'success', null);
    
    return response;

  } catch (error) {
    console.error('Error completing upload:', error);
    await logError(error, { action: 'create', entityType: 'project_file', entityId: (await ctx.params)?.itemId }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error', data: null },
      { status: 500 }
    );
  }
}
