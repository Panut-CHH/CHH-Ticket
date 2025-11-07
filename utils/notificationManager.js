import { supabaseServer } from "@/utils/supabaseServer";

// Notification types enum
export const NOTIFICATION_TYPES = {
  QC_FAILED: 'qc_failed',
  QC_PASSED: 'qc_passed',
  QC_READY: 'qc_ready',
  TICKET_ASSIGNED: 'ticket_assigned',
  TICKET_COMPLETED: 'ticket_completed',
  TICKET_NEW: 'ticket_new',
  PROJECT_NEW: 'project_new',
  ITEM_CODE_NEW: 'item_code_new',
  REWORK_ASSIGNED: 'rework_assigned',
  WORK_ORDER_CREATED: 'work_order_created',
  APPROVAL_REQUIRED: 'approval_required',
  BATCH_MERGE_REQUESTED: 'batch_merge_requested',
  BATCH_MERGED: 'batch_merged',
};

export async function createNotification({ userId, type, title, message, ticketNo, qcSessionId, workOrderId, metadata }) {
  const admin = supabaseServer;
  const payload = {
    user_id: userId,
    type,
    title,
    message,
    ticket_no: ticketNo || null,
    qc_session_id: qcSessionId || null,
    work_order_id: workOrderId || null,
    metadata: metadata || null,
  };
  const { error } = await admin.from("notifications").insert(payload);
  if (error) throw error;
  return payload;
}

export async function createQCFailedNotification(ticketNo, qcSessionId) {
  const admin = supabaseServer;

  // Try to notify supervisors/admins; fallback to the creator if available
  let targets = [];
  try {
    const { data } = await admin
      .from("users")
      .select("id, role")
      .or("role.eq.Admin,role.eq.SuperAdmin");
    targets = Array.isArray(data) ? data : [];
  } catch {}

  // If no supervisors found, skip silently
  await Promise.all(
    targets.map((u) =>
      createNotification({
        userId: u.id,
        type: NOTIFICATION_TYPES.QC_FAILED,
        title: `QC ไม่ผ่าน: ตั๋ว ${ticketNo}`,
        message: "พบรายการที่ไม่ผ่านการตรวจสอบ กรุณาตรวจสอบและดำเนินการ",
        ticketNo,
        qcSessionId,
      })
    )
  );
}

// แจ้งเตือน QC เมื่อมี ticket พร้อมสำหรับ QC
export async function createQCReadyNotification(ticketNo, stationName) {
  const admin = supabaseServer;
  
  // หา QC users
  let qcUsers = [];
  try {
    const { data } = await admin
      .from("users")
      .select("id, role, name")
      .eq("role", "QC");
    qcUsers = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error finding QC users:", error);
    return;
  }

  if (qcUsers.length === 0) {
    console.log("No QC users found to notify");
    return;
  }

  // สร้างการแจ้งเตือนให้ทุก QC user
  await Promise.all(
    qcUsers.map((user) =>
      createNotification({
        userId: user.id,
        type: NOTIFICATION_TYPES.QC_READY,
        title: `มีตั๋วพร้อมสำหรับ QC: ${ticketNo}`,
        message: `ตั๋ว ${ticketNo} พร้อมสำหรับการตรวจสอบ QC ที่สถานี ${stationName || 'QC'}`,
        ticketNo,
      })
    )
  );
}

// แจ้งเตือนช่างเมื่อได้รับมอบหมาย ticket
export async function createTicketAssignmentNotification(ticketNo, technicianId, stationName, assignedBy) {
  if (!technicianId) return;
  
  try {
    await createNotification({
      userId: technicianId,
      type: NOTIFICATION_TYPES.TICKET_ASSIGNED,
      title: `ได้รับมอบหมายตั๋ว: ${ticketNo}`,
      message: `คุณได้รับมอบหมายตั๋ว ${ticketNo} ที่สถานี ${stationName || 'Unknown Station'}`,
      ticketNo,
      metadata: { station_name: stationName, assigned_by: assignedBy },
    });
  } catch (error) {
    console.error("Error creating assignment notification:", error);
  }
}

// แจ้งเตือน admin เมื่อ ticket เสร็จสิ้น
export async function createTicketCompletedNotification(ticketNo) {
  const admin = supabaseServer;
  
  // หา admin users
  let adminUsers = [];
  try {
    const { data } = await admin
      .from("users")
      .select("id, role")
      .in("role", ["Admin", "SuperAdmin"]);
    adminUsers = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error finding admin users:", error);
    return;
  }

  if (adminUsers.length === 0) return;

  await Promise.all(
    adminUsers.map((user) =>
      createNotification({
        userId: user.id,
        type: NOTIFICATION_TYPES.TICKET_COMPLETED,
        title: `ตั๋วเสร็จสิ้น: ${ticketNo}`,
        message: `ตั๋ว ${ticketNo} ได้เสร็จสิ้นการผลิตแล้ว`,
        ticketNo,
      })
    )
  );
}

// แจ้งเตือน admin เมื่อมีการขออนุมัติ
export async function createApprovalRequiredNotification(
  userId,
  type,
  title,
  message,
  ticketNo = null,
  metadata = null
) {
  const admin = supabaseServer;
  
  // หา admin users
  let adminUsers = [];
  try {
    const { data } = await admin
      .from("users")
      .select("id, role")
      .in("role", ["Admin", "SuperAdmin"]);
    adminUsers = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error finding admin users:", error);
    return;
  }

  if (adminUsers.length === 0) return;

  await Promise.all(
    adminUsers.map((user) =>
      createNotification({
        userId: user.id,
        type: NOTIFICATION_TYPES.APPROVAL_REQUIRED,
        title,
        message,
        ticketNo,
        metadata,
      })
    )
  );
}

// แจ้งเตือน admin เมื่อมี ticket ใหม่
export async function createNewTicketNotification(ticketNo, projectName = null, source = null) {
  const admin = supabaseServer;
  
  // หา admin users
  let adminUsers = [];
  try {
    const { data } = await admin
      .from("users")
      .select("id, role")
      .in("role", ["Admin", "SuperAdmin"]);
    adminUsers = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error finding admin users:", error);
    return;
  }

  if (adminUsers.length === 0) return;

  const message = projectName 
    ? `มีตั๋วใหม่ ${ticketNo} สำหรับโปรเจ็ค ${projectName}`
    : `มีตั๋วใหม่ ${ticketNo}${source ? ` จาก ${source}` : ''}`;

  await Promise.all(
    adminUsers.map((user) =>
      createNotification({
        userId: user.id,
        type: NOTIFICATION_TYPES.TICKET_NEW,
        title: `ตั๋วใหม่: ${ticketNo}`,
        message,
        ticketNo,
        metadata: { source, project_name: projectName },
      })
    )
  );
}

// แจ้งเตือน admin เมื่อมี project ใหม่
export async function createNewProjectNotification(projectNumber, projectName, itemCode) {
  const admin = supabaseServer;
  
  // หา admin users
  let adminUsers = [];
  try {
    const { data } = await admin
      .from("users")
      .select("id, role")
      .in("role", ["Admin", "SuperAdmin"]);
    adminUsers = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error finding admin users:", error);
    return;
  }

  if (adminUsers.length === 0) return;

  await Promise.all(
    adminUsers.map((user) =>
      createNotification({
        userId: user.id,
        type: NOTIFICATION_TYPES.PROJECT_NEW,
        title: `โปรเจ็คใหม่: ${projectNumber || itemCode || 'Unknown'}`,
        message: `มีการเพิ่มโปรเจ็คใหม่ ${projectName || projectNumber || itemCode}${itemCode ? ` (Item Code: ${itemCode})` : ''}`,
        ticketNo: null,
        metadata: { project_number: projectNumber, project_name: projectName, item_code: itemCode },
      })
    )
  );
}

// แจ้งเตือน admin เมื่อมี item code ใหม่
export async function createNewItemCodeNotification(projectId, itemCode, itemType) {
  const admin = supabaseServer;
  
  // หา admin users
  let adminUsers = [];
  try {
    const { data } = await admin
      .from("users")
      .select("id, role")
      .in("role", ["Admin", "SuperAdmin"]);
    adminUsers = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error finding admin users:", error);
    return;
  }

  if (adminUsers.length === 0) return;

  await Promise.all(
    adminUsers.map((user) =>
      createNotification({
        userId: user.id,
        type: NOTIFICATION_TYPES.ITEM_CODE_NEW,
        title: `Item Code ใหม่: ${itemCode}`,
        message: `มีการเพิ่ม Item Code ใหม่ ${itemCode} (Type: ${itemType || 'Unknown'})`,
        ticketNo: null,
        metadata: { project_id: projectId, item_code: itemCode, item_type: itemType },
      })
    )
  );
}

export async function createWorkOrderNotification(workOrderId, assignedUserId) {
  if (!assignedUserId) return; // optional
  await createNotification({
    userId: assignedUserId,
    type: NOTIFICATION_TYPES.REWORK_ASSIGNED,
    title: "มีงานแก้ไขใหม่",
    message: `ได้รับมอบหมายงานแก้ไขหมายเลข ${workOrderId}`,
    workOrderId,
  });
}


