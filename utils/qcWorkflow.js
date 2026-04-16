import { supabaseServer } from "@/utils/supabaseServer";
import { createWorkOrderFromQC } from "@/utils/workOrderManager";
import { createNotification, createQCReadyNotification, createTicketCompletedNotification } from "@/utils/notificationManager";

/**
 * completeQCStation - รองรับทั้ง full completion และ partial completion
 * @param {string} ticketNo
 * @param {number|null} passQty - จำนวนที่ผ่าน (null = ผ่านทั้งหมดที่มี)
 * @param {number|null} failQty - จำนวนที่ไม่ผ่าน (null = 0)
 * @param {number|null} reworkTargetStep - step_order ที่จะส่ง fail กลับไป (null = สถานีก่อนหน้า QC)
 * @param {string} defectAction - 'rework' | 'new_ticket' (default = 'rework')
 */
export async function completeQCStation(ticketNo, passQty = null, failQty = null, reworkTargetStep = null, defectAction = 'rework') {
  console.log('=== completeQCStation Debug ===');
  console.log('Ticket No:', ticketNo, 'passQty:', passQty, 'failQty:', failQty, 'reworkTarget:', reworkTargetStep, 'defectAction:', defectAction);

  const admin = supabaseServer;

  try {
    const { data: flows, error } = await admin
      .from("ticket_station_flow")
      .select("id, status, step_order, total_qty, available_qty, completed_qty, stations(name_th, code)")
      .eq("ticket_no", ticketNo)
      .order("step_order", { ascending: true });

    if (error) {
      console.error('Error loading flows:', error);
      throw error;
    }

    console.log('Flows found:', flows);

    if (!Array.isArray(flows) || flows.length === 0) {
      console.log('No flows found for ticket:', ticketNo);
      return;
    }

    // หาเฉพาะ QC step ที่ active (progress-based: หลาย step active พร้อมกันได้)
    const isQCStation = (f) => {
      const name = (f.stations?.name_th || f.stations?.code || '').toUpperCase();
      return name.includes('QC') || name.includes('ตรวจ') || name.includes('คุณภาพ');
    };
    const qcIdx = flows.findIndex((f) => {
      const isActive = f.status === "current" || f.status === "in_progress";
      return isActive && isQCStation(f);
    });
    console.log('QC station index:', qcIdx);

    if (qcIdx >= 0) {
      const qcStation = flows[qcIdx];
      console.log('QC station:', qcStation);

      // คำนวณจำนวน
      const remaining = qcStation.available_qty - qcStation.completed_qty;
      const actualFailQty = failQty != null ? Math.min(failQty, remaining) : 0;
      const actualPassQty = passQty != null ? Math.min(passQty, remaining - actualFailQty) : (remaining - actualFailQty);
      const totalProcessed = actualPassQty + actualFailQty;
      const newCompletedQty = qcStation.completed_qty + totalProcessed;
      const isFullyCompleted = newCompletedQty >= qcStation.total_qty;

      const completedAt = new Date().toISOString();
      const newStatus = isFullyCompleted ? "completed" : "in_progress";

      const updatePayload = {
        status: newStatus,
        completed_qty: newCompletedQty
      };
      if (isFullyCompleted) {
        updatePayload.completed_at = completedAt;
      }

      const { error: updateError } = await admin
        .from("ticket_station_flow")
        .update(updatePayload)
        .eq("id", qcStation.id);

      if (updateError) {
        console.error('Error updating QC station:', updateError);
        throw updateError;
      }

      console.log('Updated QC station:', { actualPassQty, actualFailQty, newCompletedQty, totalQty: qcStation.total_qty, status: newStatus });

      // ส่งชิ้นที่ผ่าน → สถานีถัดไป
      const nextStation = flows[qcIdx + 1];
      if (nextStation && actualPassQty > 0) {
        const nextAvailable = nextStation.available_qty + actualPassQty;
        const nextStatus = nextStation.status === 'pending' && nextAvailable > 0 ? 'in_progress' : nextStation.status;
        await admin
          .from("ticket_station_flow")
          .update({ available_qty: nextAvailable, status: nextStatus })
          .eq("id", nextStation.id);

        await admin
          .from("station_qty_transfers")
          .insert({
            ticket_no: ticketNo,
            from_step_order: qcStation.step_order,
            to_step_order: nextStation.step_order,
            quantity: actualPassQty
          });
        console.log('Sent', actualPassQty, 'passed pieces to next station step', nextStation.step_order);
      }

      // ส่งชิ้นที่ไม่ผ่าน → กลับสถานีที่เลือก หรือเปิดตั๋วใหม่
      if (actualFailQty > 0 && defectAction === 'rework') {
        // หา target station: ถ้า user เลือก step ใช้อันนั้น, ไม่งั้นใช้สถานีก่อนหน้า QC
        const targetStation = reworkTargetStep != null
          ? flows.find(f => f.step_order === reworkTargetStep)
          : (qcIdx > 0 ? flows[qcIdx - 1] : null);

        if (targetStation) {
          const targetAvailable = targetStation.available_qty + actualFailQty;
          const targetStatus = targetStation.status === 'completed' || targetStation.status === 'pending'
            ? 'in_progress' : targetStation.status;
          await admin
            .from("ticket_station_flow")
            .update({ available_qty: targetAvailable, status: targetStatus })
            .eq("id", targetStation.id);

          await admin
            .from("station_qty_transfers")
            .insert({
              ticket_no: ticketNo,
              from_step_order: qcStation.step_order,
              to_step_order: targetStation.step_order,
              quantity: actualFailQty
            });
          console.log('Sent', actualFailQty, 'failed pieces to station step', targetStation.step_order, 'for rework');
        }
      } else if (actualFailQty > 0 && defectAction === 'new_ticket') {
        // สร้างตั๋วใหม่สำหรับชิ้นเสีย
        try {
          // ดึงข้อมูลตั๋วเดิม
          const { data: originalTicket } = await admin
            .from("ticket")
            .select("*")
            .eq("no", ticketNo)
            .single();

          if (originalTicket) {
            // สร้างเลขตั๋วใหม่: เดิม + "-RW" + timestamp
            const newTicketNo = `${ticketNo}-RW${Date.now().toString().slice(-4)}`;
            const { data: newTicket, error: newTicketError } = await admin
              .from("ticket")
              .insert({
                no: newTicketNo,
                project_id: originalTicket.project_id,
                source_no: originalTicket.source_no,
                description: `[แก้ไข] ${originalTicket.description || ''} (จาก ${ticketNo} — ${actualFailQty} ชิ้นไม่ผ่าน QC)`,
                quantity: actualFailQty,
                unit: originalTicket.unit,
                priority: 'High',
                customer_name: originalTicket.customer_name,
                due_date: originalTicket.due_date,
                status: 'Released',
                remark: `สร้างอัตโนมัติจาก QC ตั๋ว ${ticketNo} — ${actualFailQty} ชิ้นไม่ผ่าน`
              })
              .select()
              .single();

            if (!newTicketError && newTicket) {
              console.log('Created new ticket for defective pieces:', newTicketNo, 'qty:', actualFailQty);

              // คัดลอก station flow จากตั๋วเดิม (ทุก step ตั้งแต่ต้น)
              const flowsToCopy = flows.map((f, idx) => ({
                ticket_no: newTicketNo,
                station_id: f.station_id,
                step_order: f.step_order,
                status: 'pending',
                total_qty: actualFailQty,
                available_qty: idx === 0 ? actualFailQty : 0,
                completed_qty: 0
              }));

              await admin.from("ticket_station_flow").insert(flowsToCopy);
              console.log('Copied', flowsToCopy.length, 'station flows to new ticket');
            } else {
              console.error('Failed to create new ticket:', newTicketError);
            }
          }
        } catch (newTicketErr) {
          console.error('Error creating new ticket for defective pieces:', newTicketErr);
        }
      }

      // Check if this is the last station and fully completed
      const isLastStation = qcIdx === flows.length - 1;

      if (isLastStation && isFullyCompleted) {
        console.log('QC is the last station and fully completed - ticket is now complete');

        const finishedAt = new Date().toISOString();

        await admin
          .from("ticket")
          .update({
            status: "Finish",
            finished_at: finishedAt
          })
          .eq("no", ticketNo);

        await admin
          .from("ticket_station_flow")
          .update({ completed_at: finishedAt })
          .eq("id", qcStation.id);

        console.log('Updated ticket.finished_at and QC flow.completed_at');

        await createTicketCompletedNotification(ticketNo);
      } else if (!isFullyCompleted) {
        console.log('QC partially completed - still in progress:', { newCompletedQty, totalQty: qcStation.total_qty });
      } else {
        console.log('QC completed - next station can proceed');
      }
    } else {
      console.log('No current/in_progress QC station found for ticket:', ticketNo);
    }
  } catch (error) {
    console.error('Error in completeQCStation:', error);
    throw error;
  }
}

export async function flagForRework(ticketNo, qcSessionId, failedRows) {
  const admin = supabaseServer;
  
  try {
    // ดึง flows เพื่อหา QC station และ next station
    const { data: flows, error: flowsError } = await admin
      .from("ticket_station_flow")
      .select("id, status, step_order, stations(name_th, code)")
      .eq("ticket_no", ticketNo)
      .order("step_order", { ascending: true });

    if (flowsError) {
      console.error('Error loading flows for flagForRework:', flowsError);
      throw flowsError;
    }

    if (!flows || flows.length === 0) {
      console.log('No flows found for ticket:', ticketNo);
      return;
    }

    const qcIdx = flows.findIndex((f) => {
      const isActive = f.status === "current" || f.status === "in_progress";
      const name = (f.stations?.name_th || f.stations?.code || '').toUpperCase();
      return isActive && (name.includes('QC') || name.includes('ตรวจ'));
    });

    if (qcIdx >= 0) {
      const qcStation = flows[qcIdx];

      // Mark QC station as rework
      const { error: updateError } = await admin
        .from("ticket_station_flow")
        .update({ status: "rework" })
        .eq("id", qcStation.id);

      if (updateError) {
        console.error('Error updating QC station:', updateError);
        throw updateError;
      }

      console.log('Marked QC station as rework:', qcStation.id);
      // Progress-based: ไม่ล้าง current/in_progress ของสถานีอื่น

      // Check if this is the last station
      const isLastStation = qcIdx === flows.length - 1;
      
      if (isLastStation) {
        console.log('QC is the last station - ticket is now complete');
        const finishedAt = new Date().toISOString();
        // อัปเดต ticket status เป็น Finish และบันทึก finished_at
        await admin
          .from("ticket")
          .update({ 
            status: "Finish",
            finished_at: finishedAt
          })
          .eq("no", ticketNo);
        
        // อัปเดต completed_at ใน ticket_station_flow สำหรับ QC step
        await admin
          .from("ticket_station_flow")
          .update({ completed_at: finishedAt })
          .eq("ticket_no", ticketNo)
          .eq("id", qcStation.id);
        
        console.log('Updated ticket.finished_at and QC flow.completed_at (rework)');
      } else {
        console.log('QC completed with rework - next station remains pending');
        // Next station stays pending - technician will click start themselves
        const nextStation = flows[qcIdx + 1];
        console.log('Next station (stays pending):', nextStation);
      }
    }

    // Create work order (แต่ไม่ต้อง set status = rework)
    // เพราะตั๋วหลักจะไปต่อได้เลย (quantity ถูกอัปเดตเป็น passQuantity แล้ว)
  } catch (error) {
    console.error('Error in flagForRework:', error);
    throw error;
  }
}

export async function rejectAndRollback(ticketNo, qcSessionId, failedRows) {
  const admin = supabaseServer;
  const { data: flows } = await supabaseServer
    .from("ticket_station_flow")
    .select("id, status, step_order, stations(name_th, code)")
    .eq("ticket_no", ticketNo)
    .order("step_order", { ascending: true });

  const currentIdx = (flows || []).findIndex((f) => {
    const isActive = f.status === "current" || f.status === "in_progress";
    const name = (f.stations?.name_th || f.stations?.code || '').toUpperCase();
    return isActive && (name.includes('QC') || name.includes('ตรวจ'));
  });
  if (currentIdx >= 0) {
    const current = flows[currentIdx];
    await admin.from("ticket_station_flow").update({ status: "rejected" }).eq("id", current.id);
    const prev = flows[currentIdx - 1];
    if (prev) {
      await admin.from("ticket_station_flow").update({ status: "current" }).eq("id", prev.id);
    }
  }

  await createWorkOrderFromQC(ticketNo, qcSessionId, failedRows);
}

export function calculatePassRate(rows) {
  console.log('=== calculatePassRate Debug ===');
  console.log('Input rows:', rows);
  
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No rows provided, returning 100%');
    return 100; // ถ้าไม่มีข้อมูลให้ผ่าน
  }
  
  const checked = rows.filter((r) => r.pass === true || r.pass === false);
  console.log('Checked rows:', checked);
  
  if (checked.length === 0) {
    console.log('No checked items, returning 100%');
    return 100; // ถ้าไม่มีข้อที่ตรวจสอบให้ผ่าน
  }
  
  const passed = checked.filter((r) => r.pass === true).length;
  const passRate = Math.round((passed / checked.length) * 100);
  
  console.log('Passed:', passed, 'Total checked:', checked.length, 'Pass rate:', passRate);
  return passRate;
}


