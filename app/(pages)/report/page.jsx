"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { supabase } from "@/utils/supabaseClient";
import { FileText, CheckCircle, XCircle, Loader2, RefreshCcw, AlertCircle, Calendar, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";

const formatRound = (dateInput) => {
  if (!dateInput) {
    // Default to current month/year
    const d = new Date();
    const m = d.getMonth() + 1;
    const yy = String(d.getFullYear()).slice(-2);
    return `${m}/${yy}`;
  }
  const d = new Date(dateInput);
  // Handle timezone issues - use UTC to avoid date shifting
  const year = d.getUTCFullYear();
  const yy = String(year).slice(-2);
  
  // ถ้าเป็นปี 2025 (25) ให้แสดงเป็นรอบ 1/26
  if (yy === '25' || year === 2025) {
    return '1/26';
  }
  
  const m = d.getUTCMonth() + 1;
  return `${m}/${yy}`;
};

const isAdminOrManager = (roles) => {
  const arr = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return arr
    .map((r) => String(r).toLowerCase())
    .some((r) => r === "admin" || r === "superadmin" || r === "manager" || r === "hr");
};

export default function ReportPage() {
  const { user } = useAuth();
  const { language } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("unpaid"); // unpaid | paid
  const [selectedRound, setSelectedRound] = useState(formatRound());

  const [rows, setRows] = useState([]);
  const [payments, setPayments] = useState([]);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedProject, setSelectedProject] = useState("");

  // Sort states
  const [sortKey, setSortKey] = useState(""); // ticketNo | round | technician | station | project | quantity | pricePerUnit | totalPrice
  const [sortDir, setSortDir] = useState("asc"); // asc | desc

  const canManage = isAdminOrManager(user?.roles || user?.role);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      // 1) completed station flows - เฉพาะสถานี "ปรับขนาด" และ "สี"
      const { data: flows, error: flowError } = await supabase
        .from("ticket_station_flow")
        .select(`
          ticket_no,
          station_id,
          step_order,
          status,
          completed_at,
          price_type,
          price,
          stations ( name_th, code )
        `)
        .eq("status", "completed")
        .not("completed_at", "is", null);

      if (flowError) throw flowError;

      // Filter เฉพาะสถานี "ปรับขนาด" และ "สี" (รองรับทั้งชื่อเก่าและใหม่)
      const filteredFlows = (flows || []).filter((flow) => {
        const stationName = (flow.stations?.name_th || flow.stations?.code || "").toLowerCase();
        return stationName === "ปรับขนาด" || stationName === "อัดบาน" || stationName === "สี" || 
               stationName.includes("ปรับขนาด") || stationName.includes("อัดบาน") || stationName.includes("สี");
      });

      // Debug: Log station names to see what we're getting
      console.log("[REPORT] Total flows loaded:", flows?.length || 0);
      const stationNames = (flows || []).map(f => f.stations?.name_th || f.stations?.code || "unknown");
      const uniqueStations = [...new Set(stationNames)];
      console.log("[REPORT] Unique stations found:", uniqueStations);
      const colorStations = (flows || []).filter(f => {
        const name = (f.stations?.name_th || f.stations?.code || "").toLowerCase();
        return name.includes("สี") || name.includes("color") || name.includes("paint");
      });
      console.log("[REPORT] Color/painting stations found:", colorStations.length, colorStations.map(f => ({
        station: f.stations?.name_th || f.stations?.code,
        ticket: f.ticket_no,
        status: f.status,
        completed_at: f.completed_at
      })));

      // 2) assignments
      const { data: assignmentData, error: assignmentError } = await supabase
        .from("ticket_assignments")
        .select(`
          ticket_no,
          station_id,
          step_order,
          technician_id,
          technician:users!ticket_assignments_technician_id_fkey ( name )
        `);
      if (assignmentError) throw assignmentError;

      // 3) tickets (for qty/project)
      const { data: ticketData, error: ticketError } = await supabase
        .from("ticket")
        .select("no, description, quantity, source_no");
      if (ticketError) throw ticketError;

      // 4) payments
      const { data: paymentData, error: paymentError } = await supabase
        .from("technician_payments")
        .select("*");
      if (paymentError) throw paymentError;

      const assignmentMap = {};
      (assignmentData || []).forEach((a) => {
        const key = `${a.ticket_no}-${a.station_id}-${a.step_order}`;
        if (!assignmentMap[key]) assignmentMap[key] = [];
        assignmentMap[key].push({
          id: a.technician_id,
          name: a.technician?.name || ""
        });
      });

      const ticketMap = new Map((ticketData || []).map((t) => [t.no, t]));

      const paymentMap = {};
      (paymentData || []).forEach((p) => {
        const key = `${p.ticket_no}-${p.station_id}-${p.step_order}-${p.technician_id}-${p.payment_round}`;
        paymentMap[key] = p;
      });

      const computedRows = [];

      (filteredFlows || []).forEach((flow) => {
        const key = `${flow.ticket_no}-${flow.station_id}-${flow.step_order}`;
        const technicians = assignmentMap[key] || [];
        const ticket = ticketMap.get(flow.ticket_no);
        const qty = typeof ticket?.quantity === "number" ? ticket.quantity : 0;
        const price = Number(flow.price) || 0;
        const priceType = flow.price_type || "flat";
        const pricePerUnit = priceType === "per_piece" ? price : price;
        const total = priceType === "per_piece" ? price * qty : price;
        const roundFromCompleted = formatRound(flow.completed_at);

        // ถ้ามี technician ให้แสดงแยกตาม technician แต่ละคน
        if (technicians.length > 0) {
          technicians.forEach((tech) => {
            const paymentKeyCurrent = `${flow.ticket_no}-${flow.station_id}-${flow.step_order}-${tech.id}-${roundFromCompleted}`;
            const paidRecord = paymentMap[paymentKeyCurrent];

            computedRows.push({
              ticketNo: flow.ticket_no,
              stationId: flow.station_id,
              stepOrder: flow.step_order,
              technicianId: tech.id,
              technicianName: tech.name || "-",
              stationName: flow.stations?.name_th || flow.stations?.code || "-",
              projectName: ticket?.description || ticket?.source_no || flow.ticket_no,
              quantity: qty,
              unit: "ชิ้น",
              pricePerUnit: pricePerUnit,
              totalPrice: total,
              round: paidRecord?.payment_round || roundFromCompleted,
              completedAt: flow.completed_at,
              paymentStatus: paidRecord?.status || "unpaid",
              paymentRecord: paidRecord || null
            });
          });
        } else {
          // ถ้าไม่มี technician ให้แสดงเป็น "-" หรือ "ยังไม่ได้มอบหมาย"
          // ใช้ null สำหรับ technician_id เพื่อให้ unique key ทำงานได้
          const paymentKeyCurrent = `${flow.ticket_no}-${flow.station_id}-${flow.step_order}-null-${roundFromCompleted}`;
          const paidRecord = paymentMap[paymentKeyCurrent];

          computedRows.push({
            ticketNo: flow.ticket_no,
            stationId: flow.station_id,
            stepOrder: flow.step_order,
            technicianId: null,
            technicianName: language === "th" ? "ยังไม่ได้มอบหมาย" : "Not Assigned",
            stationName: flow.stations?.name_th || flow.stations?.code || "-",
            projectName: ticket?.description || ticket?.source_no || flow.ticket_no,
            quantity: qty,
            unit: "ชิ้น",
            pricePerUnit: pricePerUnit,
            totalPrice: total,
            round: paidRecord?.payment_round || roundFromCompleted,
            completedAt: flow.completed_at,
            paymentStatus: paidRecord?.status || "unpaid",
            paymentRecord: paidRecord || null
          });
        }
      });

      setRows(computedRows);
      setPayments(paymentData || []);
    } catch (e) {
      console.error("[REPORT] load error:", e);
      setError(e?.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const availableRounds = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      set.add(r.round);
    });
    if (!set.has(selectedRound)) {
      set.add(selectedRound);
    }
    const sorted = Array.from(set).sort((a, b) => {
      const [ma, ya] = a.split("/").map(Number);
      const [mb, yb] = b.split("/").map(Number);
      if (ya !== yb) return yb - ya;
      return mb - ma;
    });
    
    // Auto-select the most recent round with data if current selection has no data
    if (sorted.length > 0 && !rows.some(r => r.round === selectedRound)) {
      const mostRecentRound = sorted[0];
      if (mostRecentRound !== selectedRound) {
        // Update selectedRound to the most recent round with data
        setTimeout(() => setSelectedRound(mostRecentRound), 0);
      }
    }
    
    return sorted;
  }, [rows, selectedRound]);

  // Get unique values for filters
  const availableTechnicians = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      if (r.technicianName) set.add(r.technicianName);
    });
    return Array.from(set).sort();
  }, [rows]);

  const availableStations = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      if (r.stationName) set.add(r.stationName);
    });
    return Array.from(set).sort();
  }, [rows]);

  const availableProjects = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      if (r.projectName) set.add(r.projectName);
    });
    return Array.from(set).sort();
  }, [rows]);

  // Filter and sort function
  const filterAndSort = (data) => {
    let filtered = [...data];

    // Apply search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.ticketNo.toLowerCase().includes(term) ||
          r.technicianName.toLowerCase().includes(term) ||
          r.stationName.toLowerCase().includes(term) ||
          r.projectName.toLowerCase().includes(term)
      );
    }

    // Apply filters
    if (selectedTechnician) {
      filtered = filtered.filter((r) => r.technicianName === selectedTechnician);
    }
    if (selectedStation) {
      filtered = filtered.filter((r) => r.stationName === selectedStation);
    }
    if (selectedProject) {
      filtered = filtered.filter((r) => r.projectName === selectedProject);
    }

    // Apply sorting
    if (sortKey) {
      filtered.sort((a, b) => {
        let av, bv;
        switch (sortKey) {
          case "ticketNo":
            av = a.ticketNo;
            bv = b.ticketNo;
            break;
          case "round":
            const [ma, ya] = a.round.split("/").map(Number);
            const [mb, yb] = b.round.split("/").map(Number);
            av = ya * 100 + ma;
            bv = yb * 100 + mb;
            break;
          case "technician":
            av = a.technicianName;
            bv = b.technicianName;
            break;
          case "station":
            av = a.stationName;
            bv = b.stationName;
            break;
          case "project":
            av = a.projectName;
            bv = b.projectName;
            break;
          case "quantity":
            av = a.quantity;
            bv = b.quantity;
            break;
          case "pricePerUnit":
            av = a.pricePerUnit;
            bv = b.pricePerUnit;
            break;
          case "totalPrice":
            av = a.totalPrice;
            bv = b.totalPrice;
            break;
          default:
            return 0;
        }
        if (typeof av === "string" && typeof bv === "string") {
          return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        const diff = av - bv;
        return sortDir === "asc" ? diff : -diff;
      });
    }

    return filtered;
  };

  const unpaidRows = useMemo(() => {
    const base = rows
      .filter((r) => r.paymentStatus !== "paid" && r.paymentStatus !== "cancelled")
      .filter((r) => r.round === selectedRound);
    return filterAndSort(base);
  }, [rows, selectedRound, searchTerm, selectedTechnician, selectedStation, selectedProject, sortKey, sortDir]);

  const paidRows = useMemo(() => {
    const base = rows
      .filter((r) => r.paymentStatus === "paid")
      .filter((r) => r.round === selectedRound);
    return filterAndSort(base);
  }, [rows, selectedRound, searchTerm, selectedTechnician, selectedStation, selectedProject, sortKey, sortDir]);

  const handleAction = async (row, action) => {
    if (!canManage) return;
    try {
      const payload = {
        action,
        ticket_no: row.ticketNo,
        station_id: row.stationId,
        step_order: row.stepOrder,
        technician_id: row.technicianId,
        payment_amount: row.totalPrice,
        quantity: row.quantity,
        unit: row.unit,
        price_per_unit: row.pricePerUnit,
        project_name: row.projectName,
        payment_date: new Date().toISOString(),
        user_id: user?.id
      };
      const res = await fetch("/api/report/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Request failed");
      }
      await loadData();
    } catch (e) {
      console.error("[REPORT] action error:", e);
      alert(e?.message || "ไม่สามารถทำรายการได้");
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortableHeader = ({ sortKey: key, children }) => (
    <th
      className="px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 select-none"
      onClick={() => handleSort(key)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortKey === key ? (
          sortDir === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </th>
  );

  const renderTable = (data, isPaid) => (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
        <thead className="bg-gray-50 dark:bg-slate-900/40">
          <tr className="text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
            <SortableHeader sortKey="ticketNo">No.</SortableHeader>
            <SortableHeader sortKey="round">{t("round", language)}</SortableHeader>
            <SortableHeader sortKey="technician">{t("technician", language) || "Technician"}</SortableHeader>
            <SortableHeader sortKey="station">{language === "th" ? "สถานี" : "Station"}</SortableHeader>
            <SortableHeader sortKey="project">Project</SortableHeader>
            <SortableHeader sortKey="quantity">{t("quantity", language)}</SortableHeader>
            <SortableHeader sortKey="pricePerUnit">{t("price", language) || "Price/unit"}</SortableHeader>
            <SortableHeader sortKey="totalPrice">{t("total", language) || "Total"}</SortableHeader>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-700 text-sm">
          {data.map((row) => (
            <tr key={`${row.ticketNo}-${row.stationId}-${row.stepOrder}-${row.technicianId}-${row.round}`}>
              <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-800 dark:text-gray-200">{row.ticketNo}</td>
              <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-200">{row.round}</td>
              <td className="px-4 py-3 text-gray-800 dark:text-gray-100 font-medium">{row.technicianName}</td>
              <td className="px-4 py-3 text-gray-800 dark:text-gray-100">{row.stationName}</td>
              <td className="px-4 py-3 text-gray-800 dark:text-gray-100">{row.projectName}</td>
              <td className="px-4 py-3 text-gray-800 dark:text-gray-100">{row.quantity}</td>
              <td className="px-4 py-3 text-gray-800 dark:text-gray-100">
                {row.pricePerUnit.toLocaleString()} บาท
              </td>
              <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-semibold">
                {row.totalPrice.toLocaleString()} บาท
              </td>
              <td className="px-4 py-3 text-right">
                {canManage ? (
                  <div className="flex items-center justify-end gap-2">
                    {!isPaid && (
                      <button
                        onClick={() => handleAction(row, "confirm")}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {t("confirmPayment", language)}
                      </button>
                    )}
                    {isPaid && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                        <CheckCircle className="w-4 h-4" />
                        {t("paidItems", language)}
                      </span>
                    )}
                    <button
                      onClick={() => handleAction(row, "cancel")}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-100 text-rose-700 text-xs hover:bg-rose-200"
                    >
                      <XCircle className="w-4 h-4" />
                      {t("cancelPayment", language)}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500">{t("accessDenied", language)}</span>
                )}
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {t("noData", language)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/report">
        <div className="min-h-screen container-safe px-3 sm:px-4 md:px-6 lg:px-8 py-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 text-gray-800 dark:text-gray-100">
                <FileText className="w-5 h-5" />
                <h1 className="text-xl sm:text-2xl font-semibold">{t("paymentReport", language)}</h1>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {language === "th"
                  ? "สรุปยอดจ่ายช่างรายสถานี แสดงเฉพาะสถานีที่เสร็จแล้ว"
                  : "Payment summary per technician and station (completed only)"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedRound}
                onChange={(e) => setSelectedRound(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                {availableRounds.map((r) => (
                  <option key={r} value={r}>{`${t("round", language)} ${r}`}</option>
                ))}
              </select>
              <button
                onClick={loadData}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                <RefreshCcw className="w-4 h-4" />
                {language === "th" ? "รีเฟรช" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-slate-700 pb-2">
            <button
              onClick={() => setActiveTab("unpaid")}
              className={`px-3 py-2 text-sm font-medium rounded-lg ${
                activeTab === "unpaid"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
              }`}
            >
              {t("unpaidItems", language)}
            </button>
            <button
              onClick={() => setActiveTab("paid")}
              className={`px-3 py-2 text-sm font-medium rounded-lg ${
                activeTab === "paid"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
              }`}
            >
              {t("paidItems", language)}
            </button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
            {/* Search */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-gray-400" />
              </div>
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder={language === "th" ? "ค้นหา..." : "Search..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Technician Filter */}
            <div className="relative">
              <select
                value={selectedTechnician}
                onChange={(e) => setSelectedTechnician(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
              >
                <option value="">{language === "th" ? "👤 ช่างทั้งหมด" : "👤 All Technicians"}</option>
                {availableTechnicians.map((tech) => (
                  <option key={tech} value={tech}>{tech}</option>
                ))}
              </select>
              {selectedTechnician && (
                <button
                  onClick={() => setSelectedTechnician("")}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center"
                >
                  <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                </button>
              )}
            </div>

            {/* Station Filter */}
            <div className="relative">
              <select
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
              >
                <option value="">{language === "th" ? "📍 สถานีทั้งหมด" : "📍 All Stations"}</option>
                {availableStations.map((station) => (
                  <option key={station} value={station}>{station}</option>
                ))}
              </select>
              {selectedStation && (
                <button
                  onClick={() => setSelectedStation("")}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center"
                >
                  <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                </button>
              )}
            </div>

            {/* Project Filter */}
            <div className="relative">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
              >
                <option value="">{language === "th" ? "🏢 โครงการทั้งหมด" : "🏢 All Projects"}</option>
                {availableProjects.map((project) => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
              {selectedProject && (
                <button
                  onClick={() => setSelectedProject("")}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center"
                >
                  <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                </button>
              )}
            </div>
          </div>

          {/* Clear Filters Button */}
          {(searchTerm || selectedTechnician || selectedStation || selectedProject) && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedTechnician("");
                  setSelectedStation("");
                  setSelectedProject("");
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
              >
                <X className="w-3 h-3" />
                {language === "th" ? "ล้างตัวกรอง" : "Clear Filters"}
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("loading", language)}
            </div>
          ) : activeTab === "unpaid" ? (
            renderTable(unpaidRows, false)
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Calendar className="w-4 h-4" />
                {language === "th" ? "แสดงรายการจ่ายแล้วตามรอบที่เลือก" : "Showing paid items for the selected round"}
              </div>
              {renderTable(paidRows, true)}
            </div>
          )}
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}

