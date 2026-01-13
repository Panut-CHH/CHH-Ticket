"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ProtectedRoute({ children, redirectTo = "/login" }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const [hasWaitedForSession, setHasWaitedForSession] = useState(false);

  // Wait a bit for session to stabilize after initial load
  useEffect(() => {
    if (!isLoading) {
      // Give session a moment to stabilize after loading completes
      const timer = setTimeout(() => {
        setHasWaitedForSession(true);
      }, 500); // Wait 500ms for session to stabilize
      
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    // Only redirect if we've waited for session to stabilize and still not authenticated
    if (hasWaitedForSession && !isLoading && !isAuthenticated && !user && !redirecting) {
      // Double-check localStorage as a fallback before redirecting
      const savedUserData = localStorage.getItem('userData');
      if (!savedUserData) {
        setRedirecting(true);
        router.push(redirectTo);
      }
    }
  }, [isAuthenticated, isLoading, user, hasWaitedForSession, redirecting, router, redirectTo]);

  // Add a safety timeout to prevent infinite loading
  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => {
        console.warn('ProtectedRoute: Loading timeout, checking session');
        // Check localStorage before forcing redirect
        const savedUserData = localStorage.getItem('userData');
        if (!savedUserData && !isAuthenticated) {
          router.push(redirectTo);
        }
      }, 15000); // 15 second max loading time
      
      return () => clearTimeout(timeout);
    }
  }, [isLoading, isAuthenticated, router, redirectTo]);

  // Show loading while checking authentication or waiting for session to stabilize
  if (isLoading || (!hasWaitedForSession && !isLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div 
            className="w-8 h-8 border-4 border-emerald-300 dark:border-emerald-600 border-t-emerald-600 dark:border-t-emerald-400 rounded-full"
            style={{
              animation: 'spin 1s linear infinite',
              transformOrigin: 'center'
            }}
          />
          <p className="text-gray-600 dark:text-gray-400">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (but only after we've waited)
  if (hasWaitedForSession && !isAuthenticated && !user) {
    // Final check: if localStorage has user data, the session might still be loading
    const savedUserData = localStorage.getItem('userData');
    if (!savedUserData) {
      return null;
    }
  }

  return children;
}

