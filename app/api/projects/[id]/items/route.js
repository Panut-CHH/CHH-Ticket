import { NextResponse } from 'next/server';
import { getAllProjectItems, createProjectItem } from '@/utils/projectItemsDb';
import { getProjectById } from '@/utils/projectDb';
import { createNewItemCodeNotification } from '@/utils/notificationManager';
import { logApiCall, logError } from '@/utils/activityLogger';

/**
 * GET /api/projects/[id]/items
 * ดึง Item Code ทั้งหมดของ Project
 */
export async function GET(request, ctx) {
  try {
    const { id } = await ctx.params;

    const result = await getAllProjectItems(id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, data: [] },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      data: result.data,
      error: null
    });
    // Log read
    await logApiCall(request, 'read', 'project_items', id, { count: result.data?.length || 0 }, 'success', null);
    return response;

  } catch (error) {
    console.error('Error fetching project items:', error);
    await logError(error, { action: 'read', entityType: 'project_items' }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error', data: [] },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/items
 * สร้าง Item Code (Subfolder) ใหม่
 */
export async function POST(request, ctx) {
  try {
    const { id: projectId } = await ctx.params;
    const body = await request.json();

    // Validate input
    if (!body.itemType || !body.itemProductCode || !body.itemUnit) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields', data: null },
        { status: 400 }
      );
    }

    // Get project to build item code
    const projectResult = await getProjectById(projectId);
    console.log('Project result:', projectResult);
    
    if (!projectResult.success || !projectResult.data) {
      console.error('Project not found:', projectId);
      return NextResponse.json(
        { success: false, error: 'Project not found', data: null },
        { status: 404 }
      );
    }

    const project = projectResult.data;
    const projectNumber = project.project_number;
    
    console.log('Project number:', projectNumber);

    if (!projectNumber) {
      console.error('Project has no project_number:', project);
      return NextResponse.json(
        { success: false, error: 'Project does not have a project_number', data: null },
        { status: 400 }
      );
    }

    // Generate item code: FG-00215-D01-D
    const itemCode = `${body.itemType}-${projectNumber}-${body.itemProductCode}-${body.itemUnit}`;

    // Create item
    const result = await createProjectItem({
      projectId: projectId,
      itemCode: itemCode,
      itemType: body.itemType,
      itemProductCode: body.itemProductCode,
      itemUnit: body.itemUnit
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, data: null },
        { status: 500 }
      );
    }

    // แจ้งเตือน admin เมื่อมี item code ใหม่
    try {
      await createNewItemCodeNotification(
        projectId,
        itemCode,
        body.itemType
      );
    } catch (notificationError) {
      console.warn('Failed to create item code notification:', notificationError);
      // ไม่ throw error เพื่อไม่ให้การสร้าง item ล้มเหลว
    }

    const response = NextResponse.json({
      success: true,
      data: result.data,
      error: null
    });
    // Log create item code
    await logApiCall(request, 'create', 'item_code', result.data?.id || itemCode, {
      project_id: projectId,
      item_code: itemCode,
      item_type: body.itemType,
      item_product_code: body.itemProductCode,
      item_unit: body.itemUnit
    }, 'success', null);
    return response;

  } catch (error) {
    console.error('Error creating project item:', error);
    await logError(error, { action: 'create', entityType: 'item_code' }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error', data: null },
      { status: 500 }
    );
  }
}

