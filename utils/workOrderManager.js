import { supabaseServer } from "@/utils/supabaseServer";
import { createWorkOrderNotification } from "@/utils/notificationManager";

export async function createWorkOrderFromQC(ticketNo, qcSessionId, failedRows) {
  const admin = supabaseServer;

  const failedItems = (failedRows || []).map((r) => ({
    item: r.production_no || r.productionNo || "",
    category: r.project || "",
    reason: r.note || "",
    qty: r.actual_qty || r.actualQty || null,
  }));

  const priority = failedItems.length > 5 ? "urgent" : failedItems.length >= 3 ? "high" : "medium";

  const workOrder = {
    ticket_no: ticketNo,
    qc_session_id: qcSessionId,
    type: "rework",
    priority,
    title: `แก้ไข QC ไม่ผ่าน - ตั๋ว ${ticketNo}`,
    description: `พบข้อบกพร่อง ${failedItems.length} รายการจากการตรวจสอบ QC`,
    failed_items: failedItems,
    status: "pending",
  };

  const { data, error } = await admin.from("work_orders").insert(workOrder).select().single();
  if (error) throw error;

  // Optionally notify assigned user later
  // await createWorkOrderNotification(data.id, data.assigned_to);
  return data;
}


