"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Loader2, CheckCircle, XCircle, AlertCircle, RefreshCcw,
  ChevronDown, ChevronUp, Search, ThumbsUp, ThumbsDown
} from "lucide-react";

export default function PenaltyReport() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [penalties, setPenalties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchPenalties = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/penalties?limit=200");
      const json = await res.json();
      if (json.success) {
        setPenalties(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch penalties:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPenalties();
  }, [fetchPenalties]);

  const filteredPenalties = useMemo(() => {
    let filtered = penalties.filter((p) => p.status === activeTab);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          (p.technician?.name || "").toLowerCase().includes(term) ||
          (p.proxy_user?.name || "").toLowerCase().includes(term) ||
          (p.ticket_no || "").toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [penalties, activeTab, searchTerm]);

  const pendingCount = useMemo(
    () => penalties.filter((p) => p.status === "pending").length,
    [penalties]
  );

  const handleApprove = async (id) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/penalties/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", user_id: user?.id }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchPenalties();
      }
    } catch (err) {
      console.error("Failed to approve:", err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/penalties/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          user_id: user?.id,
          rejection_reason: rejectionReason || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRejectingId(null);
        setRejectionReason("");
        await fetchPenalties();
      }
    } catch (err) {
      console.error("Failed to reject:", err);
    } finally {
      setProcessingId(null);
    }
  };

  const isAdmin = useMemo(() => {
    const roles = user?.roles || (user?.role ? [user.role] : []);
    return roles.some(
      (r) => String(r).toLowerCase() === "admin" || String(r).toLowerCase() === "superadmin"
    );
  }, [user]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const tabs = [
    { key: "pending", label: language === "th" ? "รออนุมัติ" : "Pending", color: "amber" },
    { key: "approved", label: language === "th" ? "อนุมัติแล้ว" : "Approved", color: "emerald" },
    { key: "rejected", label: language === "th" ? "ปฏิเสธ" : "Rejected", color: "rose" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {language === "th" ? "รายการหักเงิน (กดแทน)" : "Penalty Deductions (Proxy Actions)"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {language === "th"
              ? "รายการหักเงินเมื่อมีคนกดเริ่ม/เสร็จสิ้นงานแทนช่าง"
              : "Deduction records when someone acts on behalf of a technician"}
          </p>
        </div>
        <button
          onClick={fetchPenalties}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {language === "th" ? "รีเฟรช" : "Refresh"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-slate-700 pb-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg ${
              activeTab === tab.key
                ? `bg-${tab.color}-100 text-${tab.color}-700 dark:bg-${tab.color}-900/30 dark:text-${tab.color}-300`
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
            }`}
          >
            {tab.label}
            {tab.key === "pending" && pendingCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-amber-500 text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={language === "th" ? "ค้นหาชื่อช่าง, คนกดแทน, เลขตั๋ว..." : "Search technician, proxy, ticket..."}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          {language === "th" ? "กำลังโหลด..." : "Loading..."}
        </div>
      ) : filteredPenalties.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <AlertCircle className="w-10 h-10 mb-2" />
          <p>{language === "th" ? "ไม่มีรายการ" : "No records"}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  {language === "th" ? "ตั๋ว" : "Ticket"}
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  {language === "th" ? "สถานี" : "Station"}
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  {language === "th" ? "การกระทำ" : "Action"}
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  {language === "th" ? "ช่าง (ถูกหัก)" : "Technician"}
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  {language === "th" ? "คนกดแทน" : "Proxy"}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">
                  {language === "th" ? "จำนวนเงิน" : "Amount"}
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                  {language === "th" ? "วันที่" : "Date"}
                </th>
                {activeTab === "pending" && isAdmin && (
                  <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-400">
                    {language === "th" ? "จัดการ" : "Actions"}
                  </th>
                )}
                {activeTab === "approved" && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                    {language === "th" ? "อนุมัติโดย" : "Approved by"}
                  </th>
                )}
                {activeTab === "rejected" && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                    {language === "th" ? "เหตุผล" : "Reason"}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {filteredPenalties.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono text-xs">{p.ticket_no}</td>
                  <td className="px-4 py-3">
                    {p.station?.name_th || p.station?.code || "-"}
                    <span className="text-gray-400 text-xs ml-1">#{p.step_order}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.action === "start"
                          ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                          : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                      }`}
                    >
                      {p.action === "start"
                        ? language === "th" ? "เริ่มงาน" : "Start"
                        : language === "th" ? "เสร็จสิ้น" : "Complete"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{p.technician?.name || "-"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{p.proxy_user?.name || "-"}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {Number(p.amount).toLocaleString("th-TH")} ฿
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(p.created_at)}</td>

                  {/* Pending: approve/reject buttons */}
                  {activeTab === "pending" && isAdmin && (
                    <td className="px-4 py-3">
                      {rejectingId === p.id ? (
                        <div className="flex flex-col gap-1.5 min-w-[200px]">
                          <input
                            type="text"
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder={language === "th" ? "เหตุผล (ไม่บังคับ)" : "Reason (optional)"}
                            className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-rose-300"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleReject(p.id)}
                              disabled={processingId === p.id}
                              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs disabled:opacity-50"
                            >
                              {processingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
                              {language === "th" ? "ยืนยันปฏิเสธ" : "Confirm"}
                            </button>
                            <button
                              onClick={() => { setRejectingId(null); setRejectionReason(""); }}
                              className="px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-600 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700"
                            >
                              {language === "th" ? "ยกเลิก" : "Cancel"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleApprove(p.id)}
                            disabled={processingId === p.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs disabled:opacity-50"
                            title={language === "th" ? "อนุมัติ" : "Approve"}
                          >
                            {processingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
                            {language === "th" ? "อนุมัติ" : "Approve"}
                          </button>
                          <button
                            onClick={() => setRejectingId(p.id)}
                            disabled={processingId === p.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs disabled:opacity-50"
                            title={language === "th" ? "ปฏิเสธ" : "Reject"}
                          >
                            <ThumbsDown className="w-3 h-3" />
                            {language === "th" ? "ปฏิเสธ" : "Reject"}
                          </button>
                        </div>
                      )}
                    </td>
                  )}

                  {/* Approved: show approver */}
                  {activeTab === "approved" && (
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {p.approver?.name || "-"}
                      {p.approved_at && (
                        <div className="text-gray-400">{formatDate(p.approved_at)}</div>
                      )}
                    </td>
                  )}

                  {/* Rejected: show reason */}
                  {activeTab === "rejected" && (
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {p.rejection_reason || "-"}
                      {p.approver?.name && (
                        <div className="text-gray-400">
                          {language === "th" ? "โดย" : "by"} {p.approver.name}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {!loading && filteredPenalties.length > 0 && (
        <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800/60 rounded-xl px-4 py-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {language === "th" ? `${filteredPenalties.length} รายการ` : `${filteredPenalties.length} records`}
          </span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {language === "th" ? "รวม" : "Total"}:{" "}
            <span className="font-mono tabular-nums">
              {filteredPenalties
                .reduce((sum, p) => sum + Number(p.amount || 0), 0)
                .toLocaleString("th-TH")}{" "}
              ฿
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
