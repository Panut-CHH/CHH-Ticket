import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { calculatePassRate, completeQCStation } from "@/utils/qcWorkflow";
import { logApiCall, logError } from "@/utils/activityLogger";

async function createSupabaseClient(request) {
  const cookieStore = cookies();
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: bearerToken ? { headers: { Authorization: `Bearer ${bearerToken}` } } : undefined,
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

const FORM_TYPES = ["cut_edge", "shoot_frame", "press_glue", "main_qc"];

// GET /api/tickets/[id]/qc - โหลดประวัติ QC sessions
export async function GET(request, context) {
  try {
    const params = await context.params;
    const ticketNo = params?.id;

    if (!ticketNo) {
      return NextResponse.json({ error: "Missing ticket number" }, { status: 400 });
    }

    const admin = supabaseServer;

    // ดึงประวัติ QC sessions พร้อม rows
    const { data: sessions, error } = await admin
      .from("qc_sessions")
      .select(`
        id,
        ticket_no,
        form_type,
        station,
        machine_no,
        inspector,
        inspected_date,
        remark,
        created_at,
        qc_rows (
          id,
          time_text,
          project,
          production_no,
          technician,
          sample_qty,
          actual_qty,
          width_mm,
          height_mm,
          thickness_mm,
          angle_ok,
          cut_quality,
          frame_thick_upright,
          frame_thick_horizontal,
          lock_block_thick,
          press_force,
          temperature_c,
          glue_type,
          pass,
          note
        )
      `)
      .eq("ticket_no", ticketNo)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading QC history:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const response = NextResponse.json({
      success: true,
      data: {
        sessions: sessions || [],
      },
    });
    await logApiCall(request, 'read', 'qc_sessions', ticketNo, { count: sessions?.length || 0 }, 'success', null);
    return response;
  } catch (error) {
    console.error("GET /api/tickets/[id]/qc error:", error);
    await logError(error, { action: 'read', entityType: 'qc_sessions', entityId: (await context.params)?.id }, request);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/tickets/[id]/qc - บันทึก QC session ใหม่
export async function POST(request, context) {
  console.log('=== QC API POST Handler Called ===');
  console.log('Request URL:', request.url);
  console.log('Request Method:', request.method);
  
  try {
    const params = await context.params;
    const ticketNo = params?.id;
    const body = await request.json();

    if (!ticketNo) {
      return NextResponse.json({ error: "Missing ticket number" }, { status: 400 });
    }

    const { formType, header, rows, categories, passQuantity: bodyPassQty, failQuantity: bodyFailQty, qc_task_uuid: bodyQcTaskUuid } = body;

    // Debug logging
    console.log('=== QC API Debug ===');
    console.log('Ticket No:', ticketNo);
    console.log('Form Type:', formType);
    console.log('Header:', header);
    console.log('Rows:', rows);
    console.log('Categories:', categories);

    // Validate form type
    if (!FORM_TYPES.includes(formType)) {
      return NextResponse.json({ error: "Invalid form type" }, { status: 400 });
    }

    const admin = supabaseServer;

    // Resolve qc_task_uuid: prefer from body, otherwise map active QC task for this ticket
    let resolvedQcTaskUuid = bodyQcTaskUuid || null;
    if (!resolvedQcTaskUuid) {
      try {
        // Prefer the current QC step; if none, take the first pending QC step
        const { data: flows } = await admin
          .from('ticket_station_flow')
          .select('qc_task_uuid, status')
          .eq('ticket_no', ticketNo)
          .not('qc_task_uuid', 'is', null)
          .order('step_order', { ascending: true });
        if (Array.isArray(flows) && flows.length > 0) {
          const current = flows.find(f => f.status === 'current');
          const pending = flows.find(f => f.status === 'pending');
          resolvedQcTaskUuid = current?.qc_task_uuid || pending?.qc_task_uuid || flows[0]?.qc_task_uuid || null;
        }
      } catch (e) {
        console.warn('Failed to resolve qc_task_uuid, proceeding without it:', e?.message);
      }
    }

    // Resolve station snapshot from qc_task_uuid for accurate historical linkage
    let stationSnapshot = { station_id: null, step_order: null };
    let previousStationInfo = { station_id: null, station_name: null };
    if (resolvedQcTaskUuid) {
      try {
        // ดึงข้อมูล flow ทั้งหมดเพื่อหาสถานีก่อน QC
        const { data: flows } = await admin
          .from('ticket_station_flow')
          .select('station_id, step_order, qc_task_uuid, stations(name_th, code)')
          .eq('ticket_no', ticketNo)
          .order('step_order', { ascending: true });
        
        // หา flow ที่เป็น QC (ตรงกับ qc_task_uuid)
        const qcFlowIndex = flows?.findIndex(f => f.qc_task_uuid === resolvedQcTaskUuid) ?? -1;
        
        if (qcFlowIndex > 0 && flows && flows[qcFlowIndex - 1]) {
          // สถานีก่อน QC คือ flow ก่อนหน้า (step_order - 1)
          const previousFlow = flows[qcFlowIndex - 1];
          previousStationInfo = {
            station_id: previousFlow.station_id || null,
            station_name: previousFlow.stations?.name_th || previousFlow.stations?.code || null
          };
        }
        
        // ดึงข้อมูล flow ที่เป็น QC
        const { data: flowRow } = await admin
          .from('ticket_station_flow')
          .select('station_id, step_order')
          .eq('ticket_no', ticketNo)
          .eq('qc_task_uuid', resolvedQcTaskUuid)
          .maybeSingle();
        if (flowRow) {
          stationSnapshot = {
            station_id: flowRow.station_id || null,
            step_order: flowRow.step_order ?? null
          };
        }
      } catch (e) {
        console.warn('Failed to get station snapshot:', e?.message);
      }
    }
    
    // ดึงข้อมูล user จาก session (จาก cookies)
    let currentUser = null;
    let inspectorName = null;
    let inspectorId = null;
    try {
      const supabase = await createSupabaseClient(request);
      // ดึง session จาก cookies (Next.js ส่ง cookies อัตโนมัติ)
      const { data: { session } } = await supabase.auth.getSession();
      currentUser = session?.user ?? null;
      
      if (currentUser) {
        inspectorId = currentUser.id;
        // ดึงชื่อจากตาราง users
        const { data: userRecord } = await admin
          .from('users')
          .select('name, email')
          .eq('id', currentUser.id)
          .maybeSingle();
        inspectorName = userRecord?.name || userRecord?.email || currentUser.email || null;
      }
    } catch (e) {
      console.warn('Failed to get current user:', e?.message);
    }
    
    // ใช้วันที่ปัจจุบัน
    const inspectedDate = new Date().toISOString().split("T")[0];

    // สร้าง QC session (ดึงข้อมูลอัตโนมัติ)
    const sessionPayload = {
      ticket_no: ticketNo,
      form_type: formType,
      station: previousStationInfo.station_name || null, // สถานีก่อน QC
      machine_no: null, // ไม่ใช้แล้ว
      inspector: inspectorName || null, // จาก user session
      inspected_date: inspectedDate, // วันที่ปัจจุบัน
      remark: header?.remark || null,
      qc_task_uuid: resolvedQcTaskUuid || null,
      inspector_id: inspectorId || null, // จาก user session
      station_id: stationSnapshot.station_id,
      step_order: stationSnapshot.step_order,
    };

    const { data: session, error: sessionError } = await admin
      .from("qc_sessions")
      .insert(sessionPayload)
      .select()
      .single();

    if (sessionError) {
      console.error("Error creating QC session:", sessionError);
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    // เตรียม rows สำหรับบันทึก
    let rowsToInsert = [];

    if (formType === "main_qc" && categories) {
      // Main QC form: แปลง categories เป็น rows
      Object.entries(categories).forEach(([categoryName, items]) => {
        Object.entries(items).forEach(([itemKey, item]) => {
          if (item.pass !== undefined || item.fail !== undefined) {
            rowsToInsert.push({
              session_id: session.id,
              project: categoryName,
              production_no: itemKey,
              actual_qty: item.qty || null,
              pass: item.pass === true,
              note: item.reason || null,
            });
          }
        });
      });
    } else if (rows && Array.isArray(rows)) {
      // Structure forms: ใช้ rows โดยตรง
      rowsToInsert = rows.map((r) => ({
        session_id: session.id,
        time_text: r.time || null,
        project: r.project || null,
        production_no: r.productionNo || null,
        technician: r.technician || null,
        sample_qty: r.sampleQty || null,
        actual_qty: r.actualQty || null,
        width_mm: r.widthMm || null,
        height_mm: r.heightMm || null,
        thickness_mm: r.thicknessMm || null,
        angle_ok: r.angleOk || null,
        cut_quality: r.cutQuality || null,
        frame_thick_upright: r.frameThickUpright || null,
        frame_thick_horizontal: r.frameThickHorizontal || null,
        lock_block_thick: r.lockBlockThick || null,
        press_force: r.pressForce || null,
        temperature_c: r.temperatureC || null,
        glue_type: r.glueType || null,
        pass: r.pass !== undefined ? r.pass : null,
        note: r.note || null,
      }));
    }

    // บันทึก rows
    let insertedRows = [];
    if (rowsToInsert.length > 0) {
      console.log('Rows to Insert:', rowsToInsert);
      const { data: rowsData, error: rowsError } = await admin
        .from("qc_rows")
        .insert(rowsToInsert)
        .select();

      if (rowsError) {
        console.error("Error inserting QC rows:", rowsError);
        return NextResponse.json({ error: rowsError.message }, { status: 500 });
      }

      insertedRows = rowsData || [];
      console.log('Inserted Rows:', insertedRows);
    }

    // คำนวณ pass rate
    const passRate = calculatePassRate(insertedRows);
    console.log('Calculated Pass Rate:', passRate);

    // คำนวณจำนวนที่ไม่ผ่านจาก rows (fallback ถ้าไม่ได้ส่งมาใน body)
    const failedRows = insertedRows.filter((r) => r.pass === false);
    const failedQtyFromRows = failedRows.reduce((sum, r) => sum + (Number(r.actual_qty) || 0), 0);

    // อัปเดตจำนวนผ่าน/ตั้งต้นใน ticket (ใช้ DB เป็น source of truth)
    try {
      const { data: ticketRow } = await admin
        .from('ticket')
        .select('quantity, pass_quantity, initial_quantity')
        .eq('no', ticketNo)
        .single();

      const initialQty = Number(ticketRow?.initial_quantity);
      const quantity = Number(ticketRow?.quantity) || 0;
      const hasInitial = Number.isFinite(initialQty);
      const currentPass = Number.isFinite(ticketRow?.pass_quantity) ? Number(ticketRow?.pass_quantity) : null;
      const baseForCalc = Number.isFinite(currentPass) ? currentPass : quantity; // COALESCE(pass_quantity, quantity)

      const providedFail = Number(bodyFailQty);
      const failQty = Number.isFinite(providedFail) ? providedFail : failedQtyFromRows;

      // Authoritative calculation on server: newPass = COALESCE(pass_quantity, quantity) - failQty
      let newPassQuantity = Math.max(0, baseForCalc - (Number(failQty) || 0));

      if (newPassQuantity !== null) {
        const updatePayload = { pass_quantity: newPassQuantity };
        if (!hasInitial) updatePayload.initial_quantity = quantity; // lock initial once
        const { error: updateTicketErr } = await admin
          .from('ticket')
          .update(updatePayload)
          .eq('no', ticketNo);
        if (updateTicketErr) {
          console.warn('Failed updating ticket pass_quantity:', updateTicketErr.message);
        }
      }
    } catch (e) {
      console.warn('Ticket quantity update failed (non-fatal):', e.message);
    }

    // Create QC defect alert when there are failed pieces
    try {
      const totalFailed = failedQtyFromRows || 0;
      if (totalFailed > 0) {
        await supabaseServer
          .from('qc_defect_alerts')
          .upsert({
            ticket_no: ticketNo,
            station_id: stationSnapshot.station_id || null,
            station_name: previousStationInfo.station_name || null,
            session_id: session.id,
            qc_task_uuid: resolvedQcTaskUuid || null,
            defect_qty: totalFailed,
            status: 'open',
            created_by: inspectorId || null
          }, { onConflict: 'session_id' });
      }
    } catch (e) {
      console.warn('Failed to upsert qc_defect_alerts:', e?.message);
    }

    // อัปเดตสถานะตั๋วตาม pass rate - เสร็จเสมอ (ไม่ว่าจะมี defect หรือไม่)
    console.log('Failed Rows:', failedRows);
    try {
      // เรียก completeQCStation เสมอ เพื่อให้สถานี QC เป็น completed
      console.log('QC completed - calling completeQCStation (passRate:', passRate, '%)');
      await completeQCStation(ticketNo);
      console.log('completeQCStation completed successfully');
      
      // อัพเดต completed_at ใน qc_sessions เมื่อ QC เสร็จสิ้น
      await admin
        .from('qc_sessions')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', session.id);
      console.log('Updated qc_sessions.completed_at for session:', session.id);
      
      // Log QC completion
      await logApiCall(request, 'qc_completed', 'qc_workflow', ticketNo, {
        session_id: session.id,
        form_type: formType,
        station_name: previousStationInfo.station_name,
        station_id: stationSnapshot.station_id,
        step_order: stationSnapshot.step_order,
        pass_rate: passRate,
        inspector: inspectorName
      }, 'success', null, currentUser ? { id: inspectorId, email: currentUser.email, name: inspectorName } : null);
    } catch (workflowError) {
      console.error("Error in QC workflow:", workflowError);
    }

    // Store a snapshot of input and computed summary for immutable audit
    try {
      const snapshot = {
        input: {
          formType,
          header,
          categories,
          rows
        },
        computed: {
          passRate,
          failedQtyFromRows,
          providedFail: Number(bodyFailQty) || null
        }
      };
      await admin
        .from('qc_sessions')
        .update({ snapshot_json: snapshot })
        .eq('id', session.id);
    } catch (e) {
      console.warn('Failed to save snapshot_json:', e?.message);
    }

    const response = {
      success: true,
      data: {
        session,
        rows: insertedRows,
        passRate,
        status: passRate === 100 ? "completed" : passRate > 0 ? "partial" : "rejected",
      },
    };
    
    console.log('=== QC API Response ===');
    console.log('Response:', response);
    
    await logApiCall(request, 'create', 'qc_session', session?.id || ticketNo, {
      ticket_no: ticketNo,
      form_type: formType,
      rows: insertedRows?.length || 0,
      pass_rate: passRate
    }, 'success', null);
    return NextResponse.json(response);
  } catch (error) {
    console.error("POST /api/tickets/[id]/qc error:", error);
    await logError(error, { action: 'create', entityType: 'qc_session', entityId: (await context.params)?.id }, request);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}