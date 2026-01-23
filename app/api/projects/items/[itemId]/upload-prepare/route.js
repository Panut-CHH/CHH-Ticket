import { NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServer';

/**
 * POST /api/projects/items/[itemId]/upload-prepare
 * เตรียมการอัปโหลด: validate และ return filePath (ไม่รับไฟล์)
 * ไฟล์จะถูกอัปโหลดตรงจาก client ไป Supabase Storage
 */
export async function POST(request, ctx) {
  try {
    const { itemId } = await ctx.params;
    const body = await request.json();
    
    const { fileName, fileSize, fileType } = body;

    if (!fileName || !fileSize || !fileType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields', data: null },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(fileType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only PDF, JPG, PNG allowed.', data: null },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (fileSize > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum 10MB allowed.', data: null },
        { status: 400 }
      );
    }

    // Prepare file path (same logic as upload route)
    const fileExt = fileName.split('.').pop().toLowerCase();
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const timestampedFileName = `${Date.now()}_${cleanFileName}`;
    const filePath = `project-items/${itemId}/${timestampedFileName}`;

    return NextResponse.json({
      success: true,
      data: { filePath, fileName: timestampedFileName },
      error: null
    });

  } catch (error) {
    console.error('Error preparing upload:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', data: null },
      { status: 500 }
    );
  }
}
