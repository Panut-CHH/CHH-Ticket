"use client";

import React from "react";
import { X, Clock, Briefcase, TrendingUp } from "lucide-react";

export default function TechnicianDetailModal({
  technician,
  sessions,
  stationByTechnician,
  onClose,
}) {
  const techStations = (stationByTechnician || []).filter(
    s => s.technicianId === technician.technicianId
  );

  return (
    <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-md shadow-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              รายละเอียดช่าง: {technician.technicianName}
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              สถิติการทำงานทั้งหมด
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">งานเสร็จ</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {technician.completedSessions}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">เวลารวม</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {technician.totalHours.toFixed(1)}h
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">เฉลี่ยต่องาน</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {(technician.averageDuration / 60).toFixed(1)}h
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">สถานีที่ทำงาน</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {technician.stations?.length || techStations.length}
              </div>
            </div>
          </div>

          {/* Station Breakdown */}
          {techStations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                ประสิทธิภาพแยกตามสถานี
              </h4>
              <div className="space-y-2">
                {techStations
                  .sort((a, b) => b.avgMinutes - a.avgMinutes)
                  .map((station) => (
                    <div
                      key={station.stationId}
                      className="bg-gray-50 dark:bg-gray-700 rounded-md p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {station.stationName}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {station.sessionsCount} งาน | {(station.totalHours).toFixed(1)}h รวม
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">
                            {(station.avgMinutes / 60).toFixed(1)}h/งาน
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Recent Sessions */}
          {sessions && sessions.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                งานล่าสุด (แสดง 10 รายการล่าสุด)
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {sessions.slice(0, 10).map((session, idx) => (
                  <div
                    key={session.id || idx}
                    className="bg-gray-50 dark:bg-gray-700 rounded-md p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          ตั๋ว: {session.ticket_no || "-"}
                        </div>
                        <div className="text-gray-600 dark:text-gray-400 mt-0.5">
                          สถานี: {session.stations?.name_th || session.station_id || "-"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-900 dark:text-gray-100">
                          {session.duration_minutes
                            ? `${(session.duration_minutes / 60).toFixed(1)}h`
                            : "-"}
                        </div>
                        {session.completed_at && (
                          <div className="text-gray-600 dark:text-gray-400 text-[10px]">
                            {new Date(session.completed_at).toLocaleDateString("th-TH")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t dark:border-gray-700 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
