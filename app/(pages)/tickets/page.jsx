import UITicket from "@/modules/ticket/UITicket";
import React from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";

export default function TicketsPage() {
  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/tickets">
        <UITicket />
      </RoleGuard>
    </ProtectedRoute>
  );
}


