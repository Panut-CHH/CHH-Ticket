"use client";

import UIIndex from "@/modules/index/UIIndex";
import React, { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

export default function page() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div 
            className="w-8 h-8 border-4 border-emerald-300 dark:border-emerald-600 border-t-emerald-600 dark:border-t-emerald-400 rounded-full animate-spin"
            style={{
              transformOrigin: 'center'
            }}
          />
          <p className="text-gray-600 dark:text-gray-400">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <>
      <UIIndex />
    </>
  );
}
