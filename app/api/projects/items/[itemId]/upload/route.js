import { NextResponse } from 'next/server';
import { uploadFile } from '@/utils/projectFilesDb';
import { supabaseServer } from '@/utils/supabaseServer';

/**
 * POST /api/projects/items/[itemId]/upload
 * อัปโหลดไฟล์เข้า Item Code (Subfolder)
 */
export async function POST(request, ctx) {
  try {
    const { itemId } = await ctx.params;
    const formData = await request.formData();
    
    const file = formData.get('file');
    const uploadedBy = formData.get('uploadedBy');

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided', data: null },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only PDF, JPG, PNG allowed.', data: null },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum 10MB allowed.', data: null },
        { status: 400 }
      );
    }

    // Prepare file for upload
    const fileExt = file.name.split('.').pop().toLowerCase();
    // Clean filename: remove special characters and encode properly
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${Date.now()}_${cleanFileName}`;
    const filePath = `project-items/${itemId}/${fileName}`;

    // Upload to Supabase Storage
    const supabase = supabaseServer;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      console.error('File path:', filePath);
      console.error('File name:', file.name);
      console.error('Clean file name:', cleanFileName);
      return NextResponse.json(
        { success: false, error: `Upload failed: ${uploadError.message}`, data: null },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('project-files')
      .getPublicUrl(filePath);

    // Save to database using the function (auto-sets is_current)
    const result = await uploadFile({
      projectItemId: itemId,
      fileName: file.name, // Keep original filename for display
      filePath: filePath,
      fileUrl: urlData.publicUrl,
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      fileType: fileExt,
      uploadedBy: uploadedBy || null
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, data: null },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { id: result.data.id },
      error: null
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', data: null },
      { status: 500 }
    );
  }
}

