"use client";

import React, { useMemo } from "react";
import { Trophy, Medal, Award } from "lucide-react";

export default function TechnicianTable({ data, stationByTechnician, onRowClick }) {
  const tableData = useMemo(() => {
    if (!data) return [];

    return data
      .filter(t => t.completedSessions > 0)
      .map(tech => {
        // Find slowest station for this technician
        const techStations = (stationByTechnician || []).filter(s => s.technicianId === tech.technicianId);
        let slowestStation = null;
        if (techStations.length > 0) {
          slowestStation = techStations.reduce((slowest, current) =>
            current.avgMinutes > slowest.avgMinutes ? current : slowest
          );
        }

        // Calculate performance percentage (inverse of average time relative to best)
        const avgDuration = tech.averageDuration || 0;
        const allDurations = data
          .filter(t => t.completedSessions > 0)
          .map(t => t.averageDuration);
        const bestDuration = Math.min(...allDurations);
        const worstDuration = Math.max(...allDurations);
        const performancePercent = worstDuration > bestDuration
          ? Math.round(((worstDuration - avgDuration) / (worstDuration - bestDuration)) * 100)
          : 100;

        // Determine performance level
        let performanceLevel = "ดีเยี่ยม";
        let performanceColor = "bg-emerald-500";
        if (performancePercent < 50) {
          performanceLevel = "ต้องปรับ";
          performanceColor = "bg-red-500";
        } else if (performancePercent < 70) {
          performanceLevel = "ปานกลาง";
          performanceColor = "bg-amber-500";
        } else if (performancePercent < 85) {
          performanceLevel = "ดี";
          performanceColor = "bg-emerald-400";
        }

        return {
          ...tech,
          slowestStation,
          performancePercent,
          performanceLevel,
          performanceColor,
          uniqueStations: new Set(techStations.map(s => s.stationId)).size,
        };
      })
      .sort((a, b) => {
        // Sort by average duration (fastest first)
        return a.averageDuration - b.averageDuration;
      });
  }, [data, stationByTechnician]);

  const getRankIcon = (index) => {
    if (index === 0) return <Trophy className="w-4 h-4 text-yellow-500" />;
    if (index === 1) return <Medal className="w-4 h-4 text-gray-400" />;
    if (index === 2) return <Award className="w-4 h-4 text-amber-600" />;
    return null;
  };

  if (!tableData || tableData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">
          ไม่มีข้อมูลช่าง
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
      <h3 className="text-xs font-semibold mb-3 text-gray-900 dark:text-gray-100">
        📋 รายละเอียดช่างแต่ละคน (เรียงตามประสิทธิภาพ)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
            <tr>
              <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">#</th>
              <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">ชื่อช่าง</th>
              <th className="px-2 py-2 text-right text-gray-900 dark:text-gray-100">งานเสร็จ</th>
              <th className="px-2 py-2 text-right text-gray-900 dark:text-gray-100">เวลารวม</th>
              <th className="px-2 py-2 text-right text-gray-900 dark:text-gray-100">เฉลี่ย</th>
              <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">สถานีที่ช้าสุด</th>
              <th className="px-2 py-2 text-left text-gray-900 dark:text-gray-100">ประสิทธิภาพ</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((tech, idx) => (
              <tr
                key={tech.technicianId}
                className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                onClick={() => onRowClick && onRowClick(tech)}
              >
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1">
                    {getRankIcon(idx)}
                    <span className="text-gray-900 dark:text-gray-100">{idx + 1}</span>
                  </div>
                </td>
                <td className="px-2 py-2 font-medium text-gray-900 dark:text-gray-100">
                  {tech.technicianName}
                </td>
                <td className="px-2 py-2 text-right text-gray-900 dark:text-gray-100">
                  {tech.completedSessions}
                </td>
                <td className="px-2 py-2 text-right text-gray-900 dark:text-gray-100">
                  {tech.totalHours.toFixed(1)}h
                </td>
                <td className="px-2 py-2 text-right text-gray-900 dark:text-gray-100">
                  {(tech.averageDuration / 60).toFixed(1)}h
                </td>
                <td className="px-2 py-2 text-gray-900 dark:text-gray-100">
                  {tech.slowestStation ? (
                    <div>
                      <div className="font-medium">{tech.slowestStation.stationName}</div>
                      <div className="text-[10px] text-gray-600 dark:text-gray-400">
                        {(tech.slowestStation.avgMinutes / 60).toFixed(1)}h/งาน
                        {tech.slowestStation.avgMinutes > tech.averageDuration && (
                          <span className="text-amber-600 ml-1">
                            (ช้ากว่าเฉลี่ย {Math.round(((tech.slowestStation.avgMinutes - tech.averageDuration) / tech.averageDuration) * 100)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${tech.performanceColor}`}
                        style={{ width: `${tech.performancePercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {tech.performancePercent}% {tech.performanceLevel}
                    </span>
                    <button className="text-[10px] px-2 py-0.5 border dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100">
                      รายละเอียด
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-[10px] text-gray-500 dark:text-gray-400 text-center">
          💡 Tip: คลิกแถวเพื่อดู timeline การทำงาน และรายละเอียดแต่ละงาน
        </div>
      </div>
    </div>
  );
}
