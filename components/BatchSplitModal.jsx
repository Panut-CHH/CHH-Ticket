"use client";

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import ReworkRoadmapBuilder from './ReworkRoadmapBuilder';

const BatchSplitModal = ({
  isOpen = false,
  onClose,
  onConfirm,
  passQuantity = 0,
  failQuantity = 0,
  totalQuantity = 0,
  loading = false,
  defaultRoadmap = []
}) => {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [showRoadmapBuilder, setShowRoadmapBuilder] = useState(false);
  const [customRoadmap, setCustomRoadmap] = useState(defaultRoadmap);

  const handleConfirm = () => {
    if (!reason.trim()) {
      alert('กรุณากรอกสาเหตุที่ชิ้นงานไม่ผ่าน QC');
      return;
    }

    if (customRoadmap.length === 0) {
      alert('กรุณาสร้าง roadmap สำหรับการแก้ไข');
      return;
    }

    onConfirm({
      passQuantity,
      failQuantity,
      severity: 'custom', // ใช้ custom เสมอ
      reason: reason.trim(),
      notes: notes.trim(),
      roadmap: customRoadmap
    });
  };

  const handleRoadmapSave = (roadmap) => {
    setCustomRoadmap(roadmap);
    setShowRoadmapBuilder(false);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg my-4">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  แยก Batch หลัง QC
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  ชิ้นงานบางส่วนไม่ผ่าน QC ต้องการแยกเป็น Batch
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-xs font-medium text-green-800 dark:text-green-300 text-center">ผ่าน QC</span>
                </div>
                <div className="text-xl font-bold text-green-600 dark:text-green-400 text-center">
                  {passQuantity}
                </div>
                <div className="text-xs text-green-700 dark:text-green-500 text-center">
                  จาก {totalQuantity}
                </div>
              </div>

              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span className="text-xs font-medium text-red-800 dark:text-red-300 text-center">ไม่ผ่าน QC</span>
                </div>
                <div className="text-xl font-bold text-red-600 dark:text-red-400 text-center">
                  {failQuantity}
                </div>
                <div className="text-xs text-red-700 dark:text-red-500 text-center">
                  แก้ไข
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex flex-col items-center gap-1 mb-1">
                  <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-medium text-blue-800 dark:text-blue-300 text-center">อัตราการผ่าน</span>
                </div>
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400 text-center">
                  {totalQuantity > 0 ? Math.round((passQuantity / totalQuantity) * 100) : 0}%
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-500 text-center">
                  ของทั้งหมด
                </div>
              </div>
            </div>

            {/* Roadmap Section */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  กำหนด Roadmap การแก้ไข <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {customRoadmap.length > 0 ? `${customRoadmap.length} ขั้นตอน` : 'ยังไม่ได้กำหนด'}
                </span>
              </div>
              <button
                onClick={() => setShowRoadmapBuilder(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
              >
                {customRoadmap.length > 0 ? 'แก้ไข Roadmap' : 'กำหนด Roadmap'}
              </button>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                สาเหตุที่ชิ้นงานไม่ผ่าน QC <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="อธิบายสาเหตุที่ชิ้นงานไม่ผ่าน QC..."
                rows={2}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                หมายเหตุเพิ่มเติม
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="หมายเหตุเพิ่มเติมสำหรับการแก้ไข..."
                rows={1}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !reason.trim()}
              className="px-4 py-1.5 text-sm bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  กำลังสร้าง...
                </div>
              ) : (
                'สร้าง Rework Order'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ReworkRoadmapBuilder Modal */}
      {showRoadmapBuilder && (
        <ReworkRoadmapBuilder
          isOpen={showRoadmapBuilder}
          onClose={() => setShowRoadmapBuilder(false)}
          onSave={handleRoadmapSave}
          defaultRoadmap={defaultRoadmap}
        />
      )}
    </>
  );
};

export default BatchSplitModal;





