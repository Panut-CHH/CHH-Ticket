"use client";

import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import Link from "next/link";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) return;
        const { data } = await supabase
          .from("notifications")
          .select("id, title, message, created_at, read, ticket_no")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (active) setNotifications(data || []);

        // Realtime subscription
        const channel = supabase
          .channel("notifications")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
            (payload) => {
              setNotifications((prev) => [payload.new, ...prev]);
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch {}
    };
    const cleanup = load();
    return () => {
      active = false;
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        className="relative p-1.5 sm:p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-slate-700 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded shadow-lg z-50">
          <div className="p-2 text-sm font-semibold border-b dark:border-slate-700">การแจ้งเตือน</div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">ไม่มีการแจ้งเตือน</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="p-3 border-b last:border-b-0 dark:border-slate-700 text-sm">
                  <div className="font-medium">{n.title}</div>
                  <div className="text-gray-600 dark:text-gray-400 text-xs">{n.message}</div>
                  {n.ticket_no && (
                    <Link href={`/qc/${n.ticket_no}`} className="text-emerald-700 text-xs">ไปยังตั๋ว</Link>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}


