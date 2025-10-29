import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rvaywihlohlhyrowwixz.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2YXl3aWhsb2hsaHlyb3d3aXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNzgzOTQsImV4cCI6MjA2OTg1NDM5NH0.arW_SbAltWfv-AKIY5VcN9SBYxnKpA_UU2YzClpcqgQ";

// Server-side Supabase client with service role key for admin operations
export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});