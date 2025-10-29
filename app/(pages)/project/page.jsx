"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import UIProject from "@/modules/project/UIProject";

export default function ProjectPage() {
  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/project">
        <UIProject />
      </RoleGuard>
    </ProtectedRoute>
  );
}
