"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { supabase } from "@/utils/supabaseClient";
import {
  Package, RefreshCcw, Loader2, Plus, Save, Trash2, Search, Pencil, X
} from "lucide-react";

const noScroll = (e) => e.target.blur();

const formatRound = () => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const year = d.getFullYear();
  const yy = String(year).slice(-2);
  if (yy === "25" || year === 2025) return "1/26";
  return `${m}/${yy}`;
};

const formatDate = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const fmt = (n) => {
  if (n === null || n === undefined) return "-";
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function SupplyWithdrawalPage() {
  const { user } = useAuth();
  const { language } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Supply items (template)
  const [supplyItems, setSupplyItems] = useState([]);
  // Quantities for the template form
  const [quantities, setQuantities] = useState({});

  // Technicians list
  const [technicians, setTechnicians] = useState([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [paymentRound, setPaymentRound] = useState(formatRound());

  // Withdrawal history
  const [withdrawals, setWithdrawals] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTechFilter, setHistoryTechFilter] = useState("");
  const [historyRoundFilter, setHistoryRoundFilter] = useState("");
  const [historySearch, setHistorySearch] = useState("");

  // Add item modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category: "อื่นๆ", unit: "ชิ้น", price: "" });

  // Edit item modal
  const [editItem, setEditItem] = useState(null);

  // Submitting state
  const [submitting, setSubmitting] = useState(false);

  // Context menu for editing items
  const [contextItem, setContextItem] = useState(null);

  const loadSupplyItems = useCallback(async () => {
    try {
      const res = await fetch("/api/supply-items");
      const json = await res.json();
      if (json.success) setSupplyItems(json.data || []);
    } catch (e) {
      console.error("Failed to load supply items:", e);
    }
  }, []);

  const loadTechnicians = useCallback(async () => {
    const { data } = await supabase
      .from("users")
      .select("id, name, role, roles")
      .order("name");
    if (data) setTechnicians(data);
  }, []);

  const loadWithdrawals = useCallback(async () => {
    if (!user?.id) return;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ user_id: user.id });
      if (historyTechFilter) params.set("technician_id", historyTechFilter);
      if (historyRoundFilter) params.set("payment_round", historyRoundFilter);
      const res = await fetch(`/api/supply-withdrawals?${params}`);
      const json = await res.json();
      if (json.success) setWithdrawals(json.data || []);
    } catch (e) {
      console.error("Failed to load withdrawals:", e);
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.id, historyTechFilter, historyRoundFilter]);

  useEffect(() => {
    loadSupplyItems();
    loadTechnicians();
  }, [loadSupplyItems, loadTechnicians]);

  useEffect(() => {
    loadWithdrawals();
  }, [loadWithdrawals]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextItem) return;
    const close = () => setContextItem(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextItem]);

  // Group supply items by category
  const grouped = useMemo(() => {
    const map = {};
    for (const item of supplyItems) {
      const cat = item.category || "อื่นๆ";
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    return map;
  }, [supplyItems]);

  const categoryOrder = ["กระดาษทราย", "ลูกแม็ก", "กาว", "เทปกาว", "อื่นๆ"];
  const sortedCategories = useMemo(() => {
    const cats = Object.keys(grouped);
    return cats.sort((a, b) => {
      const ia = categoryOrder.indexOf(a);
      const ib = categoryOrder.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [grouped]);

  const setQty = (itemId, val) => {
    const num = Number(val);
    setQuantities((prev) => ({ ...prev, [itemId]: (val === "" || num <= 0) ? "" : val }));
  };

  // Local price overrides (for inline editing before saving to DB)
  const [priceOverrides, setPriceOverrides] = useState({});

  const getPrice = (item) => {
    if (priceOverrides[item.id] !== undefined) return Number(priceOverrides[item.id]) || 0;
    return item.price;
  };

  const setLocalPrice = (itemId, val) => {
    setPriceOverrides((prev) => ({ ...prev, [itemId]: val }));
  };

  // Save price to DB on blur
  const savePrice = async (item) => {
    const newPrice = priceOverrides[item.id];
    if (newPrice === undefined || Number(newPrice) === item.price) return;
    try {
      const res = await fetch("/api/supply-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: item.id,
          price: Number(newPrice),
          user_id: user.id,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      // Update local supplyItems state so it reflects the new price
      setSupplyItems((prev) =>
        prev.map((si) => (si.id === item.id ? { ...si, price: Number(newPrice) } : si))
      );
      setPriceOverrides((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch (e) {
      setError(e.message);
    }
  };

  const grandTotal = useMemo(() => {
    let total = 0;
    for (const item of supplyItems) {
      const qty = Number(quantities[item.id]) || 0;
      if (qty > 0) total += getPrice(item) * qty;
    }
    return total;
  }, [supplyItems, quantities, priceOverrides]);

  const itemsWithQty = useMemo(() => {
    return supplyItems.filter((item) => Number(quantities[item.id]) > 0);
  }, [supplyItems, quantities]);

  // Submit withdrawal
  const handleSubmit = async () => {
    if (!selectedTechnicianId) {
      setError(t("supplySelectTechnician", language));
      return;
    }
    if (itemsWithQty.length === 0) {
      setError(language === "th" ? "กรุณาใส่จำนวนอย่างน้อย 1 รายการ" : "Please enter quantity for at least 1 item");
      return;
    }
    if (!confirm(t("supplyConfirmSubmit", language))) return;

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/supply-withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          technician_id: selectedTechnicianId,
          payment_round: paymentRound,
          items: itemsWithQty.map((item) => ({
            supply_item_id: item.id,
            quantity: Number(quantities[item.id])
          })),
          user_id: user.id,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setSuccess(t("supplySuccessMessage", language));
      setQuantities({});
      loadWithdrawals();
    } catch (e) {
      setError(e.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  // Add custom item
  const handleAddItem = async () => {
    if (!newItem.name || !newItem.price) return;
    try {
      const res = await fetch("/api/supply-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          ...newItem,
          price: Number(newItem.price),
          user_id: user.id,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setShowAddModal(false);
      setNewItem({ name: "", category: "อื่นๆ", unit: "ชิ้น", price: "" });
      loadSupplyItems();
    } catch (e) {
      setError(e.message);
    }
  };

  // Update item
  const handleUpdateItem = async () => {
    if (!editItem) return;
    try {
      const res = await fetch("/api/supply-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editItem.id,
          name: editItem.name,
          category: editItem.category,
          unit: editItem.unit,
          price: Number(editItem.price),
          user_id: user.id,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setEditItem(null);
      loadSupplyItems();
    } catch (e) {
      setError(e.message);
    }
  };

  // Delete withdrawal record
  const handleDeleteWithdrawal = async (id) => {
    if (!confirm(t("supplyDeleteConfirm", language))) return;
    try {
      const res = await fetch("/api/supply-withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id, user_id: user.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      loadWithdrawals();
    } catch (e) {
      setError(e.message);
    }
  };

  // Delete supply item (soft)
  const handleDeleteItem = async (id) => {
    if (!confirm(t("supplyDeleteConfirm", language))) return;
    try {
      const res = await fetch("/api/supply-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id, user_id: user.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      loadSupplyItems();
    } catch (e) {
      setError(e.message);
    }
  };

  // Filtered withdrawals for history
  const filteredWithdrawals = useMemo(() => {
    let list = withdrawals;
    if (historySearch) {
      const s = historySearch.toLowerCase();
      list = list.filter(
        (w) =>
          (w.item_name || "").toLowerCase().includes(s) ||
          (w.technician_name || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [withdrawals, historySearch]);

  // Summary per technician from withdrawals
  const historySummary = useMemo(() => {
    const map = {};
    for (const w of filteredWithdrawals) {
      const key = `${w.technician_id}_${w.payment_round}`;
      if (!map[key]) {
        map[key] = { name: w.technician_name, round: w.payment_round, total: 0, count: 0 };
      }
      map[key].total += Number(w.total_amount) || 0;
      map[key].count += 1;
    }
    return Object.values(map);
  }, [filteredWithdrawals]);

  // Get unique rounds from withdrawals
  const availableRounds = useMemo(() => {
    const set = new Set(withdrawals.map((w) => w.payment_round));
    return [...set].sort();
  }, [withdrawals]);

  const selectedTechName = technicians.find((t) => t.id === selectedTechnicianId)?.name || "";

  return (
    <ProtectedRoute>
      <RoleGuard allowedRoles={["Admin", "SuperAdmin", "Manager", "HR"]}>
        <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 py-4 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-100">
                  {t("supplyWithdrawal", language)}
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {language === "th" ? "บันทึกการเบิกของสิ้นเปลืองของช่าง" : "Track technician supply withdrawals"}
                </p>
              </div>
            </div>
            <button
              onClick={() => { loadSupplyItems(); loadWithdrawals(); }}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <RefreshCcw className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Messages */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300 flex justify-between">
              <span>{error}</span>
              <button onClick={() => setError("")}><X className="w-4 h-4" /></button>
            </div>
          )}
          {success && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm text-emerald-700 dark:text-emerald-300 flex justify-between">
              <span>{success}</span>
              <button onClick={() => setSuccess("")}><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Controls Row */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {t("supplySelectTechnician", language)}
              </label>
              <select
                value={selectedTechnicianId}
                onChange={(e) => setSelectedTechnicianId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-gray-200"
              >
                <option value="">{language === "th" ? "-- เลือกช่าง --" : "-- Select --"}</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>{tech.name}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[120px]">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {t("supplyPaymentRound", language)}
              </label>
              <input
                type="text"
                value={paymentRound}
                onChange={(e) => setPaymentRound(e.target.value)}
                placeholder="M/YY"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-gray-200"
              />
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("supplyAddCustomItem", language)}
            </button>
          </div>

          {/* ===== TOP SECTION: Template Cards (PDF-style compact) ===== */}
          {supplyItems.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              {t("supplyNoItems", language)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {sortedCategories.map((cat) => {
                const catColors = {
                  "กระดาษทราย": "from-violet-600 to-violet-500",
                  "ลูกแม็ก": "from-blue-600 to-blue-500",
                  "กาว": "from-emerald-600 to-emerald-500",
                  "เทปกาว": "from-amber-600 to-amber-500",
                  "อื่นๆ": "from-gray-600 to-gray-500",
                };
                const grad = catColors[cat] || catColors["อื่นๆ"];
                const catTotal = grouped[cat].reduce((sum, item) => {
                  const qty = Number(quantities[item.id]) || 0;
                  return sum + getPrice(item) * qty;
                }, 0);

                return (
                  <div key={cat} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
                    {/* Category header */}
                    <div className={`bg-gradient-to-r ${grad} px-2.5 py-1.5 flex items-center justify-between`}>
                      <span className="text-[11px] font-bold text-white tracking-wide">{cat}</span>
                      {catTotal > 0 && (
                        <span className="text-[10px] font-mono text-white/80">{fmt(catTotal)}</span>
                      )}
                    </div>
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_62px_50px_68px] text-[10px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-600">
                      <div className="px-2 py-1">{language === "th" ? "รายการ" : "Item"}</div>
                      <div className="px-1 py-1 text-right">{language === "th" ? "ราคา" : "Price"}</div>
                      <div className="px-1 py-1 text-center">{language === "th" ? "เบิก" : "Qty"}</div>
                      <div className="px-1.5 py-1 text-right">{language === "th" ? "รวม" : "Total"}</div>
                    </div>
                    {/* Items */}
                    <div className="flex-1 divide-y divide-gray-100 dark:divide-slate-700/50">
                      {grouped[cat].map((item) => {
                        const price = getPrice(item);
                        const qty = Number(quantities[item.id]) || 0;
                        const rowTotal = price * qty;
                        const shortName = item.name.startsWith(cat + " ") ? item.name.slice(cat.length + 1) : item.name;
                        const priceChanged = priceOverrides[item.id] !== undefined && Number(priceOverrides[item.id]) !== item.price;
                        return (
                          <div
                            key={item.id}
                            className={`grid grid-cols-[1fr_62px_50px_68px] items-center group hover:bg-gray-50 dark:hover:bg-slate-700/30 ${qty > 0 ? "bg-emerald-50/60 dark:bg-emerald-900/10" : ""}`}
                            onContextMenu={(e) => { e.preventDefault(); setContextItem(contextItem?.id === item.id ? null : item); }}
                          >
                            <div className="px-2 py-[3px] text-[11px] text-gray-800 dark:text-gray-200 break-words" title={item.name}>
                              {shortName}
                            </div>
                            <div className="px-0.5 py-[2px]">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={priceOverrides[item.id] !== undefined ? priceOverrides[item.id] : item.price}
                                onChange={(e) => setLocalPrice(item.id, e.target.value === "" ? "" : e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onWheel={noScroll}
                                onBlur={() => savePrice(item)}
                                onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                                className={`w-full px-1 py-0 border rounded text-[11px] text-right font-mono tabular-nums bg-transparent dark:text-gray-300 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 ${priceChanged ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20" : "border-transparent hover:border-gray-300 dark:hover:border-slate-500"}`}
                              />
                            </div>
                            <div className="px-0.5 py-[3px] flex items-center justify-center gap-0.5">
                              <span className="text-gray-300 dark:text-gray-600 text-[10px] select-none">x</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={quantities[item.id] ?? ""}
                                onChange={(e) => setQty(item.id, e.target.value === "" ? "" : e.target.value)}
                                onWheel={noScroll}
                                className="w-[32px] px-0.5 py-0 border border-gray-200 dark:border-slate-600 rounded text-[11px] text-center bg-white dark:bg-slate-800 dark:text-gray-200 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 tabular-nums"
                                placeholder="-"
                              />
                            </div>
                            <div className={`px-1.5 py-[3px] text-[11px] text-right font-mono tabular-nums ${qty > 0 ? "text-emerald-700 dark:text-emerald-400 font-semibold" : "text-gray-300 dark:text-gray-600"}`}>
                              {qty > 0 ? fmt(rowTotal) : "-"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Context menu (floating) */}
          {contextItem && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => setContextItem(null)}
            >
              <div
                className="absolute z-50 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl py-1 min-w-[130px]"
                style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1 text-[10px] text-gray-400 dark:text-gray-500 font-semibold uppercase border-b border-gray-100 dark:border-slate-600">
                  {contextItem.name}
                </div>
                <button
                  onClick={() => { setEditItem({ ...contextItem }); setContextItem(null); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600 flex items-center gap-2"
                >
                  <Pencil className="w-3 h-3" /> {t("supplyEditItem", language)}
                </button>
                {contextItem.is_custom && (
                  <button
                    onClick={() => { handleDeleteItem(contextItem.id); setContextItem(null); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                  >
                    <Trash2 className="w-3 h-3" /> {t("supplyDeleteItem", language)}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Grand total + Submit bar */}
          {supplyItems.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {language === "th" ? "รายการที่เบิก" : "Items"}: <span className="font-semibold text-gray-700 dark:text-gray-200">{itemsWithQty.length}</span>
                </div>
                <div className="text-sm font-bold text-gray-900 dark:text-gray-50 font-mono tabular-nums">
                  {language === "th" ? "รวม" : "Total"}: ฿ {fmt(grandTotal)}
                </div>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || itemsWithQty.length === 0 || !selectedTechnicianId}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:dark:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t("supplySubmitWithdrawal", language)}
              </button>
            </div>
          )}

          {/* ===== BOTTOM SECTION: Withdrawal History ===== */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {t("supplyWithdrawalHistory", language)}
              </h2>
            </div>

            {/* History Filters */}
            <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder={language === "th" ? "ค้นหา..." : "Search..."}
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-gray-200"
                />
              </div>
              <select
                value={historyTechFilter}
                onChange={(e) => setHistoryTechFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-gray-200"
              >
                <option value="">{language === "th" ? "ทุกช่าง" : "All Technicians"}</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>{tech.name}</option>
                ))}
              </select>
              <select
                value={historyRoundFilter}
                onChange={(e) => setHistoryRoundFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-gray-200"
              >
                <option value="">{language === "th" ? "ทุกรอบ" : "All Rounds"}</option>
                {availableRounds.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* History Table */}
            <div className="overflow-x-auto">
              {historyLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-500" />
                </div>
              ) : filteredWithdrawals.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  {language === "th" ? "ยังไม่มีรายการเบิก" : "No withdrawal records"}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/30">
                      <th className="text-left px-4 py-2 font-medium">{language === "th" ? "วันที่" : "Date"}</th>
                      <th className="text-left px-3 py-2 font-medium">{language === "th" ? "ช่าง" : "Technician"}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("supplyItemName", language)}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("supplyCategory", language)}</th>
                      <th className="text-right px-3 py-2 font-medium">{t("supplyLockedPrice", language)}</th>
                      <th className="text-center px-3 py-2 font-medium">{t("supplyQuantity", language)}</th>
                      <th className="text-right px-3 py-2 font-medium">{t("supplyTotal", language)}</th>
                      <th className="text-center px-3 py-2 font-medium">{t("supplyPaymentRound", language)}</th>
                      <th className="w-12 px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWithdrawals.map((w) => (
                      <tr key={w.id} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                        <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{formatDate(w.created_at)}</td>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200 font-medium">{w.technician_name}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{w.item_name}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">{w.item_category || "-"}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{fmt(w.locked_price)}</td>
                        <td className="px-3 py-2 text-center font-mono text-gray-800 dark:text-gray-200">{w.quantity}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-gray-800 dark:text-gray-200">{fmt(w.total_amount)}</td>
                        <td className="px-3 py-2 text-center text-gray-500 dark:text-gray-400">{w.payment_round}</td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => handleDeleteWithdrawal(w.id)}
                            className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            title={t("supplyDeleteItem", language)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* History Summary */}
            {historySummary.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
                <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 uppercase">
                  {t("supplyTotalByTechnician", language)}
                </h3>
                <div className="flex flex-wrap gap-3">
                  {historySummary.map((s, i) => (
                    <div key={i} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600 px-3 py-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{s.name} ({s.round})</div>
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">฿ {fmt(s.total)}</div>
                      <div className="text-xs text-gray-400">{s.count} {language === "th" ? "รายการ" : "items"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== Add Item Modal ===== */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md mx-4 p-5">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
                {t("supplyAddCustomItem", language)}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {t("supplyItemName", language)} *
                  </label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-gray-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {t("supplyCategory", language)}
                    </label>
                    <select
                      value={newItem.category}
                      onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-gray-200"
                    >
                      {["กระดาษทราย", "ลูกแม็ก", "กาว", "เทปกาว", "อื่นๆ"].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {t("supplyUnit", language)}
                    </label>
                    <input
                      type="text"
                      value={newItem.unit}
                      onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-gray-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {t("supplyPrice", language)} (฿) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newItem.price}
                    onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                    onWheel={noScroll}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-gray-200"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  {language === "th" ? "ยกเลิก" : "Cancel"}
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={!newItem.name || !newItem.price}
                  className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 rounded-lg"
                >
                  {language === "th" ? "เพิ่ม" : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== Edit Item Modal ===== */}
        {editItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md mx-4 p-5">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
                {t("supplyEditItem", language)}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {t("supplyItemName", language)}
                  </label>
                  <input
                    type="text"
                    value={editItem.name}
                    onChange={(e) => setEditItem({ ...editItem, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-gray-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {t("supplyCategory", language)}
                    </label>
                    <select
                      value={editItem.category || "อื่นๆ"}
                      onChange={(e) => setEditItem({ ...editItem, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-gray-200"
                    >
                      {["กระดาษทราย", "ลูกแม็ก", "กาว", "เทปกาว", "อื่นๆ"].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {t("supplyUnit", language)}
                    </label>
                    <input
                      type="text"
                      value={editItem.unit}
                      onChange={(e) => setEditItem({ ...editItem, unit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-gray-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {t("supplyPrice", language)} (฿)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editItem.price}
                    onChange={(e) => setEditItem({ ...editItem, price: e.target.value })}
                    onWheel={noScroll}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-gray-200"
                  />
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {language === "th"
                    ? "⚠️ การแก้ราคาจะมีผลเฉพาะรายการเบิกใหม่ รายการเก่าจะยังใช้ราคาเดิม"
                    : "⚠️ Price changes only affect new withdrawals. Existing records keep their locked price."}
                </p>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setEditItem(null)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  {language === "th" ? "ยกเลิก" : "Cancel"}
                </button>
                <button
                  onClick={handleUpdateItem}
                  className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                >
                  {language === "th" ? "บันทึก" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </RoleGuard>
    </ProtectedRoute>
  );
}
