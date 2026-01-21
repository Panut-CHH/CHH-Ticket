import { NextResponse } from 'next/server';
import { getAllProjectItems, createProjectItem } from '@/utils/projectItemsDb';
import { getProjectById } from '@/utils/projectDb';
import { createNewItemCodeNotification } from '@/utils/notificationManager';
import { logApiCall, logError } from '@/utils/activityLogger';
import { supabaseServer } from '@/utils/supabaseServer';

// Station name mapping - ต้องตรงกับชื่อใน database
const stationMapping = {
  "ประกอบโครง": "27e36a35-f4ef-4982-83b1-8bdd1802e108",
  "ใสไม้ให้ได้ขนาด": "a810f1b9-1edd-42f4-9ecd-7297c7b077b9",
  "QC": "14acc6a7-4f12-4809-8799-6d0885fb8b48",
  "ปรับขนาด": "75b17fd6-9956-40c5-bdcd-4c379aabed06",
  "อัดบาน": "75b17fd6-9956-40c5-bdcd-4c379aabed06", // เก็บไว้เพื่อ backward compatibility
  "CNC": "417afd0c-4be8-491b-b64f-280cae8ebaef",
  "สี": "dd2176de-4d33-4bc9-ac32-5b9f55f3a7cf",
  "Packing": "647c5f96-ddb9-46c3-b4d4-97bb17bf3d96",
};

/**
 * Get default roadmap steps based on item unit
 * @param {string} itemUnit - Item unit code (D, F, S, etc.)
 * @returns {string[]} Array of station names in order
 */
function getDefaultRoadmapSteps(itemUnit) {
  const unit = String(itemUnit).toUpperCase().trim();
  
  switch (unit) {
    case 'D': // D-ประตู
      return [
        "ประกอบโครง",
        "QC",
        "ปรับขนาด",
        "QC",
        "CNC",
        "QC",
        "สี",
        "QC",
        "Packing"
      ];
    
    case 'F': // F-วงกบ
      return [
        "ตัดบาน",
        "QC",
        "ประกอบโครง",
        "QC",
        "Packing"
      ];
    
    case 'S': // S-ชุดชาร์ป
      return [
        "ประกอบโครง",
        "QC",
        "ปรับขนาด",
        "QC",
        "CNC",
        "QC",
        "สี",
        "QC",
        "ประกอบชุดชาร์ป",
        "QC",
        "Packing"
      ];
    
    default:
      console.warn(`[ROADMAP] Unknown item unit: ${itemUnit}, returning empty roadmap`);
      return [];
  }
}

/**
 * Get station ID from station name
 * @param {string} stationName - Station name in Thai
 * @param {object} supabase - Supabase client
 * @returns {Promise<string|null>} Station ID or null if not found
 */
async function getStationId(stationName, supabase) {
  // ลองหาจาก mapping ก่อน
  if (stationMapping[stationName]) {
    return stationMapping[stationName];
  }
  
  // ถ้าไม่มี ค้นหาจาก database
  console.log('[ROADMAP] Station not in mapping, searching database for:', stationName);
  const { data, error } = await supabase
    .from('stations')
    .select('id')
    .eq('name_th', stationName)
    .single();
  
  if (error || !data) {
    console.error('[ROADMAP] Station not found in database:', stationName, error);
    return null;
  }
  
  console.log('[ROADMAP] Found station in database:', stationName, '→', data.id);
  return data.id;
}

/**
 * Create ticket flows for a ticket
 * @param {string} ticketNo - Ticket number
 * @param {string[]} steps - Array of station names
 * @param {object} supabase - Supabase client
 * @returns {Promise<{success: boolean, created: number, errors: string[]}>}
 */
async function createTicketFlows(ticketNo, steps, supabase) {
  // ตรวจสอบว่ามี flows อยู่แล้วหรือไม่
  const { data: existingFlows, error: checkError } = await supabase
    .from('ticket_station_flow')
    .select('id')
    .eq('ticket_no', ticketNo)
    .limit(1);
  
  if (checkError) {
    console.error(`[ROADMAP] Error checking existing flows for ticket ${ticketNo}:`, checkError);
    return { success: false, created: 0, errors: [checkError.message] };
  }
  
  if (existingFlows && existingFlows.length > 0) {
    console.log(`[ROADMAP] Ticket ${ticketNo} already has flows, skipping`);
    return { success: true, created: 0, errors: [] };
  }
  
  // สร้าง flows ใหม่
  const flowsToInsert = [];
  const errors = [];
  
  for (let i = 0; i < steps.length; i++) {
    const stationName = steps[i];
    const stationId = await getStationId(stationName, supabase);
    
    if (!stationId) {
      const errorMsg = `Station "${stationName}" not found`;
      console.warn(`[ROADMAP] ${errorMsg} for ticket ${ticketNo}`);
      errors.push(errorMsg);
      continue; // Skip this step but continue with others
    }
    
    flowsToInsert.push({
      ticket_no: ticketNo,
      station_id: stationId,
      step_order: i + 1,
      status: 'pending',
      price_type: 'flat',
      price: 0
    });
  }
  
  if (flowsToInsert.length === 0) {
    console.warn(`[ROADMAP] No valid flows to create for ticket ${ticketNo}`);
    return { success: false, created: 0, errors };
  }
  
  // Insert flows
  const { data: insertedFlows, error: insertError } = await supabase
    .from('ticket_station_flow')
    .insert(flowsToInsert)
    .select();
  
  if (insertError) {
    console.error(`[ROADMAP] Error creating flows for ticket ${ticketNo}:`, insertError);
    return { success: false, created: 0, errors: [insertError.message, ...errors] };
  }
  
  console.log(`[ROADMAP] Created ${insertedFlows?.length || 0} flows for ticket ${ticketNo}`);
  return { 
    success: true, 
    created: insertedFlows?.length || 0, 
    errors 
  };
}

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

    // สร้าง default roadmap สำหรับ tickets ที่ใช้ item code นี้
    try {
      console.log(`[ROADMAP] Creating default roadmap for item code: ${itemCode}, unit: ${body.itemUnit}`);
      
      // ค้นหา tickets ที่มี source_no = item_code
      const { data: tickets, error: ticketsError } = await supabaseServer
        .from('ticket')
        .select('no')
        .eq('source_no', itemCode);
      
      if (ticketsError) {
        console.warn(`[ROADMAP] Error finding tickets for item code ${itemCode}:`, ticketsError);
      } else if (tickets && tickets.length > 0) {
        console.log(`[ROADMAP] Found ${tickets.length} ticket(s) for item code ${itemCode}`);
        
        // ดึง default roadmap steps ตาม item_unit
        const roadmapSteps = getDefaultRoadmapSteps(body.itemUnit);
        
        if (roadmapSteps.length === 0) {
          console.warn(`[ROADMAP] No roadmap steps defined for item unit: ${body.itemUnit}`);
        } else {
          // สร้าง flows สำหรับแต่ละ ticket
          let totalCreated = 0;
          let totalErrors = 0;
          
          for (const ticket of tickets) {
            const flowResult = await createTicketFlows(ticket.no, roadmapSteps, supabaseServer);
            
            if (flowResult.success) {
              totalCreated += flowResult.created;
              if (flowResult.errors.length > 0) {
                console.warn(`[ROADMAP] Warnings for ticket ${ticket.no}:`, flowResult.errors);
              }
            } else {
              totalErrors++;
              console.error(`[ROADMAP] Failed to create flows for ticket ${ticket.no}:`, flowResult.errors);
            }
          }
          
          console.log(`[ROADMAP] Roadmap creation summary: ${totalCreated} flows created, ${totalErrors} tickets failed`);
        }
      } else {
        console.log(`[ROADMAP] No tickets found for item code ${itemCode} (this is normal for new item codes)`);
      }
    } catch (roadmapError) {
      // Log error but don't fail the item code creation
      console.error('[ROADMAP] Error creating default roadmap:', roadmapError);
      console.warn('[ROADMAP] Item code was created successfully, but roadmap creation failed');
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

