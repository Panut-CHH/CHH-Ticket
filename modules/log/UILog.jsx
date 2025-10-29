"use client";

import React, { useMemo, useState } from "react";
import { Search, Filter, ArrowUpDown, Calendar, User, Clock, History, CheckCircle, XCircle, TrendingUp, Timer, Activity } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { mockTickets } from "../ticket/mockTickets";

function formatDateTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(timestamp);
  }
}

const EVENT_LABEL = {
  created: "สร้างตั๋ว",
  assigned: "มอบหมายงาน",
  step_started: "เริ่มขั้นตอน",
  step_completed: "เสร็จสิ้นขั้นตอน",
  completed: "งานเสร็จสิ้น",
};

const EVENT_LABEL_EN = {
  created: "Create Ticket",
  assigned: "Assign Task",
  step_started: "Start Step",
  step_completed: "Complete Step",
  completed: "Work Completed",
};

export default function UILog() {
  const { language } = useLanguage();
  const [q, setQ] = useState("");
  const [eventType, setEventType] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortAsc, setSortAsc] = useState(false);

  // Build log entries derived from tickets and their roadmap/status
  const { logs, assignees } = useMemo(() => {
    const list = [];
    const allAssignees = new Set();

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    mockTickets.forEach((t, idx) => {
      if (t.assignee) allAssignees.add(t.assignee);

      const ticketBase = now - (idx + 1) * day; // spread tickets back in time
      // Created
      list.push({
        id: `${t.id}-created`,
        ticketId: t.id,
        title: t.title,
        who: "System",
        type: "created",
        detail: `สร้างตั๋ว ${t.id}`,
        at: ticketBase - 2 * 60 * 60 * 1000,
      });

      // Assigned (if any)
      if (t.assignee && t.assignee !== "ยังไม่ได้มอบหมาย") {
        list.push({
          id: `${t.id}-assigned`,
          ticketId: t.id,
          title: t.title,
          who: t.assignee,
          type: "assigned",
          detail: `มอบหมายงานให้ ${t.assignee}`,
          at: ticketBase - 60 * 60 * 1000,
        });
      }

      // Roadmap steps
      if (Array.isArray(t.roadmap)) {
        t.roadmap.forEach((step, sIdx) => {
          const base = ticketBase + sIdx * (60 * 60 * 1000);
          if (step.status === "completed") {
            list.push({
              id: `${t.id}-step-${sIdx}-done`,
              ticketId: t.id,
              title: t.title,
              who: step.technician || t.assignee || "System",
              type: "step_completed",
              detail: `ขั้นตอน "${step.step}" เสร็จสิ้น`,
              at: base,
            });
          } else if (step.status === "current") {
            list.push({
              id: `${t.id}-step-${sIdx}-start`,
              ticketId: t.id,
              title: t.title,
              who: step.technician || t.assignee || "System",
              type: "step_started",
              detail: `เริ่มขั้นตอน "${step.step}"`,
              at: base,
            });
          }
        });
      }

      // Completed ticket
      if (t.status === "เสร็จสิ้น") {
        list.push({
          id: `${t.id}-completed`,
          ticketId: t.id,
          title: t.title,
          who: t.assignee || "System",
          type: "completed",
          detail: `ตั๋ว ${t.id} เสร็จสิ้น`,
          at: ticketBase + 6 * 60 * 60 * 1000,
        });
      }
    });

    // Sort newest first by default
    list.sort((a, b) => b.at - a.at);
    return { logs: list, assignees: Array.from(allAssignees) };
  }, []);

  const filtered = useMemo(() => {
    const qnorm = q.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
    const to = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;

    let rows = logs.filter((log) => {
      const hay = `${log.ticketId} ${log.title} ${log.detail} ${log.who}`.toLowerCase();
      const matchQ = qnorm ? hay.includes(qnorm) : true;
      const matchType = eventType ? log.type === eventType : true;
      const matchAssignee = assignee ? log.who === assignee : true;
      const matchDate = log.at >= from && log.at <= to;
      return matchQ && matchType && matchAssignee && matchDate;
    });

    rows = rows.sort((a, b) => (sortAsc ? a.at - b.at : b.at - a.at));
    return rows;
  }, [logs, q, eventType, assignee, dateFrom, dateTo, sortAsc]);

  const chips = useMemo(() => {
    const list = [];
    if (q.trim()) list.push({ key: "q", label: `ค้นหา: ${q.trim()}`, clear: () => setQ("") });
    if (eventType) list.push({ key: "type", label: `ประเภท: ${EVENT_LABEL[eventType]}`, clear: () => setEventType("") });
    if (assignee) list.push({ key: "who", label: `ผู้รับผิดชอบ: ${assignee}`, clear: () => setAssignee("") });
    if (dateFrom || dateTo) {
      const f = dateFrom ? new Date(dateFrom).toLocaleDateString("th-TH") : "-";
      const t = dateTo ? new Date(dateTo).toLocaleDateString("th-TH") : "-";
      list.push({ key: "date", label: `ช่วงวันที่: ${f} ถึง ${t}` , clear: () => { setDateFrom(""); setDateTo(""); } });
    }
    return list;
  }, [q, eventType, assignee, dateFrom, dateTo]);

  const clearAll = () => { setQ(""); setEventType(""); setAssignee(""); setDateFrom(""); setDateTo(""); };

  // สรุปสถิติเวลาการทำงาน
  const timeStats = useMemo(() => {
    const finishedTickets = mockTickets.filter(t => t.status === "Finished" || t.status === "Completed");
    const inProgressTickets = mockTickets.filter(t => t.status === "In Progress");
    
    return {
      totalTickets: mockTickets.length,
      finished: finishedTickets.length,
      inProgress: inProgressTickets.length,
      avgCompletionTime: finishedTickets.length > 0 ? 24.5 : 0, // Mock: เฉลี่ย 24.5 ชม
      totalWorkHours: finishedTickets.length * 24.5 + inProgressTickets.length * 12 // Mock calculation
    };
  }, []);

  return (
    <div className="min-h-screen px-3 py-5 md:px-5 md:py-7 animate-fadeInUp overflow-x-hidden">
      <div className="max-w-6xl mx-auto w-full">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-md" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
                <History className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">{t('logTitle', language)}</h1>
                <p className="text-gray-600 dark:text-gray-400 text-sm">{t('logDesc', language)}</p>
              </div>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} {t('itemsCount', language)}</div>
          </div>

          {/* Stats Cards - สรุปเวลาการทำงาน */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{timeStats.totalTickets}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{language === 'th' ? 'ตั๋วทั้งหมด' : 'Total Tickets'}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{timeStats.finished}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{language === 'th' ? 'เสร็จสิ้น' : 'Finished'}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                  <Timer className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{timeStats.avgCompletionTime.toFixed(1)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{language === 'th' ? 'ชม. เฉลี่ย/ตั๋ว' : 'Avg Hrs/Ticket'}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{timeStats.totalWorkHours.toFixed(0)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{language === 'th' ? 'รวมชั่วโมง' : 'Total Hours'}</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Filters */}
        <div className="relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 md:p-5 mb-6 shadow-sm">
          <div className="absolute inset-x-0 -top-[1px] h-[3px] bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 rounded-t-2xl" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{language === 'th' ? 'ตัวกรอง' : 'Filters'}</h3>

          {/* Top Row: Search + Reset */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-emerald-500" />
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-10 pr-3 py-3 bg-slate-50 dark:bg-slate-700 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-slate-400 text-gray-900 dark:text-gray-100 dark:text-gray-100"
                placeholder={t('searchLog', language)}
              />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clearAll} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-700 dark:hover:bg-slate-700 text-sm">
                {t('clearFilter', language)}
              </button>
            </div>
          </div>

          {/* Second Row: Selects / Dates / Sort */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* Event type */}
            <div>
              <div className="flex items-center gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400"><Filter className="w-4 h-4" /> {t('eventType', language)}</div>
              <div className="relative">
                <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-full appearance-none px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">{language === 'th' ? 'ทั้งหมด' : 'All'}</option>
                  <option value="created">{language === 'th' ? EVENT_LABEL.created : EVENT_LABEL_EN.created}</option>
                  <option value="assigned">{language === 'th' ? EVENT_LABEL.assigned : EVENT_LABEL_EN.assigned}</option>
                  <option value="step_started">{language === 'th' ? EVENT_LABEL.step_started : EVENT_LABEL_EN.step_started}</option>
                  <option value="step_completed">{language === 'th' ? EVENT_LABEL.step_completed : EVENT_LABEL_EN.step_completed}</option>
                  <option value="completed">{language === 'th' ? EVENT_LABEL.completed : EVENT_LABEL_EN.completed}</option>
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</div>
              </div>
            </div>

            {/* Assignee */}
            <div>
              <div className="flex items-center gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400"><User className="w-4 h-4" /> {t('responsiblePerson', language)}</div>
              <div className="relative">
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-full appearance-none px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">{language === 'th' ? 'ทั้งหมด' : 'All'}</option>
                  {assignees.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</div>
              </div>
            </div>

            {/* Date from */}
            <div>
              <div className="flex items-center gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400"><Calendar className="w-4 h-4" /> {t('fromDate', language)}</div>
              <div className="relative">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Date to */}
            <div>
              <div className="flex items-center gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400"><Calendar className="w-4 h-4" /> {t('toDate', language)}</div>
              <div className="relative">
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Sort */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400"><ArrowUpDown className="w-4 h-4" /> {t('sortTime', language)}</div>
              <div className="inline-flex w-full md:w-auto rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-700 p-1">
                <button onClick={() => setSortAsc(false)} className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-sm ${!sortAsc ? 'bg-white shadow-sm text-emerald-700 border border-emerald-200' : 'text-slate-600'}`}>
                  {t('newToOld', language)}
                </button>
                <button onClick={() => setSortAsc(true)} className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-sm ${sortAsc ? 'bg-white shadow-sm text-emerald-700 border border-emerald-200' : 'text-slate-600'}`}>
                  {t('oldToNew', language)}
                </button>
              </div>
            </div>
          </div>

          {/* Active chips */}
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {chips.map((c) => (
                <button key={c.key} onClick={c.clear} className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-xs hover:bg-emerald-100">
                  <span>{c.label}</span>
                  <span className="text-emerald-600">×</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-gray-50 dark:bg-slate-700 text-xs font-medium text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700">
            <div className="col-span-2">{t('ticket', language)}</div>
            <div className="col-span-3">{t('event', language)}</div>
            <div className="col-span-3">{t('details', language)}</div>
            <div className="col-span-2">{t('relatedPerson', language)}</div>
            <div className="col-span-2">{t('time', language)}</div>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {filtered.map((log) => (
              <li key={log.id} className="px-5 py-4 bg-white dark:bg-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-12 md:items-center gap-2">
                  <div className="md:col-span-2">
                    <div className="inline-flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                      <span className="text-sm">{log.ticketId}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 md:hidden">{log.title}</div>
                  </div>

                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2 text-sm">
                      {log.type === "completed" ? (
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                      ) : log.type === "step_completed" ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : log.type === "step_started" ? (
                        <History className="w-4 h-4 text-amber-600" />
                      ) : log.type === "assigned" ? (
                        <User className="w-4 h-4 text-blue-600" />
                      ) : (
                        <History className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      )}
                      <span>{language === 'th' ? EVENT_LABEL[log.type] : EVENT_LABEL_EN[log.type]}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 hidden md:block">{log.title}</div>
                  </div>

                  <div className="md:col-span-3 text-sm text-gray-700 dark:text-gray-300">{log.detail}</div>

                  <div className="md:col-span-2">
                    <div className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                      <User className="w-4 h-4" />
                      <span>{log.who}</span>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <Clock className="w-4 h-4" />
                      <span>{formatDateTime(log.at)}</span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800">{language === 'th' ? 'ไม่พบข้อมูลตามเงื่อนไข' : 'No data found matching criteria'}</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}


