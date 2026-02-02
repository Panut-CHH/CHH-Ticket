"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { supabase } from "@/utils/supabaseClient";
import { FileText, CheckCircle, XCircle, Loader2, RefreshCcw, AlertCircle, Calendar, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, X, MoreVertical, Image as ImageIcon, LayoutList, Banknote, Package } from "lucide-react";
import DocumentViewer from "@/components/DocumentViewer";

/** เซลล์ชื่อ Project: บรรทัดเดียว ตัดด้วย ... ชี้แล้วเด้งกรอบแสดงชื่อเต็ม (Portal tooltip) */
const PROJECT_CELL_WIDTH = 240;

function ProjectCell({ text, onShow, onHide }) {
  const hideTimerRef = useRef(null);

  const handleMouseEnter = (e) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (text && onShow) onShow(text, e.currentTarget);
  };

  const handleMouseLeave = () => {
    if (onHide) {
      hideTimerRef.current = setTimeout(onHide, 120);
    }
  };

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  if (!text) return <span className="text-gray-500">-</span>;

  return (
    <span
      className="block truncate max-w-full cursor-default"
      style={{ maxWidth: PROJECT_CELL_WIDTH }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {text}
    </span>
  );
}

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

/** แปลง ISO date เป็น dd/mm/yy สำหรับคอลัมน์ QC เสร็จเมื่อ */
const formatQcCompletedAt = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
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
  const [activeTab, setActiveTab] = useState("unpaid"); // unpaid | paid | cancelled

  const [rows, setRows] = useState([]);
  const [payments, setPayments] = useState([]);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedProject, setSelectedProject] = useState("");

  // Sort states
  const [sortKey, setSortKey] = useState(""); // ticketNo | technician | station | project | quantity | pricePerUnit | totalPrice
  const [sortDir, setSortDir] = useState("asc"); // asc | desc

  // Actions dropdown: ซึ่งแถวเปิดเมนู ... (null = ปิด)
  const [openActionsKey, setOpenActionsKey] = useState(null);

  // Project tooltip: ชี้แล้วเด้งกรอบแสดงชื่อเต็ม (Portal)
  const [projectTooltip, setProjectTooltip] = useState(null); // null | { text, left, top }
  const hideTooltipRef = useRef(null);

  // แสดงภาพแปลน: โมดัลแสดงแบบแปลนจาก project
  const [planModal, setPlanModal] = useState(null); // null | { ticketNo, sourceNo }
  const [planFile, setPlanFile] = useState(null); // null | { file_url, file_name, file_type }
  const [planLoading, setPlanLoading] = useState(false);

  const showProjectTooltip = useCallback((text, element) => {
    if (hideTooltipRef.current) {
      clearTimeout(hideTooltipRef.current);
      hideTooltipRef.current = null;
    }
    const rect = element.getBoundingClientRect();
    setProjectTooltip({ text, left: rect.left, top: rect.bottom + 6 });
  }, []);

  const hideProjectTooltip = useCallback(() => {
    hideTooltipRef.current = setTimeout(() => setProjectTooltip(null), 180);
  }, []);

  useEffect(() => () => {
    if (hideTooltipRef.current) clearTimeout(hideTooltipRef.current);
  }, []);

  // โหลดแบบแปลนเมื่อเปิดโมดัล
  const fetchPlanFile = useCallback(async (sourceNo) => {
    if (!sourceNo) return null;
    const { data: item } = await supabase
      .from("project_items")
      .select("id")
      .eq("item_code", sourceNo)
      .maybeSingle();
    if (!item) return null;
    const { data: file } = await supabase
      .from("project_files")
      .select("file_url, file_name, file_type")
      .eq("project_item_id", item.id)
      .eq("is_current", true)
      .maybeSingle();
    return file;
  }, []);

  useEffect(() => {
    if (!planModal) {
      setPlanFile(null);
      return;
    }
    let cancelled = false;
    setPlanLoading(true);
    setPlanFile(null);
    fetchPlanFile(planModal.sourceNo).then((file) => {
      if (!cancelled) {
        setPlanFile(file || null);
        setPlanLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setPlanLoading(false);
    });
    return () => { cancelled = true; };
  }, [planModal, fetchPlanFile]);

  const openPlanModal = useCallback((row) => {
    setOpenActionsKey(null);
    setPlanModal({ ticketNo: row.ticketNo, sourceNo: row.sourceNo });
  }, []);

  const closePlanModal = useCallback(() => {
    setPlanModal(null);
    setPlanFile(null);
  }, []);

  const canManage = isAdminOrManager(user?.roles || user?.role);

  // ปิดเมนู Actions เมื่อคลิกนอก
  useEffect(() => {
    if (!openActionsKey) return;
    const close = (e) => {
      if (!e.target.closest(".report-actions-dropdown")) setOpenActionsKey(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openActionsKey]);

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

      // 4) payments — ดึงผ่าน API (service role) เพื่อให้เห็น record ที่เพิ่ง insert หลังรีเฟรช
      let paymentData = [];
      if (user?.id) {
        try {
          const payRes = await fetch(`/api/report/payments?user_id=${encodeURIComponent(user.id)}`);
          const payJson = await payRes.json().catch(() => ({}));
          if (payRes.ok && payJson.success && Array.isArray(payJson.data)) {
            paymentData = payJson.data;
          } else {
            const { data: fallback } = await supabase.from("technician_payments").select("*");
            paymentData = fallback || [];
          }
        } catch (_) {
          const { data: fallback } = await supabase.from("technician_payments").select("*");
          paymentData = fallback || [];
        }
      } else {
        const { data: fallback, error: paymentError } = await supabase
          .from("technician_payments")
          .select("*");
        if (paymentError) throw paymentError;
        paymentData = fallback || [];
      }

      // 5) qc_sessions - เวลา QC เสร็จ (ใช้ completed_at จาก QC session ถ้ามี)
      const ticketNos = [...new Set((filteredFlows || []).map((f) => f.ticket_no))];
      let qcCompletedMap = {};
      if (ticketNos.length > 0) {
        const { data: qcSessions, error: qcError } = await supabase
          .from("qc_sessions")
          .select("ticket_no, station_id, step_order, completed_at")
          .in("ticket_no", ticketNos)
          .not("completed_at", "is", null);
        if (!qcError && qcSessions?.length) {
          qcSessions.forEach((s) => {
            const key = `${s.ticket_no}-${s.station_id}-${s.step_order}`;
            const existing = qcCompletedMap[key];
            const at = s.completed_at;
            if (!existing || (at && new Date(at) > new Date(existing))) {
              qcCompletedMap[key] = at;
            }
          });
        }
      }

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
        const flowKey = `${flow.ticket_no}-${flow.station_id}-${flow.step_order}`;
        const qcCompletedAt = qcCompletedMap[flowKey] || flow.completed_at;

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
              sourceNo: ticket?.source_no ?? null,
              quantity: qty,
              unit: "ชิ้น",
              pricePerUnit: pricePerUnit,
              totalPrice: total,
              round: paidRecord?.payment_round || roundFromCompleted,
              completedAt: flow.completed_at,
              qcCompletedAt,
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
            sourceNo: ticket?.source_no ?? null,
            quantity: qty,
            unit: "ชิ้น",
            pricePerUnit: pricePerUnit,
            totalPrice: total,
            round: paidRecord?.payment_round || roundFromCompleted,
            completedAt: flow.completed_at,
            qcCompletedAt,
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
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
          case "qcCompletedAt":
            av = a.qcCompletedAt ? new Date(a.qcCompletedAt).getTime() : 0;
            bv = b.qcCompletedAt ? new Date(b.qcCompletedAt).getTime() : 0;
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
    const base = rows.filter((r) => r.paymentStatus !== "paid" && r.paymentStatus !== "cancelled");
    return filterAndSort(base);
  }, [rows, searchTerm, selectedTechnician, selectedStation, selectedProject, sortKey, sortDir]);

  const paidRows = useMemo(() => {
    const base = rows.filter((r) => r.paymentStatus === "paid");
    return filterAndSort(base);
  }, [rows, searchTerm, selectedTechnician, selectedStation, selectedProject, sortKey, sortDir]);

  const cancelledRows = useMemo(() => {
    const base = rows.filter((r) => r.paymentStatus === "cancelled");
    return filterAndSort(base);
  }, [rows, searchTerm, selectedTechnician, selectedStation, selectedProject, sortKey, sortDir]);

  const currentTabRows = useMemo(() => {
    if (activeTab === "unpaid") return unpaidRows;
    if (activeTab === "paid") return paidRows;
    return cancelledRows;
  }, [activeTab, unpaidRows, paidRows, cancelledRows]);

  const summary = useMemo(() => {
    const count = currentTabRows.length;
    const totalAmount = currentTabRows.reduce((s, r) => s + (Number(r.totalPrice) || 0), 0);
    const totalQty = currentTabRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    return { count, totalAmount, totalQty };
  }, [currentTabRows]);

  const [actionLoadingKey, setActionLoadingKey] = useState(null);

  const handleAction = async (row, action) => {
    if (!canManage) return;
    const rowKey = `${row.ticketNo}-${row.stationId}-${row.stepOrder}-${row.technicianId}-${row.round}`;
    setActionLoadingKey(rowKey);
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
        payment_round: row.round,
        user_id: user?.id
      };
      const res = await fetch("/api/report/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Request failed");
      }
      // อัปเดต state ทันที (optimistic) ให้แถวหายจาก "รอจ่าย" และโผล่ใน "จ่ายแล้ว"
      const isSameRow = (r) =>
        r.ticketNo === row.ticketNo &&
        r.stationId === row.stationId &&
        r.stepOrder === row.stepOrder &&
        r.technicianId === row.technicianId &&
        r.round === row.round;
      if (action === "confirm") {
        setRows((prev) =>
          prev.map((r) =>
            isSameRow(r)
              ? { ...r, paymentStatus: "paid", paymentRecord: { ...(r.paymentRecord || {}), status: "paid", payment_round: row.round } }
              : r
          )
        );
        alert(language === "th" ? "ยืนยันการจ่ายแล้ว" : "Payment confirmed");
      } else if (action === "cancel") {
        setRows((prev) =>
          prev.map((r) =>
            isSameRow(r)
              ? { ...r, paymentStatus: "cancelled", paymentRecord: { ...(r.paymentRecord || {}), status: "cancelled", payment_round: row.round } }
              : r
          )
        );
      } else if (action === "revert") {
        setRows((prev) =>
          prev.map((r) =>
            isSameRow(r)
              ? { ...r, paymentStatus: "unpaid", paymentRecord: null }
              : r
          )
        );
      }
      // ไม่เรียก loadData() หลังยืนยัน/ยกเลิก เพราะจะดึงข้อมูลเก่าจาก server มาเขียนทับ state แล้วแถวกลับไปโชว์ "รอจ่าย"
    } catch (e) {
      console.error("[REPORT] action error:", e);
      alert(e?.message || "ไม่สามารถทำรายการได้");
    } finally {
      setActionLoadingKey(null);
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

  const SortableHeader = ({ sortKey: key, children, style, className = "" }) => (
    <th
      className={`py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 select-none ${className}`}
      onClick={() => handleSort(key)}
      style={style}
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

  const renderTable = (data, tabType, tooltip) => (
    <div className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-visible">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700 w-full" style={{ tableLayout: "fixed", minWidth: "720px" }}>
        <thead className="bg-gray-50 dark:bg-slate-900/40">
          <tr className="text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
            <SortableHeader sortKey="ticketNo" className="pl-4 pr-3">No.</SortableHeader>
            <SortableHeader sortKey="technician" className="px-3">{t("technician", language) || "Technician"}</SortableHeader>
            <SortableHeader sortKey="station" className="px-3">{language === "th" ? "สถานี" : "Station"}</SortableHeader>
            <SortableHeader sortKey="project" className="pl-3 pr-6" style={{ width: PROJECT_CELL_WIDTH, maxWidth: PROJECT_CELL_WIDTH }}>Project</SortableHeader>
            <SortableHeader sortKey="qcCompletedAt" className="pl-6 pr-3">{language === "th" ? "QC เสร็จเมื่อ" : "QC completed"}</SortableHeader>
            <SortableHeader sortKey="quantity" className="px-3">{t("quantity", language)}</SortableHeader>
            <SortableHeader sortKey="pricePerUnit" className="px-3">{t("price", language) || "Price/unit"}</SortableHeader>
            <SortableHeader sortKey="totalPrice" className="px-3">{t("total", language) || "Total"}</SortableHeader>
            <th className="pl-3 pr-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-700 text-sm">
          {data.map((row) => {
            const rowKey = `${row.ticketNo}-${row.stationId}-${row.stepOrder}-${row.technicianId}-${row.round}`;
            return (
            <tr key={rowKey}>
              <td className="pl-4 pr-3 py-3 whitespace-nowrap font-mono text-xs text-gray-800 dark:text-gray-200">{row.ticketNo}</td>
              <td className="px-3 py-3 text-gray-800 dark:text-gray-100 font-medium">{row.technicianName}</td>
              <td className="px-3 py-3 text-gray-800 dark:text-gray-100">{row.stationName}</td>
              <td className="pl-3 pr-6 py-3 text-gray-800 dark:text-gray-100 align-middle" style={{ width: PROJECT_CELL_WIDTH, maxWidth: PROJECT_CELL_WIDTH }}>
                <ProjectCell text={row.projectName} onShow={tooltip?.showProjectTooltip} onHide={tooltip?.hideProjectTooltip} />
              </td>
              <td className="pl-6 pr-3 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300 text-xs">
                {formatQcCompletedAt(row.qcCompletedAt)}
              </td>
              <td className="px-3 py-3 text-gray-800 dark:text-gray-100">{row.quantity}</td>
              <td className="px-3 py-3 text-gray-800 dark:text-gray-100">
                {row.pricePerUnit.toLocaleString()} บาท
              </td>
              <td className="px-3 py-3 text-gray-900 dark:text-gray-100 font-semibold">
                {row.totalPrice.toLocaleString()} บาท
              </td>
              <td className="pl-3 pr-4 py-3 text-right">
                {canManage ? (
                  <div className="report-actions-dropdown relative flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (actionLoadingKey === rowKey) return;
                        setOpenActionsKey((k) => (k === rowKey ? null : rowKey));
                      }}
                      disabled={actionLoadingKey === rowKey}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-600 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-70 disabled:cursor-wait"
                      aria-label={language === "th" ? "เมนู" : "Menu"}
                    >
                      {actionLoadingKey === rowKey ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <MoreVertical className="w-5 h-5" />
                      )}
                    </button>
                    {openActionsKey === rowKey && (
                      <div className="absolute right-0 top-full z-10 mt-1 min-w-[180px] rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 py-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => openPlanModal(row)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                        >
                          <ImageIcon className="w-4 h-4 shrink-0 text-slate-600 dark:text-slate-400" />
                          {language === "th" ? "แสดงภาพแปลน" : "View plan"}
                        </button>
                        {tabType === "unpaid" && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                handleAction(row, "confirm");
                                setOpenActionsKey(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                            >
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                              {t("confirmPayment", language)}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleAction(row, "cancel");
                                setOpenActionsKey(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                            >
                              <XCircle className="w-4 h-4" />
                              {t("cancelPayment", language)}
                            </button>
                          </>
                        )}
                        {tabType === "paid" && (
                          <>
                            <div className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                              <CheckCircle className="w-4 h-4" />
                              {t("paidItems", language)}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                handleAction(row, "revert");
                                setOpenActionsKey(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                            >
                              <RefreshCcw className="w-4 h-4" />
                              {language === "th" ? "ย้อนกลับเป็นรอจ่าย" : "Revert to unpaid"}
                            </button>
                          </>
                        )}
                        {tabType === "cancelled" && (
                          <button
                            type="button"
                            onClick={() => {
                              handleAction(row, "revert");
                              setOpenActionsKey(null);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                          >
                            <CheckCircle className="w-4 h-4" />
                            {language === "th" ? "คืนสถานะรอจ่าย" : "Revert to unpaid"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-gray-500">{t("accessDenied", language)}</span>
                )}
              </td>
            </tr>
            );
          })}
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
        {projectTooltip &&
          createPortal(
            <div
              className="report-project-tooltip fixed z-[9999] max-w-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-gray-800 dark:text-gray-100 shadow-2xl"
              style={{
                left: projectTooltip.left,
                top: projectTooltip.top,
              }}
              role="tooltip"
            >
              <div className="whitespace-normal break-words">{projectTooltip.text}</div>
            </div>,
            document.body
          )}
        {planModal &&
          createPortal(
            <div
              className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4"
              onClick={closePlanModal}
              role="dialog"
              aria-modal="true"
              aria-label={language === "th" ? "แบบแปลน" : "Plan"}
            >
              <div
                className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-600 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {language === "th" ? "แบบแปลน" : "Plan"} — {planModal.ticketNo}
                  </h3>
                  <button
                    type="button"
                    onClick={closePlanModal}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-gray-200"
                    aria-label={language === "th" ? "ปิด" : "Close"}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-4 min-h-[400px]">
                  {planLoading ? (
                    <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  ) : planFile?.file_url ? (
                    <DocumentViewer url={planFile.file_url} height={560} className="w-full" />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400 text-sm">
                      <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                      {language === "th" ? "ไม่มีแบบแปลน" : "No plan available"}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )}
        <div className="min-h-screen container-safe px-3 sm:px-4 md:px-6 lg:px-8 py-6 space-y-4 max-w-full overflow-x-auto">
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
            <button
              onClick={() => setActiveTab("cancelled")}
              className={`px-3 py-2 text-sm font-medium rounded-lg ${
                activeTab === "cancelled"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
              }`}
            >
              {language === "th" ? "ยกเลิกการจ่าย" : "Cancelled"}
            </button>
          </div>

          {/* Summary cards - คำนวณจากข้อมูลที่กรองแล้วตามแท็บ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                  <LayoutList className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {language === "th" ? "จำนวนรายการ" : "Items"}
                  </p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                    {summary.count}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                  <Banknote className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {language === "th" ? "ยอดรวม" : "Total"}
                  </p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                    {summary.totalAmount.toLocaleString()}
                    <span className="ml-1 text-sm font-normal text-gray-500 dark:text-gray-400">บาท</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {language === "th" ? "จำนวนชิ้น" : "Quantity"}
                  </p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                    {summary.totalQty.toLocaleString()}
                    <span className="ml-1 text-sm font-normal text-gray-500 dark:text-gray-400">{language === "th" ? "ชิ้น" : "pcs"}</span>
                  </p>
                </div>
              </div>
            </div>
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
            renderTable(unpaidRows, "unpaid", { showProjectTooltip, hideProjectTooltip })
          ) : activeTab === "paid" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Calendar className="w-4 h-4" />
                {language === "th" ? "แสดงรายการจ่ายแล้ว" : "Showing paid items"}
              </div>
              {renderTable(paidRows, "paid", { showProjectTooltip, hideProjectTooltip })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <XCircle className="w-4 h-4" />
                {language === "th" ? "รายการที่ยกเลิกการจ่าย กดคืนสถานะรอจ่ายได้" : "Cancelled items. You can revert to unpaid."}
              </div>
              {renderTable(cancelledRows, "cancelled", { showProjectTooltip, hideProjectTooltip })}
            </div>
          )}
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}

