"use client";

import React, { useEffect, useState, useRef } from "react";
import { Bell, X } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const { language } = useLanguage();
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) return;
        const { data } = await supabase
          .from("notifications")
          .select("id, title, message, created_at, read, ticket_no, type, metadata")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50); // เพิ่ม limit เพื่อให้เห็น read notifications ด้วย
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
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
            (payload) => {
              setNotifications((prev) =>
                prev.map((n) => (n.id === payload.new.id ? payload.new : n))
              );
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

  const unreadNotifications = notifications.filter((n) => !n.read);
  const readNotifications = notifications.filter((n) => n.read);
  const unreadCount = unreadNotifications.length;

  const markAsRead = async (notificationId, e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PUT",
      });

      if (response.ok) {
        // Update local state
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const getNotificationLink = (notification) => {
    const type = notification.type || "";
    
    // Notification ที่มี ticket_no
    if (notification.ticket_no) {
      if (type.includes("qc") || type === "qc_ready") {
        return `/qc/${notification.ticket_no}`;
      } else if (type === "ticket_assigned" || type === "ticket_new" || type === "ticket_completed") {
        return `/tickets?ticket=${notification.ticket_no}`;
      } else if (type.includes("rework")) {
        return `/rework?ticket=${notification.ticket_no}`;
      } else if (type.includes("approval") || type.includes("batch")) {
        return `/tickets?ticket=${notification.ticket_no}`;
      }
      // Default: link to tickets page
      return `/tickets?ticket=${notification.ticket_no}`;
    }
    
    // Notification ที่ไม่มี ticket_no แต่มี metadata
    if (type === "project_new") {
      return `/project`; // Link to project list
    } else if (type === "item_code_new") {
      const projectId = notification.metadata?.project_id;
      if (projectId) {
        return `/project/${projectId}`;
      }
      return `/project`; // Link to project list
    }
    
    return null; // No link available
  };

  const formatTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "เมื่อสักครู่";
    if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
    if (days < 7) return `${days} วันที่แล้ว`;
    return date.toLocaleDateString("th-TH", { month: "short", day: "numeric" });
  };

  const displayNotifications = unreadNotifications.length > 0 ? unreadNotifications : notifications.slice(0, 20);

  return (
    <div className="relative" ref={dropdownRef}>
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
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
          <div className="p-3 text-sm font-semibold border-b dark:border-slate-700 flex items-center justify-between">
            <span>{t("notifications", language) || "การแจ้งเตือน"}</span>
            {unreadCount > 0 && (
              <span className="text-xs text-gray-500 font-normal">
                {unreadCount} {t("unread", language) || "ยังไม่ได้อ่าน"}
              </span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {displayNotifications.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">
                {t("noNotifications", language) || "ไม่มีการแจ้งเตือน"}
              </div>
            ) : (
              <>
                {unreadNotifications.length > 0 && (
                  <>
                    {unreadNotifications.map((n) => (
                      <NotificationItem
                        key={n.id}
                        notification={n}
                        onMarkRead={markAsRead}
                        getLink={getNotificationLink}
                        formatTime={formatTime}
                      />
                    ))}
                    {readNotifications.length > 0 && (
                      <div className="p-2 text-xs text-gray-400 border-t dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                        {t("readNotifications", language) || "อ่านแล้ว"}
                      </div>
                    )}
                  </>
                )}
                {unreadNotifications.length === 0 &&
                  displayNotifications.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onMarkRead={markAsRead}
                      getLink={getNotificationLink}
                      formatTime={formatTime}
                    />
                  ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notification, onMarkRead, getLink, formatTime }) {
  const link = getLink(notification);
  const isRead = notification.read;

  const content = (
    <div
      className={`p-3 border-b last:border-b-0 dark:border-slate-700 text-sm transition-colors ${
        !isRead ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-slate-700/50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className={`font-medium ${!isRead ? "font-semibold" : ""}`}>{notification.title}</div>
          <div className="text-gray-600 dark:text-gray-400 text-xs mt-1">{notification.message}</div>
          <div className="text-gray-400 dark:text-gray-500 text-xs mt-1">
            {formatTime(notification.created_at)}
          </div>
          <div className="flex items-center gap-2 mt-2">
            {link && (
              <Link
                href={link}
                className="text-emerald-700 dark:text-emerald-400 text-xs hover:underline"
                onClick={(e) => {
                  // ไม่ mark as read อัตโนมัติเมื่อกดลิงก์
                  e.stopPropagation();
                }}
              >
                {notification.type === "qc_ready" 
                  ? "ไปยัง QC" 
                  : notification.type === "project_new"
                  ? "ไปยังโปรเจ็ค"
                  : notification.type === "item_code_new"
                  ? "ไปยังโปรเจ็ค"
                  : notification.ticket_no
                  ? "ดูรายละเอียด"
                  : "ดูรายละเอียด"}
              </Link>
            )}
            {!isRead && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMarkRead(notification.id, e);
                }}
                className="text-xs px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                title="Mark as read"
                aria-label="Mark as read"
              >
                อ่านแล้ว
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return content;
}


