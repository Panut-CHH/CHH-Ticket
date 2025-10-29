import { NextResponse } from 'next/server';
import { getItemFiles } from '@/utils/projectFilesDb';

/**
 * GET /api/projects/items/[itemId]/files
 * ดึงไฟล์ทั้งหมดของ Item Code
 */
export async function GET(request, ctx) {
  try {
    const { itemId } = await ctx.params;

    const result = await getItemFiles(itemId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, data: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      error: null
    });

  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', data: [] },
      { status: 500 }
    );
  }
}

