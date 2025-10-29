import { supabaseServer } from "@/utils/supabaseServer";

export async function createNotification({ userId, type, title, message, ticketNo, qcSessionId }) {
  const admin = supabaseServer;
  const payload = {
    user_id: userId,
    type,
    title,
    message,
    ticket_no: ticketNo || null,
    qc_session_id: qcSessionId || null,
  };
  const { error } = await admin.from("notifications").insert(payload);
  if (error) throw error;
}

export async function createQCFailedNotification(ticketNo, qcSessionId) {
  const admin = supabaseServer;

  // Try to notify supervisors/admins; fallback to the creator if available
  let targets = [];
  try {
    const { data } = await admin
      .from("users")
      .select("id, role")
      .or("role.eq.admin,role.eq.supervisor");
    targets = Array.isArray(data) ? data : [];
  } catch {}

  // If no supervisors found, skip silently
  await Promise.all(
    targets.map((u) =>
      createNotification({
        userId: u.id,
        type: "qc_failed",
        title: `QC ไม่ผ่าน: ตั๋ว ${ticketNo}`,
        message: "พบรายการที่ไม่ผ่านการตรวจสอบ กรุณาตรวจสอบและดำเนินการ",
        ticketNo,
        qcSessionId,
      })
    )
  );
}

export async function createWorkOrderNotification(workOrderId, assignedUserId) {
  if (!assignedUserId) return; // optional
  await createNotification({
    userId: assignedUserId,
    type: "rework_assigned",
    title: "มีงานแก้ไขใหม่",
    message: `ได้รับมอบหมายงานแก้ไขหมายเลข ${workOrderId}`,
  });
}


