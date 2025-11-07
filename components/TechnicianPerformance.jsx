"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "next-themes";
import { RefreshCw } from "lucide-react";
import KPICard from "./performance/KPICard";
import InsightAlert from "./performance/InsightAlert";
import PerformanceHeatmap from "./performance/PerformanceHeatmap";
import TechnicianTable from "./performance/TechnicianTable";
import StationAnalysis from "./performance/StationAnalysis";
import TechnicianDetailModal from "./performance/TechnicianDetailModal";

export default function TechnicianPerformance() {
  const { user } = useAuth();
  const { theme } = useTheme();
  
  // State management
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState([]);
  
  // Filters
  const [dateRange, setDateRange] = useState("today");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [selectedTechnician, setSelectedTechnician] = useState("all");
  const [selectedStation, setSelectedStation] = useState("all");
  
  // Modal state
  const [selectedTechnicianDetail, setSelectedTechnicianDetail] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  
  // Chart refs
  const jobsChartRef = useRef(null);
  const avgTimeChartRef = useRef(null);
  const top10ChartRef = useRef(null);
  const bubbleChartRef = useRef(null);
  const [chartsReady, setChartsReady] = useState(false);
  const chartsInitializedRef = useRef(false);

  // Calculate date range - memoized
  const dateRangeParams = useMemo(() => {
    const now = new Date();
    let from, to;
    
    switch (dateRange) {
      case "today":
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case "yesterday":
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
        break;
      case "week":
        from = new Date(now);
        from.setDate(from.getDate() - 7);
        from.setHours(0, 0, 0, 0);
        to = new Date(now);
        to.setHours(23, 59, 59, 999);
        break;
      case "month":
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case "custom":
        from = customDateFrom ? new Date(customDateFrom) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
        to = customDateTo ? new Date(customDateTo) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      default:
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    }
    
    return { 
      from: from.toISOString().split('T')[0], 
      to: to.toISOString().split('T')[0] 
    };
  }, [dateRange, customDateFrom, customDateTo]);

  // Fetch data - stable callback
  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date_from: dateRangeParams.from,
        date_to: dateRangeParams.to,
        user_id: user.id,
      });
      
      if (selectedTechnician !== "all") {
        params.append("technician_id", selectedTechnician);
      }
      
      if (selectedStation !== "all") {
        params.append("station_id", selectedStation);
      }

      const response = await fetch(`/api/reports/technician-performance?${params.toString()}`);
      const result = await response.json();

      if (result.success && result.data) {
        setData(result.data);
      }
    } catch (error) {
      console.error("Error fetching technician performance:", error);
    } finally {
      setLoading(false);
      setChartsReady(true);
    }
  }, [dateRangeParams.from, dateRangeParams.to, selectedTechnician, selectedStation, user?.id]);

  // Helper functions for insights - stable
  const findSlowestStation = useCallback((technicianId, stationByTechnician) => {
    if (!stationByTechnician) return null;
    const techStations = stationByTechnician.filter(s => s.technicianId === technicianId);
    if (techStations.length === 0) return null;
    return techStations.reduce((slowest, current) => 
      current.avgMinutes > slowest.avgMinutes ? current : slowest
    );
  }, []);

  const groupByStation = useCallback((stationByTechnician) => {
    if (!stationByTechnician) return {};
    const groups = {};
    stationByTechnician.forEach(item => {
      if (!groups[item.stationName]) {
        groups[item.stationName] = [];
      }
      groups[item.stationName].push(item);
    });
    return groups;
  }, []);

  // Calculate insights - memoized and stable
  const calculateInsights = useCallback((data) => {
    const newInsights = [];
    const { technicianSummary, stationByTechnician, statistics } = data || {};
    
    if (!technicianSummary || !statistics) {
      setInsights([]);
      return;
    }
    
    const technicians = Object.values(technicianSummary)
      .filter(t => t.completedSessions > 0);
    
    if (technicians.length === 0) {
      setInsights([]);
      return;
    }
    
    const avgDuration = statistics.averageDuration || 0;
    
    // ถ้าไม่มี averageDuration ให้คำนวณจาก technicians
    const calculatedAvg = avgDuration > 0 
      ? avgDuration 
      : technicians.reduce((sum, t) => sum + t.averageDuration, 0) / technicians.length;
    
    // Find slow technicians (>15% slower than average) - ลด threshold
    technicians.forEach(tech => {
      if (tech.averageDuration > calculatedAvg * 1.15 && tech.completedSessions > 0) {
        const slowestStation = findSlowestStation(tech.technicianId, stationByTechnician);
        if (slowestStation) {
          newInsights.push({
            type: "warning",
            icon: "⚠️",
            title: `ช่าง "${tech.technicianName}" ใช้เวลาในสถานี "${slowestStation.stationName}" นานกว่าเฉลี่ย ${Math.round(((slowestStation.avgMinutes - calculatedAvg) / calculatedAvg) * 100)}%`,
            description: `(เฉลี่ย: ${(calculatedAvg / 60).toFixed(1)}h → ${tech.technicianName}: ${(slowestStation.avgMinutes / 60).toFixed(1)}h)`,
            action: "ดูรายละเอียด",
            technicianId: tech.technicianId,
          });
        }
      }
    });
    
    // Find top performers (>10% faster than average) - ลด threshold และจำนวนงานขั้นต่ำ
    technicians.forEach(tech => {
      if (tech.averageDuration < calculatedAvg * 0.9 && tech.completedSessions >= 3) {
        newInsights.push({
          type: "success",
          icon: "🎯",
          title: `ช่าง "${tech.technicianName}" มีประสิทธิภาพสูง - เร็วกว่าเฉลี่ย ${Math.round(((calculatedAvg - tech.averageDuration) / calculatedAvg) * 100)}%`,
          description: `(เฉลี่ย: ${(calculatedAvg / 60).toFixed(1)}h → ${tech.technicianName}: ${(tech.averageDuration / 60).toFixed(1)}h)`,
          action: "ดูรายละเอียด",
          technicianId: tech.technicianId,
        });
      }
    });
    
    // Find bottleneck stations - ลด threshold
    if (stationByTechnician && stationByTechnician.length > 0) {
      const stationGroups = groupByStation(stationByTechnician);
      const allStationAvgs = Object.entries(stationGroups).map(([_, sessions]) => 
        sessions.reduce((sum, s) => sum + s.avgMinutes, 0) / sessions.length
      );
      const overallStationAvg = allStationAvgs.length > 0 
        ? allStationAvgs.reduce((sum, avg) => sum + avg, 0) / allStationAvgs.length 
        : 90;
      
      Object.entries(stationGroups).forEach(([stationName, sessions]) => {
        const stationAvg = sessions.reduce((sum, s) => sum + s.avgMinutes, 0) / sessions.length;
        if (stationAvg > overallStationAvg * 1.15) {
          newInsights.push({
            type: "warning",
            icon: "🐌",
            title: `สถานี "${stationName}" ใช้เวลามากกว่าเฉลี่ย - ${(stationAvg / 60).toFixed(1)}h/งาน`,
            description: `(เฉลี่ยสถานี: ${(overallStationAvg / 60).toFixed(1)}h) พิจารณาเพิ่มช่างหรือปรับ process`,
            action: null,
            technicianId: null,
          });
        }
      });
    }
    
    setInsights(newInsights.slice(0, 5));
  }, [findSlowestStation, groupByStation]);

  // Fetch data on mount and filter changes
  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [fetchData]);

  // Calculate insights when data changes
  useEffect(() => {
    if (data) {
      calculateInsights(data);
    }
  }, [data, calculateInsights]);

  // Handle insight click
  const handleInsightClick = useCallback((insight) => {
    if (!insight.technicianId || !data?.technicianSummary) return;
    const tech = Object.values(data.technicianSummary).find(t => t.technicianId === insight.technicianId);
    if (tech) {
      setSelectedTechnicianDetail(tech);
      setDetailModalOpen(true);
    }
  }, [data]);

  // Calculate KPIs - memoized
  const kpis = useMemo(() => {
    if (!data?.technicianSummary) {
      return {
        totalTechnicians: 0,
        totalCompleted: 0,
        totalHours: 0,
        averagePerJob: 0,
      };
    }

    const technicians = Object.values(data.technicianSummary);
    const totalTechnicians = technicians.length;
    const totalCompleted = technicians.reduce((sum, t) => sum + (t.completedSessions || 0), 0);
    const totalHours = technicians.reduce((sum, t) => sum + (t.totalHours || 0), 0);
    const averagePerJob = totalCompleted > 0 ? (totalHours / totalCompleted) : 0;

    return {
      totalTechnicians,
      totalCompleted,
      totalHours: Math.round(totalHours * 100) / 100,
      averagePerJob: Math.round(averagePerJob * 100) / 100,
    };
  }, [data]);

  // Get top performers and needs improvement - memoized
  const performanceLists = useMemo(() => {
    if (!data?.technicianSummary) {
      return { topPerformers: [], needsImprovement: [] };
    }

    const technicians = Object.values(data.technicianSummary)
      .filter(t => t.completedSessions > 0)
      .map(t => ({
        ...t,
        avgHours: t.averageDuration / 60,
      }))
      .sort((a, b) => a.averageDuration - b.averageDuration);

    if (technicians.length === 0) {
      return { topPerformers: [], needsImprovement: [] };
    }

    const avgDuration = technicians.reduce((sum, t) => sum + t.averageDuration, 0) / technicians.length;

    const topPerformers = technicians
      .filter(t => t.averageDuration < avgDuration * 0.9)
      .slice(0, 5);

    const needsImprovement = technicians
      .filter(t => t.averageDuration > avgDuration * 1.1)
      .slice(-3)
      .reverse();

    return { topPerformers, needsImprovement };
  }, [data]);

  // Load and draw charts - only once when data is ready
  useEffect(() => {
    if (!chartsReady || !data?.technicianSummary || chartsInitializedRef.current) return;

    const loadCharts = async () => {
      let Chart;
      try {
        const mod = await import('chart.js/auto');
        Chart = mod.default;
      } catch (e) {
        if (!window.Chart) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
          await new Promise((resolve) => {
            script.onload = resolve;
            document.body.appendChild(script);
          });
        }
        Chart = window.Chart;
      }

      const isDark = theme === 'dark' || document.documentElement.classList.contains('dark');
      const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)';
      const textColor = isDark ? '#e5e7eb' : '#374151';

      const destroyChart = (canvas) => {
        if (canvas?._chart) {
          canvas._chart.destroy();
          canvas._chart = null;
        }
      };

      const technicians = Object.values(data.technicianSummary || {})
        .filter(t => t.completedSessions > 0)
        .sort((a, b) => b.completedSessions - a.completedSessions);

      // TOP 10 ช่างยอดเยี่ยม - Horizontal Bar Chart (เรียงตามประสิทธิภาพ: เร็วที่สุด = ยอดเยี่ยม)
      const top10Technicians = Object.values(data.technicianSummary || {})
        .filter(t => t.completedSessions > 0)
        .sort((a, b) => a.averageDuration - b.averageDuration) // เรียงตามเวลาเฉลี่ย (น้อย = เร็ว = ยอดเยี่ยม)
        .slice(0, 10);
      
      if (top10ChartRef.current && top10Technicians.length > 0) {
        destroyChart(top10ChartRef.current);
        const top10Chart = new Chart(top10ChartRef.current.getContext('2d'), {
          type: 'bar',
          data: {
            labels: top10Technicians.map(t => t.technicianName),
            datasets: [{
              label: 'เวลาเฉลี่ย (ชม./งาน)',
              data: top10Technicians.map(t => parseFloat((t.averageDuration / 60).toFixed(1))),
              backgroundColor: top10Technicians.map((_, idx) => {
                if (idx === 0) return '#fbbf24'; // Gold - อันดับ 1
                if (idx === 1) return '#94a3b8'; // Silver - อันดับ 2
                if (idx === 2) return '#f97316'; // Bronze - อันดับ 3
                return '#34d399'; // Green - อื่นๆ
              }),
              borderRadius: 8
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const tech = top10Technicians[context.dataIndex];
                    return [
                      `อันดับ: ${context.dataIndex + 1}`,
                      `งานเสร็จ: ${tech.completedSessions} งาน`,
                      `เวลาเฉลี่ย: ${(tech.averageDuration / 60).toFixed(1)}h/งาน`,
                      `เวลารวม: ${tech.totalHours.toFixed(1)}h`
                    ];
                  }
                }
              }
            },
            scales: {
              x: { 
                title: {
                  display: true,
                  text: 'เวลาเฉลี่ย (ชั่วโมง/งาน)',
                  color: textColor
                },
                grid: { color: gridColor }, 
                ticks: { color: textColor } 
              },
              y: { grid: { display: false }, ticks: { color: textColor } }
            },
            animation: {
              duration: 0
            }
          }
        });
        top10ChartRef.current._chart = top10Chart;
      }

      // Jobs completed chart
      if (jobsChartRef.current && technicians.length > 0) {
        destroyChart(jobsChartRef.current);
        const jobsChart = new Chart(jobsChartRef.current.getContext('2d'), {
          type: 'bar',
          data: {
            labels: technicians.map(t => t.technicianName),
            datasets: [{
              label: 'งานเสร็จ',
              data: technicians.map(t => t.completedSessions),
              backgroundColor: '#34d399',
              borderRadius: 8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { grid: { color: gridColor }, ticks: { color: textColor } },
              x: { grid: { display: false }, ticks: { color: textColor } }
            },
            animation: {
              duration: 0 // Disable animation to prevent render loops
            }
          }
        });
        jobsChartRef.current._chart = jobsChart;
      }

      // Average time chart
      if (avgTimeChartRef.current && technicians.length > 0) {
        destroyChart(avgTimeChartRef.current);
        const avgChart = new Chart(avgTimeChartRef.current.getContext('2d'), {
          type: 'line',
          data: {
            labels: technicians.map(t => t.technicianName),
            datasets: [{
              label: 'เวลาเฉลี่ย (ชม.)',
              data: technicians.map(t => (t.averageDuration / 60).toFixed(1)),
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              tension: 0.3,
              fill: true
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { grid: { color: gridColor }, ticks: { color: textColor } },
              x: { grid: { display: false }, ticks: { color: textColor } }
            },
            animation: {
              duration: 0 // Disable animation to prevent render loops
            }
          }
        });
        avgTimeChartRef.current._chart = avgChart;
      }

      // Bubble Chart - การกระจายงาน (เวลารวม vs จำนวนงาน)
      if (bubbleChartRef.current && technicians.length > 0) {
        destroyChart(bubbleChartRef.current);
        const bubbleData = technicians.map(t => ({
          x: t.completedSessions,
          y: t.totalHours,
          r: Math.max(5, Math.min(30, t.completedSessions / 2))
        }));

        const bubbleChart = new Chart(bubbleChartRef.current.getContext('2d'), {
          type: 'bubble',
          data: {
            datasets: [{
              label: 'ช่าง',
              data: bubbleData.map((b, idx) => ({
                ...b,
                label: technicians[idx].technicianName
              })),
              backgroundColor: 'rgba(52, 211, 153, 0.5)',
              borderColor: 'rgba(52, 211, 153, 1)',
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const tech = technicians[context.dataIndex];
                    return [
                      `ชื่อ: ${tech.technicianName}`,
                      `จำนวนงาน: ${tech.completedSessions} งาน`,
                      `เวลารวม: ${tech.totalHours.toFixed(1)}h`,
                      `เฉลี่ย: ${(tech.averageDuration / 60).toFixed(1)}h/งาน`
                    ];
                  }
                }
              }
            },
            scales: {
              x: {
                title: {
                  display: true,
                  text: 'จำนวนงานที่ทำเสร็จ',
                  color: textColor
                },
                grid: { color: gridColor },
                ticks: { color: textColor }
              },
              y: {
                title: {
                  display: true,
                  text: 'เวลารวม (ชั่วโมง)',
                  color: textColor
                },
                grid: { color: gridColor },
                ticks: { color: textColor }
              }
            },
            animation: {
              duration: 0
            }
          }
        });
        bubbleChartRef.current._chart = bubbleChart;
      }

      chartsInitializedRef.current = true;
    };

    loadCharts();

    // Cleanup on unmount
    return () => {
      if (jobsChartRef.current?._chart) {
        jobsChartRef.current._chart.destroy();
        jobsChartRef.current._chart = null;
      }
      if (avgTimeChartRef.current?._chart) {
        avgTimeChartRef.current._chart.destroy();
        avgTimeChartRef.current._chart = null;
      }
      if (top10ChartRef.current?._chart) {
        top10ChartRef.current._chart.destroy();
        top10ChartRef.current._chart = null;
      }
      if (bubbleChartRef.current?._chart) {
        bubbleChartRef.current._chart.destroy();
        bubbleChartRef.current._chart = null;
      }
      chartsInitializedRef.current = false;
    };
  }, [chartsReady, data, theme]);

  // Reset charts when data changes significantly
  useEffect(() => {
    if (data) {
      chartsInitializedRef.current = false;
      setChartsReady(false);
      setTimeout(() => setChartsReady(true), 100);
    }
  }, [selectedTechnician, selectedStation, dateRange]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-gray-600 dark:text-gray-400">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">ประสิทธิภาพการทำงานของช่าง</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">วิเคราะห์ประสิทธิภาพการทำงานของช่างแต่ละคน</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-1.5 border dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="today">วันนี้</option>
            <option value="yesterday">เมื่อวาน</option>
            <option value="week">สัปดาห์นี้</option>
            <option value="month">เดือนนี้</option>
            <option value="custom">กำหนดเอง</option>
          </select>

          {dateRange === "custom" && (
            <>
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="px-3 py-1.5 border dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <span className="text-gray-600 dark:text-gray-400">ถึง</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="px-3 py-1.5 border dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </>
          )}

          <select
            value={selectedTechnician}
            onChange={(e) => setSelectedTechnician(e.target.value)}
            className="px-3 py-1.5 border dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="all">ช่าง: ทั้งหมด</option>
            {data?.technicianSummary && Object.values(data.technicianSummary).map(tech => (
              <option key={tech.technicianId} value={tech.technicianId}>
                {tech.technicianName}
              </option>
            ))}
          </select>

          <select
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            className="px-3 py-1.5 border dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="all">สถานี: ทั้งหมด</option>
            {data?.stationByTechnician && Array.from(new Set(data.stationByTechnician.map(s => s.stationId))).map(stationId => {
              const station = data.stationByTechnician.find(s => s.stationId === stationId);
              return (
                <option key={stationId} value={stationId}>
                  {station?.stationName || stationId}
                </option>
              );
            })}
          </select>

          <button
            onClick={fetchData}
            className="px-3 py-1.5 border dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" />
            รีเฟรช
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KPICard
          title="ช่างทำงาน"
          value={kpis.totalTechnicians}
          icon="👷"
        />
        <KPICard
          title="งานเสร็จ"
          value={kpis.totalCompleted}
          icon="✅"
        />
        <KPICard
          title="เวลารวม"
          value={`${kpis.totalHours} ชม.`}
          icon="⏱️"
        />
        <KPICard
          title="เฉลี่ยต่องาน"
          value={`${kpis.averagePerJob} ชม.`}
          icon="📈"
        />
      </div>

      {/* Insights & Alerts */}
      {data && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
          <h3 className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">🔥 INSIGHTS & ALERTS</h3>
          <div className="space-y-2">
            {insights.length > 0 ? (
              insights.map((insight, idx) => (
                <InsightAlert 
                  key={idx} 
                  {...insight}
                  onClick={insight.action ? () => handleInsightClick(insight) : null}
                />
              ))
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                ไม่มี insights ในช่วงเวลาที่เลือก
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOP 10 ช่างยอดเยี่ยม Chart */}
      {data?.technicianSummary && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
          <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">📊 TOP 10 ช่างยอดเยี่ยม</h3>
          {Object.values(data.technicianSummary).filter(t => t.completedSessions > 0).length > 0 ? (
            <div className="w-full h-[250px] relative">
              <canvas ref={top10ChartRef} className="w-full h-full" />
            </div>
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
              ไม่มีข้อมูลช่างในช่วงเวลาที่เลือก
            </div>
          )}
        </div>
      )}

      {/* Top Performers vs Needs Improvement */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
          <h3 className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">🏆 Top 5 Performers</h3>
          <div className="space-y-2">
            {performanceLists.topPerformers.map((tech) => (
              <div key={tech.technicianId} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                <div className="flex-1">
                  <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                    {tech.technicianName}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {tech.completedSessions} งาน | {tech.totalHours.toFixed(1)}h รวม
                  </div>
                </div>
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {(tech.averageDuration / 60).toFixed(1)}h/งาน
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
          <h3 className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">🐢 Needs Improvement</h3>
          <div className="space-y-2">
            {performanceLists.needsImprovement.length > 0 ? (
              performanceLists.needsImprovement.map((tech) => (
                <div key={tech.technicianId} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                  <div className="flex-1">
                    <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                      {tech.technicianName}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {tech.completedSessions} งาน | {tech.totalHours.toFixed(1)}h รวม
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {(tech.averageDuration / 60).toFixed(1)}h/งาน
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                ไม่มีช่างที่ต้องปรับปรุง
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      {data?.technicianSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
            <h3 className="text-xs font-semibold mb-2 text-gray-900 dark:text-gray-100">📈 จำนวนงานที่ทำเสร็จ</h3>
            {Object.values(data.technicianSummary).filter(t => t.completedSessions > 0).length > 0 ? (
              <div className="w-full h-[200px] relative">
                <canvas ref={jobsChartRef} className="w-full h-full" />
              </div>
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
                ไม่มีข้อมูล
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
            <h3 className="text-xs font-semibold mb-2 text-gray-900 dark:text-gray-100">⏱️ เวลาเฉลี่ยต่องาน</h3>
            {Object.values(data.technicianSummary).filter(t => t.completedSessions > 0).length > 0 ? (
              <div className="w-full h-[200px] relative">
                <canvas ref={avgTimeChartRef} className="w-full h-full" />
              </div>
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
                ไม่มีข้อมูล
              </div>
            )}
          </div>
        </div>
      )}

      {/* Heatmap - เวลาทำงานแยกตามสถานี */}
      {data && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
          <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">⏱️ เวลาทำงานแยกตามสถานี</h3>
          {data?.stationByTechnician && data.stationByTechnician.length > 0 ? (
            <PerformanceHeatmap
              data={data.stationByTechnician}
              technicianSummary={data.technicianSummary}
              onCellClick={(techId) => {
                const tech = Object.values(data.technicianSummary || {}).find(t => t.technicianId === techId);
                if (tech) {
                  setSelectedTechnicianDetail(tech);
                  setDetailModalOpen(true);
                }
              }}
            />
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
              ไม่มีข้อมูลสถานีในช่วงเวลาที่เลือก
            </div>
          )}
        </div>
      )}

      {/* Bubble Chart - การกระจายงาน */}
      {data?.technicianSummary && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
          <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">📊 การกระจายงาน (Bubble Chart)</h3>
          {Object.values(data.technicianSummary).filter(t => t.completedSessions > 0).length > 0 ? (
            <div className="w-full h-[300px] relative">
              <canvas ref={bubbleChartRef} className="w-full h-full" />
            </div>
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
              ไม่มีข้อมูลสำหรับแสดง bubble chart
            </div>
          )}
        </div>
      )}

      {/* Detail Table - รายละเอียดช่างแต่ละคน */}
      {data && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
          <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">📋 รายละเอียดช่างแต่ละคน (คลิกเพื่อดู drill-down)</h3>
          {data?.technicianSummary && Object.values(data.technicianSummary).length > 0 ? (
            <TechnicianTable
              data={Object.values(data.technicianSummary)}
              stationByTechnician={data.stationByTechnician}
              onRowClick={(tech) => {
                setSelectedTechnicianDetail(tech);
                setDetailModalOpen(true);
              }}
            />
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
              ไม่มีข้อมูลช่างในช่วงเวลาที่เลือก
            </div>
          )}
        </div>
      )}

      {/* Station Analysis */}
      {data && data?.stationByTechnician && data.stationByTechnician.length > 0 && (
        <StationAnalysis
          stationByTechnician={data.stationByTechnician}
          technicianSummary={data.technicianSummary}
        />
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedTechnicianDetail && data && (
        <TechnicianDetailModal
          technician={selectedTechnicianDetail}
          sessions={data.sessions?.filter(s => s.technician_id === selectedTechnicianDetail.technicianId) || []}
          stationByTechnician={data.stationByTechnician?.filter(s => s.technicianId === selectedTechnicianDetail.technicianId) || []}
          onClose={() => {
            setDetailModalOpen(false);
            setSelectedTechnicianDetail(null);
          }}
        />
      )}
    </section>
  );
}
