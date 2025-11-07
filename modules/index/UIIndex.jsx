"use client";

import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@heroui/react";
import { LogIn, User, Shield, Home, Ticket, Settings, ClipboardCheck, Factory, History, FolderOpen } from "lucide-react";
import UserProfile from "@/components/UserProfile";
import LanguageToggle from "@/components/LanguageToggle";
import NotificationBell from "@/components/NotificationBell";
import { t } from "@/utils/translations";
import { hasPageAccess } from "@/utils/rolePermissions";

export default function UIIndex() {
  const { isAuthenticated, user } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();

  // Define all possible page buttons
  const pageButtons = [
    { path: "/dashboard", label: "dashboard", description: "dashboardOverview", icon: Home },
    { path: "/project", label: "project", description: "manageProjects", icon: FolderOpen },
    { path: "/tickets", label: "ticket", description: "viewTickets", icon: Ticket },
    { path: "/production", label: "production", description: "manageProduction", icon: Factory },
    { path: "/qc", label: "qc", description: "qualityControl", icon: ClipboardCheck },
    { path: "/log", label: "log", description: "activityHistory", icon: History },
    { path: "/settings", label: "settings", description: "systemSettings", icon: Settings },
  ];

  // Filter buttons based on user role
  const allowedButtons = pageButtons.filter(button => {
    if (!user) return false;
    return hasPageAccess(user.role, button.path);
  });

  return (
    <>
      <div className="flex flex-col w-full min-h-screen bg-[#f8fffe] dark:bg-slate-900">
        {/* Header */}
        <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-30">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Link href="/" aria-label="Go to Home" className="inline-flex">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-md"
                     style={{background: "linear-gradient(135deg,#22d3a0,#1cb890)"}}>
                  <Home className="w-5 h-5" />
                </div>
              </Link>
              <span className="text-xl font-semibold text-gray-800 dark:text-gray-200">{t('systemTitle', language)}</span>
            </div>
            <div className="flex items-center gap-3">
              <LanguageToggle />
              {isAuthenticated && <NotificationBell />}
              {isAuthenticated ? (
                <UserProfile />
              ) : (
                <Button
                  color="primary"
                  startContent={<LogIn className="w-4 h-4" />}
                  onPress={() => router.push("/login")}
                >
                  {t('login', language)}
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Home Section */}
        <main className="flex-1 px-4 py-8">
          <div className="home-slide-in-right max-w-5xl mx-auto text-center">
            <div className="mb-10">
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('systemTitle', language)} EverGreen</h1>
              <p className="text-gray-500 dark:text-gray-400 dark:text-gray-400">{t('systemDescription', language)}</p>
            </div>      

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 max-w-4xl mx-auto mt-6">
              {allowedButtons.map((button) => {
                const IconComponent = button.icon;
                return (
                  <button
                    key={button.path}
                    onClick={() => router.push(button.path)}
                    className="pressable group text-left bg-white dark:bg-slate-800 rounded-2xl px-6 py-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-emerald-400 transition-all duration-300 flex items-center gap-4"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow"
                      style={{background: "linear-gradient(135deg,#22d3a0,#1cb890)"}}
                    >
                      <IconComponent className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{t(button.label, language)}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{t(button.description, language)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
