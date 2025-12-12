import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rvaywihlohlhyrowwixz.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2YXl3aWhsb2hsaHlyb3d3aXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNzgzOTQsImV4cCI6MjA2OTg1NDM5NH0.arW_SbAltWfv-AKIY5VcN9SBYxnKpA_UU2YzClpcqgQ";

// Function to clear auth data
const clearAuthData = () => {
  if (typeof window !== 'undefined') {
    // Clear all Supabase auth tokens
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-') && key.includes('auth-token')) {
        localStorage.removeItem(key);
      }
    });
    localStorage.removeItem('userData');
    localStorage.removeItem('loginLockEndTime');
    localStorage.removeItem('impersonationState');
  }
};

// Enhanced Supabase client with better error handling
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    // Enhanced error handling for refresh token failures
    onError: (event, session, error) => {
      // Handle refresh token errors silently
      if (error && (
        error.message?.includes('refresh_token_not_found') ||
        error.message?.includes('Invalid Refresh Token') ||
        error.message?.includes('Refresh Token Not Found') ||
        error.name === 'AuthApiError'
      )) {
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
          console.warn('Supabase refresh token error (handled):', error.message);
        }
        clearAuthData();
        return;
      }
      
      // Handle token refresh failures
      if (event === 'TOKEN_REFRESHED' && !session) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Token refresh failed, clearing session');
        }
        clearAuthData();
      }
    }
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js-web'
    }
  }
});

// Set up global error handler for unhandled Supabase auth errors
if (typeof window !== 'undefined') {
  // Handle unhandled promise rejections from Supabase
  const originalUnhandledRejection = window.onunhandledrejection;
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    
    // Check if it's a Supabase auth error related to refresh tokens
    if (error && (
      error.message?.includes('refresh_token_not_found') ||
      error.message?.includes('Invalid Refresh Token') ||
      error.message?.includes('Refresh Token Not Found') ||
      (error.name === 'AuthApiError' && error.message?.includes('refresh'))
    )) {
      // Prevent the error from showing in console
      event.preventDefault();
      
      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        console.warn('Handled Supabase refresh token error:', error.message);
      }
      
      // Clear invalid auth data
      clearAuthData();
      
      // Optionally trigger a session check
      supabase.auth.getSession().catch(() => {
        // Ignore errors from getSession after clearing data
      });
      
      return;
    }
    
    // Call original handler if it exists
    if (originalUnhandledRejection) {
      originalUnhandledRejection(event);
    }
  });
}


