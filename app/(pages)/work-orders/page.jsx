"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { supabase } from "@/utils/supabaseClient";

export default function WorkOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await supabase
          .from("work_orders")
          .select("id, ticket_no, priority, status, created_at, title")
          .order("created_at", { ascending: false });
        if (active) setOrders(data || []);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/work-orders">
        <div className="min-h-screen p-4 sm:p-6 md:p-8">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-bold mb-4">Work Orders</h1>
            {loading ? (
              <div>Loading...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {orders.map((o) => (
                  <Link key={o.id} href={`/work-orders/${o.id}`} className="block p-4 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-700">
                    <div className="text-sm text-gray-500">Ticket #{o.ticket_no}</div>
                    <div className="font-semibold">{o.title}</div>
                    <div className="text-xs mt-1">
                      <span className="mr-2">Priority: {o.priority}</span>
                      <span>Status: {o.status}</span>
                    </div>
                  </Link>
                ))}
                {orders.length === 0 && (
                  <div className="text-gray-500">No work orders</div>
                )}
              </div>
            )}
          </div>
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}


