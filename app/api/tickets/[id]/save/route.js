import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logApiCall, logError } from '@/utils/activityLogger';
import { createTicketAssignmentNotification } from '@/utils/notificationManager';

// สร้าง Supabase client ที่ใช้ session ของผู้ใช้ (รองรับทั้ง Cookie และ Authorization header)
async function createSupabaseClient(request) {
  const cookieStore = cookies();

  // อ่าน Bearer token จาก Authorization header ถ้ามี
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      // ใส่ token ลงใน global headers เพื่อให้ RLS ใช้ JWT ของผู้ใช้
      global: bearerToken
        ? { headers: { Authorization: `Bearer ${bearerToken}` } }
        : undefined,
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

// Station name mapping - ต้องตรงกับชื่อใน database
const stationMapping = {
  "ประกอบโครง": "27e36a35-f4ef-4982-83b1-8bdd1802e108",
  "ใสไม้ให้ได้ขนาด": "a810f1b9-1edd-42f4-9ecd-7297c7b077b9",
  "QC": "14acc6a7-4f12-4809-8799-6d0885fb8b48",
  "อัดบาน": "75b17fd6-9956-40c5-bdcd-4c379aabed06",
  "CNC": "417afd0c-4be8-491b-b64f-280cae8ebaef",
  "สี": "dd2176de-4d33-4bc9-ac32-5b9f55f3a7cf",
  "Packing": "647c5f96-ddb9-46c3-b4d4-97bb17bf3d96",
};

// Fallback: ถ้าไม่มีใน mapping ให้ดึง station_id จาก database
async function getStationId(stationName, supabase) {
  // ลองหาจาก mapping ก่อน
  if (stationMapping[stationName]) {
    return stationMapping[stationName];
  }
  
  // ถ้าไม่มี ค้นหาจาก database
  console.log('[API SAVE] Station not in mapping, searching database for:', stationName);
  const { data, error } = await supabase
    .from('stations')
    .select('id')
    .eq('name_th', stationName)
    .single();
  
  if (error || !data) {
    console.error('[API SAVE] Station not found in database:', stationName, error);
    return null;
  }
  
  console.log('[API SAVE] Found station in database:', stationName, '→', data.id);
  return data.id;
}

export async function POST(request, { params }) {
  try {
    const { id: ticketId } = params;
    const body = await request.json();
    const { priority, customerName, stations, ticketView } = body;

    console.log('[API SAVE] Received request for ticket:', ticketId);
    console.log('[API SAVE] Stations received:', stations?.length, 'stations');
    console.log('[API SAVE] Station details:', stations?.map(s => ({ name: s.name, technician: s.technician })));

    // สร้าง Supabase client ที่ใช้ session ของผู้ใช้จาก Bearer token หรือ Cookie
    const supabase = await createSupabaseClient(request);

    // ตรวจสอบว่า user login และมีสิทธิ์หรือไม่
    // ถ้ามี Bearer token ให้ใช้ตรวจสอบโดยตรงเพื่อกันกรณีไม่มีคุกกี้
    let user = null;
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : null;

    if (bearerToken) {
      const { data: userData } = await supabase.auth.getUser(bearerToken);
      user = userData?.user ?? null;
    } else {
      const { data: userData } = await supabase.auth.getUser();
      user = userData?.user ?? null;
    }
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Please login' },
        { status: 401 }
      );
    }

    // ตรวจสอบ role
    const { data: userRecord } = await supabase
      .from('users')
      .select('role, roles')
      .eq('id', user.id)
      .single();

    // Support both old format (role) and new format (roles)
    const userRoles = userRecord?.roles || (userRecord?.role ? [userRecord.role] : []);
    const hasAdminRole = userRoles.some(r => r === 'Admin' || r === 'SuperAdmin');
    
    if (!userRecord || !hasAdminRole) {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin/SuperAdmin only' },
        { status: 403 }
      );
    }

    // 1. Upsert ข้อมูลตั๋วหลัก (RLS Policy จะเช็คสิทธิ์อัตโนมัติ)
    
    // ถ้าไม่มี project_id แต่มี source_no → ค้นหา project_id จาก item_code
    let finalProjectId = ticketView?.projectId || null;
    if (!finalProjectId && ticketView?.itemCode) {
      try {
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('id')
          .eq('item_code', ticketView.itemCode)
          .single();

        if (!projectError && project) {
          finalProjectId = project.id;
          console.log(`[API SAVE] Auto-linked ticket ${ticketId} to project ${project.id} via itemCode ${ticketView.itemCode}`);
        } else {
          console.warn(`[API SAVE] No project found for itemCode ${ticketView.itemCode} in ticket ${ticketId}`);
        }
      } catch (linkError) {
        console.warn(`[API SAVE] Error linking ticket ${ticketId} to project via itemCode ${ticketView.itemCode}:`, linkError);
      }
    }

    const { error: ticketError } = await supabase
      .from('ticket')
      .upsert({
        no: ticketId,
        project_id: finalProjectId,
        priority: priority === "High Priority" ? "High" : priority === "Low Priority" ? "Low" : "Medium",
        customer_name: customerName || "",
        source_no: ticketView?.itemCode || null,
        quantity: ticketView?.quantity || 0,
        due_date: ticketView?.dueDate || null,
        description: ticketView?.description || null,
        description_2: ticketView?.description2 || null,
      }, {
        onConflict: 'no'
      });

    if (ticketError) {
      console.error('Error saving ticket:', ticketError);
      return NextResponse.json(
        { success: false, error: ticketError.message },
        { status: 500 }
      );
    }

    // 2. โหลด station flow เดิมเพื่อเก็บ status และ completed_at ไว้
    const { data: existingFlows } = await supabase
      .from('ticket_station_flow')
      .select('*')
      .eq('ticket_no', ticketId);

    // สร้าง map ของ flows เดิมตาม station_id + step_order เพื่อให้แต่ละ step มี status แยกกัน
    const existingFlowMap = {};
    (existingFlows || []).forEach(flow => {
      const key = `${flow.station_id}_${flow.step_order}`;
      existingFlowMap[key] = {
        status: flow.status,
        completed_at: flow.completed_at
      };
    });

    console.log('[SAVE] Existing flows to preserve by station_id + step_order:', existingFlowMap);

    // 3. ลบ station flow เดิม
    await supabase
      .from('ticket_station_flow')
      .delete()
      .eq('ticket_no', ticketId);

    // 4. ลบ assignments เดิม
    await supabase
      .from('ticket_assignments')
      .delete()
      .eq('ticket_no', ticketId);

    // 5. เพิ่ม station flow และ assignments ใหม่ (เก็บ status เดิมไว้)
    console.log('[API SAVE] Processing', stations.length, 'stations...');
    
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      console.log(`[API SAVE] Processing station ${i + 1}:`, station.name);
      
      const stationId = await getStationId(station.name, supabase);
      
      if (!stationId) {
        console.warn(`[API SAVE] Station ${station.name} not found in mapping or database, skipping`);
        continue;
      }

      // เก็บ status และ completed_at จาก flow เดิม (ถ้ามี) - ใช้ station_id + step_order เป็น key
      const flowKey = `${stationId}_${i + 1}`;
      const existingFlow = existingFlowMap[flowKey];
      const preservedStatus = existingFlow?.status || 'pending';
      const preservedCompletedAt = existingFlow?.completed_at || null;

      // Parse completion time to ISO (nullable) - ถ้าไม่มีใน existing ให้ใช้จาก form
      let completedAt = preservedCompletedAt;
      if (!completedAt && station.completionTime && String(station.completionTime).trim() !== '') {
        try {
          const dt = new Date(station.completionTime);
          if (!isNaN(dt.getTime())) {
            completedAt = dt.toISOString();
          }
        } catch {}
      }

      console.log(`[API SAVE] Station ${station.name} (${stationId}) step ${i + 1}: preserving status=${preservedStatus}, completed_at=${completedAt}`);

      const flowData = {
        ticket_no: ticketId,
        station_id: stationId,
        step_order: i + 1,
        status: preservedStatus,
        price_type: station.priceType || 'flat',
        price: station.price || 0,
        completed_at: completedAt,
      };

      console.log(`[API SAVE] Inserting flow data:`, flowData);

      const { data: insertedFlow, error: flowError } = await supabase
        .from('ticket_station_flow')
        .insert(flowData)
        .select();

      if (flowError) {
        console.error(`[API SAVE] Error saving station flow for ${station.name}:`, flowError);
      } else {
        console.log(`[API SAVE] Successfully inserted flow for ${station.name}:`, insertedFlow);
      }

      // เพิ่ม assignment ถ้ามีการมอบหมายช่าง
      if (station.name !== "QC") {
        let technicianId = station.technicianId || null;

        // ถ้าไม่ได้ส่ง technicianId มา แต่ส่งชื่อมา ให้ค้นหาจากชื่อเพื่อความเข้ากันได้ย้อนหลัง
        if (!technicianId && station.technician) {
          const { data: techData } = await supabase
            .from('users')
            .select('id')
            .eq('name', station.technician)
            .or('roles.ov.{Production,Painting,Packing},role.in.(Production,Painting,Packing)')
            .single();
          technicianId = techData?.id || null;
        }

        if (technicianId) {
          const assignmentResult = await supabase
            .from('ticket_assignments')
            .insert({
              ticket_no: ticketId,
              station_id: stationId,
              step_order: i + 1, // เพิ่ม step_order เพื่อให้แต่ละ step แยกกัน
              technician_id: technicianId,
              assignment_type: 'primary',
              status: 'assigned',
              assigned_by: user.id,
            })
            .select()
            .single();

          // แจ้งเตือนช่างเมื่อได้รับมอบหมาย
          if (assignmentResult.data && !assignmentResult.error) {
            // ดึงชื่อสถานี
            const { data: stationData } = await supabase
              .from('stations')
              .select('name_th')
              .eq('id', stationId)
              .single();
            
            await createTicketAssignmentNotification(
              ticketId,
              technicianId,
              stationData?.name_th || station.name,
              user.id
            );
          }
        }
      }
    }

    // Log successful ticket update
    await logApiCall(request, 'update', 'ticket', ticketId, {
      ticket_no: ticketId,
      stations_count: stations?.length || 0,
      priority
    }, 'success', null, user ? { id: user.id, email: user.email, name: user.user_metadata?.full_name || user.email?.split("@")[0] } : null);

    return NextResponse.json({
      success: true,
      message: 'Ticket saved successfully'
    });

  } catch (error) {
    console.error('Error in save ticket API:', error);
    const { id: ticketId } = params || {};
    await logError(error, {
      action: 'update',
      entityType: 'ticket',
      entityId: ticketId
    }, request);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

