"use client";

import { useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Play, Check, RotateCcw, ChevronRight, FlaskConical, Plus, Minus, Send
} from "lucide-react";

// =====================================================
// SIMULATION ONLY — ไม่มีการเรียก API หรือแตะ DB จริง
// ใช้ local state ทั้งหมดเพื่อทดสอบ logic ของระบบ
// =====================================================

// ===== Default station templates =====
const PRESETS = {
  furniture_10: {
    label: "เฟอร์นิเจอร์ 10 สถานี (90 ชิ้น)",
    qty: 90,
    stations: ["ประกอบโครง", "QC", "ปรับขนาด", "QC", "CNC", "QC", "สี", "QC", "Packing", "QC"],
  },
  simple_3: {
    label: "3 สถานี (20 ชิ้น)",
    qty: 20,
    stations: ["ตัด", "ประกอบ", "QC"],
  },
  paint_5: {
    label: "งานสี 5 สถานี (50 ชิ้น)",
    qty: 50,
    stations: ["ขัด", "รองพื้น", "พ่นสี", "QC", "Packing"],
  },
};

function buildFlows(stations, qty) {
  return stations.map((name, i) => ({
    id: `sim-${i}`,
    step_order: i + 1,
    station_name: name,
    status: "pending",
    total_qty: qty,
    available_qty: i === 0 ? qty : 0,
    completed_qty: 0,
    started_at: null,
    completed_at: null,
  }));
}

// ===== Progress Bar =====
function ProgressBar({ completed, total }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-600 dark:text-gray-400">{completed}/{total}</span>
        <span className="font-semibold text-gray-700 dark:text-gray-300">{pct}%</span>
      </div>
      <div className="h-3 rounded-full bg-gray-200 dark:bg-slate-600 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-500" : "bg-gray-300 dark:bg-slate-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ===== Inline Qty Input (แทน Modal — ไม่มีปัญหา z-index) =====
function InlineQtyInput({ remaining, onSend }) {
  const [qty, setQty] = useState(Math.min(remaining, 5));
  // Quick preset values
  const presets = [1, 5, 10, Math.floor(remaining / 2), remaining]
    .filter((v, i, a) => v > 0 && v <= remaining && a.indexOf(v) === i)
    .slice(0, 4);

  return (
    <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg px-2 py-1.5">
      <button onClick={() => setQty(q => Math.max(1, q - 1))}
        className="p-1 rounded hover:bg-amber-200 dark:hover:bg-amber-800 text-amber-700 dark:text-amber-400">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input type="number" min={1} max={remaining} value={qty}
        onChange={e => setQty(Math.min(Math.max(parseInt(e.target.value) || 1, 1), remaining))}
        className="w-14 px-1 py-1 text-center text-sm font-bold border border-amber-300 dark:border-amber-600 rounded bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
      />
      <button onClick={() => setQty(q => Math.min(remaining, q + 1))}
        className="p-1 rounded hover:bg-amber-200 dark:hover:bg-amber-800 text-amber-700 dark:text-amber-400">
        <Plus className="w-3.5 h-3.5" />
      </button>
      {presets.length > 1 && presets.map(v => (
        <button key={v} onClick={() => setQty(v)}
          className={`px-1.5 py-0.5 rounded text-xs font-medium ${qty === v ? "bg-amber-500 text-white" : "bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-600 hover:bg-amber-100"}`}
        >{v}</button>
      ))}
      <button onClick={() => onSend(qty)}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white"
      ><Send className="w-3.5 h-3.5" /> ส่ง</button>
    </div>
  );
}

// ===== Status Badge =====
function StatusBadge({ status }) {
  const map = {
    pending: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400",
    current: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  };
  const label = { pending: "รอ", current: "กำลังทำ", in_progress: "กำลังทำ", completed: "เสร็จ" };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] || map.pending}`}>{label[status] || status}</span>;
}

// ===== Overall Progress =====
function OverallProgress({ flows }) {
  const totalWork = flows.reduce((s, f) => s + f.total_qty, 0);
  const totalDone = flows.reduce((s, f) => s + f.completed_qty, 0);
  const pct = totalWork > 0 ? Math.round((totalDone / totalWork) * 100) : 0;
  const allDone = flows.every(f => f.status === "completed");
  return (
    <div className={`p-4 rounded-xl border-2 ${allDone ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700" : "border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">ความคืบหน้ารวม</span>
        <span className={`text-lg font-bold ${allDone ? "text-emerald-600" : "text-blue-600"}`}>{pct}%</span>
      </div>
      <div className="h-4 rounded-full bg-gray-200 dark:bg-slate-600 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${allDone ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
      </div>
      {allDone && <div className="mt-2 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400">ทุกสถานีเสร็จสิ้น!</div>}
    </div>
  );
}

// ===== Main Page =====
export default function TestStationFlowPage() {
  const [flows, setFlows] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [ticketQty, setTicketQty] = useState(0);
  const [customStations, setCustomStations] = useState("ตัด, ประกอบ, QC, สี, Packing");
  const [customQty, setCustomQty] = useState(30);

  function addLog(msg) {
    const time = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs(prev => [{ time, msg, id: Date.now() + Math.random() }, ...prev].slice(0, 80));
  }

  // ===== Load Preset =====
  function loadPreset(key) {
    const p = PRESETS[key];
    const f = buildFlows(p.stations, p.qty);
    setFlows(f);
    setTransfers([]);
    setTicketQty(p.qty);
    setLogs([]);
    addLog(`โหลด preset: ${p.label}`);
  }

  function loadCustom() {
    const names = customStations.split(",").map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    const qty = Math.max(1, parseInt(customQty) || 1);
    const f = buildFlows(names, qty);
    setFlows(f);
    setTransfers([]);
    setTicketQty(qty);
    setLogs([]);
    addLog(`โหลด custom: ${names.length} สถานี, ${qty} ชิ้น`);
  }

  function reset() {
    const f = flows.map((fl, i) => ({
      ...fl,
      status: "pending",
      available_qty: i === 0 ? fl.total_qty : 0,
      completed_qty: 0,
      started_at: null,
      completed_at: null,
    }));
    setFlows(f);
    setTransfers([]);
    addLog("RESET: ทุกสถานีกลับเป็น pending");
  }

  // ===== Simulated Actions (Pure State — No API) =====

  function simStart(stepOrder) {
    setFlows(prev => {
      const updated = prev.map(f => ({ ...f }));
      const idx = updated.findIndex(f => f.step_order === stepOrder);
      if (idx < 0) return prev;
      const flow = updated[idx];

      if (flow.available_qty <= 0 && flow.step_order !== 1) {
        addLog(`FAIL: step ${stepOrder} "${flow.station_name}" — ยังไม่มีชิ้นงานมาถึง (available=0)`);
        return prev;
      }
      if (flow.status !== "pending") {
        addLog(`FAIL: step ${stepOrder} — status=${flow.status} ไม่ใช่ pending`);
        return prev;
      }

      flow.status = "current";
      flow.started_at = new Date().toISOString();
      addLog(`START: step ${stepOrder} "${flow.station_name}" → current (available=${flow.available_qty})`);
      return updated;
    });
  }

  function simPartialComplete(stepOrder, qty) {
    setFlows(prev => {
      const updated = prev.map(f => ({ ...f }));
      const idx = updated.findIndex(f => f.step_order === stepOrder);
      if (idx < 0) return prev;
      const flow = updated[idx];

      const remaining = flow.available_qty - flow.completed_qty;
      if (qty > remaining) {
        addLog(`FAIL: step ${stepOrder} — qty ${qty} > remaining ${remaining}`);
        return prev;
      }

      // Update current station
      flow.completed_qty += qty;
      const isFullyDone = flow.completed_qty >= flow.total_qty;
      flow.status = isFullyDone ? "completed" : "in_progress";
      if (isFullyDone) flow.completed_at = new Date().toISOString();

      // Update next station
      const next = updated[idx + 1];
      if (next) {
        next.available_qty += qty;
        if (next.status === "pending" && next.available_qty > 0) {
          next.status = "in_progress";
        }
      }

      addLog(`PARTIAL: step ${stepOrder} "${flow.station_name}" — ส่ง ${qty} ชิ้น → ${isFullyDone ? "completed" : "in_progress"} (${flow.completed_qty}/${flow.total_qty})`);
      if (next) {
        addLog(`   ↳ step ${next.step_order} "${next.station_name}" — available: ${next.available_qty}, status: ${next.status}`);
      }

      return updated;
    });

    // Add transfer log
    setTransfers(prev => [{
      from_step_order: stepOrder,
      to_step_order: stepOrder + 1,
      quantity: qty,
      created_at: new Date().toISOString(),
    }, ...prev]);
  }

  function simCompleteAll(stepOrder) {
    const flow = flows.find(f => f.step_order === stepOrder);
    if (!flow) return;
    const remaining = flow.available_qty - flow.completed_qty;
    if (remaining <= 0) return;
    simPartialComplete(stepOrder, remaining);
  }

  // ===== Check if all done =====
  const allDone = flows.length > 0 && flows.every(f => f.status === "completed");

  return (
    <ProtectedRoute>
      <div className="min-h-screen px-4 py-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <FlaskConical className="w-7 h-7 text-purple-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Test Station Flow</h1>
            <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-semibold">SIMULATION</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            จำลองระบบ Progress-Based — ทุกอย่างทำงานใน browser ไม่มีการเรียก API หรือเปลี่ยนข้อมูลจริง
          </p>
        </div>

        {/* Preset Selection */}
        <div className="mb-6 p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">เลือก Preset หรือสร้างเอง</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button key={key} onClick={() => loadPreset(key)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-400 transition-colors"
              >{p.label}</button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="text" placeholder="สถานี (คั่นด้วย ,)" value={customStations}
              onChange={e => setCustomStations(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-gray-100"
            />
            <input type="number" min={1} value={customQty}
              onChange={e => setCustomQty(parseInt(e.target.value) || 1)}
              className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-center text-gray-900 dark:text-gray-100"
              placeholder="จำนวน"
            />
            <button onClick={loadCustom}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold"
            >สร้าง</button>
          </div>
        </div>

        {/* Overall Progress + Reset */}
        {flows.length > 0 && (
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <OverallProgress flows={flows} />
            </div>
            <div className="flex flex-col gap-2 sm:w-32">
              <button onClick={reset}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20"
              ><RotateCcw className="w-4 h-4" /> Reset</button>
              <div className="text-center text-xs text-gray-400 dark:text-gray-500">
                {ticketQty} ชิ้น | {flows.length} สถานี
              </div>
            </div>
          </div>
        )}

        {/* Station Flow Cards */}
        {flows.length > 0 && (
          <div className="space-y-3 mb-6">
            {flows.map((flow) => {
              const isActive = flow.status === "current" || flow.status === "in_progress";
              const isDone = flow.status === "completed";
              const remaining = flow.available_qty - flow.completed_qty;
              const canStart = flow.status === "pending" && (flow.available_qty > 0 || flow.step_order === 1);
              const canPartial = isActive && remaining > 0;
              const canComplete = isActive && remaining > 0;

              return (
                <div key={flow.id}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    isDone ? "border-emerald-300 bg-emerald-50/70 dark:bg-emerald-900/10 dark:border-emerald-700" :
                    isActive ? "border-amber-300 bg-amber-50/70 dark:bg-amber-900/10 dark:border-amber-700 shadow-md" :
                    flow.available_qty > 0 && flow.status === "pending" ? "border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-800" :
                    "border-gray-200 bg-white dark:bg-slate-800 dark:border-slate-700 opacity-60"
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                        isDone ? "bg-emerald-500 text-white" :
                        isActive ? "bg-amber-500 text-white animate-pulse" :
                        flow.available_qty > 0 ? "bg-blue-500 text-white" :
                        "bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-gray-400"
                      }`}>{flow.step_order}</div>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{flow.station_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          avail: <span className="font-bold">{flow.available_qty}</span> |
                          done: <span className="font-bold">{flow.completed_qty}</span> |
                          remain: <span className={`font-bold ${remaining > 0 && isActive ? "text-amber-600" : ""}`}>{remaining}</span>
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={flow.status} />
                  </div>

                  {/* Progress Bar */}
                  <ProgressBar completed={flow.completed_qty} total={flow.total_qty} />

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {canStart && (
                      <button onClick={() => simStart(flow.step_order)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                      ><Play className="w-4 h-4" /> เริ่มทำ</button>
                    )}
                    {canPartial && (
                      <InlineQtyInput
                        remaining={remaining}
                        onSend={(qty) => simPartialComplete(flow.step_order, qty)}
                      />
                    )}
                    {canComplete && (
                      <button onClick={() => simCompleteAll(flow.step_order)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                      ><Check className="w-4 h-4" /> เสร็จทั้งหมด ({remaining})</button>
                    )}
                    {isDone && (
                      <div className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        <Check className="w-4 h-4" /> เสร็จสิ้น
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Transfer History */}
        {transfers.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">ประวัติการส่งชิ้นงาน ({transfers.length} รายการ)</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {transfers.map((t, i) => {
                const fromFlow = flows.find(f => f.step_order === t.from_step_order);
                const toFlow = flows.find(f => f.step_order === t.to_step_order);
                return (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 py-1.5 px-2 rounded-lg bg-white dark:bg-slate-700/50">
                    <span className="font-mono bg-gray-100 dark:bg-slate-600 px-2 py-0.5 rounded">{fromFlow?.station_name || `step ${t.from_step_order}`}</span>
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                    <span className="font-mono bg-gray-100 dark:bg-slate-600 px-2 py-0.5 rounded">{toFlow?.station_name || `step ${t.to_step_order}`}</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">{t.quantity} ชิ้น</span>
                    <span className="ml-auto text-gray-400">{new Date(t.created_at).toLocaleTimeString("th-TH")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Console Log */}
        {logs.length > 0 && (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-400">Console Log (Simulation)</h3>
              <button onClick={() => setLogs([])} className="text-xs text-slate-500 hover:text-slate-300">Clear</button>
            </div>
            <div className="space-y-1 max-h-52 overflow-y-auto font-mono text-xs">
              {logs.map((log) => (
                <div key={log.id} className={`${
                  log.msg.includes("FAIL") ? "text-red-400" :
                  log.msg.startsWith("START") ? "text-blue-400" :
                  log.msg.startsWith("PARTIAL") ? "text-amber-400" :
                  log.msg.startsWith("RESET") ? "text-purple-400" :
                  log.msg.includes("↳") ? "text-cyan-400" :
                  "text-slate-400"
                }`}>
                  <span className="text-slate-600">[{log.time}]</span> {log.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {flows.length === 0 && (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <FlaskConical className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <div className="text-lg font-medium mb-1">เลือก Preset ด้านบนเพื่อเริ่มทดสอบ</div>
            <div className="text-sm">หรือสร้าง custom สถานีตามต้องการ</div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
