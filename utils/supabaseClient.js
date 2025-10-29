import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rvaywihlohlhyrowwixz.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2YXl3aWhsb2hsaHlyb3d3aXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNzgzOTQsImV4cCI6MjA2OTg1NDM5NH0.arW_SbAltWfv-AKIY5VcN9SBYxnKpA_UU2YzClpcqgQ";

// Enhanced Supabase client with better error handling
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    // Enhanced error handling for refresh token failures
    onError: (event, session) => {
      console.warn('Supabase auth error:', event, session);
      
      // Handle refresh token errors
      if (event === 'TOKEN_REFRESHED' && !session) {
        console.warn('Token refresh failed, clearing session');
        // Clear invalid session data
        if (typeof window !== 'undefined') {
          localStorage.removeItem('sb-rvaywihlohlhyrowwixz-auth-token');
          localStorage.removeItem('userData');
          localStorage.removeItem('loginLockEndTime');
        }
      }
    }
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js-web'
    }
  }
});


