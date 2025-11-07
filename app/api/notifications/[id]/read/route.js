import { NextResponse } from "next/server";
import { supabaseServer } from "@/utils/supabaseServer";
import { logApiCall, logError } from "@/utils/activityLogger";

/**
 * PUT /api/notifications/[id]/read
 * Mark notification as read
 */
export async function PUT(request, context) {
  try {
    const params = await context.params;
    const notificationId = params?.id;

    if (!notificationId) {
      return NextResponse.json(
        { success: false, error: "Missing notification ID" },
        { status: 400 }
      );
    }

    const admin = supabaseServer;

    // Update notification to read
    const { data, error } = await admin
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .select()
      .single();

    if (error) {
      console.error("Error marking notification as read:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      data,
      message: "Notification marked as read",
    });
    await logApiCall(request, 'update', 'notification', notificationId, { read: true }, 'success', null);
    return response;
  } catch (error) {
    console.error("API Error:", error);
    await logError(error, { action: 'update', entityType: 'notification', entityId: (await context.params)?.id }, request);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

