"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { supabase } from "@/utils/supabaseClient";
import { FileText, CheckCircle, XCircle, Loader2, RefreshCcw, AlertCircle, Calendar, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, X, MoreVertical, Image as ImageIcon, LayoutList, Banknote, Package, Printer, Clock, Pencil } from "lucide-react";
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

      // 1) ดึง station IDs สำหรับสถานีที่ต้องการ (ปรับขนาด, อัดบาน, สี)
      const { data: reportStations, error: stationError } = await supabase
        .from("stations")
        .select("id, name_th, code");
      if (stationError) throw stationError;

      const targetStationIds = (reportStations || [])
        .filter((s) => {
          const name = (s.name_th || s.code || "").toLowerCase();
          return name === "ปรับขนาด" || name === "อัดบาน" || name === "สี" ||
                 name.includes("ปรับขนาด") || name.includes("อัดบาน") || name.includes("สี");
        })
        .map((s) => s.id);

      if (targetStationIds.length === 0) {
        setRows([]);
        setPayments([]);
        setLoading(false);
        return;
      }

      // 2) completed station flows - filter สถานีที่ server-side เพื่อไม่ให้โดน row limit ตัด
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
        .not("completed_at", "is", null)
        .in("station_id", targetStationIds)
        .order("completed_at", { ascending: false })
        .limit(5000);

      if (flowError) throw flowError;

      const filteredFlows = flows || [];

      console.log("[REPORT] Total flows loaded:", filteredFlows.length);

      // 3) assignments - ดึงเฉพาะตั๋วที่มี flow ที่ตรงกัน + limit เพื่อป้องกัน row limit ตัด
      const flowTicketNos = [...new Set(filteredFlows.map((f) => f.ticket_no))];
      let assignmentData = [];
      if (flowTicketNos.length > 0) {
        // Supabase .in() supports up to ~300 items, chunk if needed
        const CHUNK = 200;
        for (let i = 0; i < flowTicketNos.length; i += CHUNK) {
          const chunk = flowTicketNos.slice(i, i + CHUNK);
          const { data: aData, error: aErr } = await supabase
            .from("ticket_assignments")
            .select(`
              ticket_no,
              station_id,
              step_order,
              technician_id,
              technician:users!ticket_assignments_technician_id_fkey ( name )
            `)
            .in("ticket_no", chunk);
          if (aErr) throw aErr;
          assignmentData = assignmentData.concat(aData || []);
        }
      }

      // 4) tickets (for qty/project) - ดึงเฉพาะตั๋วที่เกี่ยวข้อง
      let ticketData = [];
      if (flowTicketNos.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < flowTicketNos.length; i += CHUNK) {
          const chunk = flowTicketNos.slice(i, i + CHUNK);
          const { data: tData, error: tErr } = await supabase
            .from("ticket")
            .select("no, description, quantity, source_no")
            .in("no", chunk);
          if (tErr) throw tErr;
          ticketData = ticketData.concat(tData || []);
        }
      }

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

      // 6) projects - สร้าง map item_code → project_name (เหมือน production page)
      const projectMap = new Map();
      try {
        const { data: projectsData } = await supabase
          .from("projects")
          .select("id, item_code, project_name, description");
        if (Array.isArray(projectsData)) {
          projectsData.forEach((p) => {
            if (p.item_code) projectMap.set(p.item_code, p);
          });
        }
        // เติมจาก project_items
        const { data: projectItems } = await supabase
          .from("project_items")
          .select("project_id, item_code");
        if (Array.isArray(projectItems) && projectsData) {
          const projectIdMap = new Map(projectsData.map((p) => [p.id, p]));
          projectItems.forEach((it) => {
            const proj = projectIdMap.get(it.project_id);
            if (proj && it?.item_code && !projectMap.has(it.item_code)) {
              projectMap.set(it.item_code, proj);
            }
          });
        }
      } catch (e) {
        console.warn("[REPORT] Failed to load projectMap:", e?.message);
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

        const projectFromMap = ticket?.source_no ? projectMap.get(ticket.source_no) : null;
        const projectTitle = projectFromMap?.project_name || projectFromMap?.description || ticket?.source_no || "-";

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
              projectTitle,
              sourceNo: ticket?.source_no ?? null,
              quantity: qty,
              unit: "ชิ้น",
              pricePerUnit: pricePerUnit,
              priceType: priceType,
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
            projectTitle,
            sourceNo: ticket?.source_no ?? null,
            quantity: qty,
            unit: "ชิ้น",
            pricePerUnit: pricePerUnit,
            priceType: priceType,
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
    const base = rows.filter((r) => r.paymentStatus === "unpaid");
    return filterAndSort(base);
  }, [rows, searchTerm, selectedTechnician, selectedStation, selectedProject, sortKey, sortDir]);

  const pendingRows = useMemo(() => {
    const base = rows.filter((r) => r.paymentStatus === "pending");
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
    if (activeTab === "pending") return pendingRows;
    if (activeTab === "paid") return paidRows;
    return cancelledRows;
  }, [activeTab, unpaidRows, pendingRows, paidRows, cancelledRows]);

  const summary = useMemo(() => {
    const count = currentTabRows.length;
    const totalAmount = currentTabRows.reduce((s, r) => s + (Number(r.totalPrice) || 0), 0);
    const totalQty = currentTabRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    return { count, totalAmount, totalQty };
  }, [currentTabRows]);

  const [actionLoadingKey, setActionLoadingKey] = useState(null);
  const [editPriceModal, setEditPriceModal] = useState(null); // null | { row, price, priceType }
  const [editPriceSaving, setEditPriceSaving] = useState(false);

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
        technician_id: row.paymentRecord?.technician_id || row.technicianId,
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
      if (action === "pending") {
        setRows((prev) =>
          prev.map((r) =>
            isSameRow(r)
              ? { ...r, paymentStatus: "pending", paymentRecord: { ...(r.paymentRecord || {}), status: "pending", payment_round: row.round } }
              : r
          )
        );
      } else if (action === "confirm") {
        setRows((prev) =>
          prev.map((r) =>
            isSameRow(r)
              ? { ...r, paymentStatus: "paid", paymentRecord: { ...(r.paymentRecord || {}), status: "paid", payment_round: row.round } }
              : r
          )
        );
        alert(language === "th" ? "จ่ายเงินสำเร็จ" : "Payment confirmed");
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

  const handlePrint = useCallback((printData, tabLabel) => {
    const printSummary = {
      count: printData.length,
      totalAmount: printData.reduce((s, r) => s + (Number(r.totalPrice) || 0), 0),
      totalQty: printData.reduce((s, r) => s + (Number(r.quantity) || 0), 0),
    };
    const rowsHtml = printData.map((row) => `
      <tr>
        <td>${row.ticketNo}</td>
        <td>${row.technicianName}</td>
        <td>${row.stationName}</td>
        <td>${row.projectTitle || '-'}</td>
        <td>${row.projectName}</td>
        <td>${formatQcCompletedAt(row.qcCompletedAt)}</td>
        <td style="text-align:center">${row.quantity}</td>
        <td style="text-align:right">${Number(row.pricePerUnit).toLocaleString()}</td>
        <td style="text-align:right;font-weight:600">${Number(row.totalPrice).toLocaleString()}</td>
      </tr>
    `).join('');
    const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8"><title>${tabLabel}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
  body{font-family:'Sarabun',sans-serif;font-size:10px;color:#000;padding:4px;}
  h2{margin:0 0 6px;font-size:12px;font-weight:700;}
  table{width:100%;border-collapse:separate;border-spacing:0;margin-bottom:8px;}
  th,td{border-right:1px solid #ccc;border-bottom:1px solid #ccc;padding:3px 5px;vertical-align:top;}
  th:first-child,td:first-child{border-left:1px solid #ccc;}
  th{border-top:1px solid #ccc;background:#f3f4f6;font-weight:600;text-align:left;}
  tr:nth-child(even){background:#fafafa;}
  .summary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;}
  .summary-item{border:1px solid #ddd;padding:4px 10px;border-radius:3px;min-width:110px;}
  .summary-item .label{font-size:9px;color:#666;margin-bottom:1px;}
  .summary-item .value{font-size:12px;font-weight:700;}
  @page{margin:2mm;size:A4 portrait;}
  @media print{body{padding:0;}}
</style>
</head><body>
<h2>${tabLabel}</h2>
<div class="summary">
  <div class="summary-item">
    <div class="label">จำนวนรายการ</div>
    <div class="value">${printSummary.count.toLocaleString()} รายการ</div>
  </div>
  <div class="summary-item">
    <div class="label">ยอดรวม</div>
    <div class="value">${printSummary.totalAmount.toLocaleString()} บาท</div>
  </div>
  <div class="summary-item">
    <div class="label">จำนวนชิ้น</div>
    <div class="value">${printSummary.totalQty.toLocaleString()} ชิ้น</div>
  </div>
</div>
<table>
  <thead><tr>
    <th>No.</th><th>ช่าง</th><th>สถานี</th><th>โปรเจ็ค</th><th>Description</th>
    <th>QC</th><th style="text-align:center">จำนวน</th>
    <th style="text-align:right">ราคา/หน่วย</th><th style="text-align:right">รวม</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
</body></html>`;
    const w = window.open('', '_blank', 'width=800,height=1100');
    if (!w) { alert('กรุณาอนุญาต popup ในเบราว์เซอร์'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
  }, []);

  const handleUpdatePrice = useCallback(async () => {
    if (!editPriceModal) return;
    const { row, price, priceType } = editPriceModal;
    const newPrice = Number(price);
    if (isNaN(newPrice) || newPrice < 0) {
      alert(language === "th" ? "กรุณาระบุราคาที่ถูกต้อง" : "Please enter a valid price");
      return;
    }
    setEditPriceSaving(true);
    try {
      const res = await fetch("/api/report/flow-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_no: row.ticketNo,
          station_id: row.stationId,
          step_order: row.stepOrder,
          price: newPrice,
          price_type: priceType,
          user_id: user?.id
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Request failed");
      // อัปเดต local state — ทุก row ที่ใช้ ticket+station+step เดิม (อาจมีหลายช่าง)
      setRows((prev) =>
        prev.map((r) => {
          if (r.ticketNo !== row.ticketNo || r.stationId !== row.stationId || r.stepOrder !== row.stepOrder) return r;
          const newTotal = priceType === "per_piece" ? newPrice * r.quantity : newPrice;
          return { ...r, pricePerUnit: newPrice, priceType, totalPrice: newTotal };
        })
      );
      setEditPriceModal(null);
    } catch (e) {
      console.error("[FLOW PRICE] update error:", e);
      alert(e?.message || "ไม่สามารถอัปเดตราคาได้");
    } finally {
      setEditPriceSaving(false);
    }
  }, [editPriceModal, user?.id, language]);

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
            <SortableHeader sortKey="technician" className="px-3">ช่าง</SortableHeader>
            <SortableHeader sortKey="station" className="px-3">สถานี</SortableHeader>
            <th className="px-3 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">โปรเจ็ค</th>
            <SortableHeader sortKey="project" className="pl-3 pr-6" style={{ width: PROJECT_CELL_WIDTH, maxWidth: PROJECT_CELL_WIDTH }}>Description</SortableHeader>
            <SortableHeader sortKey="qcCompletedAt" className="pl-6 pr-3">QC</SortableHeader>
            <SortableHeader sortKey="quantity" className="px-3">จำนวน</SortableHeader>
            <SortableHeader sortKey="pricePerUnit" className="px-3">ราคา/หน่วย</SortableHeader>
            <SortableHeader sortKey="totalPrice" className="px-3">รวม</SortableHeader>
            <th className="w-8 py-3"></th>
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
              <td className="px-3 py-3 text-xs text-gray-700 dark:text-gray-300 max-w-[120px] truncate" title={row.projectTitle}>{row.projectTitle || "-"}</td>
              <td className="pl-3 pr-6 py-3 text-gray-800 dark:text-gray-100 align-middle" style={{ width: PROJECT_CELL_WIDTH, maxWidth: PROJECT_CELL_WIDTH }}>
                <ProjectCell text={row.projectName} onShow={tooltip?.showProjectTooltip} onHide={tooltip?.hideProjectTooltip} />
              </td>
              <td className="pl-6 pr-3 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300 text-xs">
                {formatQcCompletedAt(row.qcCompletedAt)}
              </td>
              <td className="px-3 py-3 text-gray-800 dark:text-gray-100">{row.quantity}</td>
              <td className="px-3 py-3 text-gray-800 dark:text-gray-100">
                {row.pricePerUnit.toLocaleString()}
              </td>
              <td className="px-3 py-3 text-gray-900 dark:text-gray-100 font-semibold">
                {row.totalPrice.toLocaleString()}
              </td>
              <td className="py-3 text-center">
                <button
                  type="button"
                  onClick={() => openPlanModal(row)}
                  className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-600 text-gray-400 hover:text-sky-500 dark:hover:text-sky-400 transition-colors"
                  title={language === "th" ? "แสดงภาพแปลน" : "View plan"}
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
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
                        {tabType === "unpaid" && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditPriceModal({ row, price: String(row.pricePerUnit), priceType: row.priceType || "flat" });
                                setOpenActionsKey(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-sky-900/30"
                            >
                              <Pencil className="w-4 h-4 text-sky-500" />
                              {language === "th" ? "แก้ไขราคา" : "Edit price"}
                            </button>
                            <div className="my-0.5 mx-3 border-t border-gray-100 dark:border-slate-700" />
                            <button
                              type="button"
                              onClick={() => {
                                handleAction(row, "pending");
                                setOpenActionsKey(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                            >
                              <Clock className="w-4 h-4 text-amber-500" />
                              {language === "th" ? "ยืนยันการจ่าย" : "Confirm payment"}
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
                        {tabType === "pending" && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditPriceModal({ row, price: String(row.pricePerUnit), priceType: row.priceType || "flat" });
                                setOpenActionsKey(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-sky-50 dark:hover:bg-sky-900/30"
                            >
                              <Pencil className="w-4 h-4 text-sky-500" />
                              {language === "th" ? "แก้ไขราคา" : "Edit price"}
                            </button>
                            <div className="my-0.5 mx-3 border-t border-gray-100 dark:border-slate-700" />
                            <button
                              type="button"
                              onClick={() => {
                                handleAction(row, "confirm");
                                setOpenActionsKey(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                            >
                              <CheckCircle className="w-4 h-4 text-emerald-600" />
                              {language === "th" ? "จ่ายแล้ว" : "Mark as paid"}
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
                              {language === "th" ? "ยกเลิกจ่าย" : "Cancel payment"}
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
              <td colSpan={11} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
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
        {editPriceModal &&
          createPortal(
            <div
              className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/50 p-4"
              onClick={() => { if (!editPriceSaving) setEditPriceModal(null); }}
              role="dialog"
              aria-modal="true"
            >
              <div
                className="relative w-full max-w-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-600 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Pencil className="w-4 h-4 text-sky-500" />
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {language === "th" ? "แก้ไขราคาค่าแรง" : "Edit labor price"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditPriceModal(null)}
                    disabled={editPriceSaving}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {/* Body */}
                <div className="px-4 py-4 space-y-4">
                  {/* Info */}
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                    <div><span className="font-medium">{language === "th" ? "ตั๋ว" : "Ticket"}:</span> {editPriceModal.row.ticketNo}</div>
                    <div><span className="font-medium">{language === "th" ? "สถานี" : "Station"}:</span> {editPriceModal.row.stationName}</div>
                    <div><span className="font-medium">{language === "th" ? "ช่าง" : "Tech"}:</span> {editPriceModal.row.technicianName}</div>
                    <div className="pt-1 text-amber-600 dark:text-amber-400 text-xs">
                      ⚠️ {language === "th" ? "การแก้ไขนี้จะ sync ไปยังหน้า production และ ticket ด้วย" : "This change will sync to production and ticket pages"}
                    </div>
                  </div>
                  {/* Price type */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {language === "th" ? "ประเภทราคา" : "Price type"}
                    </label>
                    <select
                      value={editPriceModal.priceType}
                      onChange={(e) => setEditPriceModal((m) => ({ ...m, priceType: e.target.value }))}
                      disabled={editPriceSaving}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="flat">{language === "th" ? "ราคาเหมา (รวมทุกชิ้น)" : "Flat rate (all pieces)"}</option>
                      <option value="per_piece">{language === "th" ? "ราคาต่อชิ้น" : "Per piece"}</option>
                    </select>
                  </div>
                  {/* Price input */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {editPriceModal.priceType === "per_piece"
                        ? (language === "th" ? "ราคาต่อชิ้น (บาท)" : "Price per piece (THB)")
                        : (language === "th" ? "ราคาเหมา (บาท)" : "Flat price (THB)")}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editPriceModal.price}
                      onChange={(e) => setEditPriceModal((m) => ({ ...m, price: e.target.value }))}
                      disabled={editPriceSaving}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") handleUpdatePrice(); }}
                    />
                  </div>
                  {/* Preview */}
                  {editPriceModal.price !== "" && !isNaN(Number(editPriceModal.price)) && (
                    <div className="rounded-lg bg-gray-50 dark:bg-slate-700/50 px-3 py-2 text-xs space-y-1">
                      <div className="flex justify-between text-gray-600 dark:text-gray-400">
                        <span>{language === "th" ? "จำนวน" : "Qty"}</span>
                        <span>{editPriceModal.row.quantity} {language === "th" ? "ชิ้น" : "pcs"}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-100">
                        <span>{language === "th" ? "ยอดรวมใหม่" : "New total"}</span>
                        <span>
                          {(editPriceModal.priceType === "per_piece"
                            ? Number(editPriceModal.price) * editPriceModal.row.quantity
                            : Number(editPriceModal.price)
                          ).toLocaleString()} {language === "th" ? "บาท" : "THB"}
                        </span>
                      </div>
                      {editPriceModal.row.pricePerUnit !== Number(editPriceModal.price) && (
                        <div className="flex justify-between text-gray-400 line-through text-xs">
                          <span>{language === "th" ? "ยอดเดิม" : "Old total"}</span>
                          <span>{editPriceModal.row.totalPrice.toLocaleString()} {language === "th" ? "บาท" : "THB"}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Footer */}
                <div className="flex gap-2 px-4 pb-4">
                  <button
                    type="button"
                    onClick={() => setEditPriceModal(null)}
                    disabled={editPriceSaving}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
                  >
                    {language === "th" ? "ยกเลิก" : "Cancel"}
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdatePrice}
                    disabled={editPriceSaving || editPriceModal.price === "" || isNaN(Number(editPriceModal.price))}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editPriceSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                    {language === "th" ? "บันทึก" : "Save"}
                  </button>
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

          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-slate-700 pb-2 flex-wrap">
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
              onClick={() => setActiveTab("pending")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg ${
                activeTab === "pending"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
              }`}
            >
              {language === "th" ? "ยืนยันการจ่าย" : "Pending payment"}
              {pendingRows.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-amber-500 text-white">
                  {pendingRows.length}
                </span>
              )}
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
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
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
          ) : activeTab === "pending" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Clock className="w-4 h-4 text-amber-500" />
                  {language === "th" ? "รายการรอยืนยันการจ่าย — กด \"จ่ายแล้ว\" เพื่อยืนยัน หรือ \"ยกเลิกจ่าย\" เพื่อยกเลิก" : "Items pending payment — confirm or cancel each item"}
                </div>
                {pendingRows.length > 0 && (
                  <button
                    onClick={() => handlePrint(pendingRows, language === "th" ? "ยืนยันการจ่าย" : "Pending Payment")}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 shrink-0"
                  >
                    <Printer className="w-4 h-4" />
                    {language === "th" ? "สั่งพิมพ์" : "Print"}
                  </button>
                )}
              </div>
              {renderTable(pendingRows, "pending", { showProjectTooltip, hideProjectTooltip })}
            </div>
          ) : activeTab === "paid" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Calendar className="w-4 h-4" />
                  {language === "th" ? "แสดงรายการจ่ายแล้ว" : "Showing paid items"}
                </div>
                {paidRows.length > 0 && (
                  <button
                    onClick={() => handlePrint(paidRows, language === "th" ? "จ่ายแล้ว" : "Paid")}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 shrink-0"
                  >
                    <Printer className="w-4 h-4" />
                    {language === "th" ? "สั่งพิมพ์" : "Print"}
                  </button>
                )}
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

