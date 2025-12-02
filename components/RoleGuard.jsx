"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { hasPageAccess } from "@/utils/rolePermissions";

export default function RoleGuard({ children, requiredRole, pagePath, redirectTo = "/" }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Fallback: หากไม่ได้ส่ง pagePath มา ให้ใช้ path ปัจจุบัน
  const effectivePath = pagePath || pathname || "/";

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      // Check if user has access to this page
      if (!hasPageAccess(user.roles || user.role, effectivePath)) {
        const userRoles = user.roles || (user.role ? [user.role] : []);
        console.warn(`User ${user.name} (${JSON.stringify(userRoles)}) attempted to access ${effectivePath} without permission`);
        router.push(redirectTo);
      }
    }
  }, [isAuthenticated, isLoading, user, effectivePath, router, redirectTo]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">กำลังตรวจสอบสิทธิ์...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated || !user) {
    return null;
  }

  // Don't render if user doesn't have access to this page
  if (!hasPageAccess(user.roles || user.role, effectivePath)) {
    return null;
  }

  return children;
}
