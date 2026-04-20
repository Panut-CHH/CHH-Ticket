"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth, Printer, Plug, PlugZap, Send, Loader2, Copy, Download, Trash2 } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import {
  isSupported,
  requestAndConnect,
  writeBytes,
  disconnect,
  getStatus,
  parseHex,
} from "@/utils/btPrinter";
import { escposHello, escposLabel } from "@/utils/escpos";
import { tsplHello, tsplQcLabel } from "@/utils/tspl";

export default function PrintTestPage() {
  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/qc">
        <PrintTestInner />
      </RoleGuard>
    </ProtectedRoute>
  );
}

function PrintTestInner() {
  const [supported, setSupported] = useState(true);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [chUuid, setChUuid] = useState("");
  const [busy, setBusy] = useState(false);
  const [copies, setCopies] = useState(3);
  const [labelW, setLabelW] = useState(40);
  const [labelH, setLabelH] = useState(30);
  const [rawHex, setRawHex] = useState("1B 40 48 65 6C 6C 6F 0A 0A 0A 0A");
  const [logs, setLogs] = useState([]);
  const logBoxRef = useRef(null);

  const log = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${ts}] ${msg}`]);
  }, []);

  useEffect(() => {
    setSupported(isSupported());
    if (!isSupported()) {
      log("⚠ Web Bluetooth ไม่รองรับ — ใช้ Chrome/Edge บน Android หรือ desktop");
    } else {
      log("พร้อมใช้งาน — กด Connect เพื่อเริ่ม");
    }
  }, [log]);

  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logs]);

  const refreshStatus = useCallback(() => {
    const s = getStatus();
    setConnected(s.connected);
    setDeviceName(s.deviceName || "");
    setChUuid(s.characteristicUuid || "");
  }, []);

  const onConnect = async () => {
    setBusy(true);
    try {
      await requestAndConnect({ log });
      refreshStatus();
      log("✓ connected");
    } catch (e) {
      log(`✗ connect error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = () => {
    disconnect({ log });
    refreshStatus();
  };

  const send = async (bytes, label) => {
    setBusy(true);
    try {
      log(`→ sending ${label} (${bytes.length} bytes)`);
      await writeBytes(bytes, { log });
      log(`✓ ${label} sent`);
    } catch (e) {
      log(`✗ send error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const sendEscposHello = () => send(escposHello(), "ESC/POS hello");
  const sendTsplHello = () =>
    send(tsplHello({ widthMm: labelW, heightMm: labelH }), "TSPL hello");
  const sendRawHex = () => {
    try {
      const bytes = parseHex(rawHex);
      return send(bytes, "raw hex");
    } catch (e) {
      log(`✗ hex parse error: ${e.message}`);
    }
  };

  const buildLogText = () => {
    const header = [
      `# QC Printer POC log`,
      `# generated: ${new Date().toISOString()}`,
      `# userAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`,
      `# device: ${deviceName || "-"}`,
      `# characteristic: ${chUuid || "-"}`,
      ``,
    ].join("\n");
    return header + logs.join("\n") + "\n";
  };

  const copyLog = async () => {
    const text = buildLogText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      log("✓ log copied to clipboard");
    } catch (e) {
      log(`✗ copy failed: ${e.message}`);
    }
  };

  const downloadLog = () => {
    const text = buildLogText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qc-printer-log-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log("✓ log downloaded");
  };

  const clearLog = () => setLogs([]);

  const printBatch = async () => {
    const n = Math.max(1, Math.min(100, Number(copies) || 1));
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      for (let i = 1; i <= n; i++) {
        const bytes = tsplQcLabel({
          ticketNo: "TK-TEST-001",
          sourceNo: "SKU-DEMO",
          station: "QC-TEST",
          inspector: "Tester",
          date: today,
          index: i,
          total: n,
          widthMm: labelW,
          heightMm: labelH,
        });
        log(`→ label ${i}/${n}`);
        await writeBytes(bytes, { log });
        await new Promise((r) => setTimeout(r, 250));
      }
      log(`✓ printed ${n} label(s)`);
    } catch (e) {
      log(`✗ batch error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center gap-2">
          <Printer className="h-6 w-6 text-gray-700" />
          <h1 className="text-xl font-semibold text-gray-900">
            QC Printer POC — Zhuyitao L2X
          </h1>
        </header>

        {!supported && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Browser นี้ไม่รองรับ Web Bluetooth — ใช้ Chrome/Edge บน Android หรือ
            desktop พร้อม HTTPS
          </div>
        )}

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onConnect}
              disabled={busy || !supported}
              className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bluetooth className="h-4 w-4" />
              )}
              Connect
            </button>
            <button
              onClick={onDisconnect}
              disabled={!connected}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Plug className="h-4 w-4" /> Disconnect
            </button>
            <div className="ml-auto text-xs text-gray-600">
              {connected ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <PlugZap className="h-4 w-4" />
                  {deviceName} · {chUuid.slice(0, 8)}…
                </span>
              ) : (
                <span className="text-gray-500">not connected</span>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-800">
            Step 1 — ลองส่ง hello แต่ละ protocol
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={sendEscposHello}
              disabled={!connected || busy}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Print ESC/POS hello
            </button>
            <button
              onClick={sendTsplHello}
              disabled={!connected || busy}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              Print TSPL hello
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <label className="flex items-center gap-1">
              W(mm)
              <input
                type="number"
                min="20"
                max="100"
                value={labelW}
                onChange={(e) => setLabelW(Number(e.target.value))}
                className="w-16 rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-1">
              H(mm)
              <input
                type="number"
                min="10"
                max="100"
                value={labelH}
                onChange={(e) => setLabelH(Number(e.target.value))}
                className="w-16 rounded border border-gray-300 px-2 py-1"
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-800">
            Step 2 — ยิงซ้ำหลาย label (จำลอง QC pass quantity)
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-600">
              จำนวนชิ้น
              <input
                type="number"
                min="1"
                max="100"
                value={copies}
                onChange={(e) => setCopies(Number(e.target.value))}
                className="ml-2 w-20 rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <button
              onClick={printBatch}
              disabled={!connected || busy}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" /> Print {copies} labels
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold text-gray-800">
            Step 3 — Raw hex (ใช้ตอน vendor ให้ชุด byte มา)
          </h2>
          <textarea
            value={rawHex}
            onChange={(e) => setRawHex(e.target.value)}
            rows={3}
            className="w-full rounded border border-gray-300 p-2 font-mono text-xs"
            placeholder="1B 40 48 65 6C 6C 6F 0A"
          />
          <button
            onClick={sendRawHex}
            disabled={!connected || busy}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Send raw
          </button>
        </section>

        <section className="rounded-lg border border-gray-200 bg-gray-900 p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <div className="text-xs font-semibold text-gray-300">Log</div>
            <div className="ml-auto flex gap-1">
              <button
                onClick={copyLog}
                disabled={logs.length === 0}
                className="inline-flex items-center gap-1 rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                title="Copy log to clipboard"
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
              <button
                onClick={downloadLog}
                disabled={logs.length === 0}
                className="inline-flex items-center gap-1 rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                title="Download log as .txt"
              >
                <Download className="h-3 w-3" /> Download
              </button>
              <button
                onClick={clearLog}
                disabled={logs.length === 0}
                className="inline-flex items-center gap-1 rounded border border-gray-600 px-2 py-1 text-xs text-red-300 hover:bg-gray-800 disabled:opacity-40"
                title="Clear log"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            </div>
          </div>
          <div
            ref={logBoxRef}
            className="h-64 overflow-y-auto rounded bg-black p-2 font-mono text-xs text-emerald-300"
          >
            {logs.length === 0 ? (
              <div className="text-gray-500">—</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {l}
                </div>
              ))
            )}
          </div>
        </section>

        <p className="text-xs text-gray-500">
          หมายเหตุ: ต้องเปิดผ่าน HTTPS หรือ localhost เท่านั้น · Chrome/Edge บน
          Android/Windows/macOS (iOS ไม่รองรับ)
        </p>
      </div>
    </div>
  );
}
