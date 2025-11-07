/**
 * API Logger Middleware
 * ใช้สำหรับ wrap API routes เพื่อบันทึก log อัตโนมัติ
 */

import { logApiCall, logError } from './activityLogger';
import { supabaseServer } from './supabaseServer';

/**
 * Extract user from request headers (if available)
 * @param {Request} request - Next.js Request object
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserFromRequest(request) {
  try {
    // Try to get user from authorization header
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      // In a real implementation, you might verify the token
      // For now, we'll get user from Supabase session if available
    }

    // Alternative: Get user from cookies or session
    // This would need to be implemented based on your auth setup
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Wrap an API handler with automatic logging
 * @param {Function} handler - The API route handler function
 * @param {Object} options - Options for logging
 * @param {string} options.entityType - Entity type (ticket, project, user, etc.)
 * @param {string} options.action - Default action (will be inferred from method if not provided)
 * @returns {Function} Wrapped handler
 */
export function withLogging(handler, options = {}) {
  return async (request, context) => {
    const { entityType, action: defaultAction } = options;
    const startTime = Date.now();
    let status = 'success';
    let errorMessage = null;
    let responseData = null;
    let entityId = null;

    try {
      // Determine action from HTTP method
      const method = request.method;
      let action = defaultAction;
      
      if (!action) {
        switch (method) {
          case 'GET':
            action = 'read';
            break;
          case 'POST':
            action = 'create';
            break;
          case 'PUT':
          case 'PATCH':
            action = 'update';
            break;
          case 'DELETE':
            action = 'delete';
            break;
          default:
            action = method.toLowerCase();
        }
      }

      // Extract entity ID from URL params if available
      if (context?.params) {
        entityId = context.params.id || context.params.ticketNo || context.params.projectCodeNo || null;
      }

      // Try to get user from request
      const user = await getUserFromRequest(request);

      // Execute the handler
      const response = await handler(request, context);
      
      // Extract response data if available
      try {
        if (response && typeof response.json === 'function') {
          const clonedResponse = response.clone();
          responseData = await clonedResponse.json().catch(() => null);
          
          // Extract entity ID from response if not already set
          if (!entityId && responseData?.data?.id) {
            entityId = responseData.data.id;
          }
          if (!entityId && responseData?.data?.no) {
            entityId = responseData.data.no;
          }
          
          // Determine status from response
          if (response.status >= 400) {
            status = 'error';
            errorMessage = responseData?.error || responseData?.message || `HTTP ${response.status}`;
          } else if (response.status >= 300) {
            status = 'warning';
          }
        }
      } catch (e) {
        // If response is not JSON, just use status code
        if (response.status >= 400) {
          status = 'error';
        } else if (response.status >= 300) {
          status = 'warning';
        }
      }

      // Log the API call
      await logApiCall(
        request,
        action,
        entityType,
        entityId,
        {
          method,
          statusCode: response?.status || 200,
          duration: Date.now() - startTime,
          responseSize: responseData ? JSON.stringify(responseData).length : 0
        },
        status,
        errorMessage,
        user
      );

      return response;
    } catch (error) {
      status = 'error';
      errorMessage = error.message || 'Unknown error';
      
      // Log the error
      await logError(error, {
        action: defaultAction || action || 'api_call',
        entityType,
        entityId,
        method: request.method,
        duration: Date.now() - startTime
      }, request, await getUserFromRequest(request));

      // Re-throw to let Next.js handle it
      throw error;
    }
  };
}

/**
 * Helper function to log API calls manually
 * Useful when you need more control over what gets logged
 * @param {Request} request - Request object
 * @param {string} action - Action performed
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @param {Object} details - Additional details
 * @param {string} status - Status (success, error, warning)
 * @param {Object} user - User object
 */
export async function logApiRequest(request, action, entityType, entityId, details = {}, status = 'success', user = null) {
  const errorMessage = status === 'error' ? (details.errorMessage || details.message) : null;
  await logApiCall(request, action, entityType, entityId, details, status, errorMessage, user);
}

