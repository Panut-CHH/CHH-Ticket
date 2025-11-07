"use client";

import React from "react";
import { AlertTriangle, Target, TrendingDown, TrendingUp, Info, BarChart3 } from "lucide-react";

export default function InsightAlert({ type, icon, title, description, action, onClick }) {
  const getIcon = () => {
    if (icon === "⚠️") return <AlertTriangle className="w-4 h-4" />;
    if (icon === "🎯") return <Target className="w-4 h-4" />;
    if (icon === "🐌") return <TrendingDown className="w-4 h-4" />;
    if (icon === "🔥") return <TrendingUp className="w-4 h-4" />;
    if (icon === "ℹ️") return <Info className="w-4 h-4" />;
    if (icon === "📊") return <BarChart3 className="w-4 h-4" />;
    return null;
  };

  const getColorClass = () => {
    switch (type) {
      case "warning":
        return "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200";
      case "success":
        return "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200";
      case "error":
        return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200";
      default:
        return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200";
    }
  };

  return (
    <div
      className={`border rounded-md p-2 text-xs ${getColorClass()} ${onClick ? "cursor-pointer hover:opacity-80" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex-shrink-0">
          {getIcon()}
        </div>
        <div className="flex-1">
          <div className="font-semibold mb-0.5">{title}</div>
          {description && (
            <div className="text-xs opacity-80 mb-1">{description}</div>
          )}
          {action && onClick && (
            <button className="text-xs underline font-medium mt-1">{action}</button>
          )}
        </div>
      </div>
    </div>
  );
}
