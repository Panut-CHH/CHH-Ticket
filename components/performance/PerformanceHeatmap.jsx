"use client";

import React, { useMemo } from "react";

export default function PerformanceHeatmap({ data, technicianSummary, onCellClick }) {
  const heatmapData = useMemo(() => {
    if (!data || !technicianSummary) return null;

    // Get unique technicians and stations
    const technicians = Object.values(technicianSummary || {});
    const stationIds = [...new Set(data.map(s => s.stationId))];
    const stationNames = [...new Set(data.map(s => s.stationName))];

    // Build matrix: technician x station
    const matrix = technicians.map(tech => {
      const techStations = data.filter(s => s.technicianId === tech.technicianId);
      const row = {};
      stationIds.forEach(sId => {
        const stationData = techStations.find(s => s.stationId === sId);
        row[sId] = stationData ? stationData.avgMinutes : null;
      });
      return {
        tech,
        stations: row,
      };
    });

    // Calculate min/max for color scale
    const allTimes = data.map(s => s.avgMinutes).filter(v => v !== null && v > 0);
    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);

    return { matrix, stationIds, stationNames, minTime, maxTime };
  }, [data, technicianSummary]);

  const getHeatColor = (minutes, minTime, maxTime) => {
    if (!minutes || minutes === 0) return "🟩"; // Fastest (light green)
    const ratio = (minutes - minTime) / (maxTime - minTime);
    if (ratio < 0.25) return "🟩"; // < 25% - Fast
    if (ratio < 0.5) return "🟨"; // 25-50% - Medium
    if (ratio < 0.75) return "🟧"; // 50-75% - Slow
    return "🟥"; // > 75% - Slowest
  };

  const formatTime = (minutes) => {
    if (!minutes) return "-";
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}.${Math.floor(mins / 6)}h` : `${mins}m`;
  };

  if (!heatmapData) {
    return (
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">
          ไม่มีข้อมูล
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md p-3">
      <h3 className="text-xs font-semibold mb-3 text-gray-900 dark:text-gray-100">
        ⏱️ ช่างใช้เวลาในสถานีไหนนาน? (Heatmap)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-gray-900 dark:text-gray-100 sticky left-0 bg-white dark:bg-gray-800 z-10">
                ช่าง
              </th>
              {heatmapData.stationNames.map((name, idx) => (
                <th key={heatmapData.stationIds[idx]} className="px-2 py-1 text-center text-gray-900 dark:text-gray-100 min-w-[80px]">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmapData.matrix.map(({ tech, stations }) => (
              <tr key={tech.technicianId} className="border-b dark:border-gray-700">
                <td className="px-2 py-2 text-left font-medium text-gray-900 dark:text-gray-100 sticky left-0 bg-white dark:bg-gray-800 z-10">
                  {tech.technicianName}
                </td>
                {heatmapData.stationIds.map((sId) => {
                  const minutes = stations[sId];
                  const color = getHeatColor(minutes, heatmapData.minTime, heatmapData.maxTime);
                  return (
                    <td
                      key={sId}
                      className={`px-2 py-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        minutes ? "cursor-pointer" : ""
                      }`}
                      onClick={() => minutes && onCellClick && onCellClick(tech.technicianId)}
                      title={minutes ? `${formatTime(minutes)}` : "ไม่มีข้อมูล"}
                    >
                      <span className="text-lg">{color}</span>
                      {minutes && (
                        <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                          {formatTime(minutes)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-gray-600 dark:text-gray-400">
          <span>🟩 &lt;{formatTime(heatmapData.minTime)}</span>
          <span>🟨 {formatTime((heatmapData.minTime + heatmapData.maxTime) / 4)}</span>
          <span>🟧 {formatTime((heatmapData.minTime + heatmapData.maxTime) / 2)}</span>
          <span>🟥 &gt;{formatTime(heatmapData.maxTime * 0.75)}</span>
        </div>
      </div>
    </div>
  );
}
