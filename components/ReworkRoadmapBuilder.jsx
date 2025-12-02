"use client";

import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Trash2, GripVertical, Clock, User, MapPin } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

const ReworkRoadmapBuilder = ({ 
  initialRoadmap = [], 
  defaultRoadmap = [],
  onRoadmapChange, 
  onSave,
  onCancel,
  isOpen = false 
}) => {
  const [roadmap, setRoadmap] = useState(defaultRoadmap.length > 0 ? defaultRoadmap : initialRoadmap);
  const [stations, setStations] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(false);
  const [useDefaultRoadmap, setUseDefaultRoadmap] = useState(defaultRoadmap.length > 0);

  useEffect(() => {
    if (isOpen) {
      loadStationsAndTechnicians();
    }
  }, [isOpen]);

  const loadStationsAndTechnicians = async () => {
    try {
      setLoading(true);
      
      // โหลดสถานี
      const { data: stationsData, error: stationsError } = await supabase
        .from('stations')
        .select('id, name_th, code')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (stationsError) {
        console.error('Error loading stations:', stationsError);
      } else {
        setStations(stationsData || []);
      }

      // โหลดช่าง
      // Use overlaps to check if user has any of the required roles
      const { data: techniciansData, error: techniciansError } = await supabase
        .from('users')
        .select('id, name, role, roles')
        .eq('status', 'active')
        .or('roles.ov.{Production,Painting,Packing,Supervisor},role.in.(Production,Painting,Packing,Supervisor)');

      if (techniciansError) {
        console.error('Error loading technicians:', techniciansError);
      } else {
        setTechnicians(techniciansData || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addStep = () => {
    const newStep = {
      id: `step_${Date.now()}`,
      stationId: '',
      stationName: '',
      assignedTechnicianId: '',
      estimatedHours: 1,
      notes: ''
    };
    
    const newRoadmap = [...roadmap, newStep];
    setRoadmap(newRoadmap);
    onRoadmapChange?.(newRoadmap);
  };

  const removeStep = (stepId) => {
    const newRoadmap = roadmap.filter(step => step.id !== stepId);
    setRoadmap(newRoadmap);
    onRoadmapChange?.(newRoadmap);
  };

  const updateStep = (stepId, field, value) => {
    const newRoadmap = roadmap.map(step => 
      step.id === stepId ? { ...step, [field]: value } : step
    );
    setRoadmap(newRoadmap);
    onRoadmapChange?.(newRoadmap);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(roadmap);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setRoadmap(items);
    onRoadmapChange?.(items);
  };

  const handleSave = () => {
    if (roadmap.length === 0) {
      alert('กรุณาเพิ่มขั้นตอนอย่างน้อย 1 ขั้นตอน');
      return;
    }

    // ตรวจสอบว่าทุกขั้นตอนมีข้อมูลครบ
    const incompleteSteps = roadmap.filter(step => {
      const isQcStation = step.stationName && (
        step.stationName.toLowerCase().includes('qc') ||
        step.stationName.toLowerCase().includes('ตรวจ') ||
        step.stationName.toLowerCase().includes('คุณภาพ')
      );
      
      if (isQcStation) {
        // สถานี QC: ต้องมี stationName เท่านั้น
        return !step.stationName;
      } else {
        // สถานีปกติ: ต้องมีทั้ง stationName และ assignedTechnicianId
        return !step.stationName || !step.assignedTechnicianId;
      }
    });

    if (incompleteSteps.length > 0) {
      alert('กรุณากรอกข้อมูลให้ครบทุกขั้นตอน');
      return;
    }

    onSave?.(roadmap);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                กำหนด Roadmap การแก้ไข
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                ลาก-วางเพื่อเรียงลำดับ ลบสถานีที่ไม่ต้องการ หรือเพิ่มสถานีใหม่
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(85vh-140px)]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">กำลังโหลด...</span>
            </div>
          ) : (
            <>
              {/* Mode Selection */}
              {defaultRoadmap.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useDefaultRoadmap}
                      onChange={(e) => {
                        const use = e.target.checked;
                        setUseDefaultRoadmap(use);
                        if (use) {
                          // เปลี่ยนไปใช้ default roadmap
                          setRoadmap(defaultRoadmap);
                          onRoadmapChange?.(defaultRoadmap);
                        } else {
                          // เปลี่ยนไปใช้ roadmap เปล่า
                          setRoadmap([]);
                          onRoadmapChange?.([]);
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      ใช้สถานีจากตั๋วเดิมเป็นจุดเริ่มต้น
                    </span>
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 ml-6">
                    {useDefaultRoadmap 
                      ? 'มีสถานีเริ่มต้นจากตั๋วเดิม พร้อมแก้ไข ลบ หรือเพิ่มได้' 
                      : 'เริ่มจากศูนย์ เพิ่มสถานีใหม่ทั้งหมด'}
                  </p>
                </div>
              )}

              {/* Add Step Button */}
              <div className="mb-4 flex items-center justify-between">
                <button
                  onClick={addStep}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มสถานี
                </button>
                {roadmap.length > 0 && (
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {roadmap.length} สถานี
                  </span>
                )}
              </div>

              {/* Roadmap Steps */}
              {roadmap.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <MapPin className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>ยังไม่มีขั้นตอนใน roadmap</p>
                  <p className="text-sm">คลิก "เพิ่มขั้นตอน" เพื่อเริ่มต้น</p>
                </div>
              ) : (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="roadmap">
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                        {roadmap.map((step, index) => (
                          <Draggable key={step.id} draggableId={step.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`relative p-3 border rounded-lg ${
                                  snapshot.isDragging ? 'bg-blue-50 dark:bg-blue-900/20 shadow-md' : 'bg-gray-50 dark:bg-slate-700'
                                } border-gray-200 dark:border-slate-600 mb-3`}
                              >
                                <div className="flex items-start gap-3">
                                  {/* Drag Handle & Step Number */}
                                  <div className="flex items-center gap-2">
                                    <div {...provided.dragHandleProps} className="cursor-grab">
                                      <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                                    </div>
                                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                      {index + 1}
                                    </div>
                                  </div>

                                  {/* Step Content */}
                                  {/* ตรวจสอบว่าเป็นสถานี QC หรือไม่ */}
                                  {step.stationName && (
                                    step.stationName.toLowerCase().includes('qc') ||
                                    step.stationName.toLowerCase().includes('ตรวจ') ||
                                    step.stationName.toLowerCase().includes('คุณภาพ')
                                  ) ? (
                                    /* Layout สำหรับสถานี QC (แสดงแค่สถานีเดียว) */
                                    <div className="flex-1">
                                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        สถานี
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="พิมพ์ชื่อสถานี เช่น QC, ตรวจคุณภาพ"
                                        value={step.stationName}
                                        onChange={(e) => updateStep(step.id, 'stationName', e.target.value)}
                                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                                      />
                                    </div>
                                  ) : (
                                    /* Layout สำหรับสถานีทั่วไป (แสดง 2 คอลัมน์) */
                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                      {/* Station */}
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                          สถานี
                                        </label>
                                        <select
                                          key={`${step.id}-station`}
                                          value={step.stationId || ''}
                                          onChange={(e) => {
                                            const selected = stations.find(s => s.id === e.target.value);
                                            // อัปเดตพร้อมกันทั้ง 2 fields ในครั้งเดียว
                                            const newRoadmap = roadmap.map(s => 
                                              s.id === step.id 
                                                ? { ...s, stationId: e.target.value, stationName: selected?.name_th || '' }
                                                : s
                                            );
                                            setRoadmap(newRoadmap);
                                            onRoadmapChange?.(newRoadmap);
                                          }}
                                          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                                        >
                                          <option value="">เลือกสถานี</option>
                                          {stations.length > 0 ? stations.map(station => (
                                            <option key={station.id} value={station.id}>
                                              {station.name_th}
                                            </option>
                                          )) : (
                                            <option disabled>ไม่มีสถานี</option>
                                          )}
                                        </select>
                                      </div>

                                      {/* Technician */}
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                          ช่าง
                                        </label>
                                        <select
                                          key={`${step.id}-technician`}
                                          value={step.assignedTechnicianId || ''}
                                          onChange={(e) => {
                                            // อัปเดตโดยตรงใน roadmap state
                                            const newRoadmap = roadmap.map(s => 
                                              s.id === step.id 
                                                ? { ...s, assignedTechnicianId: e.target.value }
                                                : s
                                            );
                                            setRoadmap(newRoadmap);
                                            onRoadmapChange?.(newRoadmap);
                                          }}
                                          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                                        >
                                          <option value="">เลือกช่าง</option>
                                          {technicians.map(technician => (
                                            <option key={technician.id} value={technician.id}>
                                              {technician.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  )}

                                  {/* Remove Button */}
                                  <button
                                    onClick={() => removeStep(step.id)}
                                    className="absolute top-2 right-2 p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                    title="ลบสถานี"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={roadmap.length === 0}
            className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReworkRoadmapBuilder;
