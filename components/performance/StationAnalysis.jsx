"use client";

import React, { useMemo } from "react";

export default function StationAnalysis({ stationByTechnician, technicianSummary }) {
  const stationStats = useMemo(() => {
    if (!stationByTechnician) return [];

    // Group by station
    const groups = {};
    stationByTechnician.forEach(item => {
      if (!groups[item.stationId]) {
        groups[item.stationId] = {
          stationId: item.stationId,
          stationName: item.stationName,
          sessions: [],
          totalMinutes: 0,
          sessionsCount: 0,
          technicians: new Set(),
        };
      }
      groups[item.stationId].sessions.push(item);
      groups[item.stationId].totalMinutes += item.totalMinutes || 0;
      groups[item.stationId].sessionsCount += item.sessionsCount || 0;
      groups[item.stationId].technicians.add(item.technicianId);
    });

    // Calculate stats for each station
    return Object.values(groups).map(station => {
      const avgMinutes = station.sessionsCount > 0
        ? (station.totalMinutes * 60) / station.sessionsCount
        : 0;

      // Find fastest and slowest technicians
      const techTimes = station.sessions.map(s => ({
        technicianId: s.technicianId,
        technicianName: s.technicianName,
        avgMinutes: s.avgMinutes,
        sessionsCount: s.sessionsCount,
      }));

      const fastest = techTimes.length > 0
        ? techTimes.reduce((fast, current) => current.avgMinutes < fast.avgMinutes ? current : fast)
        : null;

      const slowest = techTimes.length > 0
        ? techTimes.reduce((slow, current) => current.avgMinutes > slow.avgMinutes ? current : slow)
        : null;

      // Target time (assume 90 minutes = 1.5 hours as baseline)
      const targetMinutes = 90;
      const targetTime = targetMinutes / 60;
      const exceedPercent = targetMinutes > 0
        ? Math.round(((avgMinutes - targetMinutes) / targetMinutes) * 100)
        : 0;

      // Difference between fastest and slowest
      const timeDiff = fastest && slowest ? slowest.avgMinutes - fastest.avgMinutes : 0;
      const timeDiffPercent = fastest && fastest.avgMinutes > 0
        ? Math.round((timeDiff / fastest.avgMinutes) * 100)
        : 0;

      // Determine status
      let status = "ปกติ";
      let statusColor = "bg-gray-500";
      if (timeDiffPercent > 100) {
        status = "สูงมาก";
        statusColor = "bg-red-500";
      } else if (timeDiffPercent > 67) {
        status = "สูง";
        statusColor = "bg-orange-500";
      } else if (timeDiffPercent > 33) {
        status = "ปานกลาง";
        statusColor = "bg-yellow-500";
      }

      return {
        ...station,
        avgMinutes,
        avgHours: avgMinutes / 60,
        targetTime,
        exceedPercent,
        fastest,
        slowest,
        timeDiff,
        timeDiffPercent,
        status,
        statusColor,
        technicianCount: station.technicians.size,
        totalJobs: station.sessionsCount,
      };
    });
  }, [stationByTechnician]);

  if (!stationStats || stationStats.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">
          ไม่มีข้อมูลสถานี
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
      <h3 className="text-xs font-semibold mb-3 text-gray-900 dark:text-gray-100">
        🏭 การวิเคราะห์ตามสถานี (Station Analysis)
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {stationStats.map((station) => (
          <div
            key={station.stationId}
            className="border dark:border-gray-600 rounded-md p-3 bg-gray-50 dark:bg-gray-700/50"
          >
            <div className="font-semibold text-xs text-gray-900 dark:text-gray-100 mb-2">
              {station.stationName}
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div>
                <span className="text-gray-600 dark:text-gray-400">เวลาเฉลี่ย: </span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {station.avgHours.toFixed(1)}h/งาน
                </span>
                {station.exceedPercent > 0 && (
                  <span className="text-amber-600 ml-1">
                    ⚠️ เกินเป้า {station.exceedPercent}%
                  </span>
                )}
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">เป้า: </span>
                <span className="text-gray-900 dark:text-gray-100">{station.targetTime.toFixed(1)}h</span>
              </div>
              <div className="border-t dark:border-gray-600 pt-1.5 mt-1.5">
                <span className="text-gray-600 dark:text-gray-400">งาน: </span>
                <span className="text-gray-900 dark:text-gray-100">{station.totalJobs}</span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">ช่าง: </span>
                <span className="text-gray-900 dark:text-gray-100">{station.technicianCount} คน</span>
              </div>
              {station.fastest && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400">เร็วสุด: </span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {station.fastest.technicianName} ({(station.fastest.avgMinutes / 60).toFixed(1)}h)
                  </span>
                </div>
              )}
              {station.slowest && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400">ช้าสุด: </span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {station.slowest.technicianName} ({(station.slowest.avgMinutes / 60).toFixed(1)}h)
                  </span>
                </div>
              )}
              <div className="border-t dark:border-gray-600 pt-1.5 mt-1.5">
                <span className="text-gray-600 dark:text-gray-400">ส่วนต่าง: </span>
                <span className="text-gray-900 dark:text-gray-100">
                  {(station.timeDiff / 60).toFixed(1)}h ({station.timeDiffPercent}%)
                </span>
                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] text-white ${station.statusColor}`}>
                  {station.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
