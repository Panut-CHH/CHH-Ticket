"use client";

import { BarChart3, TrendingUp, Clock, Users, Award } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/contexts/AuthContext";

export default function ReportsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState({ totalSessions: 0, totalHours: 0, completedSessions: 0, technicians: 0, efficiency: 0 });
  const [rangeDays, setRangeDays] = useState(30);

  // Load quick stats (default: last 30 days)
  useEffect(() => {
    const loadSummary = async () => {
      try {
        setLoading(true);
        setError("");

        const today = new Date();
        const from = new Date(today.getTime() - rangeDays * 24 * 60 * 60 * 1000);

        const params = new URLSearchParams({
          date_from: from.toISOString().split('T')[0],
          date_to: today.toISOString().split('T')[0],
          user_id: user?.id || ''
        });

        const res = await fetch(`/api/reports/technician-performance?${params.toString()}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to load');

        const sessions = json.data.sessions || [];
        const stats = json.data.statistics || { totalSessions: 0, totalHours: 0 };

        const technicians = new Set(sessions.map(s => s.technician_id)).size;
        const completed = sessions.filter(s => s.completed_at && s.duration_minutes).length;
        const efficiency = stats.totalSessions > 0 ? Math.round((completed / stats.totalSessions) * 100) : 0;

        setSummary({
          totalSessions: stats.totalSessions || 0,
          totalHours: stats.totalHours || 0,
          completedSessions: completed,
          technicians,
          efficiency
        });
      } catch (e) {
        setError(e?.message || 'Failed to load summary');
      } finally {
        setLoading(false);
      }
    };
    loadSummary();
  }, [user?.id, rangeDays]);
  const reportCards = [
    {
      href: "/reports/technician-performance",
      title: "ประสิทธิภาพช่าง",
      description: "ติดตามและประเมินประสิทธิภาพการทำงานของช่างแต่ละคน",
      icon: <Users className="w-6 h-6" />,
      color: "from-blue-500 to-blue-600",
      stats: "วิเคราะห์เวลาและประสิทธิภาพ"
    }
  ];

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/reports">
        <div className="space-y-6">
          {/* Quick Stats - moved to top and includes controls */}
          <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">สถิติโดยรวม</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">ช่วงเวลา</span>
                <select
                  className="px-2 py-1 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md text-gray-700 dark:text-gray-200"
                  value={rangeDays}
                  onChange={(e) => setRangeDays(Number(e.target.value))}
                >
                  <option value={7}>7 วันล่าสุด</option>
                  <option value={30}>30 วันล่าสุด</option>
                  <option value={90}>90 วันล่าสุด</option>
                </select>
                <button
                  onClick={() => setRangeDays((d) => d)}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                  disabled={loading}
                >รีเฟรช</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={<Clock className="w-6 h-6 text-blue-600" />} label="ชั่วโมงทำงานรวม" value={`${summary.totalHours}`} tint="blue" loading={loading} />
              <StatCard icon={<Award className="w-6 h-6 text-green-600" />} label="งานที่เสร็จสิ้น" value={`${summary.completedSessions}`} tint="green" loading={loading} />
              <StatCard icon={<Users className="w-6 h-6 text-purple-600" />} label="ช่างที่ใช้งาน" value={`${summary.technicians}`} tint="purple" loading={loading} />
              <StatCard icon={<TrendingUp className="w-6 h-6 text-amber-600" />} label="ประสิทธิภาพเฉลี่ย" value={`${summary.efficiency}%`} tint="amber" loading={loading} />
            </div>
            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          </div>

          {/* Report Cards - moved below */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reportCards.map((card, index) => (
              <Link
                key={index}
                href={card.href}
                className="group bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-slate-700 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white shadow-md bg-gradient-to-r ${card.color}`}>
                    {card.icon}
                  </div>
                  <TrendingUp className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                </div>
                
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-blue-600 transition-colors">
                  {card.title}
                </h3>
                
                <p className="text-gray-600 dark:text-gray-400 mb-3 text-sm">
                  {card.description}
                </p>
                
                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  {card.stats}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}

function StatCard({ icon, label, value, tint = 'blue', loading }) {
  const bgTint = {
    blue: 'bg-blue-50 dark:bg-blue-900/30',
    green: 'bg-green-50 dark:bg-green-900/30',
    purple: 'bg-purple-50 dark:bg-purple-900/30',
    amber: 'bg-amber-50 dark:bg-amber-900/30'
  }[tint] || 'bg-gray-50 dark:bg-slate-700/30';

  return (
    <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgTint}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-600 dark:text-gray-400 truncate">{label}</div>
        {loading ? (
          <div className="h-6 w-16 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" />
        ) : (
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
        )}
      </div>
    </div>
  );
}
