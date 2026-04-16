import { supabaseServer } from "@/utils/supabaseServer";

const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

/**
 * ส่ง push message ไปยัง LINE user
 * @param {string} lineUserId - LINE User ID ของผู้รับ
 * @param {string} message - ข้อความที่ต้องการส่ง
 */
export async function sendLinePushMessage(lineUserId, message) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn("[LINE] LINE_CHANNEL_ACCESS_TOKEN not configured, skipping");
    return;
  }
  if (!lineUserId) return;

  const res = await fetch(LINE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[LINE] Push message failed:", res.status, body);
  }
}

/**
 * แจ้งเตือนช่างสถานีถัดไปผ่าน LINE เมื่อสถานีก่อนหน้าทำเสร็จ (หรือส่งชิ้นงานบางส่วน)
 * @param {string} ticketNo - หมายเลขตั๋ว
 * @param {number} completedStepOrder - step_order ที่เพิ่งทำเสร็จ
 * @param {number|null} transferQty - จำนวนชิ้นที่ส่ง (null = แบบเดิม ไม่ระบุจำนวน)
 */
export async function sendLineNextStationNotification(ticketNo, completedStepOrder, transferQty = null) {
  const admin = supabaseServer;
  console.log(`[LINE] sendLineNextStationNotification: ticket=${ticketNo}, completedStep=${completedStepOrder}`);

  // หา step ถัดไปของตั๋วนี้
  const { data: nextFlow, error: nextFlowError } = await admin
    .from("ticket_station_flow")
    .select("station_id, step_order")
    .eq("ticket_no", ticketNo)
    .in("status", ["pending", "in_progress"])
    .gt("step_order", completedStepOrder)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  console.log(`[LINE] nextFlow:`, nextFlow, nextFlowError?.message);
  if (!nextFlow) return; // ไม่มีสถานีถัดไป (สถานีสุดท้ายแล้ว)

  // ดึงชื่อสถานีถัดไป
  const { data: station } = await admin
    .from("stations")
    .select("name_th, code")
    .eq("id", nextFlow.station_id)
    .maybeSingle();

  const stationName = station?.name_th || station?.code || "Unknown";
  const stationCode = (station?.code || "").toUpperCase();
  console.log(`[LINE] nextStation: name=${stationName}, code=${stationCode}`);

  // ถ้าสถานีถัดไปเป็น QC → แจ้ง QC users ทุกคน
  const isQC = stationCode === "QC" || stationName.toUpperCase().includes("QC") || stationName.includes("ตรวจ") || stationName.includes("คุณภาพ");
  console.log(`[LINE] isQC=${isQC}`);
  if (isQC) {
    await sendLineQCNotification(ticketNo, stationName, transferQty);
    return;
  }

  // หาช่างที่ assigned อยู่สถานีถัดไป
  const { data: assignment } = await admin
    .from("ticket_assignments")
    .select("technician_id")
    .eq("ticket_no", ticketNo)
    .eq("station_id", nextFlow.station_id)
    .eq("step_order", nextFlow.step_order)
    .maybeSingle();

  console.log(`[LINE] assignment:`, assignment);
  if (!assignment?.technician_id) return;

  // ดึง line_user_id ของช่าง
  const { data: user } = await admin
    .from("users")
    .select("line_user_id, name")
    .eq("id", assignment.technician_id)
    .maybeSingle();

  console.log(`[LINE] technician line_user_id:`, user?.line_user_id ? "found" : "not set");
  if (!user?.line_user_id) return;

  const qtyInfo = transferQty ? ` (${transferQty} ชิ้น)` : '';
  const message = `📋 ตั๋ว ${ticketNo} ถึงสถานี ${stationName} แล้ว${qtyInfo}\nกรุณาเริ่มงาน`;
  await sendLinePushMessage(user.line_user_id, message);
}

/**
 * แจ้งเตือน QC ทุกคนผ่าน LINE เมื่อตั๋วพร้อมสำหรับ QC
 * @param {string} ticketNo - หมายเลขตั๋ว
 * @param {string} stationName - ชื่อสถานี QC
 * @param {number|null} transferQty - จำนวนชิ้นที่���่งมา
 */
export async function sendLineQCNotification(ticketNo, stationName, transferQty = null) {
  const admin = supabaseServer;
  console.log(`[LINE] sendLineQCNotification: ticket=${ticketNo}, station=${stationName}`);

  // หา QC users ที่มี line_user_id
  const { data: qcUsers, error: qcError } = await admin
    .from("users")
    .select("line_user_id, name")
    .or("roles.ov.{QC},role.eq.QC")
    .not("line_user_id", "is", null);

  console.log(`[LINE] QC users found: ${qcUsers?.length || 0}`, qcError?.message);
  if (!qcUsers || qcUsers.length === 0) return;

  const qtyInfo = transferQty ? ` (${transferQty} ชิ้น)` : '';
  const message = `🔍 ตั๋ว ${ticketNo} พร้อมสำหรับ QC ที่สถานี ${stationName || "QC"}${qtyInfo}\nกรุณาตรวจสอบ`;

  await Promise.all(
    qcUsers.map((user) => sendLinePushMessage(user.line_user_id, message))
  );
}
