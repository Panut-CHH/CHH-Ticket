import React from "react";
import UILog from "@/modules/log/UILog";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";

export default function LogPage() {
  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/log">
        <UILog />
      </RoleGuard>
    </ProtectedRoute>
  );
}


