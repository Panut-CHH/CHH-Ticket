import { NextResponse } from 'next/server';
import { getAllProjectItems, createProjectItem } from '@/utils/projectItemsDb';
import { getProjectById } from '@/utils/projectDb';

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

    return NextResponse.json({
      success: true,
      data: result.data,
      error: null
    });

  } catch (error) {
    console.error('Error fetching project items:', error);
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

    return NextResponse.json({
      success: true,
      data: result.data,
      error: null
    });

  } catch (error) {
    console.error('Error creating project item:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', data: null },
      { status: 500 }
    );
  }
}

