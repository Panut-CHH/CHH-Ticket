import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendLinePushMessage } from "@/utils/lineMessaging";
import crypto from "crypto";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function verifySignature(body, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return false;
  const hash = crypto
    .createHmac("SHA256", secret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-line-signature");

    // Verify signature (skip if no secret configured — dev mode)
    if (process.env.LINE_CHANNEL_SECRET && !verifySignature(rawBody, signature)) {
      console.warn("[LINE Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const body = JSON.parse(rawBody);
    const events = body.events || [];

    const supabase = getSupabaseAdmin();

    for (const event of events) {
      const lineUserId = event.source?.userId;
      if (!lineUserId) continue;

      if (event.type === "unfollow") {
        // ผู้ใช้ block bot → ลบ line_user_id
        const { error } = await supabase
          .from("users")
          .update({ line_user_id: null })
          .eq("line_user_id", lineUserId);

        if (error) {
          console.error("[LINE Webhook] Failed to clear line_user_id:", error.message);
        } else {
          console.log("[LINE Webhook] Cleared line_user_id for:", lineUserId);
        }
      }

      if (event.type === "follow") {
        console.log("[LINE Webhook] New follower:", lineUserId);
        // ตอบ LINE User ID กลับไปให้ผู้ใช้เอาไปให้ Admin กรอก
        sendLinePushMessage(lineUserId, `สวัสดีครับ! ยินดีต้อนรับสู่ระบบแจ้งเตือน CHH Ticket\n\nLINE User ID ของคุณคือ:\n${lineUserId}\n\nกรุณาส่ง ID นี้ให้ Admin เพื่อเปิดใช้งานแจ้งเตือน`).catch(() => {});
      }

      // ถ้าส่งข้อความ "id" หรือ "ไอดี" มา → ตอบ LINE User ID กลับ
      if (event.type === "message" && event.message?.type === "text") {
        const text = event.message.text.trim().toLowerCase();
        if (text === "id" || text === "ไอดี" || text === "userid") {
          sendLinePushMessage(lineUserId, `LINE User ID ของคุณคือ:\n${lineUserId}`).catch(() => {});
        }
      }
    }

    // LINE requires 200 OK response
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[LINE Webhook] Error:", error);
    return NextResponse.json({ success: true }); // Always return 200 to LINE
  }
}
