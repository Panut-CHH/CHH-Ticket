"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { supabase } from "@/utils/supabaseClient";
import Link from "next/link";

export default function WorkOrderDetail({ params }) {
  const router = useRouter();
  const resolved = React.use(params);
  const id = String(resolved?.id || "");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await supabase
          .from("work_orders")
          .select("*")
          .eq("id", id)
          .single();
        if (active) setOrder(data || null);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [id]);

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/work-orders">
        <div className="min-h-screen p-4 sm:p-6 md:p-8">
          <div className="max-w-3xl mx-auto">
            <div className="mb-4"><Link href="/work-orders" className="text-sm text-emerald-700">← Back</Link></div>
            <h1 className="text-xl sm:text-2xl font-bold mb-4">Work Order Detail</h1>
            {loading ? (
              <div>Loading...</div>
            ) : !order ? (
              <div>Not found</div>
            ) : (
              <div className="space-y-3 bg-white dark:bg-slate-800 p-4 rounded border dark:border-slate-700">
                <div className="text-sm text-gray-600">Ticket #{order.ticket_no}</div>
                <div className="font-semibold">{order.title}</div>
                <div className="text-sm">Priority: {order.priority}</div>
                <div className="text-sm">Status: {order.status}</div>
                <div className="text-sm">Description: {order.description}</div>
                <div className="text-sm">
                  Failed Items:
                  <pre className="bg-gray-50 dark:bg-slate-900 p-2 rounded mt-1 text-xs overflow-x-auto">{JSON.stringify(order.failed_items, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}


