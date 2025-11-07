/**
 * Activity Logger Utility
 * ใช้สำหรับบันทึกทุกการกระทำในระบบ
 */

import { supabaseServer } from './supabaseServer';

/**
 * Log activity to database
 * @param {Object} options - Log options
 * @param {string} options.action - Action performed (create, update, delete, login, logout, read, etc.)
 * @param {string} options.entityType - Entity type (ticket, project, user, rework, etc.)
 * @param {string} options.entityId - ID of the entity
 * @param {Object} options.details - Additional details (old/new values, metadata, etc.)
 * @param {string} options.status - Status: 'success', 'error', or 'warning'
 * @param {string} options.errorMessage - Error message if status is 'error'
 * @param {string} options.userId - User ID (optional, will be extracted from request if not provided)
 * @param {string} options.userEmail - User email (optional)
 * @param {string} options.userName - User name (optional)
 * @param {string} options.ipAddress - IP address (optional)
 * @param {string} options.userAgent - User agent (optional)
 * @param {Object} options.metadata - Additional metadata
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logActivity(options) {
  try {
    const {
      action,
      entityType = null,
      entityId = null,
      details = {},
      status = 'success',
      errorMessage = null,
      userId = null,
      userEmail = null,
      userName = null,
      ipAddress = null,
      userAgent = null,
      metadata = {}
    } = options;

    if (!action) {
      console.error('[ActivityLogger] Action is required');
      return { success: false, error: 'Action is required' };
    }

    if (!['success', 'error', 'warning'].includes(status)) {
      console.error('[ActivityLogger] Invalid status:', status);
      return { success: false, error: 'Invalid status' };
    }

    // Skip noisy system reads: do not persist when it's a system/background read
    // Heuristic: action === 'read' AND no user context provided (userId/email/name)
    // This preserves only human actions while allowing explicit reads with user context
    const noUserContext = !userId && !userEmail && !userName;
    if (action === 'read' && noUserContext) {
      return { success: true };
    }

    const logData = {
      by_user: userId || null,
      user_email: userEmail || null,
      user_name: userName || null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      ticket_no: entityType === 'ticket' ? entityId : null, // For backward compatibility
      details: typeof details === 'object' ? details : { value: details },
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      status,
      error_message: errorMessage || null,
      metadata: typeof metadata === 'object' ? metadata : { value: metadata },
      created_at: new Date().toISOString()
    };

    const { error } = await supabaseServer
      .from('activity_logs')
      .insert([logData]);

    if (error) {
      // Prevent infinite loops - don't log errors from the logger itself
      console.error('[ActivityLogger] Failed to insert log:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    // Prevent infinite loops - don't log errors from the logger itself
    console.error('[ActivityLogger] Exception:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Log API call
 * @param {Request} request - Next.js Request object
 * @param {string} action - Action (create, read, update, delete, etc.)
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @param {Object} details - Additional details
 * @param {string} status - Status: 'success', 'error', or 'warning'
 * @param {string} errorMessage - Error message if any
 * @param {Object} user - User object (optional)
 * @returns {Promise<{success: boolean}>}
 */
export async function logApiCall(request, action, entityType, entityId, details = {}, status = 'success', errorMessage = null, user = null) {
  try {
    // Extract IP address from request
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    // Extract user agent
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Extract user info from request or user parameter
    let userId = null;
    let userEmail = null;
    let userName = null;

    if (user) {
      userId = user.id || null;
      userEmail = user.email || null;
      userName = user.name || null;
    }

    return await logActivity({
      action,
      entityType,
      entityId,
      details,
      status,
      errorMessage,
      userId,
      userEmail,
      userName,
      ipAddress,
      userAgent
    });
  } catch (error) {
    console.error('[ActivityLogger] Error in logApiCall:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Log error
 * @param {Error} error - Error object
 * @param {Object} context - Context information
 * @param {Request} request - Request object (optional)
 * @param {Object} user - User object (optional)
 * @returns {Promise<{success: boolean}>}
 */
export async function logError(error, context = {}, request = null, user = null) {
  try {
    const errorDetails = {
      message: error.message || 'Unknown error',
      stack: error.stack || null,
      ...context
    };

    let ipAddress = null;
    let userAgent = null;

    if (request) {
      ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                  request.headers.get('x-real-ip') ||
                  'unknown';
      userAgent = request.headers.get('user-agent') || 'unknown';
    }

    let userId = null;
    let userEmail = null;
    let userName = null;

    if (user) {
      userId = user.id || null;
      userEmail = user.email || null;
      userName = user.name || null;
    }

    return await logActivity({
      action: context.action || 'error',
      entityType: context.entityType || null,
      entityId: context.entityId || null,
      details: errorDetails,
      status: 'error',
      errorMessage: error.message || 'Unknown error',
      userId,
      userEmail,
      userName,
      ipAddress,
      userAgent,
      metadata: {
        errorType: error.name || 'Error',
        ...context
      }
    });
  } catch (logError) {
    // Prevent infinite loops
    console.error('[ActivityLogger] Failed to log error:', logError.message);
    return { success: false, error: logError.message };
  }
}

/**
 * Log warning
 * @param {string} message - Warning message
 * @param {Object} context - Context information
 * @param {Request} request - Request object (optional)
 * @param {Object} user - User object (optional)
 * @returns {Promise<{success: boolean}>}
 */
export async function logWarning(message, context = {}, request = null, user = null) {
  try {
    let ipAddress = null;
    let userAgent = null;

    if (request) {
      ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                  request.headers.get('x-real-ip') ||
                  'unknown';
      userAgent = request.headers.get('user-agent') || 'unknown';
    }

    let userId = null;
    let userEmail = null;
    let userName = null;

    if (user) {
      userId = user.id || null;
      userEmail = user.email || null;
      userName = user.name || null;
    }

    return await logActivity({
      action: context.action || 'warning',
      entityType: context.entityType || null,
      entityId: context.entityId || null,
      details: {
        message,
        ...context
      },
      status: 'warning',
      userId,
      userEmail,
      userName,
      ipAddress,
      userAgent
    });
  } catch (error) {
    console.error('[ActivityLogger] Failed to log warning:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Log auth event (login, logout, etc.)
 * @param {string} event - Event type (login, logout, login_failed, etc.)
 * @param {Object} user - User object
 * @param {boolean} success - Whether the event was successful
 * @param {Object} details - Additional details
 * @param {Request} request - Request object (optional)
 * @returns {Promise<{success: boolean}>}
 */
export async function logAuthEvent(event, user, success, details = {}, request = null) {
  try {
    let ipAddress = null;
    let userAgent = null;

    if (request) {
      ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                  request.headers.get('x-real-ip') ||
                  'unknown';
      userAgent = request.headers.get('user-agent') || 'unknown';
    }

    const status = success ? 'success' : 'error';
    const errorMessage = success ? null : (details.errorMessage || details.message || 'Authentication failed');

    return await logActivity({
      action: event,
      entityType: 'auth',
      entityId: user?.id || null,
      details: {
        ...details,
        success
      },
      status,
      errorMessage,
      userId: user?.id || null,
      userEmail: user?.email || null,
      userName: user?.name || null,
      ipAddress,
      userAgent
    });
  } catch (error) {
    console.error('[ActivityLogger] Failed to log auth event:', error.message);
    return { success: false, error: error.message };
  }
}

