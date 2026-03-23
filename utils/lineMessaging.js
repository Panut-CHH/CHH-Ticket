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
 * แจ้งเตือนช่างผ่าน LINE เมื่อตั๋วถึงสถานีของเขา
 * @param {string} ticketNo - หมายเลขตั๋ว
 * @param {string} stationId - UUID ของสถานี
 * @param {number} stepOrder - ลำดับ step
 */
export async function sendLineStationNotification(ticketNo, stationId, stepOrder) {
  const admin = supabaseServer;

  // หาช่างที่ assigned อยู่สถานีนี้
  const { data: assignment } = await admin
    .from("ticket_assignments")
    .select("technician_id")
    .eq("ticket_no", ticketNo)
    .eq("station_id", stationId)
    .eq("step_order", stepOrder)
    .maybeSingle();

  if (!assignment?.technician_id) return;

  // ดึง line_user_id ของช่าง
  const { data: user } = await admin
    .from("users")
    .select("line_user_id, name")
    .eq("id", assignment.technician_id)
    .maybeSingle();

  if (!user?.line_user_id) return;

  // ดึงชื่อสถานี
  const { data: station } = await admin
    .from("stations")
    .select("name_th, code")
    .eq("id", stationId)
    .maybeSingle();

  const stationName = station?.name_th || station?.code || "Unknown";
  const message = `📋 ตั๋ว ${ticketNo} ถึงสถานี ${stationName} แล้ว\nกรุณาเริ่มงาน`;

  await sendLinePushMessage(user.line_user_id, message);
}

/**
 * แจ้งเตือน QC ทุกคนผ่าน LINE เมื่อตั๋วพร้อมสำหรับ QC
 * @param {string} ticketNo - หมายเลขตั๋ว
 * @param {string} stationName - ชื่อสถานี QC
 */
export async function sendLineQCNotification(ticketNo, stationName) {
  const admin = supabaseServer;

  // หา QC users ที่มี line_user_id
  const { data: qcUsers } = await admin
    .from("users")
    .select("line_user_id, name")
    .or("roles.ov.{QC},role.eq.QC")
    .not("line_user_id", "is", null);

  if (!qcUsers || qcUsers.length === 0) return;

  const message = `🔍 ตั๋ว ${ticketNo} พร้อมสำหรับ QC ที่สถานี ${stationName || "QC"}\nกรุณาตรวจสอบ`;

  await Promise.all(
    qcUsers.map((user) => sendLinePushMessage(user.line_user_id, message))
  );
}
