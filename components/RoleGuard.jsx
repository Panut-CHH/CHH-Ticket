"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { hasPageAccess } from "@/utils/rolePermissions";

export default function RoleGuard({ children, requiredRole, pagePath, redirectTo = "/" }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [hasCheckedAccess, setHasCheckedAccess] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  // Fallback: หากไม่ได้ส่ง pagePath มา ให้ใช้ path ปัจจุบัน
  const effectivePath = pagePath || pathname || "/";

  useEffect(() => {
    // Wait for loading to complete and user to be available
    if (!isLoading && isAuthenticated && user) {
      // Check if user has access to this page
      const access = hasPageAccess(user.roles || user.role, effectivePath);
      setHasAccess(access);
      setHasCheckedAccess(true);
      
      if (!access) {
        const userRoles = user.roles || (user.role ? [user.role] : []);
        console.warn(`User ${user.name} (${JSON.stringify(userRoles)}) attempted to access ${effectivePath} without permission`);
        // Use setTimeout to avoid navigation during render
        setTimeout(() => {
          router.push(redirectTo);
        }, 100);
      }
    } else if (!isLoading && !isAuthenticated) {
      // If not authenticated and not loading, mark as checked
      setHasCheckedAccess(true);
      setHasAccess(false);
    }
  }, [isAuthenticated, isLoading, user, effectivePath, router, redirectTo]);

  // Show loading while checking authentication or permissions
  if (isLoading || (!hasCheckedAccess && isAuthenticated && user)) {
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
  if (hasCheckedAccess && !hasAccess) {
    return null;
  }

  return children;
}
