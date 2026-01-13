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

  // Filter buttons based on user roles
  const allowedButtons = pageButtons.filter(button => {
    if (!user) return false;
    return hasPageAccess(user.roles || user.role, button.path);
  });

  return (
    <>
      <div className="flex flex-col w-full min-h-screen bg-[#f8fffe] dark:bg-slate-900">
        {/* Header */}
        <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-30">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-3 sm:px-4 md:px-6 py-2 sm:py-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link href="/" aria-label="Go to Home" className="inline-flex">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-white shadow-md"
                     style={{background: "linear-gradient(135deg,#22d3a0,#1cb890)"}}>
                  <Home className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </Link>
              <span className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 dark:text-gray-200">{t('systemTitle', language)}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageToggle />
              {isAuthenticated && <NotificationBell />}
              {isAuthenticated ? (
                <UserProfile />
              ) : (
                <Button
                  color="primary"
                  size="sm"
                  className="text-xs sm:text-sm"
                  startContent={<LogIn className="w-3 h-3 sm:w-4 sm:h-4" />}
                  onPress={() => router.push("/login")}
                >
                  <span className="hidden sm:inline">{t('login', language)}</span>
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Home Section */}
        <main className="flex-1 px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-10">
          <div className="home-slide-in-right max-w-5xl mx-auto text-center">
            <div className="mb-6 sm:mb-8 md:mb-10">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-semibold text-gray-900 dark:text-gray-100 mb-2 px-2">{t('systemTitle', language)} EverGreen</h1>
              <p className="text-sm sm:text-base md:text-lg text-gray-500 dark:text-gray-400 px-2">{t('systemDescription', language)}</p>
            </div>      

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 md:gap-5 max-w-4xl mx-auto mt-4 sm:mt-6">
              {allowedButtons.map((button) => {
                const IconComponent = button.icon;
                return (
                  <button
                    key={button.path}
                    onClick={() => router.push(button.path)}
                    className="pressable group text-left bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-5 md:px-6 py-4 sm:py-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-emerald-400 transition-all duration-300 flex items-center gap-3 sm:gap-4"
                  >
                    <div
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white shadow flex-shrink-0"
                      style={{background: "linear-gradient(135deg,#22d3a0,#1cb890)"}}
                    >
                      <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 mb-0.5 truncate">{t(button.label, language)}</div>
                      <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{t(button.description, language)}</div>
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
