"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { 
  Calendar, 
  User, 
  Clock, 
  TrendingUp, 
  Download, 
  Filter, 
  Search,
  BarChart3,
  Award,
  Timer,
  Users,
  Building
} from "lucide-react";

export default function TechnicianPerformancePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  
  // Filters
  const [technicianId, setTechnicianId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stationId, setStationId] = useState("");
  
  // Available options for filters
  const [technicians, setTechnicians] = useState([]);
  const [stations, setStations] = useState([]);

  // Set default date range (last 30 days)
  useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    setDateTo(today.toISOString().split('T')[0]);
    setDateFrom(thirtyDaysAgo.toISOString().split('T')[0]);
  }, []);

  // Load filter options
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        // Load technicians
        const usersRes = await fetch('/api/users/list');
        const usersJson = await usersRes.json();
        setTechnicians(usersJson?.users?.filter(u => String(u.role || '').toLowerCase() === 'technician') || []);

        // Load stations
        const stationsRes = await fetch('/api/stations');
        const stationsJson = await stationsRes.json();
        setStations(stationsJson?.data || []);
      } catch (e) {
        console.error('Failed to load filter options:', e);
      }
    };

    loadFilterOptions();
  }, []);

  // Load performance data
  const loadPerformanceData = async () => {
    if (!dateFrom || !dateTo) return;

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        user_id: user?.id || ''
      });

      if (technicianId) params.append('technician_id', technicianId);
      if (stationId) params.append('station_id', stationId);

      const response = await fetch(`/api/reports/technician-performance?${params}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load performance data');
      }

      setData(result.data);
    } catch (e) {
      console.error('Failed to load performance data:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPerformanceData();
  }, [technicianId, dateFrom, dateTo, stationId, user?.id]);

  // Export to CSV
  const exportToCSV = () => {
    if (!data?.sessions) return;

    const csvContent = [
      ['Ticket No', 'Station', 'Technician', 'Start Time', 'End Time', 'Duration (Minutes)', 'Date'].join(','),
      ...data.sessions.map(session => [
        session.ticket_no,
        session.stations?.name_th || 'Unknown',
        session.users?.name || session.users?.email || 'Unknown',
        new Date(session.started_at).toLocaleString('th-TH'),
        session.completed_at ? new Date(session.completed_at).toLocaleString('th-TH') : 'In Progress',
        session.duration_minutes || '',
        new Date(session.started_at).toLocaleDateString('th-TH')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `technician-performance-${dateFrom}-to-${dateTo}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDuration = (minutes) => {
    if (!minutes) return "0 นาที";
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours} ชม. ${mins} นาที` : `${mins} นาที`;
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('th-TH');
  };

  return (
    <ProtectedRoute>
      <RoleGuard allowedRoles={['admin', 'manager', 'technician']}>
        <div className="min-h-screen p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                รายงานประสิทธิภาพช่าง
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                ติดตามและประเมินประสิทธิภาพการทำงานของช่างแต่ละคน
              </p>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 mb-6 border border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">ตัวกรองข้อมูล</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    วันที่เริ่มต้น
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    วันที่สิ้นสุด
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  />
                </div>

                {/* Technician Filter (Admin/Manager only) */}
                {user?.role === 'admin' || user?.role === 'manager' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      ช่าง
                    </label>
                    <select
                      value={technicianId}
                      onChange={(e) => setTechnicianId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">ทั้งหมด</option>
                      {technicians.map(tech => (
                        <option key={tech.id} value={tech.id}>
                          {tech.name || tech.email}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {/* Station Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    สถานี
                  </label>
                  <select
                    value={stationId}
                    onChange={(e) => setStationId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">ทั้งหมด</option>
                    {stations.map(station => (
                      <option key={station.id} value={station.id}>
                        {station.name_th}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={loadPerformanceData}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  {loading ? 'กำลังโหลด...' : 'ค้นหา'}
                </button>
                
                {data?.sessions && data.sessions.length > 0 && (
                  <button
                    onClick={exportToCSV}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    ส่งออก CSV
                  </button>
                )}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                <p className="text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Statistics Cards */}
            {data?.statistics && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">งานทั้งหมด</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {data.statistics.totalSessions}
                      </p>
                    </div>
                    <BarChart3 className="w-8 h-8 text-blue-600" />
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">เวลาทำงานรวม</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {data.statistics.totalHours} ชม.
                      </p>
                    </div>
                    <Clock className="w-8 h-8 text-green-600" />
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">เวลาเฉลี่ย</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {data.statistics.averageDuration} นาที
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-purple-600" />
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">งานที่เสร็จ</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {data.statistics.completedSessions}
                      </p>
                    </div>
                    <Award className="w-8 h-8 text-amber-600" />
                  </div>
                </div>
              </div>
            )}

            {/* Station time by Technician */}
            {data?.stationByTechnician && data.stationByTechnician.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 mb-8">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    เวลารวมต่อสถานี (ตามช่าง)
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-slate-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ช่าง</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานี</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">จำนวนครั้ง</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">รวม (ชม.)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">เฉลี่ย (นาที)</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                      {data.stationByTechnician.map((row, idx) => (
                        <tr key={`${row.technicianId}-${row.stationId}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{row.technicianName}</td>
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{row.stationName}</td>
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{row.sessionsCount}</td>
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{row.totalHours}</td>
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{row.avgMinutes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Ticket totals by Technician */}
            {data?.ticketTotalsByTechnician && data.ticketTotalsByTechnician.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 mb-8">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    เวลารวมต่อหมายเลขตั๋ว (ตามช่าง)
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-slate-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ช่าง</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตั๋ว</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">จำนวนครั้ง</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">รวม (ชม.)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">เฉลี่ย (นาที)</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                      {data.ticketTotalsByTechnician.map((row, idx) => (
                        <tr key={`${row.technicianId}-${row.ticketNo}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{row.technicianName}</td>
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{row.ticketNo}</td>
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{row.sessionsCount}</td>
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{row.totalHours}</td>
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{row.avgMinutes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Work Sessions Table */}
            {data?.sessions && (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    รายละเอียดการทำงาน
                  </h2>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-slate-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          ตั๋ว
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          สถานี
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          ช่าง
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          เริ่มงาน
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          เสร็จงาน
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          ระยะเวลา
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                      {data.sessions.map((session) => (
                        <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                            {session.ticket_no}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {session.stations?.name_th || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {session.users?.name || session.users?.email || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {formatTime(session.started_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {session.completed_at ? formatTime(session.completed_at) : 
                             <span className="text-amber-600">กำลังดำเนินการ</span>}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {session.duration_minutes ? formatDuration(session.duration_minutes) : 
                             <span className="text-gray-400">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!loading && data?.sessions && data.sessions.length === 0 && (
              <div className="text-center py-12">
                <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  ไม่พบข้อมูล
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  ไม่มีข้อมูลการทำงานในช่วงเวลาที่เลือก
                </p>
              </div>
            )}
          </div>
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}
