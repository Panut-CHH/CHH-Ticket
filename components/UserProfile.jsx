"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LogOut, User, Settings, Shield, UserCheck } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import ImpersonateModal from "./ImpersonateModal";
import { t } from "@/utils/translations";
import { hasPageAccess } from "@/utils/rolePermissions";

export default function UserProfile() {
  const { user, logout, isImpersonating, originalUser, exitImpersonate } = useAuth();
  const { language } = useLanguage();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const router = useRouter();

  if (!user) return null;

  // Check if user can impersonate (SuperAdmin or Admin)
  const userRoles = user.roles || (user.role ? [user.role] : []);
  const canImpersonate = userRoles.some(r => r === 'SuperAdmin' || r === 'superadmin' || r === 'Admin' || r === 'admin');

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-lg hover:bg-emerald-50 transition-colors"
      >
        <div className="relative">
          <img
            src={user.avatar || "/pictureUser/pictureUser_1.png"}
            alt={user.name}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover"
          />
          {isImpersonating && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-800"></div>
          )}
        </div>
        <div className="text-left hidden xs:block">
          <p className="text-xs sm:text-sm md:text-sm font-medium text-gray-800">
            {user.name}
            {isImpersonating && (
              <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                {t('impersonate', language)}
              </span>
            )}
          </p>
          <p className="text-[10px] sm:text-xs md:text-xs text-gray-600">{user.email}</p>
        </div>
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-44 sm:w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20">
            <div className="p-2">
              {/* Theme Toggle */}
              <div className="flex items-center justify-between p-2 rounded-lg">
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                  โหมดธีม
                </span>
                <ThemeToggle />
              </div>
              {hasPageAccess(user?.roles || user?.role, "/settings") && (
                <>
                  <hr className="my-2 border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      router.push("/settings");
                    }}
                    className="w-full flex items-center gap-2 sm:gap-3 p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-left"
                  >
                    <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                      {t('settings', language)}
                    </span>
                  </button>
                </>
              )}
              
              {/* Impersonate Button */}
              {canImpersonate && !isImpersonating && (
                <>
                  <hr className="my-2 border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      setShowImpersonateModal(true);
                    }}
                    className="w-full flex items-center gap-2 sm:gap-3 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                  >
                    <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs sm:text-sm text-blue-600 dark:text-blue-400">
                      {t('impersonateUser', language)}
                    </span>
                  </button>
                </>
              )}
              
              {/* Exit Impersonate Button */}
              {isImpersonating && (
                <>
                  <hr className="my-2 border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      exitImpersonate();
                    }}
                    className="w-full flex items-center gap-2 sm:gap-3 p-2 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors text-left"
                  >
                    <UserCheck className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <span className="text-xs sm:text-sm text-orange-600 dark:text-orange-400">
                      {t('exitImpersonate', language)}
                    </span>
                  </button>
                </>
              )}
              
              <hr className="my-2 border-gray-200 dark:border-gray-700" />
              <button
                onClick={async () => {
                  setShowDropdown(false);
                  await logout();
                  // Force redirect to login page and clear any cached state
                  window.location.href = '/login';
                }}
                className="w-full flex items-center gap-2 sm:gap-3 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
              >
                <LogOut className="w-4 h-4 text-red-500" />
                <span className="text-xs sm:text-sm text-red-500">ออกจากระบบ</span>
              </button>
            </div>
          </div>
        </>
      )}
      
      {/* Impersonate Modal */}
      <ImpersonateModal
        open={showImpersonateModal}
        onClose={() => setShowImpersonateModal(false)}
      />
    </div>
  );
}

