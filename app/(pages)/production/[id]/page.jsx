"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, Circle, Play, Check, Calendar, Package, Coins, ArrowLeft, FileText } from "lucide-react";
import DocumentViewer from "@/components/DocumentViewer";
import Modal from "@/components/Modal";
import { supabase } from "@/utils/supabaseClient";

function DetailCard({ ticket, onDone, onStart, me, isAdmin = false, batches = [], reworkOrders = [], userId = null, onAfterMerge }) {
  const currentIndex = ticket.roadmap.findIndex((s) => s.status === "current");
  const nextIndex = currentIndex >= 0 ? currentIndex + 1 : -1;
  const currentStep = currentIndex >= 0 ? ticket.roadmap[currentIndex]?.step : null;
  const nextStep = nextIndex >= 0 ? ticket.roadmap[nextIndex]?.step : null;
  // Treat 'rework' as completed for gating (allow the flow to continue)
  const isCompletedLike = (status) => status === "completed" || status === "rework";
  const isFinished = currentIndex === -1 && ticket.roadmap.every((s) => isCompletedLike(s.status));
  const hasPending = ticket.roadmap.some((s) => !isCompletedLike(s.status));
  const canStart = !currentStep && hasPending && !isFinished;
  const firstPendingIndex = ticket.roadmap.findIndex((s) => !isCompletedLike(s.status));
  const firstPendingStep = firstPendingIndex >= 0 ? ticket.roadmap[firstPendingIndex]?.step : null;

  // Get assigned technician from stations array
  const stations = Array.isArray(ticket.stations) ? ticket.stations : [];
  const currentStationData = currentIndex >= 0 ? stations[currentIndex] : null;
  const firstPendingStationData = firstPendingIndex >= 0 ? stations[firstPendingIndex] : null;
  
  const currentTechnician = currentStationData?.technician || "";
  const firstPendingTechnician = firstPendingStationData?.technician || "";
  
  // Helper: exact-match against comma-separated names (case-insensitive)
  const isUserAssigned = (technicianList, meName) => {
    if (!technicianList || !meName) return false;
    const meNorm = String(meName).trim().toLowerCase();
    return String(technicianList)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .some((name) => name === meNorm);
  };
  
  // Check if current user is assigned to the step
  const isAssignedToCurrent = isAdmin || isUserAssigned(currentTechnician, me);
  const isAssignedToPending = isAdmin || isUserAssigned(firstPendingTechnician, me);

  // QC gating flags
  const isPendingQC = (firstPendingStep || "").toUpperCase().includes("QC");
  const isCurrentQC = (currentStep || "").toUpperCase().includes("QC");

  // Cooldown to prevent repeated clicks
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const isCoolingDown = cooldownUntil > now;

  useEffect(() => {
    if (cooldownUntil > now) {
      const timer = setInterval(() => {
        setNow(Date.now());
      }, 100);
      return () => clearInterval(timer);
    }
  }, [cooldownUntil, now]);

  // Work session data from database
  const [workSessions, setWorkSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Load work sessions from database
  const loadWorkSessions = useCallback(async () => {
    if (!ticket.id) return;
    
    try {
      setLoadingSessions(true);
      const { data: sessions, error } = await supabase
        .from('technician_work_sessions')
        .select(`
          *,
          stations (
            id,
            name_th,
            code
          ),
          users (
            id,
            name,
            email
          )
        `)
        .eq('ticket_no', ticket.id.replace('#', ''))
        .order('started_at', { ascending: true });

      if (error) {
        console.error('Error loading work sessions:', error);
      } else {
        console.log('[DEBUG] Loaded work sessions:', sessions?.length || 0, 'sessions');
        setWorkSessions(sessions || []);
      }
    } catch (e) {
      console.error('Failed to load work sessions:', e);
    } finally {
      setLoadingSessions(false);
    }
  }, [ticket.id]);

  useEffect(() => {
    loadWorkSessions();
  }, [loadWorkSessions]);

  function onStartClick() {
    if (!canStart || isCoolingDown || !isAssignedToPending) return;
    onStart(ticket.id);
    setCooldownUntil(Date.now() + 2000);
    
    // Reload work sessions after starting
    setTimeout(() => {
      loadWorkSessions();
    }, 1000);
  }

  function onDoneClick() {
    if (isCoolingDown || !isAssignedToCurrent) return;
    // Allow DONE if there's a current step
    if (currentIndex === -1) return;
    onDone(ticket.id);
    setCooldownUntil(Date.now() + 2000);
    
    // Reload work sessions after completing
    setTimeout(() => {
      loadWorkSessions();
    }, 1000);
  }

  const canDone = currentIndex >= 0 && !isFinished && isAssignedToCurrent && !isCurrentQC;

  // Get current work session data
  const currentSession = workSessions.find(session => {
    // Find session that matches current station and is not completed
    const currentStation = ticket.roadmap[currentIndex];
    if (!currentStation) return false;
    
    // Match by station name and technician, and not completed
    return session.stations?.name_th === currentStation.step && 
           session.completed_at === null &&
           session.users?.name === currentTechnician;
  });

  // Debug logging
  if (!currentSession && workSessions.length > 0) {
    console.log('[DEBUG] No current session found. Station:', ticket.roadmap[currentIndex]?.step, 'Technician:', currentTechnician);
  }

  const startedAt = currentSession?.started_at;
  const doneAt = currentSession?.completed_at;
  const durationMinutes = currentSession?.duration_minutes;

  const formatTime = (ts) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString('th-TH');
  };
  
  const formatDuration = (minutes) => {
    if (!minutes) return "-";
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins}น. ${secs}วิ.`;
  };

  const myEarnings = useMemo(() => {
    const steps = Array.isArray(ticket.stations) ? ticket.stations : [];
    return steps
      .filter((s) => (s.technician || "") === me)
      .reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  }, [ticket.stations, me]);

  const totalLabor = useMemo(() => {
    const steps = Array.isArray(ticket.stations) ? ticket.stations : [];
    return steps.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  }, [ticket.stations]);

  const bomItems = Array.isArray(ticket.bom) ? ticket.bom : [];

  // ERP document per ticket
  const storageKey = `ticket_doc_${(ticket.id || "").replace('#','')}`;
  const [uploadedDoc, setUploadedDoc] = useState(null);
  const [isDocOpen, setIsDocOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setUploadedDoc(JSON.parse(saved));
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  return (
    <div className="bg-white dark:bg-slate-800 dark:bg-slate-800 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-700 dark:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">ตั๋ว</div>
          <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{ticket.id}</div>
          {ticket.route && <span className={`text-xs px-2 py-1 rounded-full font-medium ${ticket.routeClass}`}>{ticket.route}</span>}
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${ticket.priorityClass}`}>{ticket.priority}</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
          {ticket.dueDate && (
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>กำหนดส่ง: <span className="font-medium text-gray-800 dark:text-gray-200">{ticket.dueDate}</span></span>
            </div>
          )}
          <div>ผู้รับผิดชอบ: <span className="font-medium text-gray-800 dark:text-gray-200">{ticket.assignee}</span></div>
          {typeof ticket.quantity === 'number' ? (
            <div>จำนวนที่ต้องผลิต: <span className="font-medium text-gray-800 dark:text-gray-200">{ticket.quantity.toLocaleString()} ชิ้น</span></div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          {/* ERP Document Button - Top */}
          <div className="mb-4">
            <button 
              onClick={() => setIsDocOpen(true)} 
              disabled={!ticket.projectDoc}
              className={`w-full px-6 py-3 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 shadow-sm ${ticket.projectDoc ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800' : 'bg-gray-100 dark:bg-slate-600 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-gray-200 dark:border-slate-700'}`}
            >
              <FileText className="w-5 h-5" />
              {ticket.projectDoc ? `ดูเอกสาร: ${ticket.projectDoc.file_name}` : 'ไม่มีเอกสาร'}
            </button>
          </div>

          {/* View File Modal - Minimal fullscreen-like */}
          <Modal 
            open={isDocOpen} 
            onClose={() => setIsDocOpen(false)} 
            hideHeader
            maxWidth="max-w-7xl"
            maxHeight="max-h-[88vh]"
          >
            {ticket.projectDoc?.file_url ? (
              <div className="relative w-full h-full p-0">
                {/* Close button */}
                <button
                  onClick={() => setIsDocOpen(false)}
                  className="absolute top-3 right-3 z-10 px-3 py-1.5 bg-black/60 text-white rounded-md hover:bg-black/70 transition-colors"
                >
                  ปิด
                </button>

                {/* Content */}
                <div className="w-full h-full">
                  {ticket.projectDoc.file_type === 'pdf' ? (
                    <iframe
                      src={`${ticket.projectDoc.file_url}#toolbar=0&navpanes=0&scrollbar=0`}
                      className="w-full h-[82vh]"
                      title={ticket.projectDoc.file_name}
                    />
                  ) : (
                    <div className="w-full h-[82vh] flex items-center justify-center bg-black/5 dark:bg-black/20">
                      <img
                        src={ticket.projectDoc.file_url}
                        alt={ticket.projectDoc.file_name}
                        className="max-h-full max-w-full object-contain rounded"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-96 text-gray-500 dark:text-gray-400">
                <div className="text-center">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium mb-2">ไม่มีไฟล์เอกสารในโฟลเดอร์นี้</p>
                  <p className="text-sm">กรุณาอัปโหลดไฟล์เอกสารในหน้า Project</p>
                </div>
              </div>
            )}
          </Modal>

          <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-700 border border-gray-100 dark:border-slate-600">
            <div className="text-gray-600 dark:text-gray-400 dark:text-gray-500 mb-1">ขั้นตอนปัจจุบัน</div>
            {(() => {
              const headerStepName = currentIndex >= 0 ? (currentStep || "-") : (firstPendingStep || "-");
              const headerStatusText = currentIndex >= 0 ? "กำลังทำ" : (isFinished ? "เสร็จสิ้นแล้ว" : "ยังไม่เริ่ม");
              return (
                <>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{headerStepName}</div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">สถานะ: <span className={`font-medium ${headerStatusText === 'กำลังทำ' ? 'text-amber-700' : headerStatusText === 'เสร็จสิ้นแล้ว' ? 'text-emerald-700' : 'text-gray-700 dark:text-gray-300'}`}>{headerStatusText}</span></div>
                </>
              );
            })()}
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">ถัดไป: <span className="text-gray-800 dark:text-gray-200 font-medium">{nextStep || (isFinished ? "-" : "รอเริ่มงาน")}</span></div>
          </div>

          <div className="mt-4">
            {isPendingQC && !isAssignedToPending && !isAdmin && (
              <div className="mb-3 p-3 rounded-lg border bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-300 text-sm">
                ขั้นตอนปัจจุบันเป็น QC กรุณารอให้ทีม QC ตรวจสอบให้เสร็จก่อนจึงจะเริ่มขั้นตอนถัดไปได้
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={onStartClick}
                disabled={!canStart || isFinished || isCoolingDown || !isAssignedToPending || (isPendingQC && !isAssignedToPending)}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-white font-semibold transition-colors ${
                  !canStart || isFinished || isCoolingDown || !isAssignedToPending || (isPendingQC && !isAssignedToPending) 
                    ? "bg-gray-400 text-gray-600 dark:bg-gray-600 dark:text-gray-400 cursor-not-allowed" 
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                <Play className="w-5 h-5" /> เริ่มทำขั้นตอน {firstPendingStep || "-"}
              </button>
              <button
                onClick={onDoneClick}
                disabled={!canDone || isCoolingDown}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-white font-semibold transition-colors ${!canDone || isCoolingDown ? "bg-gray-300 text-gray-500 dark:text-gray-400 dark:text-gray-500 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}
              >
                <Check className="w-5 h-5" /> DONE (ทำขั้นตอนนี้เสร็จแล้ว)
              </button>
            </div>
            
            {/* Warning message when user is not assigned to current step */}
              {!isAssignedToPending && firstPendingStep && !isPendingQC && !isAdmin && (
                <div className="mt-3 p-3 rounded-lg border bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-300 text-sm">
                  ⚠️ คุณไม่ได้รับมอบหมายให้ทำในสถานีนี้
                </div>
              )}
          </div>

          {isFinished && (
            <div className="mt-2 text-center text-sm text-emerald-700 font-medium">งานเสร็จสิ้น</div>
          )}


          <div className="mt-6">
            <div className="flex gap-3 overflow-x-auto roadmap-scroll pb-2 pr-4">
              {ticket.roadmap.map((step, index) => {
                const stationData = stations[index];
                const isQCStep = (step.step || "").toUpperCase().includes("QC");
                const techName = isQCStep ? "-" : (stationData?.technician || "ยังไม่ได้มอบหมาย");
                const isMyStation = !isQCStep && stationData?.technician && me && stationData.technician.includes(me);
                // แสดง rework count เฉพาะเมื่อเป็นขั้น QC และเป็นขั้นที่มีสถานะ rework เท่านั้น
                const showReworkCount = isQCStep && step.status === 'rework';
                return (
                  <div key={index} className={`min-w-[220px] rounded-xl border p-4 shadow-sm ${
                    step.status === 'current' ? 'border-amber-300 bg-amber-50' : 
                    step.status === 'completed' ? 'border-emerald-200 bg-emerald-50' : 
                    step.status === 'rework' ? 'border-orange-300 bg-orange-50' :
                    'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                  }`}>
                    <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">ขั้นที่ {index + 1}</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{step.step}</div>
                    <div className={`mt-3 h-2 rounded-full ${
                      step.status === 'completed' ? 'bg-emerald-500' : 
                      step.status === 'current' ? 'bg-amber-500 animate-pulse' : 
                      step.status === 'rework' ? 'bg-orange-500' :
                      'bg-gray-200'
                    }`} />
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500">สถานะ: <span className={`font-medium ${
                      step.status === 'current' ? 'text-amber-700' : 
                      step.status === 'completed' ? 'text-emerald-700' : 
                      step.status === 'rework' ? 'text-orange-700' :
                      'text-gray-600 dark:text-gray-400 dark:text-gray-500'
                    }`}>{step.status}</span></div>
                    {/* แสดงจำนวนชิ้น rework ใต้ขั้น QC เฉพาะเมื่อ uuid ตรงกัน */}
                    {showReworkCount && (reworkOrders || []).length > 0 && (
                      <div className="mt-1 text-[11px] text-orange-700">
                        {(() => {
                          const sid = stationData?.stationId || stationData?.id;
                          const isSameUuid = (ro) => ro.failed_qc_task_uuid && step.qc_task_uuid && ro.failed_qc_task_uuid === step.qc_task_uuid;
                          const isSameStationFallback = (ro) => !ro.failed_qc_task_uuid && sid && ro.failed_at_station_id === sid;
                          const related = (reworkOrders || []).filter(ro => isSameUuid(ro) || isSameStationFallback(ro));
                          const total = related.reduce((sum, ro) => sum + (Number(ro.quantity) || 0), 0);
                          return (
                            <>
                              {`rework: ${total} ชิ้น`}
                              {related.map(ro => (
                                ro.rework_ticket_no ? (
                                  <span key={ro.id} className="ml-2 inline-flex items-center gap-1">
                                    <a href={`/production/${encodeURIComponent(ro.rework_ticket_no)}`} className="text-blue-600 hover:underline">
                                      {ro.rework_ticket_no}
                                    </a>
                                  </span>
                                ) : null
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    )}
                    {!isQCStep && (
                      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500">
                        ช่าง: <span className={`font-medium ${isMyStation ? 'text-blue-700' : 'text-gray-900 dark:text-gray-100'}`}>{techName}</span>
                        {isMyStation && <span className="ml-1 text-blue-600">✓</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex-shrink-0 w-6" aria-hidden="true" />
            </div>
            <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 dark:text-gray-500 select-none">
              <span>เลื่อนไปทางขวาเพื่อดูทั้งหมด</span>
              <span className="animate-pulse">→</span>
            </div>
          </div>

          
        </div>

        <div className="space-y-3">
          {/* Current technician and time info */}
          {currentTechnician && currentIndex >= 0 && !isCurrentQC && (
            <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-600">
              <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">ช่างประจำสถานีปัจจุบัน</div>
              <div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{currentTechnician}</div>
              {currentIndex >= 0 && (
                <div className="mt-3 space-y-1 text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500">
                  <div>เริ่ม: <span className="text-gray-900 dark:text-gray-100 font-medium">{formatTime(startedAt)}</span></div>
                  <div>สิ้นสุด: <span className="text-gray-900 dark:text-gray-100 font-medium">{formatTime(doneAt)}</span></div>
                  <div>ใช้เวลา: <span className="text-gray-900 dark:text-gray-100 font-medium">{formatDuration(durationMinutes)}</span></div>
                </div>
              )}
            </div>
          )}

          {/* Historical Stations Section */}
          {workSessions.filter(s => s.completed_at).length > 0 && (
            <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-600">
              <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-3">ประวัติสถานีที่ผ่านมา</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {workSessions
                  .filter(session => session.completed_at)
                  .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
                  .slice(0, 5) // Show last 5 completed sessions
                  .map(session => (
                    <div key={session.id} className="p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {session.stations?.name_th || 'Unknown Station'}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        ช่าง: {session.users?.name || session.users?.email || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500">
                        เริ่ม: {formatTime(session.started_at)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500">
                        สิ้นสุด: {formatTime(session.completed_at)}
                      </div>
                      <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        ใช้เวลา: {formatDuration(session.duration_minutes)}
                      </div>
                    </div>
                  ))}
                {workSessions.filter(s => s.completed_at).length > 5 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                    และอีก {workSessions.filter(s => s.completed_at).length - 5} สถานี...
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-600">
            <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">ค่าแรงรวมตั๋ว</div>
            <div className="mt-1 inline-flex items-center gap-2 text-gray-800 dark:text-gray-200 font-semibold">
              <Coins className="w-4 h-4 text-emerald-600" />
              {totalLabor.toLocaleString()} บาท
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">ของฉัน: <span className="text-gray-800 dark:text-gray-200 font-medium">{myEarnings.toLocaleString()} บาท</span></div>
          </div>
          <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-600">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">
              <Package className="w-4 h-4" />
              BOM รายการเบิก
            </div>
            <div className="mt-2 space-y-2">
              {bomItems.length === 0 && <div className="text-sm text-gray-400 dark:text-gray-500">ไม่มีรายการ</div>}
              {bomItems.slice(0,5).map((it, idx) => (
                <div key={idx} className="text-sm flex items-center justify-between">
                  <div className="truncate">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">{it.code}</span> — <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500">{it.name}</span>
                  </div>
                  <div className="shrink-0 text-gray-700 dark:text-gray-300">{it.issued}/{it.qty} {it.unit}</div>
                </div>
              ))}
              {bomItems.length > 5 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">และอีก {bomItems.length - 5} รายการ…</div>
              )}
            </div>
          </div>
          
          {/* Batch Information */}
          {batches.length > 0 && (
            <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-600">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-3">
                <div className="w-4 h-4 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-blue-600">B</span>
                </div>
                Batches ({batches.length})
              </div>
              <div className="space-y-2">
                {batches.map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        batch.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                        batch.status === 'rework' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                        batch.status === 'waiting_merge' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400' :
                        'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                      }`}>
                        {batch.batch_name}
                      </span>
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {batch.quantity} ชิ้น
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {batch.stations?.name_th || batch.stations?.code || 'Unknown Station'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Rework Orders Information */}
          {reworkOrders.filter(r => (r.status || 'pending') !== 'merged').length > 0 && (
            <div className="p-4 rounded-xl border border-gray-100 dark:border-slate-600">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-3">
                <div className="w-4 h-4 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-orange-600">R</span>
                </div>
                Rework Orders ({reworkOrders.filter(r => (r.status || 'pending') !== 'merged').length})
              </div>
              <div className="space-y-2">
                {reworkOrders.filter(r => (r.status || 'pending') !== 'merged').map((rework) => (
                  <div key={rework.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        rework.approval_status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                        rework.approval_status === 'rejected' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                      }`}>
                        {rework.approval_status === 'approved' ? 'อนุมัติแล้ว' :
                         rework.approval_status === 'rejected' ? 'ปฏิเสธ' : 'รออนุมัติ'}
                      </span>
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {rework.quantity} ชิ้น
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      {rework.severity === 'minor' ? 'เล็กน้อย' :
                       rework.severity === 'major' ? 'รุนแรง' : 'Custom'}
                      {isAdmin && (
                        <button
                          onClick={async () => {
                            try {
                              const resp = await fetch(`/api/rework/${encodeURIComponent(rework.id)}/merge-approve`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ approvedBy: userId, notes: '' })
                              });
                              const json = await resp.json();
                              if (!resp.ok) throw new Error(json?.error || 'Merge failed');
                              if (typeof onAfterMerge === 'function') {
                                await onAfterMerge();
                              }
                            } catch (e) {
                              alert(`Merge failed: ${e.message}`);
                            }
                          }}
                          className="ml-2 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Merge
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProductionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const myName = (user?.name || user?.email || "").trim();
  const ticketId = `${params?.id || ""}`;

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  
  // Batch and rework data
  const [batches, setBatches] = useState([]);
  const [reworkOrders, setReworkOrders] = useState([]);
  const [isClosed, setIsClosed] = useState(false);

  // Function to load batch and rework data
  const loadBatchData = useCallback(async () => {
    try {
      // Load batches for this ticket
      const { data: batchData, error: batchError } = await supabase
        .from('ticket_batches')
        .select(`
          *,
          stations(name_th, code),
          qc_sessions(form_type, inspector)
        `)
        .eq('ticket_no', ticketId)
        .order('created_at', { ascending: false });
      
      if (batchError) throw batchError;
      setBatches(batchData || []);

      // Load rework orders for this ticket
      const { data: reworkData, error: reworkError } = await supabase
        .from('rework_orders')
        .select(`
          *,
          users!rework_orders_created_by_fkey(name),
          stations(name_th, code)
        `)
        .eq('ticket_no', ticketId)
        .order('created_at', { ascending: false });
      
      if (reworkError) throw reworkError;
      setReworkOrders(reworkData || []);
    } catch (error) {
      console.error('Error loading batch data:', error);
    }
  }, [ticketId]);

  // Evaluate Closed badge when ticket/reworkOrders change
  useEffect(() => {
    try {
      if (!ticket) return;
      if ((ticketId || '').includes('-RW')) { setIsClosed(false); return; }
      const open = (reworkOrders || []).filter(r => (r.status || 'pending') !== 'merged' && (r.status || 'pending') !== 'cancelled');
      setIsClosed((ticket.status === 'Finish') && open.length === 0);
    } catch {}
  }, [ticket, reworkOrders, ticketId]);

  // Function to reload ticket data from DB
  const reloadTicketData = useCallback(async () => {
    try {
      // ตรวจสอบว่าเป็นตั๋ว Rework หรือไม่
      const isReworkTicket = ticketId && ticketId.includes('-RW');
      
      let erpTicket;
      
      if (isReworkTicket) {
        // ถ้าเป็น Rework ticket ให้ดึงข้อมูลจาก DB แทน ERP
        console.log('[RELOAD] Loading rework ticket from DB:', ticketId);
        const { data: dbTicket, error: dbError } = await supabase
          .from('ticket')
          .select('*')
          .eq('no', ticketId)
          .single();
        
        if (dbError || !dbTicket) {
          throw new Error('ไม่พบข้อมูลตั๋ว Rework ในฐานข้อมูล');
        }
        
        // แปลง dbTicket เป็น erpTicket format
        erpTicket = {
          id: dbTicket.no,
          title: dbTicket.description || `Rework: ${dbTicket.source_no}`,
          quantity: dbTicket.quantity || 0,
          itemCode: dbTicket.source_no || dbTicket.no,
          description: dbTicket.description || '',
          description2: dbTicket.description_2 || '',
          dueDate: dbTicket.due_date || '',
          priority: dbTicket.priority || 'High',
          status: dbTicket.status || 'In Progress',
          projectCode: dbTicket.source_no || '',
          projectName: `Rework Ticket ${dbTicket.no}`,
          isRework: true,
          parentTicketNo: dbTicket.source_no
        };
      } else {
        // DB-first: โหลดตั๋วปกติจากฐานข้อมูล
        const { data: dbTicket, error: dbError } = await supabase
          .from('ticket')
          .select('*')
          .eq('no', ticketId)
          .single();
        if (dbError || !dbTicket) throw new Error('ไม่พบข้อมูลตั๋วในฐานข้อมูล');

        erpTicket = {
          id: dbTicket.no,
          title: dbTicket.description || dbTicket.no,
          quantity: dbTicket.quantity || 0,
          itemCode: dbTicket.source_no || dbTicket.no,
          description: dbTicket.description || '',
          description2: dbTicket.description_2 || '',
          dueDate: dbTicket.due_date || '',
          priority: dbTicket.priority || 'Medium',
          status: dbTicket.status || 'Released',
          projectCode: dbTicket.source_no || '',
          projectName: dbTicket.description || dbTicket.no,
          isRework: false,
          parentTicketNo: null
        };
      }

      // 2) Load station flows for this ticket from DB
      // สำหรับ rework ticket ให้ดูเฉพาะ flows ที่มี is_rework_ticket = true
      // สำหรับตั๋วปกติ ให้ดูเฉพาะ flows ที่ไม่มี is_rework_ticket
      const { data: flows, error: flowError } = await supabase
        .from('ticket_station_flow')
        .select(`
          *,
          stations (
            name_th,
            code
          )
        `)
        .eq('ticket_no', ticketId)
        .eq('is_rework_ticket', isReworkTicket) // Filter by is_rework_ticket
        .order('step_order', { ascending: true });
      
      console.log('[RELOAD] Raw flows from DB (isRework:', isReworkTicket, '):', flows?.map(f => ({
        station: f.stations?.name_th,
        status: f.status,
        station_id: f.station_id,
        is_rework_ticket: f.is_rework_ticket
      })));
      
      if (flowError) {
        console.warn('Load flows error:', flowError.message);
      }

      // 3) Load ticket data from DB for priority, quantity and customer info
      let dbTicket = null;
      try {
        const { data: ticketData, error: ticketError } = await supabase
          .from('ticket')
          .select('no, priority, customer_name, quantity, initial_quantity, pass_quantity')
          .eq('no', ticketId)
          .single();
        if (!ticketError && ticketData) {
          dbTicket = ticketData;
        }
      } catch (e) {
        console.warn('Load ticket data error:', e.message);
      }

      // 3.5) Load project document from DB
      let projectDoc = null;
      try {
        // First get project_item_id from project_items table
        // ใช้ limit(1) เพื่อหลีกเลี่ยง 406 (Not Acceptable) หากมีหลายแถวที่ item_code ซ้ำกัน
        const { data: projectItems, error: projectItemError } = await supabase
          .from('project_items')
          .select('id')
          .eq('item_code', erpTicket.itemCode)
          .limit(1);
        const projectItemData = Array.isArray(projectItems) && projectItems.length > 0 ? projectItems[0] : null;
        
        if (!projectItemError && projectItemData) {
          // Then get file from project_files table
          const { data: projectFileData, error: projectFileError } = await supabase
            .from('project_files')
            .select('file_name, file_url, file_path, uploaded_at, file_size, file_type')
            .eq('project_item_id', projectItemData.id)
            .eq('is_current', true)
            .maybeSingle();
          
          if (!projectFileError && projectFileData) {
            projectDoc = projectFileData;
          } else if (projectFileError) {
            console.warn('Load project file error:', projectFileError);
          }
        }
      } catch (e) {
        console.warn('Load project document error:', e.message);
      }

      // 4) Load assignments (technicians)
      let assignments = [];
      try {
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('ticket_assignments')
          .select(`
            ticket_no,
            station_id,
            step_order,
            technician_id,
            users(name)
          `)
          .eq('ticket_no', ticketId);
        if (!assignmentError && Array.isArray(assignmentData)) {
          assignments = assignmentData;
        } else {
            const { data: simpleData } = await supabase
              .from('ticket_assignments')
              .select('ticket_no, station_id, step_order, technician_id')
              .eq('ticket_no', ticketId);
          if (Array.isArray(simpleData) && simpleData.length > 0) {
            const techIds = [...new Set(simpleData.map(a => a.technician_id))];
            const { data: userData } = await supabase
              .from('users')
              .select('id,name')
              .in('id', techIds);
            assignments = simpleData.map(a => ({
              ...a,
              users: (userData || []).find(u => u.id === a.technician_id) || null
            }));
          }
      }
    } catch {}

    // ถ้าเป็น rework ticket และยังไม่มี assignments ให้ดึงจาก rework_roadmap
    if (isReworkTicket && (!assignments || assignments.length === 0)) {
      try {
        // ดึง rework_order_id จาก flows
        const reworkOrderId = flows[0]?.rework_order_id;
        
        if (reworkOrderId) {
          const { data: roadmapData, error: roadmapError } = await supabase
            .from('rework_roadmap')
            .select(`
              rework_order_id,
              station_id,
              step_order,
              assigned_technician_id,
              station_name,
              users(name)
            `)
            .eq('rework_order_id', reworkOrderId);
          
          if (!roadmapError && Array.isArray(roadmapData)) {
            // แปลง roadmap เป็นรูปแบบ assignments
            assignments = roadmapData.map(roadmap => ({
              ticket_no: ticketId, // ใช้ ticket_no ของ rework ticket
              station_id: roadmap.station_id,
              step_order: roadmap.step_order,
              technician_id: roadmap.assigned_technician_id,
              rework_order_id: reworkOrderId, // เพิ่มเพื่อใช้เป็น key
              users: roadmap.users || { name: '' }
            }));
            
            console.log('[DETAIL] Loaded rework roadmap assignments:', assignments);
          }
        }
      } catch (e) {
        console.warn('Error loading rework roadmap:', e);
      }
    }

      // 5) Merge flows + assignments
      const merged = mergeFlowsIntoTicket(erpTicket, Array.isArray(flows) ? flows : [], assignments);
      
      // Apply priority/quantity from Supabase if available
      if (dbTicket && dbTicket.priority) {
        merged.priority = dbTicket.priority === "High" ? "High Priority" : 
                         dbTicket.priority === "Low" ? "Low Priority" : "Medium Priority";
        if (merged.priority === "High Priority") {
          merged.priorityClass = "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
        } else if (merged.priority === "Medium Priority") {
          merged.priorityClass = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
        } else if (merged.priority === "Low Priority") {
          merged.priorityClass = "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
        } else {
          merged.priorityClass = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
        }
      }
      if (dbTicket && typeof dbTicket.quantity === 'number') {
        // displayCount = COALESCE(pass_quantity, quantity)
        const passQ = (typeof dbTicket.pass_quantity === 'number' && dbTicket.pass_quantity !== null)
          ? dbTicket.pass_quantity
          : dbTicket.quantity;
        merged.quantity = passQ;
      }
      if (dbTicket && typeof dbTicket.initial_quantity === 'number') {
        merged.initialQuantity = dbTicket.initial_quantity;
      }
      
      // Add project document info
      if (projectDoc) {
        merged.projectDoc = projectDoc;
      }
      
      return merged;
    } catch (e) {
      console.error('Reload failed:', e);
      throw e;
    }
  }, [ticketId]);

  useEffect(() => {
    let active = true;
    async function loadDetail() {
      try {
        setLoading(true);
        setError("");
        const merged = await reloadTicketData();
        if (active) setTicket(merged);
        // Also load batch data
        if (active) await loadBatchData();
      } catch (e) {
        console.error('Load detail failed:', e);
        if (active) setError(e?.message || 'Failed to load ticket detail');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDetail();
    return () => { active = false; };
  }, [ticketId, reloadTicketData, loadBatchData]);

  // Realtime subscription for this specific ticket: flows + assignments
  useEffect(() => {
    if (!ticketId) return;

    console.log('[DETAIL] Setting up realtime subscription for ticket:', ticketId);
    
    const channel = supabase
      .channel(`ticket-detail-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'ticket_station_flow',
          filter: `ticket_no=eq.${ticketId}` // Only listen to changes for this ticket
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 FLOW CHANGE DETECTED for ticket:', ticketId);
          console.log('[DETAIL REALTIME] Payload:', payload);
          // Reload ticket data when flows change
          try {
            // Add small delay to ensure DB propagation
            await new Promise(resolve => setTimeout(resolve, 300));
            console.log('[DETAIL REALTIME] Reloading after flow change...');
            const refreshed = await reloadTicketData();
            console.log('[DETAIL REALTIME] Reloaded ticket status:', refreshed.status);
            console.log('[DETAIL REALTIME] Reloaded roadmap:', refreshed.roadmap?.map(r => ({ step: r.step, status: r.status })));
            // Force re-render by creating new object reference
            setTicket({ ...refreshed, _refreshKey: Date.now() });
            // Also refresh rework/batch data so rework count updates immediately
            await loadBatchData();
            console.log('[DETAIL REALTIME] ✅ UI updated successfully');
          } catch (e) {
            console.error('[DETAIL REALTIME] Failed to reload:', e);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_assignments',
          filter: `ticket_no=eq.${ticketId}`
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 ASSIGNMENT CHANGE DETECTED for ticket:', ticketId);
          console.log('[DETAIL REALTIME] Assignment Payload:', payload);
          try {
            // Add small delay to ensure DB propagation
            await new Promise(resolve => setTimeout(resolve, 300));
            console.log('[DETAIL REALTIME] Reloading after assignment change...');
            const refreshed = await reloadTicketData();
            console.log('[DETAIL REALTIME] Reloaded ticket status:', refreshed.status);
            console.log('[DETAIL REALTIME] Reloaded roadmap:', refreshed.roadmap?.map(r => ({ step: r.step, status: r.status })));
            // Force re-render by creating new object reference
            setTicket({ ...refreshed, _refreshKey: Date.now() });
            console.log('[DETAIL REALTIME] ✅ UI updated successfully (assignments)');
          } catch (e) {
            console.error('[DETAIL REALTIME] Failed to reload (assignments):', e);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'technician_work_sessions',
          filter: `ticket_no=eq.${ticketId}`
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 WORK SESSION CHANGE DETECTED for ticket:', ticketId);
          console.log('[DETAIL REALTIME] Work Session Payload:', payload);
          try {
            // Reload work sessions data
            await loadWorkSessions();
            console.log('[DETAIL REALTIME] ✅ Work sessions updated successfully');
          } catch (e) {
            console.error('[DETAIL REALTIME] Failed to reload work sessions:', e);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_batches',
          filter: `ticket_no=eq.${ticketId}`
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 BATCH CHANGE DETECTED for ticket:', ticketId);
          await new Promise(resolve => setTimeout(resolve, 300));
          await loadBatchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rework_orders',
          filter: `ticket_no=eq.${ticketId}`
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 REWORK ORDER CHANGE DETECTED for ticket:', ticketId);
          await new Promise(resolve => setTimeout(resolve, 300));
          await loadBatchData();
          try {
            const refreshed = await reloadTicketData();
            setTicket({ ...refreshed, _refreshKey: Date.now() });
          } catch (e) { console.warn('Reload after rework change failed:', e); }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rework_orders'
        },
        async (payload) => {
          const changedTicket = payload.new?.ticket_no || payload.old?.ticket_no;
          if (changedTicket === ticketId) {
            console.log('[DETAIL REALTIME] 🔥 FALLBACK rework_orders change for this ticket');
            await new Promise(resolve => setTimeout(resolve, 300));
            await loadBatchData();
            try {
              const refreshed = await reloadTicketData();
              setTicket({ ...refreshed, _refreshKey: Date.now() });
            } catch (e) { console.warn('Fallback reload after rework change failed:', e); }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket',
          filter: `no=eq.${ticketId}`
        },
        async () => {
          try {
            await new Promise(resolve => setTimeout(resolve, 300));
            const refreshed = await reloadTicketData();
            setTicket({ ...refreshed, _refreshKey: Date.now() });
          } catch {}
        }
      )
      .subscribe((status) => {
        console.log('[DETAIL] Realtime subscription status:', status);
      });

    // Fallback: Listen to ALL changes (in case filtered subscription doesn't work)
    const fallbackChannel = supabase
      .channel(`ticket-detail-fallback-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_station_flow'
        },
        async (payload) => {
          console.log('[DETAIL REALTIME] 🔥 FALLBACK: FLOW CHANGE DETECTED');
          console.log('[DETAIL REALTIME] Fallback Payload:', payload);
          
          // Check if this change is for our ticket
          if (payload.new?.ticket_no === ticketId || payload.old?.ticket_no === ticketId) {
            console.log('[DETAIL REALTIME] ✅ FALLBACK: This change is for our ticket!');
            try {
              await new Promise(resolve => setTimeout(resolve, 300));
              console.log('[DETAIL REALTIME] FALLBACK: Reloading after change...');
              const refreshed = await reloadTicketData();
              console.log('[DETAIL REALTIME] FALLBACK: Reloaded ticket status:', refreshed.status);
              setTicket({ ...refreshed, _refreshKey: Date.now() });
              await loadBatchData();
              console.log('[DETAIL REALTIME] ✅ FALLBACK: UI updated successfully');
            } catch (e) {
              console.error('[DETAIL REALTIME] FALLBACK: Failed to reload:', e);
            }
          } else {
            console.log('[DETAIL REALTIME] ⚠️ FALLBACK: This change is for different ticket:', payload.new?.ticket_no || payload.old?.ticket_no);
          }
        }
      )
      .subscribe((status) => {
        console.log('[DETAIL] Fallback subscription status:', status);
      });

    return () => {
      console.log('[DETAIL] Cleaning up realtime subscriptions');
      supabase.removeChannel(channel);
      supabase.removeChannel(fallbackChannel);
    };
  }, [ticketId, reloadTicketData]);

  // Polling fallback (every 5 seconds) in case realtime doesn't work
  useEffect(() => {
    if (!ticketId) return;

    console.log('[DETAIL] Setting up polling fallback...');
    
    const pollInterval = setInterval(async () => {
      try {
        const refreshed = await reloadTicketData();
        
        // Check if data has changed by comparing with current ticket
        if (ticket && JSON.stringify(refreshed.roadmap) !== JSON.stringify(ticket.roadmap)) {
          setTicket({ ...refreshed, _refreshKey: Date.now() });
        }
      } catch (e) {
        console.error('[POLLING] Failed to poll:', e);
      }
    }, 5000); // Poll every 5 seconds

    return () => {
      console.log('[DETAIL] Cleaning up polling fallback');
      clearInterval(pollInterval);
    };
  }, [ticketId, reloadTicketData, ticket]);

  // Server-Sent Events (SSE) fallback for realtime updates
  useEffect(() => {
    if (!ticketId) return;

    console.log('[SSE] Setting up SSE connection for ticket:', ticketId);
    
    const eventSource = new EventSource(`/api/production/${ticketId}/events`);
    
    eventSource.onopen = () => {
      console.log('[SSE] ✅ Connection opened');
    };

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'flow_change' || data.type === 'assignment_change') {
          console.log('[REALTIME] Data updated, refreshing...');
          const refreshed = await reloadTicketData();
          setTicket({ ...refreshed, _refreshKey: Date.now() });
        }
      } catch (e) {
        console.error('[REALTIME] Failed to parse event:', e);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
    };

    return () => {
      console.log('[SSE] Cleaning up SSE connection');
      eventSource.close();
    };
  }, [ticketId, reloadTicketData]);

  function mapErpToTicket(record) {
    const rec = record && record.data ? record.data : record;
    const id = rec?.No || rec?.no || rec?.RPD_No || rec?.rpdNo || rec?.orderNumber || rec?.Order_No || rec?.No_ || rec?.id;
    const rpdNo = String(id || "").trim();
    const quantity = Number(rec?.Quantity ?? rec?.quantity ?? 0);
    const dueDate = rec?.Delivery_Date || rec?.deliveryDate || rec?.Ending_Date_Time || rec?.Ending_Date || rec?.Due_Date || "";
    const itemCode = rec?.Source_No || rec?.Item_No || rec?.itemCode || rec?.Item_Code || rec?.Source_Item || "";
    const description = rec?.Description || rec?.description || "";
    const description2 = rec?.Description_2 || rec?.description2 || "";
    const route = rec?.Routing_No || rec?.Routing || rec?.Route || "";
    const roadmap = Array.isArray(rec?.Operations)
      ? rec.Operations.map(op => ({ step: op?.Description || op?.description || op?.Operation_No || "", status: "pending" }))
      : [];
    return {
      id: rpdNo,
      title: description,
      priority: "ยังไม่ได้กำหนด Priority",
      priorityClass: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
      status: "Pending",
      statusClass: "text-blue-600",
      assignee: "-",
      dueDate: dueDate || "",
      quantity: quantity || 0,
      rpd: rpdNo,
      itemCode,
      description,
      description2,
      route: itemCode || route,
      routeClass: "bg-blue-100 text-blue-800",
      bom: Array.isArray(rec?.BOM) ? rec.BOM : [],
      stations: [],
      roadmap,
    };
  }

  function mergeFlowsIntoTicket(base, flows, assignments) {
    if (!flows || flows.length === 0) return base;
    
    console.log('[MERGE] Merging flows:', flows.map(f => ({
      station: f.stations?.name_th,
      status: f.status,
      step_order: f.step_order,
      rework_order_id: f.rework_order_id
    })));
    
    const assignmentMap = {};
    (assignments || []).forEach(a => {
      // สำหรับ rework tickets ให้ใช้ rework_order_id ถ้ามี
      const key = a.rework_order_id 
        ? `${a.rework_order_id}-${a.station_id}-${a.step_order || 0}`
        : `${a.ticket_no}-${a.station_id}-${a.step_order || 0}`;
      assignmentMap[key] = a.users?.name || '';
    });
    
    console.log('[MERGE] Assignment map:', assignmentMap);
    
    const roadmap = flows.map(flow => {
      // สำหรับ rework tickets ให้ใช้ rework_order_id ถ้ามี
      const techKey = flow.rework_order_id 
        ? `${flow.rework_order_id}-${flow.station_id}-${flow.step_order}`
        : `${flow.ticket_no}-${flow.station_id}-${flow.step_order}`;
      return {
        step: flow.stations?.name_th || '',
        status: flow.status || 'pending',
        technician: assignmentMap[techKey] || '',
        qc_task_uuid: flow.qc_task_uuid || null
      };
    });
    
    console.log('[MERGE] Created roadmap:', roadmap);
    
        const stations = flows.map(flow => {
      // สำหรับ rework tickets ให้ใช้ rework_order_id ถ้ามี
      const techKey = flow.rework_order_id 
        ? `${flow.rework_order_id}-${flow.station_id}-${flow.step_order}`
        : `${flow.ticket_no}-${flow.station_id}-${flow.step_order}`;
      return {
        name: flow.stations?.name_th || '',
        technician: assignmentMap[techKey] || '',
        priceType: flow.price_type || 'flat',
        price: Number(flow.price) || 0,
            status: flow.status || 'pending',
            stationId: flow.station_id
      };
    });
    
    const currentFlow = flows.find(f => f.status === 'current');
    console.log('[MERGE] Current flow found:', currentFlow ? currentFlow.stations?.name_th : 'none');
    
    // สำหรับ rework tickets ให้ใช้ rework_order_id ถ้ามี
    let assignee = '';
    if (currentFlow) {
      const techKey = currentFlow.rework_order_id 
        ? `${currentFlow.rework_order_id}-${currentFlow.station_id}-${currentFlow.step_order}`
        : `${currentFlow.ticket_no}-${currentFlow.station_id}-${currentFlow.step_order}`;
      assignee = assignmentMap[techKey] || '';
    }
    if (!assignee && flows.length > 0) {
      const firstFlow = flows[0];
      const techKey = firstFlow.rework_order_id 
        ? `${firstFlow.rework_order_id}-${firstFlow.station_id}-${firstFlow.step_order}`
        : `${firstFlow.ticket_no}-${firstFlow.station_id}-${firstFlow.step_order}`;
      assignee = assignmentMap[techKey] || '';
    }
    
    const status = calculateTicketStatus(stations, roadmap);
    console.log('[MERGE] Calculated status:', status);
    
    const statusClass = getStatusClass(status);
    return { ...base, roadmap, stations, assignee: assignee || '-', status, statusClass };
  }

  function calculateTicketStatus(stations, roadmap) {
    console.log('[CALC] Calculating status with roadmap:', roadmap?.map(r => ({ step: r.step, status: r.status })));
    
    if (!Array.isArray(stations) || stations.length === 0) {
      console.log('[CALC] No stations, returning Pending');
      return "Pending";
    }
    
    const hasAssigned = stations.some(s => (s.technician || '').trim() !== '');
    if (!hasAssigned) {
      console.log('[CALC] No assigned technicians, returning Pending');
      return "Pending";
    }
    
    if (Array.isArray(roadmap) && roadmap.length > 0) {
      const allCompleted = roadmap.every(step => step.status === 'completed' || step.status === 'rework');
      const hasCurrent = roadmap.some(step => step.status === 'current');
      
      console.log('[CALC] allCompleted:', allCompleted, 'hasCurrent:', hasCurrent);
      
      if (allCompleted) return "Finish";
      if (hasCurrent) return "In Progress";
    }
    
    console.log('[CALC] Returning Released (default)');
    return "Released";
  }

  function getStatusClass(status) {
    switch (status) {
      case "Pending":
        return "text-blue-600";
      case "Released":
        return "text-green-600";
      case "In Progress":
        return "text-amber-600";
      case "Finish":
        return "text-emerald-600";
      default:
        return "text-gray-600";
    }
  }

  async function handleDone(id) {
    if (actionBusy) return;
    setActionBusy(true);

    // Update UI optimistically
    setTicket((t) => {
      if (!t || t.id !== id) return t;
      const roadmap = t.roadmap.map((s) => ({ ...s }));
      const currentIndex = roadmap.findIndex((s) => s.status === "current");
      if (currentIndex === -1) return t;
      roadmap[currentIndex].status = "completed";
      const allCompleted = roadmap.every((s) => s.status === "completed" || s.status === 'rework');
      if (allCompleted) {
        return { ...t, roadmap, status: "Finish", statusClass: "text-emerald-600" };
      }
      const nextPendingIndex = roadmap.findIndex((s) => s.status !== "completed" && s.status !== 'rework');
      const nextPendingStep = nextPendingIndex >= 0 ? roadmap[nextPendingIndex]?.step || "" : "";
      const waitingForQC = (nextPendingStep || "").toUpperCase().includes("QC");
      if (waitingForQC) {
        return { ...t, roadmap, status: "รอ QC ตรวจ", statusClass: "text-indigo-700" };
      }
      return { ...t, roadmap, status: "Released", statusClass: "text-green-600" };
    });

    // Persist to database via API
    try {
      // Get current flow's station_id from ticket roadmap
      const currentRoadmap = ticket?.roadmap?.find(r => r.status === 'current');
      if (!currentRoadmap) {
        console.warn('[DONE] No current step found in UI');
        setActionBusy(false);
        return;
      }

      // Load flows with step_order and status, then use the actual current step
      const { data: flows } = await supabase
        .from('ticket_station_flow')
        .select('station_id, step_order, status, stations(name_th)')
        .eq('ticket_no', ticketId)
        .order('step_order', { ascending: true });

      // Prefer DB truth: the one marked as current
      let currentStationFlow = Array.isArray(flows)
        ? flows.find(f => f.status === 'current')
        : null;
      // Fallback: match by name (in case realtime lag), choose the earliest pending/current
      if (!currentStationFlow && Array.isArray(flows)) {
        currentStationFlow = flows.find(f => f.stations?.name_th === currentRoadmap.step && (f.status === 'current' || f.status === 'pending')) || null;
      }

      if (!currentStationFlow) {
        console.warn('[DONE] Could not find station_id for current step');
        setActionBusy(false);
        return;
      }

      console.log('[DONE] Calling API to complete station:', currentStationFlow.station_id, 'step_order:', currentStationFlow.step_order);

      const apiResponse = await fetch(`/api/production/${ticketId}/update-flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          station_id: currentStationFlow.station_id,
          step_order: currentStationFlow.step_order,
          user_id: user?.id
        })
      });

      const apiResult = await apiResponse.json();
      console.log('[DONE] API response:', apiResult);

      if (!apiResponse.ok || !apiResult.success) {
        console.error('[DONE] API error:', apiResult.error);
        alert(apiResult.error || 'ไม่สามารถทำขั้นตอนให้เสร็จได้');
        setActionBusy(false);
        return;
      }

      // Reload ticket data from DB
      const refreshed = await reloadTicketData();
      // Force re-render by creating new object reference
      setTicket({ ...refreshed, _refreshKey: Date.now() });

    } catch (e) {
      console.error('[DONE] Failed to persist DONE:', e);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (e?.message || 'Unknown error'));
      // Reload to restore correct state
      try {
        const refreshed = await reloadTicketData();
        setTicket({ ...refreshed, _refreshKey: Date.now() });
      } catch {}
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStart(id) {
    if (actionBusy) {
      console.log('[START] Already busy, skipping');
      return;
    }
    
    console.log('[START] Starting handleStart for ticket:', id);
    setActionBusy(true);

    // Update UI optimistically
    setTicket((t) => {
      if (!t || t.id !== id) {
        console.log('[START] Ticket mismatch or null, skipping UI update');
        return t;
      }
      const roadmap = t.roadmap.map((s) => ({ ...s }));
      const hasCurrent = roadmap.some((s) => s.status === "current");
      if (hasCurrent) {
        console.log('[START] Already has current step in UI');
        return t;
      }
      const firstPending = roadmap.findIndex((s) => s.status !== "completed" && s.status !== 'rework');
      if (firstPending !== -1) {
        console.log('[START] Setting step', firstPending, 'to current in UI');
        roadmap[firstPending].status = "current";
        return { ...t, roadmap, status: "In Progress", statusClass: "text-amber-600" };
      }
      return t;
    });

    // Persist to database
    try {
      console.log('[START] Fetching flows from DB for ticket:', ticketId);
      
      // 1) Get flows from DB
      const { data: flows, error: flowError } = await supabase
        .from('ticket_station_flow')
        .select(`
          *,
          stations (
            name_th
          )
        `)
        .eq('ticket_no', ticketId)
        .order('step_order', { ascending: true });

      if (flowError) {
        console.error('[START] Error fetching flows:', flowError);
        throw flowError;
      }

      if (!flows || flows.length === 0) {
        console.warn('[START] No flows found in DB for ticket:', ticketId);
        alert('ไม่พบข้อมูลสถานีในฐานข้อมูล กรุณาให้ Admin เพิ่มสถานีให้ตั๋วนี้ก่อน');
        setActionBusy(false);
        return;
      }

      console.log('[START] Found flows:', flows.map(f => ({
        step_order: f.step_order,
        station: f.stations?.name_th,
        status: f.status
      })));

      // 2) Check if there's already a current step
      const currentFlow = flows.find(f => f.status === 'current');
      if (currentFlow) {
        console.log('[START] Already have current step in DB:', currentFlow.stations?.name_th);
        alert('มีขั้นตอนที่กำลังทำอยู่แล้ว กรุณาทำให้เสร็จก่อน');
        setActionBusy(false);
        // Reload to sync UI with DB
        const refreshed = await reloadTicketData();
        setTicket({ ...refreshed, _refreshKey: Date.now() });
        return;
      }

      // 3) Find first pending step that's not QC
      const firstPending = flows.find(f => {
        const isQC = (f.stations?.name_th || '').toUpperCase().includes('QC');
        return f.status === 'pending' && !isQC;
      });

      if (!firstPending) {
        console.log('[START] No eligible pending step found');
        alert('ไม่พบขั้นตอนที่สามารถเริ่มได้ (อาจเป็น QC หรือเสร็จสิ้นแล้ว)');
        setActionBusy(false);
        return;
      }

      console.log('[START] Found first pending step:', {
        step_order: firstPending.step_order,
        station: firstPending.stations?.name_th,
        station_id: firstPending.station_id
      });

      // 4) Update to current via API
      console.log('[START] Calling API to update station', firstPending.station_id, 'to current');
      
      const apiResponse = await fetch(`/api/production/${ticketId}/update-flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          station_id: firstPending.station_id,
          step_order: firstPending.step_order,
          user_id: user?.id
        })
      });

      console.log('[START] API request details:', {
        url: `/api/production/${ticketId}/update-flow`,
        ticketId,
        station_id: firstPending.station_id,
        step_order: firstPending.step_order,
        user_id: user?.id
      });

      const apiResult = await apiResponse.json();
      console.log('[START] API response:', apiResult);

      if (!apiResponse.ok || !apiResult.success) {
        console.error('[START] API error:', apiResult.error);
        alert(apiResult.error || 'ไม่สามารถเริ่มขั้นตอนได้');
        setActionBusy(false);
        return;
      }

      console.log('[START] Successfully updated to current, waiting before reload');

      // Wait a bit for DB to propagate changes
      await new Promise(resolve => setTimeout(resolve, 200));

      // 5) Reload ticket data from DB
      console.log('[START] Reloading data from DB...');
      const refreshed = await reloadTicketData();
      console.log('[START] Reloaded ticket, new status:', refreshed.status);
      console.log('[START] Reloaded roadmap:', refreshed.roadmap?.map(r => ({ step: r.step, status: r.status })));
      setTicket(refreshed);

    } catch (e) {
      console.error('[START] Failed to persist START:', e);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (e?.message || 'Unknown error'));
      // Reload to restore correct state
      try {
        const refreshed = await reloadTicketData();
        setTicket({ ...refreshed, _refreshKey: Date.now() });
      } catch {}
    } finally {
      console.log('[START] Finished handleStart, clearing busy flag');
      setActionBusy(false);
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="mb-4 flex gap-2">
          <button onClick={() => router.push('/production')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-sm text-gray-900 dark:text-gray-100">
            <ArrowLeft className="w-4 h-4" /> กลับหน้า Production
          </button>
          {isClosed && (
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-100 text-emerald-800 text-sm border border-emerald-200">
              ✅ Closed
            </span>
          )}
          <button 
            onClick={async () => {
              console.log('[MANUAL] Force refresh triggered');
              try {
                const refreshed = await reloadTicketData();
                // Force re-render by creating new object reference
                setTicket({ ...refreshed, _refreshKey: Date.now() });
                // Reload rework/batch so rework count updates immediately
                await loadBatchData();
                console.log('[MANUAL] Refreshed ticket status:', refreshed.status);
              } catch (e) {
                console.error('[MANUAL] Refresh failed:', e);
              }
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-sm text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
          >
            🔄 Refresh
          </button>
        </div>

        {loading && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-800 dark:text-blue-300">กำลังโหลดข้อมูลตั๋ว...</div>
        )}

        {!!error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">{error}</div>
        )}

        {!loading && !error && !ticket && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">ไม่พบตั๋ว {ticketId}</div>
        )}

        {ticket && !loading && (
          <DetailCard 
            ticket={ticket} 
            onDone={handleDone} 
            onStart={handleStart} 
            me={myName}
            isAdmin={(user?.role || '').toLowerCase() === 'admin' || (user?.role || '').toLowerCase() === 'superadmin'}
            userId={user?.id || null}
            onAfterMerge={async () => {
              await loadBatchData();
              const refreshed = await reloadTicketData();
              setTicket({ ...refreshed, _refreshKey: Date.now() });
            }}
            batches={batches}
            reworkOrders={reworkOrders}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}


