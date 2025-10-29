/*
 * ⚠️ CRITICAL THEME PROVIDER FILE ⚠️
 * DO NOT MODIFY THE ThemeProvider CONFIGURATION!
 * This file is essential for theme switching functionality.
 * Any changes to ThemeProvider settings may break the dark/light theme system.
 */

"use client";

import { HeroUIProvider } from "@heroui/react";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import NotificationBell from "@/components/NotificationBell";
import AuthErrorBoundary from "@/components/AuthErrorBoundary";

export function Providers({ children }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={true}
      disableTransitionOnChange
    >
      <HeroUIProvider>
        <LanguageProvider>
          <AuthErrorBoundary>
            <AuthProvider>
              <div className="min-h-screen flex flex-col">
                <main className="flex-1">{children}</main>
              </div>
            </AuthProvider>
          </AuthErrorBoundary>
        </LanguageProvider>
      </HeroUIProvider>
    </ThemeProvider>
  );
}
