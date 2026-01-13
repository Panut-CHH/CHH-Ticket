"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ProtectedRoute({ children, redirectTo = "/login" }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !redirecting) {
      setRedirecting(true);
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, router, redirectTo, redirecting]);

  // Add a safety timeout to prevent infinite loading
  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => {
        console.warn('ProtectedRoute: Loading timeout, forcing redirect');
        if (!isAuthenticated) {
          router.push(redirectTo);
        }
      }, 15000); // 15 second max loading time
      
      return () => clearTimeout(timeout);
    }
  }, [isLoading, isAuthenticated, router, redirectTo]);

  if (isLoading) {
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

  if (!isAuthenticated) {
    return null;
  }

  return children;
}

