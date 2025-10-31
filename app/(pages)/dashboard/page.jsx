"use client";

import React, { useEffect, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/utils/supabaseClient";
import { loadActiveQcQueue } from "@/utils/ticketsDb";
import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  const { language } = useLanguage();
  const { user } = useAuth();

  // KPI state
  const [kpi, setKpi] = useState({ open: 42, doing: 18, aging: 7, mttr: 3.6, tp: 128, sla: 5 });

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

  // Rework list
  const [reworks, setReworks] = useState([]);
  const [reworksLoading, setReworksLoading] = useState(true);
  const srAlertRef = useRef(null);

  // Kanban
  const [kanban, setKanban] = useState({
    open: [ { id: 'TK-1023', line: 'A', p: 'P2' }, { id: 'TK-1058', line: 'C', p: 'P1' } ],
    inProgress: [ { id: 'TK-1041', line: 'B', p: 'P2' }, { id: 'TK-1055', line: 'A', p: 'P3' } ],
    waiting: [ { id: 'TK-1062', line: 'D', p: 'P1' } ],
    done: [ { id: 'TK-0998', line: 'A', p: 'P3' }, { id: 'TK-1012', line: 'C', p: 'P2' } ]
  });
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  // Load real data (KPIs, charts, kanban, queue)
  const loadAll = async () => {
      // 1) Tickets base for KPIs and charts
      try {
        const { data: tickets } = await supabase.from('ticket').select('status, created_at');
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const toLower = (s) => String(s || '').toLowerCase();
        const open = (tickets || []).filter(t => toLower(t.status) === 'open').length;
        const inProgress = (tickets || []).filter(t => ['in_progress','in-progress','doing'].includes(toLower(t.status))).length;
        const waiting = (tickets || []).filter(t => toLower(t.status) === 'waiting').length;
        const done = (tickets || []).filter(t => toLower(t.status) === 'done').length;
        const aging = (tickets || []).filter(t => {
          const created = t.created_at ? new Date(t.created_at) : null;
          const older = created ? (now.getTime() - created.getTime()) > (24*60*60*1000) : false;
          return older && toLower(t.status) !== 'done';
        }).length;
        const tp = (tickets || []).filter(t => {
          const created = t.created_at ? new Date(t.created_at) : null;
          return created && created >= todayStart;
        }).length;
        setKpi(prev => ({ ...prev, open, doing: inProgress, aging, tp, sla: prev.sla }));

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
      } catch {}

      // 2) Kanban lanes from tickets
      try {
        const { data } = await supabase.from('ticket').select('no, status, source_no, priority');
        const bucket = { open: [], in_progress: [], waiting: [], done: [] };
        (data||[]).forEach(t=>{
          const s = String(t.status||'').toLowerCase();
          if (s==='open') bucket.open.push(t);
          else if (['in_progress','in-progress'].includes(s)) bucket.in_progress.push(t);
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
          data: {
            labels: ['Open','In Progress','Waiting','Done'],
            datasets: [{
              data: safeStatusData,
              backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#6366f1'],
              borderWidth: 2,
              borderColor: '#ffffff',
              hoverBackgroundColor: ['#2563eb', '#059669', '#d97706', '#4f46e5'],
              hoverBorderWidth: 3,
              hoverBorderColor: '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              title: {
                display: true,
                text: 'สถานะตั๋วทั้งหมด',
                font: { size: 16, weight: 'bold' },
                padding: { top: 10, bottom: 20 },
                color: '#1f2937'
              },
              legend: {
                position: 'bottom',
                labels: {
                  boxWidth: 15,
                  padding: 15,
                  font: { size: 12 },
                  usePointStyle: true,
                  pointStyle: 'circle'
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                titleFont: { size: 14, weight: 'bold' },
                bodyFont: { size: 13 },
                callbacks: {
                  label: function(context) {
                    const label = context.label || '';
                    const value = context.parsed || 0;
                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                    return `${label}: ${value} ตั๋ว (${percentage}%)`;
                  }
                }
              }
            },
            cutout: '65%'
          },
          plugins: [{
            id: 'centerText',
            beforeDraw: function(chart) {
              const ctx = chart.ctx;
              const width = chart.width;
              const height = chart.height;
              const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);

              ctx.restore();
              ctx.font = 'bold 24px sans-serif';
              ctx.fillStyle = '#1f2937';
              ctx.textBaseline = 'middle';
              ctx.textAlign = 'center';

              const text = total.toString();
              const textX = width / 2;
              const textY = height / 2 - 10;

              ctx.fillText(text, textX, textY);

              ctx.font = '12px sans-serif';
              ctx.fillStyle = '#6b7280';
              ctx.fillText('ตั๋วทั้งหมด', textX, textY + 25);

              ctx.save();
            }
          }]
        });
        statusChartRef.current._chart = inst;
      }
      if (tpChartRef.current) {
        const inst = new Chart(tpChartRef.current.getContext('2d'), {
          type: 'line', data: { labels: tpLabels, datasets: [{ label: 'Jobs/day', data: tpData, borderColor: '#34d399', backgroundColor: 'transparent', tension: .3 }] },
          options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display:false } } } }
        });
        tpChartRef.current._chart = inst;
      }
      if (backlogChartRef.current) {
        const inst = new Chart(backlogChartRef.current.getContext('2d'), {
          type: 'bar', data: { labels: blLabels, datasets: [{ label: 'Backlog', data: blData, backgroundColor: '#f4c06a', borderWidth: 0, borderRadius: 8 }] },
          options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display:false } } } }
        });
        backlogChartRef.current._chart = inst;
      }
      if (mttrChartRef.current) {
        const inst = new Chart(mttrChartRef.current.getContext('2d'), {
          type: 'line', data: { labels: mtLabels, datasets: [ { label: 'MTTR (min)', data: mttr, borderColor: '#ef4444', backgroundColor: 'transparent', tension: .3 }, { label: 'MTBF (min)', data: mtbf, borderColor: '#94a3b8', backgroundColor: 'transparent', tension: .3 } ] },
          options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display:false } } } }
        });
        mttrChartRef.current._chart = inst;
      }
    };
    draw();
  }, [chartData]);

  // No mock realtime; optional: subscribe to changes (disabled for now)
  useEffect(() => {
    const ch = supabase.channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_station_flow' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'technician_work_sessions' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rework_orders' }, loadAll)
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, []);

  // Load pending reworks
  useEffect(() => {
    const load = async () => {
      try {
        setReworksLoading(true);
        const { data, error } = await supabase.from('rework_orders').select('*').eq('approval_status', 'pending').order('created_at', { ascending: false });
        if (error) throw error;
        setReworks(data || []);
      } catch (e) {
        setReworks([]);
      } finally {
        setReworksLoading(false);
      }
    };
    load();
  }, []);

  const approveRework = async (id) => {
    try {
      await fetch(`/api/rework/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvedBy: user?.id || user?.email || 'admin' }) });
    } catch {}
    setReworks(prev => prev.filter(r => r.id !== id));
    if (srAlertRef.current) srAlertRef.current.textContent = `Approved ${id}`;
  };
  const rejectRework = async (id) => {
    try {
      await fetch(`/api/rework/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rejectedBy: user?.id || user?.email || 'admin', reason: 'Rejected via dashboard' }) });
    } catch {}
    setReworks(prev => prev.filter(r => r.id !== id));
    if (srAlertRef.current) srAlertRef.current.textContent = `Rejected ${id}`;
  };

  // Kanban DnD handlers
  const onDragStart = (e, id) => { e.dataTransfer.setData('text/plain', id); };
  const onDropTo = async (laneKey, e) => {
    e.preventDefault();
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
                <p className="text-gray-600 dark:text-gray-400">ภาพรวมสถานะตั๋ว ไลน์ผลิต และ Rework</p>
              </div>
            </div>
          </header>

          {/* KPI Shelf */}
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="bg-white border rounded-md p-3 text-xs">Open: <b>{kpi.open}</b></div>
            <div className="bg-white border rounded-md p-3 text-xs">In‑Progress: <b>{kpi.doing}</b></div>
            <div className="bg-white border rounded-md p-3 text-xs">Aging &gt; 24h: <b>{kpi.aging}</b></div>
            <div className="bg-white border rounded-md p-3 text-xs">MTTR (hrs): <b>{kpi.mttr.toFixed(1)}</b></div>
            <div className="bg-white border rounded-md p-3 text-xs">Throughput / day: <b>{kpi.tp}</b></div>
            <div className="bg-white border rounded-md p-3 text-xs">SLA Breach: <b>{kpi.sla}</b></div>
          </section>
          {/* Charts Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="bg-white border rounded-md p-3"><canvas ref={statusChartRef} height="180" /></div>
            <div className="bg-white border rounded-md p-3"><canvas ref={tpChartRef} height="180" /></div>
            <div className="bg-white border rounded-md p-3"><canvas ref={backlogChartRef} height="180" /></div>
            <div className="bg-white border rounded-md p-3"><canvas ref={mttrChartRef} height="180" /></div>
          </section>

          {/* Live Queue + Alerts */}
          <section className="grid grid-cols-1 gap-2">
            <div className="bg-white border rounded-md p-3 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Ticket</th>
                    <th className="px-2 py-2 text-left">Line/Station</th>
                    <th className="px-2 py-2 text-left">Tech</th>
                    <th className="px-2 py-2 text-left">Pri</th>
                    <th className="px-2 py-2 text-left">Age</th>
                    <th className="px-2 py-2 text-left">SLA</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queueLoading ? (
                    <tr>
                      <td colSpan="9" className="px-2 py-3 text-center text-gray-500">กำลังโหลด...</td>
                    </tr>
                  ) : queue.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="px-2 py-3 text-center text-gray-500">ไม่มีคิว QC</td>
                    </tr>
                  ) : (
                    queue.map((r, idx) => (
                      <tr key={`${r.id}-${idx}`} className="border-b">
                        <td className="px-2 py-2">{idx+1}</td>
                        <td className="px-2 py-2">{r.id}</td>
                        <td className="px-2 py-2">{r.route}</td>
                        <td className="px-2 py-2">{r.assignee || '-'}</td>
                        <td className="px-2 py-2">{r.priority || 'P?'}</td>
                        <td className="px-2 py-2">{r.time || '-'}</td>
                        <td className="px-2 py-2">-</td>
                        <td className="px-2 py-2">{r.status || 'Released'}</td>
                        <td className="px-2 py-2"><button onClick={()=>{ setSelectedTicket(r); setDrawerOpen(true); }} className="px-2 py-1 border rounded">Details</button></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="text-[11px] text-gray-500 text-right mt-1">Right drawer opens on row select (details & actions)</div>
            </div>
          </section>

          {/* Rework Approval List */}
          <section className="bg-white border rounded-md p-3">
            <h3 className="text-xs font-semibold mb-2">Rework Orders — Pending Approval</h3>
            {reworksLoading ? (
              <div className="text-xs text-gray-500 p-2">กำลังโหลด...</div>
            ) : reworks.length === 0 ? (
              <div className="text-xs text-gray-500 p-2">No pending rework orders.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Rework ID</th>
                    <th className="px-2 py-2 text-left">Line/Station</th>
                    <th className="px-2 py-2 text-left">Reason</th>
                    <th className="px-2 py-2 text-left">Requested By</th>
                    <th className="px-2 py-2 text-left">Age</th>
                    <th className="px-2 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reworks.map((r, idx) => (
                    <tr key={r.id} className="border-b">
                      <td className="px-2 py-2">{idx+1}</td>
                      <td className="px-2 py-2">{r.id}</td>
                      <td className="px-2 py-2">{r.failed_at_station_id || '-'}</td>
                      <td className="px-2 py-2">{r.reason || '-'}</td>
                      <td className="px-2 py-2">{r.created_by || '-'}</td>
                      <td className="px-2 py-2">{r.created_at ? new Date(r.created_at).toLocaleTimeString('th-TH') : '-'}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <button onClick={()=>approveRework(r.id)} className="px-2 py-1 border rounded bg-emerald-50 border-emerald-200">Approve</button>
                          <button onClick={()=>rejectRework(r.id)} className="px-2 py-1 border rounded">Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div ref={srAlertRef} role="status" aria-live="polite" className="sr-only" />
          </section>

          {/* Assignment Board (Kanban) */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2" id="kanban">
            {[{key:'open',title:'Open'},{key:'inProgress',title:'In‑Progress'},{key:'waiting',title:'Waiting / Blocked'},{key:'done',title:'Done'}].map(col => (
              <div key={col.key} className="bg-white border rounded-md p-2 min-h-[140px]" onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>onDropTo(col.key, e)}>
                <h4 className="text-xs font-semibold mb-2">{col.title}</h4>
                <div className="flex flex-col gap-2">
                  {kanban[col.key].map(card => (
                    <div key={card.id} draggable onDragStart={(e)=>onDragStart(e, card.id)} className="border rounded p-2 text-xs bg-white">
                      {card.id} · Line {card.line} · {card.p}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* Drawer */}
          {drawerOpen && (
            <aside className="fixed top-0 right-0 h-full w-[380px] max-w-[90vw] bg-white border-l shadow-md p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{selectedTicket?.id || '-'}</h3>
                <button onClick={()=>setDrawerOpen(false)} className="px-2 py-1 border rounded">Close</button>
              </div>
              <p className="text-xs text-gray-600 mb-2">{selectedTicket?.route || '-'} · Priority {selectedTicket?.priority || 'P?'}</p>
              <div className="flex gap-2">
                <button className="px-2 py-1 border rounded bg-emerald-50 border-emerald-200">Start</button>
                <button className="px-2 py-1 border rounded">Assign ▾</button>
              </div>
            </aside>
          )}

        </main>
      </RoleGuard>
    </ProtectedRoute>
  );
}


