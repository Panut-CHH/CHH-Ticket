import { NextResponse } from 'next/server';
import { deleteProjectItem, getProjectItemById, updateProjectItem } from '@/utils/projectItemsDb';
import { getProjectById } from '@/utils/projectDb';
import { supabaseServer } from '@/utils/supabaseServer';
import { logApiCall, logError } from '@/utils/activityLogger';

/**
 * GET /api/projects/items/[itemId]/preview-update
 * ตรวจสอบผลกระทบจากการอัปเดต item_code
 */
export async function GET(request, ctx) {
  try {
    const { itemId } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const newItemType = searchParams.get('itemType');
    const newItemProductCode = searchParams.get('itemProductCode');
    const newItemUnit = searchParams.get('itemUnit');

    // ถ้ามี query params แสดงว่าเป็นการ preview update
    if (newItemType && newItemProductCode && newItemUnit) {
      // ดึงข้อมูล item เดิม
      const oldItemResult = await getProjectItemById(itemId);
      if (!oldItemResult.success || !oldItemResult.data) {
        return NextResponse.json(
          { success: false, error: 'Item not found' },
          { status: 404 }
        );
      }

      const oldItem = oldItemResult.data;
      const oldItemCode = oldItem.item_code;

      // ดึงข้อมูล project เพื่อได้ project_number
      const projectResult = await getProjectById(oldItem.project_id);
      if (!projectResult.success || !projectResult.data) {
        return NextResponse.json(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      }

      const project = projectResult.data;
      const projectNumber = project.project_number;

      if (!projectNumber) {
        return NextResponse.json(
          { success: false, error: 'Project does not have a project_number' },
          { status: 400 }
        );
      }

      // สร้าง item_code ใหม่
      const newItemCode = `${newItemType}-${projectNumber}-${newItemProductCode}-${newItemUnit}`;

      // ตรวจสอบว่ามี tickets ที่อ้างอิง item_code เดิมหรือไม่
      let affectedTicketsCount = 0;
      if (oldItemCode && oldItemCode !== newItemCode) {
        const { count, error: ticketsError } = await supabaseServer
          .from('ticket')
          .select('no', { count: 'exact', head: true })
          .eq('source_no', oldItemCode);

        if (!ticketsError && count !== null) {
          affectedTicketsCount = count;
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          oldItemCode,
          newItemCode,
          affectedTicketsCount,
          willChange: oldItemCode !== newItemCode
        }
      });
    }

    // ถ้าไม่มี query params ให้ดึงข้อมูล item ปกติ
    const itemResult = await getProjectItemById(itemId);
    if (!itemResult.success) {
      return NextResponse.json(
        { success: false, error: itemResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: itemResult.data
    });

  } catch (error) {
    console.error('Error in GET project item:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/items/[itemId]
 * อัปเดต Item Code (รวมถึง product code และ item_code)
 */
export async function PUT(request, ctx) {
  try {
    const { itemId } = await ctx.params;
    const body = await request.json();

    // Validate input
    if (!body.itemType || !body.itemProductCode || !body.itemUnit) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields (itemType, itemProductCode, itemUnit)' },
        { status: 400 }
      );
    }

    // ดึงข้อมูล item เดิม
    const oldItemResult = await getProjectItemById(itemId);
    if (!oldItemResult.success || !oldItemResult.data) {
      return NextResponse.json(
        { success: false, error: 'Item not found' },
        { status: 404 }
      );
    }

    const oldItem = oldItemResult.data;
    const oldItemCode = oldItem.item_code;

    // ดึงข้อมูล project เพื่อได้ project_number
    const projectResult = await getProjectById(oldItem.project_id);
    if (!projectResult.success || !projectResult.data) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const project = projectResult.data;
    const projectNumber = project.project_number;

    if (!projectNumber) {
      return NextResponse.json(
        { success: false, error: 'Project does not have a project_number' },
        { status: 400 }
      );
    }

    // สร้าง item_code ใหม่
    const newItemCode = `${body.itemType}-${projectNumber}-${body.itemProductCode}-${body.itemUnit}`;

    // ตรวจสอบว่ามี tickets หรือ records อื่นๆ ที่อ้างอิง item_code เดิมหรือไม่
    let affectedTickets = [];
    if (oldItemCode && oldItemCode !== newItemCode) {
      // ค้นหา tickets ที่ใช้ item_code เดิม (source_no = oldItemCode)
      const { data: tickets, error: ticketsError } = await supabaseServer
        .from('ticket')
        .select('no, source_no')
        .eq('source_no', oldItemCode);

      if (!ticketsError && tickets && tickets.length > 0) {
        affectedTickets = tickets.map(t => t.no);
      }
    }

    // อัปเดต item code
    const updateResult = await updateProjectItem(itemId, {
      itemCode: newItemCode,
      itemType: body.itemType,
      itemProductCode: body.itemProductCode,
      itemUnit: body.itemUnit
    });

    if (!updateResult.success) {
      return NextResponse.json(
        { success: false, error: updateResult.error },
        { status: 500 }
      );
    }

    // อัปเดต tickets ที่เกี่ยวข้อง (ถ้า item_code เปลี่ยน)
    let updatedTicketsCount = 0;
    if (oldItemCode && oldItemCode !== newItemCode && affectedTickets.length > 0) {
      const { data: updatedTickets, error: updateTicketsError } = await supabaseServer
        .from('ticket')
        .update({ source_no: newItemCode })
        .eq('source_no', oldItemCode)
        .select('no');

      if (!updateTicketsError && updatedTickets) {
        updatedTicketsCount = updatedTickets.length;
      } else if (updateTicketsError) {
        console.warn('Failed to update tickets:', updateTicketsError);
        // ไม่ return error เพราะ item code ถูกอัปเดตแล้ว
      }
    }

    const response = NextResponse.json({
      success: true,
      data: {
        ...updateResult.data,
        oldItemCode,
        newItemCode,
        ticketsUpdated: updatedTicketsCount
      },
      error: null
    });

    // Log update item code
    await logApiCall(request, 'update', 'item_code', itemId, {
      old_item_code: oldItemCode,
      new_item_code: newItemCode,
      tickets_updated: updatedTicketsCount
    }, 'success', null);

    return response;

  } catch (error) {
    console.error('Error updating project item:', error);
    await logError(error, { action: 'update', entityType: 'item_code', entityId: (await ctx.params)?.itemId }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/items/[itemId]
 * ลบ Item Code (Subfolder) พร้อมไฟล์ทั้งหมด
 */
export async function DELETE(request, ctx) {
  try {
    const { itemId } = await ctx.params;

    // ดึงรายการไฟล์ก่อนลบ เพื่อลบจาก Storage
    const { data: files, error: fetchError } = await supabaseServer
      .from('project_files')
      .select('file_path')
      .eq('project_item_id', itemId);

    if (!fetchError && files && files.length > 0) {
      // ลบไฟล์ทั้งหมดจาก Storage
      const filePaths = files.map(f => f.file_path).filter(p => p);
      
      if (filePaths.length > 0) {
        const { error: storageError } = await supabaseServer.storage
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

