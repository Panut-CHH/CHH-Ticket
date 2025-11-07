"use client";

import React from "react";

export default function KPICard({ title, value, icon }) {
  return (
    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{title}</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</div>
        </div>
        {icon && (
          <div className="text-2xl opacity-60">{icon}</div>
        )}
      </div>
    </div>
  );
}
