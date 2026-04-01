"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { Package, Loader2, ChevronDown, ChevronUp } from "lucide-react";

const fmt = (n) => {
  if (n === null || n === undefined) return "-";
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function SupplyWithdrawalSummary({ paymentRound }) {
  const { user } = useAuth();
  const { language } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState([]);
  const [expanded, setExpanded] = useState({});

  const loadSummary = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ user_id: user.id });
      if (paymentRound) params.set("payment_round", paymentRound);
      const res = await fetch(`/api/supply-withdrawals/summary?${params}`);
      const json = await res.json();
      if (json.success) setSummary(json.data || []);
    } catch (e) {
      console.error("Failed to load supply summary:", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id, paymentRound]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const toggleExpand = (techId) => {
    setExpanded((prev) => ({ ...prev, [techId]: !prev[techId] }));
  };

  const grandTotal = summary.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center gap-2 justify-center py-8 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">{language === "th" ? "กำลังโหลด..." : "Loading..."}</span>
      </div>
    );
  }

  if (summary.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
        {language === "th" ? "ไม่มีข้อมูลเบิกของในรอบนี้" : "No supply withdrawals in this round"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Grand total */}
      <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {t("supplyGrandTotal", language)}
          </span>
        </div>
        <span className="text-lg font-bold text-amber-800 dark:text-amber-200">
          ฿ {fmt(grandTotal)}
        </span>
      </div>

      {/* Per-technician breakdown */}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-700">
              <th className="text-left px-4 py-2 font-medium w-8"></th>
              <th className="text-left px-3 py-2 font-medium">{language === "th" ? "ช่าง" : "Technician"}</th>
              <th className="text-center px-3 py-2 font-medium">{language === "th" ? "จำนวนรายการ" : "Items"}</th>
              <th className="text-right px-4 py-2 font-medium">{t("supplyTotal", language)}</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <React.Fragment key={s.technician_id}>
                <tr
                  className="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer"
                  onClick={() => toggleExpand(s.technician_id)}
                >
                  <td className="px-4 py-2">
                    {expanded[s.technician_id]
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />
                    }
                  </td>
                  <td className="px-3 py-2 text-gray-800 dark:text-gray-200 font-medium">{s.technician_name}</td>
                  <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{s.item_count}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-gray-800 dark:text-gray-200">฿ {fmt(s.total_amount)}</td>
                </tr>
                {expanded[s.technician_id] && s.items && (
                  <tr>
                    <td colSpan={4} className="px-4 py-0">
                      <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg mb-2 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-slate-600">
                              <th className="text-left px-3 py-1.5">{t("supplyItemName", language)}</th>
                              <th className="text-right px-3 py-1.5">{t("supplyPrice", language)}</th>
                              <th className="text-center px-3 py-1.5">{t("supplyQuantity", language)}</th>
                              <th className="text-right px-3 py-1.5">{t("supplyTotal", language)}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.items.map((item, idx) => (
                              <tr key={idx} className="border-b border-gray-100 dark:border-slate-700/50">
                                <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{item.item_name}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-gray-500 dark:text-gray-400">{fmt(item.locked_price)}</td>
                                <td className="px-3 py-1.5 text-center text-gray-600 dark:text-gray-400">{item.quantity}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-gray-700 dark:text-gray-300">{fmt(item.total_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
