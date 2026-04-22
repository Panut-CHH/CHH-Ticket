import { NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServer';
import { logApiCall, logError } from '@/utils/activityLogger';

/**
 * GET /api/projects/pending-files
 * ดึงรายการ item (FG/RM/WP/EX) ที่ยังไม่มีไฟล์แบบ
 * แยกตามโปรเจ็ค
 */
export async function GET(request) {
  try {
    // ดึง project_items ทั้งหมด (pagination ป้องกันลิมิต 1000 ของ Supabase)
    const items = [];
    {
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data: page, error: itemsError } = await supabaseServer
          .from('project_items')
          .select(`
            id,
            item_code,
            item_type,
            item_product_code,
            item_unit,
            project_id,
            created_at,
            project:projects!inner(
              id,
              project_number,
              project_name
            )
          `)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);

        if (itemsError) {
          console.error('Error fetching project items:', itemsError);
          return NextResponse.json(
            { success: false, error: itemsError.message, data: [] },
            { status: 500 }
          );
        }

        if (page && page.length > 0) {
          items.push(...page);
          hasMore = page.length === pageSize;
          from += pageSize;
        } else {
          hasMore = false;
        }
      }
    }

    // ดึง project_item_id ที่มีไฟล์ — filter เฉพาะ items ของเรา + pagination
    // (Supabase default limit = 1000 row ต่อ query)
    const allItemIds = (items || []).map(i => i.id);
    const itemsWithFiles = new Set();

    if (allItemIds.length > 0) {
      const idChunkSize = 500;
      for (let i = 0; i < allItemIds.length; i += idChunkSize) {
        const chunk = allItemIds.slice(i, i + idChunkSize);

        let from = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data: filesPage, error: filesError } = await supabaseServer
            .from('project_files')
            .select('project_item_id, id')
            .in('project_item_id', chunk)
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);

          if (filesError) {
            console.error('Error fetching project files:', filesError);
            return NextResponse.json(
              { success: false, error: filesError.message, data: [] },
              { status: 500 }
            );
          }

          for (const f of filesPage || []) {
            if (f.project_item_id) itemsWithFiles.add(f.project_item_id);
          }

          hasMore = (filesPage?.length || 0) === pageSize;
          from += pageSize;
        }
      }
    }

    const pendingItems = (items || []).filter(i => !itemsWithFiles.has(i.id));

    // ดึง ticket ที่ source_no ตรงกับ item_code ของ pending items (ใช้ map เพื่อ O(1) lookup)
    const pendingItemCodes = pendingItems.map(i => i.item_code).filter(Boolean);
    const ticketsByItemCode = new Map();
    const allTicketNos = [];

    if (pendingItemCodes.length > 0) {
      // Chunk เผื่อเกินลิมิต .in()
      const chunkSize = 500;
      for (let i = 0; i < pendingItemCodes.length; i += chunkSize) {
        const chunk = pendingItemCodes.slice(i, i + chunkSize);
        const { data: tickets, error: ticketsError } = await supabaseServer
          .from('ticket')
          .select('no, source_no')
          .in('source_no', chunk);

        if (ticketsError) {
          console.warn('Error fetching tickets:', ticketsError);
          continue;
        }

        for (const tk of tickets || []) {
          if (!tk.source_no) continue;
          if (!ticketsByItemCode.has(tk.source_no)) {
            ticketsByItemCode.set(tk.source_no, []);
          }
          ticketsByItemCode.get(tk.source_no).push(tk.no);
          if (tk.no) allTicketNos.push(tk.no);
        }
      }
    }

    // ดึง roadmap flow ของ ticket เหล่านั้น เพื่อดูว่าสร้าง roadmap แล้วหรือยัง
    const ticketNosWithFlow = new Set();
    if (allTicketNos.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < allTicketNos.length; i += chunkSize) {
        const chunk = allTicketNos.slice(i, i + chunkSize);
        const { data: flows, error: flowError } = await supabaseServer
          .from('ticket_station_flow')
          .select('ticket_no')
          .in('ticket_no', chunk);

        if (flowError) {
          console.warn('Error fetching ticket_station_flow:', flowError);
          continue;
        }

        for (const fl of flows || []) {
          if (fl.ticket_no) ticketNosWithFlow.add(fl.ticket_no);
        }
      }
    }

    // จัดกลุ่มตามโปรเจ็ค พร้อม flag urgent
    const projectMap = new Map();
    for (const item of pendingItems) {
      const projectId = item.project_id;
      const ticketNos = ticketsByItemCode.get(item.item_code) || [];
      const hasErpMapping = ticketNos.length > 0;
      const hasRoadmap = ticketNos.some(no => ticketNosWithFlow.has(no));
      const isUrgent = hasErpMapping && hasRoadmap;

      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, {
          projectId,
          projectNumber: item.project?.project_number || null,
          projectName: item.project?.project_name || null,
          items: [],
          urgentCount: 0
        });
      }
      const group = projectMap.get(projectId);
      group.items.push({
        id: item.id,
        itemCode: item.item_code,
        itemType: item.item_type,
        itemProductCode: item.item_product_code,
        itemUnit: item.item_unit,
        createdAt: item.created_at,
        hasErpMapping,
        hasRoadmap,
        isUrgent,
        ticketNos
      });
      if (isUrgent) group.urgentCount += 1;
    }

    // ภายในกลุ่ม — item ที่ urgent ขึ้นก่อน
    for (const group of projectMap.values()) {
      group.items.sort((a, b) => {
        if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
        return (a.itemCode || '').localeCompare(b.itemCode || '');
      });
    }

    // เรียงโปรเจ็คตาม urgentCount (มากสุดก่อน) แล้วตาม projectNumber
    const groups = Array.from(projectMap.values()).sort((a, b) => {
      if (a.urgentCount !== b.urgentCount) return b.urgentCount - a.urgentCount;
      const na = (a.projectNumber ?? '').toString().trim();
      const nb = (b.projectNumber ?? '').toString().trim();
      return nb.localeCompare(na, undefined, { numeric: true });
    });

    const totalUrgent = groups.reduce((acc, g) => acc + (g.urgentCount || 0), 0);

    await logApiCall(
      request,
      'read',
      'pending_files',
      null,
      { groups: groups.length, items: pendingItems.length },
      'success',
      null
    );

    return NextResponse.json({
      success: true,
      data: {
        groups,
        totalItems: pendingItems.length,
        totalProjects: groups.length,
        totalUrgent
      },
      error: null
    });
  } catch (error) {
    console.error('Error in pending-files endpoint:', error);
    await logError(error, { action: 'read', entityType: 'pending_files' }, request);
    return NextResponse.json(
      { success: false, error: 'Internal server error', data: { groups: [], totalItems: 0, totalProjects: 0 } },
      { status: 500 }
    );
  }
}
