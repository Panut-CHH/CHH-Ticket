import { NextResponse } from "next/server";
import { createNewTicketNotification } from "@/utils/notificationManager";
import { logApiCall, logError } from "@/utils/activityLogger";

/**
 * POST /api/notifications/create-ticket
 * Helper endpoint to create notification for new ticket (used by client-side)
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { ticketNo, projectName, source } = body;

    if (!ticketNo) {
      return NextResponse.json(
        { success: false, error: "Missing ticketNo" },
        { status: 400 }
      );
    }

    // Create notification for admins
    await createNewTicketNotification(ticketNo, projectName, source);

    const response = NextResponse.json({
      success: true,
      message: "Notification created",
    });
    await logApiCall(request, 'create', 'notification_ticket', ticketNo, { projectName, source }, 'success', null);
    return response;
  } catch (error) {
    console.error("Error creating ticket notification:", error);
    await logError(error, { action: 'create', entityType: 'notification_ticket', entityId: ticketNo }, request);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

