"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-12 h-6 bg-gray-200 rounded-full animate-pulse"></div>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`
        relative w-12 h-6 rounded-full transition-all duration-300 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
        ${isDark 
          ? "bg-emerald-600 shadow-lg shadow-emerald-600/25" 
          : "bg-gray-300 hover:bg-gray-400"
        }
      `}
      aria-label={`เปลี่ยนเป็นโหมด${isDark ? "สว่าง" : "มืด"}`}
    >
      {/* Toggle Circle */}
      <div
        className={`
          absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md
          transition-transform duration-300 ease-in-out
          flex items-center justify-center
          ${isDark ? "translate-x-6" : "translate-x-0.5"}
        `}
      >
        {isDark ? (
          <Moon className="w-3 h-3 text-emerald-600" />
        ) : (
          <Sun className="w-3 h-3 text-yellow-500" />
        )}
      </div>
    </button>
  );
}
