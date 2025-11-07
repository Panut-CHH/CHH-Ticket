/**
 * Client-side Activity Logger
 * ใช้สำหรับบันทึก log จาก client-side components
 */

import { supabase } from './supabaseClient';

/**
 * Log activity from client-side
 * Uses API endpoint to bypass RLS restrictions
 * @param {Object} options - Log options
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
      metadata = {}
    } = options;

    if (!action) {
      console.error('[ClientLogger] Action is required');
      return { success: false, error: 'Action is required' };
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    
    // Get user agent
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    
    // Get session token for API call
    const { data: { session } } = await supabase.auth.getSession();

    // Call API endpoint instead of direct insert (bypasses RLS)
    const response = await fetch('/api/logs/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
      },
      body: JSON.stringify({
        action,
        entityType,
        entityId,
        details,
        status,
        errorMessage,
        userId: user?.id || null,
        userEmail: user?.email || null,
        userName: user?.user_metadata?.full_name || user?.email?.split("@")[0] || null,
        userAgent,
        metadata
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[ClientLogger] Failed to create log:', errorData.error);
      return { success: false, error: errorData.error || 'Failed to create log' };
    }

    return { success: true };
  } catch (error) {
    console.error('[ClientLogger] Exception:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Log auth event from client-side
 * Uses API endpoint to bypass RLS restrictions
 * @param {string} event - Event type (login, logout, login_failed, etc.)
 * @param {boolean} success - Whether the event was successful
 * @param {Object} details - Additional details
 */
export async function logAuthEvent(event, success, details = {}) {
  try {
    // Get current user (might be null for logout)
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    
    // Get session token for API call
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));

    // Call API endpoint instead of direct insert (bypasses RLS)
    const response = await fetch('/api/logs/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
      },
      body: JSON.stringify({
        action: event,
        entityType: 'auth',
        entityId: user?.id || null,
        details: {
          ...details,
          success
        },
        status: success ? 'success' : 'error',
        errorMessage: success ? null : (details.errorMessage || details.message || 'Authentication failed'),
        userId: user?.id || null,
        userEmail: user?.email || details.email || null,
        userName: user?.user_metadata?.full_name || user?.email?.split("@")[0] || details.email?.split("@")[0] || null,
        userAgent,
        metadata: {}
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[ClientLogger] Failed to log auth event:', errorData.error);
      return { success: false, error: errorData.error || 'Failed to log auth event' };
    }

    return { success: true };
  } catch (error) {
    console.error('[ClientLogger] Failed to log auth event:', error.message);
    return { success: false, error: error.message };
  }
}

