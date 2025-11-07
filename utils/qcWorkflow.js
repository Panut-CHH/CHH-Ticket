import { supabaseServer } from "@/utils/supabaseServer";
import { createWorkOrderFromQC } from "@/utils/workOrderManager";
import { createNotification, createQCReadyNotification, createTicketCompletedNotification } from "@/utils/notificationManager";

export async function completeQCStation(ticketNo) {
  console.log('=== completeQCStation Debug ===');
  console.log('Ticket No:', ticketNo);
  
  const admin = supabaseServer;
  
  try {
    const { data: flows, error } = await admin
      .from("ticket_station_flow")
      .select("id, status, step_order")
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

    const qcIdx = flows.findIndex((f) => f.status === "current");
    console.log('QC station index:', qcIdx);
    
    if (qcIdx >= 0) {
      const qcStation = flows[qcIdx];
      console.log('QC station:', qcStation);
      
      // Mark QC station as completed
      const completedAt = new Date().toISOString();
      const { error: updateError } = await admin
        .from("ticket_station_flow")
        .update({ 
          status: "completed",
          completed_at: completedAt
        })
        .eq("id", qcStation.id);
      
      if (updateError) {
        console.error('Error updating QC station:', updateError);
        throw updateError;
      }
      
      console.log('Marked QC station as completed:', qcStation.id);

      // Safety: ตรวจสอบว่ายังมี "current" อื่นๆ เหลืออยู่หรือไม่ และล้างให้หมด
      const { error: clearCurrentsError } = await admin
        .from("ticket_station_flow")
        .update({ status: "pending" })
        .eq("ticket_no", ticketNo)
        .eq("status", "current");
      if (clearCurrentsError) {
        console.warn('Warning: could not clear lingering current statuses:', clearCurrentsError);
      } else {
        console.log('Cleared all other current statuses');
      }
      
      // Check if this is the last station
      const isLastStation = qcIdx === flows.length - 1;
      
      if (isLastStation) {
        console.log('QC is the last station - ticket is now complete');
        // All stations completed - ticket status will be "Finish" automatically
        
        const finishedAt = new Date().toISOString();
        
        // อัปเดต ticket status เป็น Finish และบันทึก finished_at
        await admin
          .from("ticket")
          .update({ 
            status: "Finished",
            finished_at: finishedAt
          })
          .eq("no", ticketNo);
        
        // อัปเดต completed_at ใน ticket_station_flow สำหรับ QC step
        await admin
          .from("ticket_station_flow")
          .update({ completed_at: finishedAt })
          .eq("ticket_no", ticketNo)
          .eq("id", qcStation.id);
        
        console.log('Updated ticket.finished_at and QC flow.completed_at');
        
        // แจ้งเตือน admin เมื่อ ticket เสร็จสิ้น
        await createTicketCompletedNotification(ticketNo);
      } else {
        console.log('QC completed - next station remains pending');
        // Next station stays pending - technician will click start themselves
        const nextStation = flows[qcIdx + 1];
        console.log('Next station (stays pending):', nextStation);
        
        // ไม่ต้องเปลี่ยน next station เป็น current - ให้เป็น pending ไว้
      }
    } else {
      console.log('No current QC station found for ticket:', ticketNo);
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
      .select("id, status, step_order")
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

    const qcIdx = flows.findIndex((f) => f.status === "current");
    
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

      // Safety: Clear any other current statuses
      const { error: clearCurrentsError } = await admin
        .from("ticket_station_flow")
        .update({ status: "pending" })
        .eq("ticket_no", ticketNo)
        .eq("status", "current");
      
      if (clearCurrentsError) {
        console.warn('Warning: could not clear lingering current statuses:', clearCurrentsError);
      } else {
        console.log('Cleared all other current statuses');
      }

      // Check if this is the last station
      const isLastStation = qcIdx === flows.length - 1;
      
      if (isLastStation) {
        console.log('QC is the last station - ticket is now complete');
        const finishedAt = new Date().toISOString();
        // อัปเดต ticket status เป็น Finish และบันทึก finished_at
        await admin
          .from("ticket")
          .update({ 
            status: "Finished",
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
    .select("id, status, step_order")
    .eq("ticket_no", ticketNo)
    .order("step_order", { ascending: true });

  const currentIdx = (flows || []).findIndex((f) => f.status === "current");
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


