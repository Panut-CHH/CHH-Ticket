"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Search, Filter, ArrowUpDown, Calendar, User, Clock, History, CheckCircle, XCircle, TrendingUp, Timer, Activity, AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { supabase } from "@/utils/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

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
  created: "สร้าง",
  create: "สร้าง",
  update: "แก้ไข",
  delete: "ลบ",
  read: "อ่านข้อมูล",
  assigned: "มอบหมายงาน",
  step_started: "เริ่มขั้นตอน",
  step_completed: "เสร็จสิ้นขั้นตอน",
  qc_started: "เริ่ม QC",
  qc_completed: "เสร็จสิ้น QC",
  completed: "งานเสร็จสิ้น",
  login: "เข้าสู่ระบบ",
  logout: "ออกจากระบบ",
  login_failed: "เข้าสู่ระบบล้มเหลว",
};

const EVENT_LABEL_EN = {
  created: "Create",
  create: "Create",
  update: "Update",
  delete: "Delete",
  read: "Read",
  assigned: "Assign Task",
  step_started: "Start Step",
  step_completed: "Complete Step",
  qc_started: "Start QC",
  qc_completed: "Complete QC",
  completed: "Work Completed",
  login: "Login",
  logout: "Logout",
  login_failed: "Login Failed",
};

// Helper function to get action label with entity context
const getActionLabel = (action, entityType, language) => {
  const baseLabel = language === 'th' 
    ? (EVENT_LABEL[action] || action)
    : (EVENT_LABEL_EN[action] || action);
  
  if (action === 'created' || action === 'create') {
    const entityLabels = {
      'project': language === 'th' ? 'สร้างโปรเจ็ค' : 'Create Project',
      'item_code': language === 'th' ? 'สร้าง Item Code' : 'Create Item Code',
      'station': language === 'th' ? 'เพิ่มสถานี' : 'Add Station',
      'ticket_bom': language === 'th' ? 'เพิ่มวัสดุ' : 'Add Material',
      'ticket': language === 'th' ? 'สร้างตั๋ว' : 'Create Ticket',
    };
    return entityLabels[entityType] || baseLabel;
  }
  
  return baseLabel;
};

export default function UILog() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [eventType, setEventType] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Hide noisy system reads by default
  const [showSystemReads, setShowSystemReads] = useState(false);

  // Fetch logs from database
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch logs
        const { data: logData, error: fetchError } = await supabase
          .from('activity_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000); // Limit to recent 1000 logs

        if (fetchError) throw fetchError;

        // Filter out System logs first
        const filteredLogs = (logData || []).filter(log => {
          const who = log.user_name || log.user_email;
          return who && who.toLowerCase() !== 'system';
        });

        // Fetch user names separately
        const userEmails = [...new Set(filteredLogs.map(log => log.user_email).filter(Boolean))];
        let userMap = {};
        
        if (userEmails.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('email, name')
            .in('email', userEmails);
          
          if (usersData) {
            userMap = usersData.reduce((acc, user) => {
              acc[user.email] = user.name || user.email; // Use name if available, fallback to email
              return acc;
            }, {});
          }
        }
        
        // Transform logs with user names
        const transformedLogs = filteredLogs.map((log) => {
          const userEmail = log.user_email;
          // Priority: user_name > userMap[name] > userEmail
          const userName = log.user_name || (userEmail ? userMap[userEmail] : null) || userEmail || 'Unknown';
          
          return {
            id: log.id,
            ticketId: log.ticket_no || log.entity_id || '-',
            title: (() => {
              if (log.entity_type === 'ticket') return `Ticket ${log.ticket_no || log.entity_id}`;
              if (log.entity_type === 'project') {
                const projectName = log.details?.project_name || log.details?.item_code || log.entity_id;
                return `Project ${projectName}`;
              }
              if (log.entity_type === 'item_code') {
                const itemCode = log.details?.item_code || log.entity_id;
                return `Item Code ${itemCode}`;
              }
              if (log.entity_type === 'station') {
                const stationName = log.details?.name_th || log.details?.code || log.entity_id;
                return `Station ${stationName}`;
              }
              if (log.entity_type === 'ticket_bom') {
                return `BOM ${log.ticket_no || log.entity_id}`;
              }
              if (log.entity_type === 'production_flow') {
                const stationName = log.details?.station_name || '';
                return `Production ${log.ticket_no || log.entity_id}${stationName ? ` - ${stationName}` : ''}`;
              }
              if (log.entity_type === 'qc_workflow') {
                const stationName = log.details?.station_name || '';
                return `QC ${log.ticket_no || log.entity_id}${stationName ? ` - ${stationName}` : ''}`;
              }
              if (log.entity_type === 'user') return `User ${log.entity_id}`;
              if (log.entity_type === 'auth') return 'Authentication';
              return log.entity_type || 'Unknown';
            })(),
            who: userName,
            type: log.action,
            detail: (() => {
              if (log.details?.message) return log.details.message;
              if (log.details?.ticket_no) return `Ticket ${log.details.ticket_no}`;
              if (log.error_message) return log.error_message;
              
              // Generate descriptive message based on entity type and action
              if ((log.action === 'created' || log.action === 'create') && log.entity_type === 'project') {
                const projectName = log.details?.project_name || log.details?.item_code || '';
                return language === 'th' 
                  ? `สร้างโปรเจ็ค${projectName ? `: ${projectName}` : ''}`
                  : `Create project${projectName ? `: ${projectName}` : ''}`;
              }
              if ((log.action === 'created' || log.action === 'create') && log.entity_type === 'item_code') {
                const itemCode = log.details?.item_code || '';
                return language === 'th' 
                  ? `สร้าง Item Code${itemCode ? `: ${itemCode}` : ''}`
                  : `Create Item Code${itemCode ? `: ${itemCode}` : ''}`;
              }
              if ((log.action === 'created' || log.action === 'create') && log.entity_type === 'station') {
                const stationName = log.details?.name_th || log.details?.code || '';
                return language === 'th' 
                  ? `เพิ่มสถานี${stationName ? `: ${stationName}` : ''}`
                  : `Add station${stationName ? `: ${stationName}` : ''}`;
              }
              if (log.action === 'update' && log.entity_type === 'ticket_bom') {
                return language === 'th' 
                  ? `เพิ่ม/แก้ไขวัสดุ (${log.details?.count || 0} รายการ)`
                  : `Add/Update materials (${log.details?.count || 0} items)`;
              }
              if (log.action === 'step_started' && log.entity_type === 'production_flow') {
                const stationName = log.details?.station_name || '';
                return language === 'th' 
                  ? `เริ่มขั้นตอน${stationName ? `: ${stationName}` : ''}`
                  : `Start step${stationName ? `: ${stationName}` : ''}`;
              }
              if (log.action === 'step_completed' && log.entity_type === 'production_flow') {
                const stationName = log.details?.station_name || '';
                return language === 'th' 
                  ? `เสร็จสิ้นขั้นตอน${stationName ? `: ${stationName}` : ''}`
                  : `Complete step${stationName ? `: ${stationName}` : ''}`;
              }
              if (log.action === 'qc_started' && log.entity_type === 'qc_workflow') {
                const stationName = log.details?.station_name || '';
                return language === 'th' 
                  ? `เริ่ม QC${stationName ? `: ${stationName}` : ''}`
                  : `Start QC${stationName ? `: ${stationName}` : ''}`;
              }
              if (log.action === 'qc_completed' && log.entity_type === 'qc_workflow') {
                const stationName = log.details?.station_name || '';
                const passRate = log.details?.pass_rate;
                const passRateText = passRate !== undefined ? ` (${passRate}%)` : '';
                return language === 'th' 
                  ? `เสร็จสิ้น QC${stationName ? `: ${stationName}` : ''}${passRateText}`
                  : `Complete QC${stationName ? `: ${stationName}` : ''}${passRateText}`;
              }
              
              return getActionLabel(log.action, log.entity_type, language);
            })(),
            at: new Date(log.created_at).getTime(),
            status: log.status,
            errorMessage: log.error_message,
            entityType: log.entity_type,
            details: log.details,
          };
        });

        setLogs(transformedLogs);
      } catch (err) {
        console.error('Error fetching logs:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();

    // Set up real-time subscription
    const channel = supabase
      .channel('activity_logs_changes')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'activity_logs' },
        async (payload) => {
          const newLog = payload.new;
          
          // Filter out System logs
          const who = newLog.user_name || newLog.user_email;
          if (!who || who.toLowerCase() === 'system') {
            return; // Skip System logs
          }
          
          // Fetch user name if we have email
          let userName = newLog.user_name;
          if (!userName && newLog.user_email) {
            const { data: userData } = await supabase
              .from('users')
              .select('name, email')
              .eq('email', newLog.user_email)
              .single();
            
            if (userData) {
              userName = userData.name || userData.email;
            } else {
              userName = newLog.user_email;
            }
          } else if (!userName) {
            userName = 'Unknown';
          }
          
          const transformedLog = {
            id: newLog.id,
            ticketId: newLog.ticket_no || newLog.entity_id || '-',
            title: (() => {
              if (newLog.entity_type === 'ticket') return `Ticket ${newLog.ticket_no || newLog.entity_id}`;
              if (newLog.entity_type === 'project') {
                const projectName = newLog.details?.project_name || newLog.details?.item_code || newLog.entity_id;
                return `Project ${projectName}`;
              }
              if (newLog.entity_type === 'item_code') {
                const itemCode = newLog.details?.item_code || newLog.entity_id;
                return `Item Code ${itemCode}`;
              }
              if (newLog.entity_type === 'station') {
                const stationName = newLog.details?.name_th || newLog.details?.code || newLog.entity_id;
                return `Station ${stationName}`;
              }
              if (newLog.entity_type === 'ticket_bom') {
                return `BOM ${newLog.ticket_no || newLog.entity_id}`;
              }
              if (newLog.entity_type === 'production_flow') {
                const stationName = newLog.details?.station_name || '';
                return `Production ${newLog.ticket_no || newLog.entity_id}${stationName ? ` - ${stationName}` : ''}`;
              }
              if (newLog.entity_type === 'qc_workflow') {
                const stationName = newLog.details?.station_name || '';
                return `QC ${newLog.ticket_no || newLog.entity_id}${stationName ? ` - ${stationName}` : ''}`;
              }
              if (newLog.entity_type === 'user') return `User ${newLog.entity_id}`;
              if (newLog.entity_type === 'auth') return 'Authentication';
              return newLog.entity_type || 'Unknown';
            })(),
            who: userName,
            type: newLog.action,
            detail: (() => {
              if (newLog.details?.message) return newLog.details.message;
              if (newLog.details?.ticket_no) return `Ticket ${newLog.details.ticket_no}`;
              if (newLog.error_message) return newLog.error_message;
              
              // Generate descriptive message based on entity type and action
              if ((newLog.action === 'created' || newLog.action === 'create') && newLog.entity_type === 'project') {
                const projectName = newLog.details?.project_name || newLog.details?.item_code || '';
                return language === 'th' 
                  ? `สร้างโปรเจ็ค${projectName ? `: ${projectName}` : ''}`
                  : `Create project${projectName ? `: ${projectName}` : ''}`;
              }
              if ((newLog.action === 'created' || newLog.action === 'create') && newLog.entity_type === 'item_code') {
                const itemCode = newLog.details?.item_code || '';
                return language === 'th' 
                  ? `สร้าง Item Code${itemCode ? `: ${itemCode}` : ''}`
                  : `Create Item Code${itemCode ? `: ${itemCode}` : ''}`;
              }
              if ((newLog.action === 'created' || newLog.action === 'create') && newLog.entity_type === 'station') {
                const stationName = newLog.details?.name_th || newLog.details?.code || '';
                return language === 'th' 
                  ? `เพิ่มสถานี${stationName ? `: ${stationName}` : ''}`
                  : `Add station${stationName ? `: ${stationName}` : ''}`;
              }
              if (newLog.action === 'update' && newLog.entity_type === 'ticket_bom') {
                return language === 'th' 
                  ? `เพิ่ม/แก้ไขวัสดุ (${newLog.details?.count || 0} รายการ)`
                  : `Add/Update materials (${newLog.details?.count || 0} items)`;
              }
              if (newLog.action === 'step_started' && newLog.entity_type === 'production_flow') {
                const stationName = newLog.details?.station_name || '';
                return language === 'th' 
                  ? `เริ่มขั้นตอน${stationName ? `: ${stationName}` : ''}`
                  : `Start step${stationName ? `: ${stationName}` : ''}`;
              }
              if (newLog.action === 'step_completed' && newLog.entity_type === 'production_flow') {
                const stationName = newLog.details?.station_name || '';
                return language === 'th' 
                  ? `เสร็จสิ้นขั้นตอน${stationName ? `: ${stationName}` : ''}`
                  : `Complete step${stationName ? `: ${stationName}` : ''}`;
              }
              if (newLog.action === 'qc_started' && newLog.entity_type === 'qc_workflow') {
                const stationName = newLog.details?.station_name || '';
                return language === 'th' 
                  ? `เริ่ม QC${stationName ? `: ${stationName}` : ''}`
                  : `Start QC${stationName ? `: ${stationName}` : ''}`;
              }
              if (newLog.action === 'qc_completed' && newLog.entity_type === 'qc_workflow') {
                const stationName = newLog.details?.station_name || '';
                const passRate = newLog.details?.pass_rate;
                const passRateText = passRate !== undefined ? ` (${passRate}%)` : '';
                return language === 'th' 
                  ? `เสร็จสิ้น QC${stationName ? `: ${stationName}` : ''}${passRateText}`
                  : `Complete QC${stationName ? `: ${stationName}` : ''}${passRateText}`;
              }
              
              return getActionLabel(newLog.action, newLog.entity_type, language);
            })(),
            at: new Date(newLog.created_at).getTime(),
            status: newLog.status,
            errorMessage: newLog.error_message,
            entityType: newLog.entity_type,
            details: newLog.details,
          };
          setLogs(prev => [transformedLog, ...prev].slice(0, 1000));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [language]);

  // Extract unique assignees from logs (already filtered, no System)
  const assignees = useMemo(() => {
    const assigneeSet = new Set();
    logs.forEach(log => {
      if (log.who) {
        assigneeSet.add(log.who);
      }
    });
    return Array.from(assigneeSet).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const qnorm = q.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : -Infinity;
    const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : Infinity;

    let rows = logs.filter((log) => {
      const hay = `${log.ticketId} ${log.title} ${log.detail} ${log.who} ${log.entityType || ''}`.toLowerCase();
      const matchQ = qnorm ? hay.includes(qnorm) : true;
      const matchType = eventType ? log.type === eventType : true;
      const matchAssignee = assignee ? log.who === assignee : true;
      const matchDate = log.at >= from && log.at <= to;
      // Suppress noisy system 'read' logs unless explicitly enabled (already filtered System, but keep for ERP reads)
      const isNoisySystemRead =
        !showSystemReads &&
        log.type === 'read' &&
        (
          (log.entityType || '').includes('erp') ||
          (log.entityType || '').includes('production_events')
        );

      return matchQ && matchType && matchAssignee && matchDate && !isNoisySystemRead;
    });

    rows = rows.sort((a, b) => (sortAsc ? a.at - b.at : b.at - a.at));
    return rows;
  }, [logs, q, eventType, assignee, dateFrom, dateTo, sortAsc, showSystemReads]);

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

  // สรุปสถิติจาก logs
  const timeStats = useMemo(() => {
    const totalLogs = logs.length;
    const successLogs = logs.filter(l => l.status === 'success').length;
    const errorLogs = logs.filter(l => l.status === 'error').length;
    const warningLogs = logs.filter(l => l.status === 'warning').length;
    
    return {
      totalLogs,
      successLogs,
      errorLogs,
      warningLogs,
    };
  }, [logs]);

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
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{timeStats.totalLogs}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{language === 'th' ? 'Log ทั้งหมด' : 'Total Logs'}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{timeStats.successLogs}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{language === 'th' ? 'สำเร็จ' : 'Success'}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                  <Timer className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{timeStats.errorLogs}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{language === 'th' ? 'ข้อผิดพลาด' : 'Errors'}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{timeStats.warningLogs}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{language === 'th' ? 'คำเตือน' : 'Warnings'}</div>
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
                  {Object.keys(EVENT_LABEL).map(action => (
                    <option key={action} value={action}>
                      {language === 'th' ? EVENT_LABEL[action] : EVENT_LABEL_EN[action]}
                    </option>
                  ))}
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
            {/* Toggle noisy system reads */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400"><History className="w-4 h-4" />{language === 'th' ? 'แสดง Log ระบบ (อ่านข้อมูล)' : 'Show system read logs'}</div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={showSystemReads} onChange={(e) => setShowSystemReads(e.target.checked)} />
                <span>{language === 'th' ? (showSystemReads ? 'แสดง' : 'ซ่อน (แนะนำ)') : (showSystemReads ? 'Show' : 'Hide (recommended)')}</span>
              </label>
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
            {loading && (
              <li className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800">
                {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
              </li>
            )}
            {error && (
              <li className="px-5 py-8 text-center text-sm text-red-500 dark:text-red-400 bg-white dark:bg-slate-800">
                {language === 'th' ? 'เกิดข้อผิดพลาด: ' : 'Error: '}{error}
              </li>
            )}
            {!loading && !error && filtered.map((log) => (
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
                      {log.status === "error" ? (
                        <AlertCircle className="w-4 h-4 text-red-600" />
                      ) : log.status === "warning" ? (
                        <XCircle className="w-4 h-4 text-amber-600" />
                      ) : log.type === "completed" || log.type === "login" ? (
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                      ) : log.type === "step_completed" || log.type === "qc_completed" ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : log.type === "step_started" || log.type === "qc_started" ? (
                        <History className="w-4 h-4 text-amber-600" />
                      ) : log.type === "assigned" || log.type === "update" ? (
                        <User className="w-4 h-4 text-blue-600" />
                      ) : (
                        <History className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      )}
                      <span>{getActionLabel(log.type, log.entityType, language)}</span>
                      {log.status === "error" && (
                        <span className="text-xs text-red-600">({language === 'th' ? 'ผิดพลาด' : 'Error'})</span>
                      )}
                      {log.status === "warning" && (
                        <span className="text-xs text-amber-600">({language === 'th' ? 'คำเตือน' : 'Warning'})</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 hidden md:block">{log.title}</div>
                  </div>

                  <div className="md:col-span-3 text-sm text-gray-700 dark:text-gray-300">
                    {log.detail}
                    {log.errorMessage && (
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {log.errorMessage}
                      </div>
                    )}
                  </div>

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


