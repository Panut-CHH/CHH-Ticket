"use client";

import React, { useState, memo } from "react";

const noScroll = (e) => e.target.blur();

function MiscDeductionForm({ technicians, rounds, defaultRound, language, userId, onAdded }) {
  const [form, setForm] = useState({ technician_id: "", description: "", quantity: "1", price: "", payment_round: defaultRound || "" });
  const [adding, setAdding] = useState(false);

  const handleSubmit = async () => {
    if (!form.technician_id || !form.description || !form.price) return;
    setAdding(true);
    try {
      const tech = technicians.find((t) => t.id === form.technician_id);
      const res = await fetch("/api/misc-deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          technician_id: form.technician_id,
          technician_name: tech?.name || "-",
          description: form.description,
          quantity: Number(form.quantity) || 1,
          price: Number(form.price) || 0,
          payment_round: form.payment_round || defaultRound,
          user_id: userId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setForm({ technician_id: "", description: "", quantity: "1", price: "", payment_round: form.payment_round });
        onAdded?.();
      }
    } catch (_) {}
    setAdding(false);
  };

  return (
    <div className="px-4 py-2 border-b border-purple-100 dark:border-purple-800/50 bg-purple-50/30 dark:bg-purple-900/5">
      <div className="flex flex-wrap gap-2 items-end">
        <select
          value={form.technician_id}
          onChange={(e) => setForm({ ...form, technician_id: e.target.value })}
          className="px-2 py-1.5 border border-purple-200 dark:border-purple-700 rounded-lg text-xs bg-white dark:bg-slate-800 dark:text-gray-200 min-w-[120px]"
        >
          <option value="">{language === "th" ? "เลือกช่าง" : "Technician"}</option>
          {technicians.map((tech) => (
            <option key={tech.id} value={tech.id}>{tech.name}</option>
          ))}
        </select>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={language === "th" ? "รายละเอียด..." : "Description..."}
          className="flex-1 min-w-[140px] px-2 py-1.5 border border-purple-200 dark:border-purple-700 rounded-lg text-xs bg-white dark:bg-slate-800 dark:text-gray-200"
        />
        <input
          type="number"
          min="1"
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          onWheel={noScroll}
          placeholder={language === "th" ? "จำนวน" : "Qty"}
          className="w-[60px] px-2 py-1.5 border border-purple-200 dark:border-purple-700 rounded-lg text-xs text-center bg-white dark:bg-slate-800 dark:text-gray-200"
        />
        <input
          type="number"
          min="0"
          step="any"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          onWheel={noScroll}
          placeholder={language === "th" ? "ราคา" : "Price"}
          className="w-[90px] px-2 py-1.5 border border-purple-200 dark:border-purple-700 rounded-lg text-xs text-right bg-white dark:bg-slate-800 dark:text-gray-200"
        />
        <select
          value={form.payment_round}
          onChange={(e) => setForm({ ...form, payment_round: e.target.value })}
          className="w-[80px] px-1 py-1.5 border border-purple-200 dark:border-purple-700 rounded-lg text-xs text-center bg-white dark:bg-slate-800 dark:text-gray-200"
        >
          {rounds.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
          {!rounds.includes(form.payment_round) && form.payment_round && (
            <option value={form.payment_round}>{form.payment_round}</option>
          )}
        </select>
        <button
          disabled={adding || !form.technician_id || !form.description || !form.price}
          onClick={handleSubmit}
          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:dark:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          {adding ? "..." : (language === "th" ? "+ เพิ่ม" : "+ Add")}
        </button>
      </div>
    </div>
  );
}

export default memo(MiscDeductionForm);
