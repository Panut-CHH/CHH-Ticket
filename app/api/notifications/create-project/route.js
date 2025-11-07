import { NextResponse } from "next/server";
import { createNewProjectNotification } from "@/utils/notificationManager";
import { logApiCall, logError } from "@/utils/activityLogger";

/**
 * POST /api/notifications/create-project
 * Helper endpoint to create notification for new project (used by client-side)
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { projectNumber, projectName, itemCode } = body;

    // Create notification for admins
    await createNewProjectNotification(projectNumber, projectName, itemCode);

    const response = NextResponse.json({
      success: true,
      message: "Notification created",
    });
    await logApiCall(request, 'create', 'notification_project', projectNumber, { projectName, itemCode }, 'success', null);
    return response;
  } catch (error) {
    console.error("Error creating project notification:", error);
    await logError(error, { action: 'create', entityType: 'notification_project' }, request);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

