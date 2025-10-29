"use client";

import { Home, Ticket, ClipboardCheck, Settings, Menu, X, Shield, User as UserIcon, Factory, History, FolderOpen, Database, BarChart3 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import UserProfile from "@/components/UserProfile";
import LanguageToggle from "@/components/LanguageToggle";
import NotificationBell from "@/components/NotificationBell";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { t } from "@/utils/translations";
import { hasPageAccess } from "@/utils/rolePermissions";

const navItems = [
  { href: "/dashboard", label: "dashboard", icon: <Home className="w-4 h-4" /> },
  { href: "/project", label: "project", icon: <FolderOpen className="w-4 h-4" /> },
  { href: "/tickets", label: "ticket", icon: <Ticket className="w-4 h-4" /> },
  { href: "/production", label: "production", icon: <Factory className="w-4 h-4" /> },
  { href: "/qc", label: "qc", icon: <ClipboardCheck className="w-4 h-4" /> },
  { href: "/log", label: "log", icon: <History className="w-4 h-4" /> },
  { href: "/reports", label: "reports", icon: <BarChart3 className="w-4 h-4" />, roles: ["Admin", "SuperAdmin", "Technician"] },
  { href: "/settings", label: "settings", icon: <Settings className="w-4 h-4" /> },
];

export default function PagesLayout({ children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mobileClosing, setMobileClosing] = useState(false);
  const [homeMode, setHomeMode] = useState(false);
  const [contentOut, setContentOut] = useState(false);
  const [sidebarAnimatingOut, setSidebarAnimatingOut] = useState(false);
  const { language } = useLanguage();
  const { user, isImpersonating, originalUser, exitImpersonate } = useAuth();

  // Filter navigation items based on user role (case-insensitive role check)
  const filteredNavItems = navItems.filter(item => {
    if (!user) return false;
    const userRoleLower = String(user.role || '').toLowerCase();

    // Check if item has specific role requirements
    if (item.roles) {
      const allowed = item.roles.map(r => String(r).toLowerCase());
      if (!allowed.includes(userRoleLower)) return false;
    }

    return hasPageAccess(user.role, item.href);
  });

  return (
    <ProtectedRoute>
    <div className={`min-h-screen w-full bg-[#f8fffe] dark:bg-slate-900 overflow-x-hidden ${isImpersonating ? 'pt-[104px]' : 'pt-[72px]'}`}>
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 shadow-sm fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-3 sm:px-4 py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <button className="xl:hidden p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => setOpen(true)}>
              <Menu className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 dark:text-gray-200" />
            </button>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-white shadow-md" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
              <Ticket className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 dark:text-gray-200 hidden xs:block">{t('systemTitle', language)}</span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 xs:hidden">{t('systemTitle', language)}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageToggle />
            <NotificationBell />
            <UserProfile />
          </div>
        </div>
      </header>

      {/* Impersonation Banner */}
      {isImpersonating && originalUser && (
        <div className="bg-orange-100 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800 px-4 py-2 fixed top-[72px] left-0 right-0 z-40">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm text-orange-800 dark:text-orange-200">
                {t('currentlyImpersonating', language)} <strong>{originalUser.name}</strong>
              </span>
            </div>
            <button
              onClick={exitImpersonate}
              className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white text-xs rounded-md transition-colors"
            >
              {t('exitImpersonate', language)}
            </button>
          </div>
        </div>
      )}

      <div className="w-full flex">
        {/* Sidebar - Hidden on tablet and mobile */}
        {(!homeMode || sidebarAnimatingOut) && (
          <aside className={`hidden xl:block w-[260px] shrink-0 xl:fixed xl:left-0 xl:z-30 ${homeMode ? "animate-slide-out-left" : ""} ${isImpersonating ? 'xl:top-[104px] xl:h-[calc(100vh-104px)]' : 'xl:top-[72px] xl:h-[calc(100vh-72px)]'}`}>
            <nav className="h-full overflow-y-auto bg-white dark:bg-slate-800 border-r border-slate-100 dark:border-slate-700 animate-slide-in-left max-w-[260px]">
              <div className="py-3">
                <Link
                  href="/"
                  className="pressable w-full text-left flex items-center gap-3 px-6 py-3 text-slate-700 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                >
                  <span className="inline-flex w-6"><Home className="w-4 h-4" /></span>
                  <span className="text-sm font-medium">{t('home', language)}</span>
                </Link>
              </div>
              <ul className="py-1">
                {filteredNavItems.map((item) => {
                  const active = !homeMode && (pathname === item.href || pathname.startsWith(item.href + "/"));
                  return (
                    <li key={item.href}>
                      <Link href={item.href} className={`pressable flex items-center gap-3 px-6 py-3 border-l-4 ${active ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 border-emerald-500" : "text-slate-600 dark:text-slate-400 border-transparent hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-500 hover:border-emerald-200"}`} onClick={() => setHomeMode(false)}>
                        <span className="inline-flex w-6">{item.icon}</span>
                        <span className="text-sm font-medium">{t(item.label, language)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>
        )}

        {/* Content */}
        <main className={`flex-1 px-3 sm:px-4 md:px-5 py-4 sm:py-6 ${!homeMode ? "xl:ml-[260px] xl:pl-6" : ""}`}>
          {!homeMode && (
            <div className={`${contentOut ? "animate-slide-out-left" : ""}`}>{children}</div>
          )}
          {homeMode && (
            <div className="home-slide-in-right max-w-6xl mx-auto text-center px-2 sm:px-4">
              <div className="mb-6 sm:mb-10">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('systemTitle', language)} EverGreen</h1>
                <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 dark:text-gray-400">{t('systemDescription', language)}</p>
              </div>
              {/* Function buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-2 gap-3 sm:gap-4 max-w-7xl mx-auto mt-4 sm:mt-6">
                <Link href="/" className="pressable group text-left bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-4 sm:py-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-emerald-400 transition-all duration-300 flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white shadow" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
                    <Home className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{t('home', language)}</div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 dark:text-gray-400">{t('getStarted', language)}</div>
                  </div>
                </Link>
                <Link href="/dashboard" onClick={() => setHomeMode(false)} className="pressable group text-left bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-4 sm:py-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-emerald-400 transition-all duration-300 flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white shadow" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
                    <Home className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{t('dashboard', language)}</div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 dark:text-gray-400">{t('dashboardOverview', language)}</div>
                  </div>
                </Link>
                <Link href="/project" onClick={() => setHomeMode(false)} className="pressable group text-left bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-4 sm:py-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-emerald-400 transition-all duration-300 flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white shadow" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
                    <FolderOpen className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{t('project', language)}</div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('manageProjects', language)}</div>
                  </div>
                </Link>
                <Link href="/tickets" onClick={() => setHomeMode(false)} className="pressable group text-left bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-4 sm:py-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-emerald-400 transition-all duration-300 flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white shadow" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
                    <Ticket className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{t('ticket', language)}</div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 dark:text-gray-400">{t('viewTickets', language)}</div>
                  </div>
                </Link>
                <Link href="/production" onClick={() => setHomeMode(false)} className="pressable group text-left bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-4 sm:py-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-emerald-400 transition-all duration-300 flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white shadow" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
                    <Factory className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{t('production', language)}</div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('manageProduction', language)}</div>
                  </div>
                </Link>
                <Link href="/qc" onClick={() => setHomeMode(false)} className="pressable group text-left bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-4 sm:py-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-emerald-400 transition-all duration-300 flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white shadow" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
                    <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{t('qc', language)}</div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('qualityControl', language)}</div>
                  </div>
                </Link>
                <Link href="/log" onClick={() => setHomeMode(false)} className="pressable group text-left bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-4 sm:py-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-emerald-400 transition-all duration-300 flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white shadow" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
                    <History className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{t('log', language)}</div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('activityHistory', language)}</div>
                  </div>
                </Link>
                <Link href="/settings" onClick={() => setHomeMode(false)} className="pressable group text-left bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-4 sm:py-5 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-emerald-400 transition-all duration-300 flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white shadow" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
                    <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{t('settings', language)}</div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('systemSettings', language)}</div>
                  </div>
                </Link>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3 mt-6 sm:mt-8 px-2 sm:px-4">
                {[
                  {l: t('allWork', language), n: 24},
                  {l: t('inProgressWork', language), n: 12},
                  {l: t('completedWork', language), n: 8},
                  {l: t('delayedWork', language), n: 4}
                ].map((s,i)=> (
                  <div key={i} className="rounded-xl sm:rounded-2xl text-white text-center p-4 sm:p-6 shadow-md" style={{background:"linear-gradient(135deg,#22d3a0,#1cb890)"}}>
                    <div className="text-lg sm:text-2xl font-bold">{s.n}</div>
                    <div className="opacity-90 text-xs sm:text-sm">{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Module card */}
              <div className="bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-slate-100 dark:border-slate-700 shadow-sm mt-4 sm:mt-6 max-w-6xl mx-auto text-left">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                  <div>
                    <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">{t('sampleModule', language)}</h3>
                    <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t('sampleContent', language)}</p>
                  </div>
                  <button className="pressable px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl text-white shadow hover:shadow-lg transition text-sm sm:text-base" style={{background:'#22d3a0'}}>{t('sampleButton', language)}</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile/Tablet sidebar */}
      {open && (
        <div className="xl:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 top-0 h-full w-[70%] sm:w-[60%] md:w-[50%] max-w-[300px] bg-white dark:bg-slate-800 shadow-xl ${mobileClosing ? "animate-slide-out-left" : "animate-slide-in-left"}`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <span className="font-medium text-gray-900 dark:text-gray-100">{t('menu', language)}</span>
              <button className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => setOpen(false)}>
                <X className="w-5 h-5 text-gray-900 dark:text-gray-100" />
              </button>
            </div>
            <nav className="py-3">
              <ul>
                <li>
                  <Link
                    href="/"
                    onClick={() => { setHomeMode(true); setOpen(false); }}
                    className="pressable w-full text-left flex items-center gap-3 px-5 py-3 text-slate-700 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  >
                    <span className="inline-flex w-6"><Home className="w-4 h-4" /></span>
                    <span className="text-sm font-medium">{t('home', language)}</span>
                  </Link>
                </li>
                {filteredNavItems.map((item) => {
                  const active = !homeMode && (pathname === item.href || pathname.startsWith(item.href + "/"));
                  return (
                    <li key={item.href}>
                      <Link href={item.href} onClick={() => { setHomeMode(false); setOpen(false); }} className={`pressable flex items-center gap-3 px-5 py-3 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 ${active ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" : "text-slate-700 dark:text-slate-300 hover:text-emerald-600"}`}>
                        <span className="inline-flex w-6">{item.icon}</span>
                        <span className="text-sm font-medium">{t(item.label, language)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </div>
      )}

      {/* Back to home */}
      {!homeMode && (
        <Link
          href="/"
          className={`pressable fixed right-3 sm:right-5 md:right-6 z-30 inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-emerald-500 text-white shadow-lg hover:scale-105 transition-all duration-200 ${isImpersonating ? "top-24 sm:top-28" : "top-20 sm:top-24"}`}
          title={t('backToHome', language)}
        >
          <Home className="w-4 h-4 sm:w-5 sm:h-5" />
        </Link>
      )}
    </div>
    </ProtectedRoute>
  );
}
