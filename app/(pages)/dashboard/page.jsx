"use client";

import React, { useEffect, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/utils/supabaseClient";
import { loadActiveQcQueue } from "@/utils/ticketsDb";
import { LayoutDashboard } from "lucide-react";
import { useTheme } from "next-themes";
import TechnicianPerformance from "@/components/TechnicianPerformance";
import { canPerformActions } from "@/utils/rolePermissions";

export default function DashboardPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { theme } = useTheme();
  const canAction = canPerformActions(user?.roles || user?.role);

  // KPI state (start with zeros to avoid showing mock values)
  const [kpi, setKpi] = useState({ open: 0, doing: 0, aging: 0, mttr: 0, tp: 0, sla: 0 });

  // Charts
  const statusChartRef = useRef(null);
  const tpChartRef = useRef(null);
  const backlogChartRef = useRef(null);
  const mttrChartRef = useRef(null);
  const [chartData, setChartData] = useState({
    status: { open: 0, inProgress: 0, waiting: 0, done: 0 },
    throughput: { labels: [], data: [] },
    backlog: { labels: [], data: [] },
    mttr: { labels: [], mttr: [], mtbf: [] },
  });

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

  // (Rework feature removed)

  // Kanban
  const [kanban, setKanban] = useState({
    open: [],
    inProgress: [],
    waiting: [],
    done: []
  });
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [dueSoon, setDueSoon] = useState([]);
  const [dueSoonLoading, setDueSoonLoading] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  // QC defect alerts
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [rpdModal, setRpdModal] = useState({ open: false, id: null, rpd: '', nc: '', ticket: '', station: '' });

  // Status normalization: map many possible raw statuses into 4 buckets
  const normalizeStatus = (value) => {
    const s = String(value || '').trim().toLowerCase();
    if (['done','completed','complete','closed','resolved','finish','finished'].includes(s)) return 'done';
    if (['in_progress','in-progress','doing','work','working','processing','processed','assigned','assign','started','start'].includes(s)) return 'in_progress';
    if (['waiting','blocked','on_hold','hold','pending','pause','paused','queue','queued','qc'].includes(s)) return 'waiting';
    if (['open','new','created','release','released','todo','backlog'].includes(s)) return 'open';
    // Fallback: treat unknown/empty as open to make them visible
    return 'open';
  };

  // Load real data (KPIs, charts, kanban, queue)
  const loadAll = async () => {
      // 1) Tickets base for KPIs and charts
      try {
        const { data: tickets } = await supabase.from('ticket').select('status, created_at');
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const toLower = (s) => String(s || '').toLowerCase();
        const open = (tickets || []).filter(t => normalizeStatus(t.status) === 'open').length;
        const inProgress = (tickets || []).filter(t => normalizeStatus(t.status) === 'in_progress').length;
        const waiting = (tickets || []).filter(t => normalizeStatus(t.status) === 'waiting').length;
        const done = (tickets || []).filter(t => normalizeStatus(t.status) === 'done').length;
        const aging = (tickets || []).filter(t => {
          const created = t.created_at ? new Date(t.created_at) : null;
          const older = created ? (now.getTime() - created.getTime()) > (24*60*60*1000) : false;
          return older && toLower(t.status) !== 'done';
        }).length;
        const tp = (tickets || []).filter(t => {
          const created = t.created_at ? new Date(t.created_at) : null;
          return created && created >= todayStart;
        }).length;
        const slaBreach = (tickets || []).filter(t => {
          const status = toLower(t.status);
          const due = t.due_date ? new Date(t.due_date) : null;
          return status !== 'done' && due && due.getTime() < now.getTime();
        }).length;
        setKpi(prev => ({ ...prev, open, doing: inProgress, aging, tp, sla: slaBreach }));

        // Status distribution
        const statusAgg = { open, inProgress, waiting, done };

        // Throughput trend (last 7 days)
        const days = [...Array(7)].map((_,i)=>{
          const d = new Date(); d.setDate(d.getDate() - (6-i)); d.setHours(0,0,0,0); return d;
        });
        const labels = days.map(d=>`${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`);
        const perDay = days.map(d=>{
          const next = new Date(d); next.setDate(d.getDate()+1);
          return (tickets||[]).filter(t=>{
            const c = t.created_at ? new Date(t.created_at) : null;
            return c && c >= d && c < next;
          }).length;
        });

        // Backlog by station (from ticket_station_flow where status != completed)
        let backlogLabels = [];
        let backlogCounts = [];
        try {
          const { data: flows } = await supabase
            .from('ticket_station_flow')
            .select('station_id, status, stations(name_th)');
          const map = new Map();
          (flows||[]).forEach(f=>{
            if (toLower(f.status) === 'completed') return;
            const name = f.stations?.name_th || f.station_id || 'Unknown';
            map.set(name, (map.get(name)||0)+1);
          });
          const entries = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,4);
          backlogLabels = entries.map(e=>e[0]);
          backlogCounts = entries.map(e=>e[1]);
        } catch {}

        // MTTR/MTBF trend (best-effort from technician_work_sessions)
        let mtLabels = labels;
        let mttrSeries = new Array(7).fill(0);
        let mtbfSeries = new Array(7).fill(0);
        try {
          const since = new Date(); since.setDate(since.getDate()-6); since.setHours(0,0,0,0);
          const { data: sessions } = await supabase
            .from('technician_work_sessions')
            .select('started_at, completed_at')
            .gte('started_at', since.toISOString());
          const buckets = days.map(()=>[]);
          (sessions||[]).forEach(s=>{
            const start = s.started_at ? new Date(s.started_at) : null;
            const end = s.completed_at ? new Date(s.completed_at) : null;
            if (!start || !end) return;
            const minutes = Math.max(0, Math.round((end.getTime() - start.getTime())/60000));
            const idx = days.findIndex(d=> start >= d && start < (new Date(d.getTime()+24*60*60*1000)) );
            if (idx>=0) buckets[idx].push(minutes);
          });
          mttrSeries = buckets.map(arr=> arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0);
          mtbfSeries = perDay.map((cnt,i)=> cnt>0 ? Math.round((24*60)/Math.max(1,cnt)) : 0);
        } catch {}

        setChartData({
          status: statusAgg,
          throughput: { labels, data: perDay },
          backlog: { labels: backlogLabels, data: backlogCounts },
          mttr: { labels: mtLabels, mttr: mttrSeries, mtbf: mtbfSeries },
        });
        setChartsReady(true);
      } catch {}

      // 2) Kanban lanes from tickets
      try {
        const { data } = await supabase.from('ticket').select('no, status, source_no, priority');
        const bucket = { open: [], in_progress: [], waiting: [], done: [] };
        (data||[]).forEach(t=>{
          const s = normalizeStatus(t.status);
          if (s==='open') bucket.open.push(t);
          else if (s==='in_progress') bucket.in_progress.push(t);
          else if (s==='waiting') bucket.waiting.push(t);
          else if (s==='done') bucket.done.push(t);
          else bucket.open.push(t);
        });
        setKanban({
          open: bucket.open.slice(0,10).map(t=>({ id:t.no, line:'-', p:t.priority||'P?' })),
          inProgress: bucket.in_progress.slice(0,10).map(t=>({ id:t.no, line:'-', p:t.priority||'P?' })),
          waiting: bucket.waiting.slice(0,10).map(t=>({ id:t.no, line:'-', p:t.priority||'P?' })),
          done: bucket.done.slice(0,10).map(t=>({ id:t.no, line:'-', p:t.priority||'P?' })),
        });
      } catch {}

      // 3) QC queue
      try {
        setQueueLoading(true);
        const { qcTickets } = await loadActiveQcQueue();
        setQueue(qcTickets.slice(0,10));
      } catch {} finally {
        setQueueLoading(false);
      }

      // 3.5) QC defect alerts (open only)
      try {
        setAlertsLoading(true);
        const resp = await fetch('/api/qc/defect-alerts/list?status=open&pageSize=50');
        const json = await resp.json();
        setAlerts(json.data || []);
      } catch {}
      finally { setAlertsLoading(false); }

      // 4) Tickets near due date (within next 72 hours or overdue)
      try {
        setDueSoonLoading(true);
        const now = new Date();
        const horizon = new Date(now.getTime() + 72*60*60*1000);
        const { data: due } = await supabase
          .from('ticket')
          .select('no, description, priority, status, due_date, customer_name')
          .not('status', 'eq', 'done')
          .not('due_date', 'is', null)
          .lte('due_date', horizon.toISOString())
          .order('due_date', { ascending: true })
          .limit(20);
        const mapped = (due||[]).map(t => {
          const dueAt = t.due_date ? new Date(t.due_date) : null;
          const diffMs = dueAt ? (dueAt.getTime() - now.getTime()) : null;
          const remainingHours = diffMs !== null ? Math.round(diffMs/3600000) : null;
          return {
            id: t.no,
            desc: t.description || '-',
            priority: t.priority || 'P?',
            status: t.status || '-',
            dueAt,
            remainingHours,
          };
        });
        setDueSoon(mapped);
      } catch {} finally {
        setDueSoonLoading(false);
      }
  };
  useEffect(() => { loadAll(); }, []);

  // Load Chart.js and draw charts from state
  useEffect(() => {
    const ensure = () => new Promise(resolve => {
      if (window.Chart) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.onload = resolve;
      document.body.appendChild(s);
    });
    const draw = async () => {
      if (!chartsReady) return; // wait until data is loaded
      let Chart;
      try {
        const mod = await import('chart.js/auto');
        Chart = mod.default;
      } catch (e) {
        await ensure();
        Chart = window.Chart;
      }
      const destroy = (c) => { if (c?.current?._chart) { c.current._chart.destroy(); c.current._chart = null; } };
      [statusChartRef, tpChartRef, backlogChartRef, mttrChartRef].forEach(destroy);

      // Detect dark mode
      const isDark = theme === 'dark' || document.documentElement.classList.contains('dark');
      const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)';
      const textColor = isDark ? '#e5e7eb' : '#374151';

      // fallbacks to avoid blank charts when data is empty
      const tpLabels = (chartData.throughput.labels && chartData.throughput.labels.length) ? chartData.throughput.labels : ['','','','','','',''];
      const tpData = (chartData.throughput.data && chartData.throughput.data.length) ? chartData.throughput.data : [0,0,0,0,0,0,0];
      const blLabels = (chartData.backlog.labels && chartData.backlog.labels.length) ? chartData.backlog.labels : ['No Data'];
      const blData = (chartData.backlog.data && chartData.backlog.data.length) ? chartData.backlog.data : [0];
      const mtLabels = (chartData.mttr.labels && chartData.mttr.labels.length) ? chartData.mttr.labels : tpLabels;
      const mttr = (chartData.mttr.mttr && chartData.mttr.mttr.length) ? chartData.mttr.mttr : tpData.map(()=>0);
      const mtbf = (chartData.mttr.mtbf && chartData.mttr.mtbf.length) ? chartData.mttr.mtbf : tpData.map(()=>0);

      if (statusChartRef.current) {
        const statusValues = [chartData.status.open, chartData.status.inProgress, chartData.status.waiting, chartData.status.done];
        const totalStatus = statusValues.reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);
        const safeStatusData = totalStatus > 0 ? statusValues : [1,0,0,0];
        const inst = new Chart(statusChartRef.current.getContext('2d'), {
          type: 'doughnut',
          data: { labels: ['Open','In Progress','Waiting','Done'], datasets: [{ data: safeStatusData, backgroundColor: ['#34d399','#10b981','#f4c06a','#94a3b8'], borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: textColor } } }, cutout: '62%'}
        });
        statusChartRef.current._chart = inst;
      }
      if (tpChartRef.current) {
        const inst = new Chart(tpChartRef.current.getContext('2d'), {
          type: 'line', data: { labels: tpLabels, datasets: [{ label: 'Jobs/day', data: tpData, borderColor: '#34d399', backgroundColor: 'transparent', tension: .3 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: gridColor }, ticks: { color: textColor } }, x: { grid: { display:false }, ticks: { color: textColor } } } }
        });
        tpChartRef.current._chart = inst;
      }
      if (backlogChartRef.current) {
        const inst = new Chart(backlogChartRef.current.getContext('2d'), {
          type: 'bar', data: { labels: blLabels, datasets: [{ label: 'Backlog', data: blData, backgroundColor: '#f4c06a', borderWidth: 0, borderRadius: 8 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: gridColor }, ticks: { color: textColor } }, x: { grid: { display:false }, ticks: { color: textColor } } } }
        });
        backlogChartRef.current._chart = inst;
      }
      if (mttrChartRef.current) {
        const inst = new Chart(mttrChartRef.current.getContext('2d'), {
          type: 'line', data: { labels: mtLabels, datasets: [ { label: 'MTTR (min)', data: mttr, borderColor: '#ef4444', backgroundColor: 'transparent', tension: .3 }, { label: 'MTBF (min)', data: mtbf, borderColor: '#94a3b8', backgroundColor: 'transparent', tension: .3 } ] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColor } } }, scales: { y: { grid: { color: gridColor }, ticks: { color: textColor } }, x: { grid: { display:false }, ticks: { color: textColor } } } }
        });
        mttrChartRef.current._chart = inst;
      }
    };
    draw();
  }, [chartData, chartsReady, theme]);

  // No mock realtime; optional: subscribe to changes (disabled for now)
  useEffect(() => {
    const ch = supabase.channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_station_flow' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'technician_work_sessions' }, loadAll)
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, []);

  // (Rework approval list removed)

  // Kanban DnD handlers
  const onDragStart = (e, id) => {
    if (!canAction) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', id);
  };
  const onDropTo = async (laneKey, e) => {
    e.preventDefault();
    if (!canAction) return;
    const id = e.dataTransfer.getData('text/plain');
    setKanban(prev => {
      const remove = (arr) => arr.filter(c => c.id !== id);
      const all = { ...prev, open: remove(prev.open), inProgress: remove(prev.inProgress), waiting: remove(prev.waiting), done: remove(prev.done) };
      const found = [...prev.open, ...prev.inProgress, ...prev.waiting, ...prev.done].find(c => c.id === id) || { id, line: '-', p: 'P?' };
      all[laneKey] = [found, ...all[laneKey]];
      return all;
    });
    try { await supabase.from('ticket').update({ status: laneKey === 'inProgress' ? 'in_progress' : laneKey }).eq('no', id); } catch {}
  };

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/dashboard">
        <main id="main" className="max-w-7xl mx-auto p-3 flex flex-col gap-3">

          {/* Title Head (consistent with other pages) */}
          <header className="mb-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-md" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">แดชบอร์ดการผลิต</h1>
                <p className="text-gray-600 dark:text-gray-400">ภาพรวมสถานะตั๋ว และไลน์ผลิต</p>
              </div>
            </div>
          </header>

          {/* KPI Shelf */}
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3 text-xs text-gray-900 dark:text-gray-100">Open: <b>{kpi.open}</b></div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3 text-xs text-gray-900 dark:text-gray-100">In‑Progress: <b>{kpi.doing}</b></div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3 text-xs text-gray-900 dark:text-gray-100">Aging &gt; 24h: <b>{kpi.aging}</b></div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3 text-xs text-gray-900 dark:text-gray-100">MTTR (hrs): <b>{kpi.mttr.toFixed(1)}</b></div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3 text-xs text-gray-900 dark:text-gray-100">Throughput / day: <b>{kpi.tp}</b></div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3 text-xs text-gray-900 dark:text-gray-100">SLA Breach: <b>{kpi.sla}</b></div>
          </section>
          {/* Charts Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3"><canvas ref={statusChartRef} className="w-full h-[220px]" /></div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3"><canvas ref={tpChartRef} className="w-full h-[220px]" /></div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3"><canvas ref={backlogChartRef} className="w-full h-[220px]" /></div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3"><canvas ref={mttrChartRef} className="w-full h-[220px]" /></div>
          </section>

          {/* Live Queue + Alerts */}
          <section className="grid grid-cols-1 gap-2">
            {/* QC Defect Alerts */}
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">แจ้งเตือน QC ไม่ผ่าน (รอตรวจสอบ)</h3>
                <div className="flex items-center gap-2">
                  <a href="/dashboard/qc-defects" className="text-[11px] px-2 py-1 border dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100">ประวัติ</a>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">{alerts.length} รายการ</div>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                  <tr>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">วันที่</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">ตั๋ว</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">สถานี</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">ไม่ผ่าน (ชิ้น)</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {alertsLoading ? (
                    <tr><td colSpan="5" className="px-2 py-3 text-center text-gray-500 dark:text-gray-400">กำลังโหลด...</td></tr>
                  ) : alerts.length === 0 ? (
                    <tr><td colSpan="5" className="px-2 py-3 text-center text-gray-500 dark:text-gray-400">ไม่มีรายการ</td></tr>
                  ) : alerts.map(a => (
                    <tr key={a.id} className="border-b dark:border-gray-700">
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{new Date(a.created_at).toLocaleString('th-TH')}</td>
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{a.ticket_no}</td>
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{a.station_name || '-'}</td>
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{a.defect_qty}</td>
                      <td className="px-2 py-2">
                        <button 
                          onClick={()=> canAction && setRpdModal({ open:true, id:a.id, rpd:a.rpd_ref||'', nc:a.nc_note||'', ticket:a.ticket_no, station:a.station_name||'' })} 
                          disabled={!canAction}
                          className={`px-2 py-1 border dark:border-blue-600 rounded border-blue-200 text-blue-700 dark:text-blue-300 ${canAction ? 'bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer' : 'bg-gray-100 dark:bg-gray-700 opacity-50 cursor-not-allowed'}`}
                        >
                          บันทึก RPD/NC
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                  <tr>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">#</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Ticket</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Line/Station</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Tech</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Pri</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Age</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">SLA</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Status</th>
                    <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queueLoading ? (
                    <tr>
                      <td colSpan="9" className="px-2 py-3 text-center text-gray-500 dark:text-gray-400">กำลังโหลด...</td>
                    </tr>
                  ) : queue.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="px-2 py-3 text-center text-gray-500 dark:text-gray-400">ไม่มีคิว QC</td>
                    </tr>
                  ) : (
                    queue.map((r, idx) => (
                    <tr key={`${r.id}-${idx}`} className="border-b dark:border-gray-700">
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{idx+1}</td>
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{r.id}</td>
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{r.route}</td>
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{r.assignee || '-'}</td>
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{r.priority || 'P?'}</td>
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{r.time || '-'}</td>
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">-</td>
                      <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{r.status || 'Released'}</td>
                        <td className="px-2 py-2">
                          <button 
                            onClick={()=>{ if (canAction) { setSelectedTicket(r); setDrawerOpen(true); } }} 
                            disabled={!canAction}
                            className={`px-2 py-1 border dark:border-gray-600 rounded text-gray-900 dark:text-gray-100 ${canAction ? 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer' : 'bg-gray-100 dark:bg-gray-800 opacity-50 cursor-not-allowed'}`}
                          >
                            Details
                          </button>
                        </td>
                    </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 text-right mt-1">Right drawer opens on row select (details & actions)</div>
            </div>
          </section>

          {/* RPD/NC Modal (simple) */}
          {rpdModal.open && (
            <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-md shadow-lg p-4 w-[400px] max-w-[92vw] border dark:border-gray-700">
                <div className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">บันทึก RPD/NC — {rpdModal.ticket} · {rpdModal.station}</div>
                <div className="space-y-2">
                  <div>
                    <div className="text-[11px] text-gray-600 dark:text-gray-400 mb-1">RPD</div>
                    <input value={rpdModal.rpd} onChange={(e)=>setRpdModal(m=>({...m,rpd:e.target.value}))} className="w-full border dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400" placeholder="เลขอ้างอิง RPD" />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-600 dark:text-gray-400 mb-1">NC (สาเหตุ)</div>
                    <textarea value={rpdModal.nc} onChange={(e)=>setRpdModal(m=>({...m,nc:e.target.value}))} className="w-full border dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400" rows={4} placeholder="รายละเอียดเหตุผลไม่คอมพลีท" />
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={()=>setRpdModal({ open:false, id:null, rpd:'', nc:'', ticket:'', station:'' })} className="px-3 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600">ยกเลิก</button>
                  <button 
                    onClick={async ()=>{
                      if (!canAction) return;
                      try {
                        const resp = await fetch(`/api/qc/defect-alerts/${encodeURIComponent(rpdModal.id)}/update`, {
                          method:'PATCH', headers:{'Content-Type':'application/json'},
                          body: JSON.stringify({ rpd_ref: rpdModal.rpd, nc_note: rpdModal.nc, resolve: true })
                        });
                        if (!resp.ok) throw new Error('Failed');
                        setRpdModal({ open:false, id:null, rpd:'', nc:'', ticket:'', station:'' });
                        await loadAll();
                      } catch (e) {
                        alert('บันทึกไม่สำเร็จ');
                      }
                    }} 
                    disabled={!canAction}
                    className={`px-3 py-1 rounded text-white ${canAction ? 'bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600 cursor-pointer' : 'bg-gray-400 dark:bg-gray-600 opacity-50 cursor-not-allowed'}`}
                  >
                    บันทึก
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* (Rework approval list removed) */}

          {/* Assignment Board (Kanban) */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2" id="kanban">
            {[{key:'open',title:'Open'},{key:'inProgress',title:'In‑Progress'},{key:'waiting',title:'Waiting / Blocked'},{key:'done',title:'Done'}].map(col => (
              <div key={col.key} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-2 min-h-[140px]" onDragOver={(e)=>canAction && e.preventDefault()} onDrop={(e)=>onDropTo(col.key, e)}>
                <h4 className="text-xs font-semibold mb-2 text-gray-900 dark:text-gray-100">{col.title}</h4>
                <div className="flex flex-col gap-2">
                  {kanban[col.key].map(card => (
                    <div 
                      key={card.id} 
                      draggable={canAction} 
                      onDragStart={(e)=>onDragStart(e, card.id)} 
                      className={`border dark:border-gray-600 rounded p-2 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${canAction ? 'hover:bg-gray-50 dark:hover:bg-gray-600 cursor-move' : 'cursor-default'}`}
                    >
                      {card.id} · Line {card.line} · {card.p}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* Due Soon Tickets */}
          <section className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
            <h3 className="text-xs font-semibold mb-2 text-gray-900 dark:text-gray-100">ตั๋วใกล้กำหนดส่ง (ภายใน 72 ชม.)</h3>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">#</th>
                  <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Ticket</th>
                  <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Description</th>
                  <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Pri</th>
                  <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Due</th>
                  <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">In</th>
                  <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">Status</th>
                </tr>
              </thead>
              <tbody>
                {dueSoonLoading ? (
                  <tr>
                    <td colSpan="7" className="px-2 py-3 text-center text-gray-500 dark:text-gray-400">กำลังโหลด...</td>
                  </tr>
                ) : dueSoon.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-2 py-3 text-center text-gray-500 dark:text-gray-400">ไม่มีตั๋วใกล้กำหนดส่ง</td>
                  </tr>
                ) : (
                  dueSoon.map((t, idx) => {
                    const isOverdue = typeof t.remainingHours === 'number' && t.remainingHours <= 0;
                    const isSoon = typeof t.remainingHours === 'number' && t.remainingHours > 0 && t.remainingHours <= 24;
                    const rowClass = isOverdue ? 'bg-red-50 dark:bg-red-900/20' : (isSoon ? 'bg-amber-50 dark:bg-amber-900/20' : '');
                    return (
                      <tr key={`${t.id}-${idx}`} className={`border-b dark:border-gray-700 ${rowClass}`}>
                        <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{idx+1}</td>
                        <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{t.id}</td>
                        <td className="px-2 py-2 truncate max-w-[340px] text-gray-900 dark:text-gray-100">{t.desc}</td>
                        <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{t.priority}</td>
                        <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{t.dueAt ? new Date(t.dueAt).toLocaleString('th-TH') : '-'}</td>
                        <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{typeof t.remainingHours === 'number' ? (t.remainingHours <= 0 ? `${Math.abs(t.remainingHours)}h overdue` : `${t.remainingHours}h`) : '-'}</td>
                        <td className="px-2 py-2 text-gray-900 dark:text-gray-100">{t.status}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>

          {/* Technician Performance */}
          <TechnicianPerformance />

          {/* Drawer */}
          {drawerOpen && (
            <aside className="fixed top-0 right-0 h-full w-[380px] max-w-[90vw] bg-white dark:bg-gray-800 border-l dark:border-gray-700 shadow-md p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{selectedTicket?.id || '-'}</h3>
                <button onClick={()=>setDrawerOpen(false)} className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600">Close</button>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{selectedTicket?.route || '-'} · Priority {selectedTicket?.priority || 'P?'}</p>
              {canAction && (
                <div className="flex gap-2">
                  <button className="px-2 py-1 border dark:border-emerald-600 rounded bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50">Start</button>
                  <button className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600">Assign ▾</button>
                </div>
              )}
              {!canAction && (
                <div className="text-xs text-gray-500 dark:text-gray-400 italic">โหมดดูอย่างเดียว - ไม่สามารถดำเนินการได้</div>
              )}
            </aside>
          )}

        </main>
      </RoleGuard>
    </ProtectedRoute>
  );
}


