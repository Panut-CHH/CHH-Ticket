import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";
import { calculatePassRate, completeQCStation, flagForRework, rejectAndRollback } from "@/utils/qcWorkflow";
import { createQCFailedNotification } from "@/utils/notificationManager";

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

    return NextResponse.json({
      success: true,
      data: {
        sessions: sessions || [],
      },
    });
  } catch (error) {
    console.error("GET /api/tickets/[id]/qc error:", error);
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

    const { formType, header, rows, categories } = body;

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

    // สร้าง QC session
    const sessionPayload = {
      ticket_no: ticketNo,
      form_type: formType,
      station: header?.station || header?.stationMachine || null,
      machine_no: header?.machineNo || null,
      inspector: header?.inspector || null,
      inspected_date: header?.inspectedDate || new Date().toISOString().split("T")[0],
      remark: header?.remark || null,
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

    // อัปเดตสถานะตั๋วตาม pass rate
    const failedRows = insertedRows.filter((r) => r.pass === false);
    console.log('Failed Rows:', failedRows);

    try {
      if (passRate === 100) {
        // QC ผ่านทั้งหมด → complete station และไปสถานีถัดไป
        console.log('QC 100% passed - calling completeQCStation');
        await completeQCStation(ticketNo);
        console.log('completeQCStation completed successfully');
      } else if (passRate > 0 && passRate < 100) {
        // ผ่านบางส่วน → flag for rework และสร้าง work order
        console.log('QC partially passed - calling flagForRework');
        await flagForRework(ticketNo, session.id, failedRows);
        await createQCFailedNotification(ticketNo, session.id);
        console.log('flagForRework completed successfully');
      } else if (passRate === 0 && insertedRows.length > 0) {
        // ไม่ผ่านเลย → reject, rollback และสร้าง work order
        console.log('QC 0% passed - calling rejectAndRollback');
        await rejectAndRollback(ticketNo, session.id, failedRows);
        await createQCFailedNotification(ticketNo, session.id);
        console.log('rejectAndRollback completed successfully');
      }
    } catch (workflowError) {
      console.error("Error in QC workflow:", workflowError);
      // ไม่ return error เพราะ QC session ถูกสร้างแล้ว
    }

    const response = {
      success: true,
      data: {
        session,
        rows: insertedRows,
        passRate,
        status: passRate === 100 ? "completed" : passRate > 0 ? "rework" : "rejected",
      },
    };
    
    console.log('=== QC API Response ===');
    console.log('Response:', response);
    
    return NextResponse.json(response);
  } catch (error) {
    console.error("POST /api/tickets/[id]/qc error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}