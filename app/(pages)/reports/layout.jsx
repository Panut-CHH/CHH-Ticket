"use client";

import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";

// หมายเหตุ: เอาเมนูรายงานด้านซ้ายออก เพื่อให้พื้นที่แสดงผลหลักเต็มหน้าจอตามคำขอ
const reportPages = [];

export default function ReportsLayout({ children }) {
  const pathname = usePathname();

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/reports">
        <div className="min-h-screen">
          {/* Reports Header (no background box) */}
          <div className="max-w-7xl mx-auto px-4 mt-2 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-md" style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)" }}>
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">รายงาน</h1>
                <p className="text-gray-600 dark:text-gray-400">วิเคราะห์และติดตามข้อมูลการทำงาน</p>
              </div>
            </div>
          </div>

          {/* Main Content - full width */}
          <div className="max-w-7xl mx-auto px-4">
            {children}
          </div>
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}
