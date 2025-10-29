"use client";

import React from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import DebugUserRole from "./DebugUserRole";

export default function DebugUserRolePage() {
  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/debug-user-role">
        <DebugUserRole />
      </RoleGuard>
    </ProtectedRoute>
  );
}