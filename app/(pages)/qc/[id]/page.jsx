"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/utils/supabaseClient";
import { ArrowLeft, AlertTriangle } from "lucide-react";
// Rework feature removed
import QCHistoryLog from "@/components/QCHistoryLog.jsx";

export default function QCMainForm({ params, forceQcTaskUuid = null, forceTicketId = null }) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const resolvedParams = (params && typeof params.then === 'function') ? React.use(params) : params;
  const id = String(forceTicketId || resolvedParams?.id || "");
  const searchParams = useSearchParams();
  const overrideQcTaskUuid = forceQcTaskUuid || searchParams?.get('qcTaskUuid') || null;
  const router = useRouter();

  // Form state
  const [checklistItems, setChecklistItems] = useState({
    frame: [
      { id: 1, name: "วัสดุตรงตามแบบ", pass: null, qty: "", reason: "" },
      { id: 2, name: "ขนาด", pass: null, qty: "", reason: "" },
      { id: 3, name: "ระยะบังใบ", pass: null, qty: "", reason: "" },
      { id: 4, name: "ตรงตามแบบ", pass: null, qty: "", reason: "" }
    ],
    door: [
      { id: 5, name: "วัสดุตรงตามแบบ", pass: null, qty: "", reason: "" },
      { id: 6, name: "ขนาด", pass: null, qty: "", reason: "" },
      { id: 7, name: "รูปแบบตรงตามแบบ", pass: null, qty: "", reason: "" },
      { id: 8, name: "ประตูไม่บิด โก่ง หรือ ห่อ", pass: null, qty: "", reason: "" },
      { id: 9, name: "แผ่นหน้าไม่หลุดจากโครงประตู", pass: null, qty: "", reason: "" },
      { id: 10, name: "แผ่นหน้าไม่เป็นคลื่น หรือมีรอยอื่นๆ", pass: null, qty: "", reason: "" },
      { id: 16, name: "ตรวจสอบโครง", pass: null, qty: "", reason: "" }
    ],
    paint: [
      { id: 11, name: "สีถูกต้องตามแบบ", pass: null, qty: "", reason: "" },
      { id: 12, name: "คุณภาพหลักการทำสี", pass: null, qty: "", reason: "" }
    ],
    drilling: [
      { id: 13, name: "ระยะเจาะตรงตามแบบ", pass: null, qty: "", reason: "" },
      { id: 14, name: "คุณภาพหลังการเจาะ", pass: null, qty: "", reason: "" },
      { id: 15, name: "รูปแบบการเปิดถูกต้องตามแบบ", pass: null, qty: "", reason: "" }
    ]
  });

  // History state
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // QC Start state
  const [qcStarted, setQcStarted] = useState(false);
  const [startingQc, setStartingQc] = useState(false);
  
  // Ticket data
  const [ticketData, setTicketData] = useState(null);
  const [ticketNotFound, setTicketNotFound] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(true);
  
  // Rework flow removed
  const [defaultRoadmap, setDefaultRoadmap] = useState([]);
  const [qcCompleted, setQcCompleted] = useState(false);

  // Toast state
  const [toast, setToast] = useState({ open: false, type: "info", message: "" });
  const showToast = (message, type = "info", timeoutMs = 2500) => {
    setToast({ open: true, type, message });
    if (timeoutMs > 0) {
      setTimeout(() => setToast((t) => ({ ...t, open: false })), timeoutMs);
    }
  };

  // Team presence (soft lock)
  const [collaborators, setCollaborators] = useState([]); // list of other users
  const othersEditing = collaborators.length > 0;

  const storageKey = `qc_main_form_${id}`;

  // Load draft from localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved) {
        if (saved.checklistItems) setChecklistItems(saved.checklistItems);
      }
    } catch {}
  }, [storageKey]);

  // Save draft to localStorage
  useEffect(() => {
    const draft = { checklistItems };
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch {}
  }, [checklistItems, storageKey]);

  // Load ticket data and history
  useEffect(() => {
    // Only load if id is valid (not empty)
    if (id && id.trim() !== '') {
      loadTicketData();
      loadHistory();
    } else {
      // If id is empty, mark as not found
      setTicketLoading(false);
      setTicketNotFound(true);
    }
  }, [id]);

  // Presence channel for soft-lock teamwork guard
  useEffect(() => {
    if (!id || !user?.id) return;
    const channel = supabase.channel(`qc-form-${id}`, {
      config: { presence: { key: user.id } }
    });

    channel.on('presence', { event: 'sync' }, () => {
      try {
        const state = channel.presenceState();
        const others = Object.entries(state)
          .filter(([key]) => key !== user.id)
          .flatMap(([, arr]) => arr)
          .map((p) => ({ userId: p.user_id, name: p.name }));
        setCollaborators(others);
      } catch {}
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try {
          await channel.track({ user_id: user.id, name: user.name || user.email || 'user' });
        } catch {}
      }
    });

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [id, user?.id]);

  const loadTicketData = async () => {
    try {
      setTicketLoading(true);
      setTicketNotFound(false);
      
      // DB-first: load ticket from database
      const { data: dbTicket, error: dbError } = await supabase
        .from('ticket')
        .select('*')
        .eq('no', id)
        .single();
      
      if (dbError) {
        // Check if ticket not found (code PGRST116 or status 406)
        if (dbError.code === 'PGRST116' || dbError.message?.includes('No rows')) {
          console.warn('Ticket not found:', id);
          setTicketNotFound(true);
          setTicketData(null);
          return;
        }
        throw dbError;
      }
      
      if (dbTicket) {
        setTicketData(dbTicket);
        setTicketNotFound(false);
      } else {
        setTicketNotFound(true);
        setTicketData(null);
        return;
      }
      
      // Load ticket_station_flow to create default roadmap
      await loadTicketStationFlow();
    } catch (e) {
      console.error('Load ticket data failed:', e);
      // Check for 406 or other "not found" errors
      if (e?.status === 406 || e?.code === 'PGRST116' || e?.message?.includes('No rows')) {
        setTicketNotFound(true);
        setTicketData(null);
      }
    } finally {
      setTicketLoading(false);
    }
  };
  
  const loadTicketStationFlow = async () => {
    try {
      const { data: flows, error } = await supabase
        .from('ticket_station_flow')
        .select('*, stations(name_th, code)')
        .eq('ticket_no', id)
        .order('step_order', { ascending: true });
      
      if (error) {
        console.error('Error loading ticket station flow:', error);
        // Check for 406 or not found errors
        if (error.status === 406 || error.code === 'PGRST116' || error.message?.includes('Not Acceptable')) {
          setTicketNotFound(true);
          setTicketData(null);
        }
        return;
      }
      
      // หา QC ขั้นที่ active (pending/current) เพื่อเก็บ qc_task_uuid
      const activeQc = overrideQcTaskUuid
        ? (flows || []).find(f => f.qc_task_uuid === overrideQcTaskUuid)
        : (flows || []).filter(f => {
          const code = String(f?.stations?.code || '').toUpperCase();
          const name = String(f?.stations?.name_th || '').toUpperCase();
          const isQC = code === 'QC' || name.includes('QC') || name.includes('ตรวจ') || name.includes('คุณภาพ');
          return isQC && ['pending','current'].includes(f.status || 'pending');
        })[0] || null;
      // active QC task uuid no longer used
      // หากสถานี QC ของตั๋วนี้เป็นสถานะกำลังดำเนินการอยู่ (current)
      // ให้เปิดฟอร์มอัตโนมัติ โดยไม่ต้องกด "เริ่ม QC" ใหม่
      if (activeQc && String(activeQc.status || '') === 'current') {
        setQcStarted(true);
      }

      // แปลงเป็น default roadmap
      const roadmap = flows.map((flow, index) => ({
        id: `default_${flow.id || index}`, // เพิ่ม id เพื่อใช้เป็น draggableId
        stationId: flow.station_id,
        stationName: flow.stations?.name_th || flow.stations?.code || 'Unknown',
        stepOrder: flow.step_order,
        assignedTechnicianId: flow.technician_id || null,
        estimatedHours: 2 // default 2 hours
      }));
      
      setDefaultRoadmap(roadmap);
    } catch (e) {
      console.error('Load ticket station flow failed:', e);
      // Check for 406 or not found errors in catch block too
      if (e?.status === 406 || e?.code === 'PGRST116' || e?.message?.includes('Not Acceptable') || e?.message?.includes('No rows')) {
        setTicketNotFound(true);
        setTicketData(null);
      }
    }
  };

  // Load station flow to detect if all QC steps are completed (lock page)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: flows, error } = await supabase
          .from('ticket_station_flow')
          .select(`status, stations(code,name_th), step_order`)
          .eq('ticket_no', id)
          .order('step_order', { ascending: true });
        
        if (error) {
          // Check for 406 or not found errors
          if (error.status === 406 || error.code === 'PGRST116' || error.message?.includes('Not Acceptable')) {
            if (!cancelled) {
              setTicketNotFound(true);
              setTicketData(null);
            }
          }
          return;
        }
        
        const list = Array.isArray(flows) ? flows : [];
        const qcSteps = list.filter(f => {
          const code = String(f?.stations?.code || '').toUpperCase();
          const name = String(f?.stations?.name_th || '').toUpperCase();
          return code === 'QC' || name.includes('QC') || name.includes('ตรวจ') || name.includes('คุณภาพ');
        });
        const isAllQcCompleted = qcSteps.length > 0 && qcSteps.every(s => (s.status || 'pending') === 'completed');
        if (!cancelled) setQcCompleted(isAllQcCompleted);
      } catch (e) {
        // Check for 406 or not found errors in catch block
        if (e?.status === 406 || e?.code === 'PGRST116' || e?.message?.includes('Not Acceptable')) {
          if (!cancelled) {
            setTicketNotFound(true);
            setTicketData(null);
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const resp = await fetch(`/api/tickets/${encodeURIComponent(id)}/qc`);
      if (resp.ok) {
        const json = await resp.json();
        setHistory(json.data?.sessions || []);
      }
    } catch (e) {
      console.error('Load history failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const startQC = async () => {
    try {
      setStartingQc(true);
      console.log('Starting QC for ticket:', id);
      
      const resp = await fetch(`/api/tickets/${encodeURIComponent(id)}/qc/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (resp.ok) {
        const json = await resp.json();
        console.log('QC Start response:', json);
        setQcStarted(true);
        alert(language === 'th' ? 'เริ่ม QC แล้ว' : 'QC Started');
      } else {
        const errorData = await resp.json().catch(() => ({}));
        console.error('QC Start failed:', errorData);
        alert(`Failed to start QC: ${errorData?.error || resp.status}`);
      }
    } catch (e) {
      console.error('QC Start error:', e);
      alert(`Error: ${e.message}`);
    } finally {
      setStartingQc(false);
    }
  };

  const updateItem = (category, itemId, field, value) => {
    setChecklistItems(prev => ({
      ...prev,
      [category]: prev[category].map(item => 
        item.id === itemId ? { ...item, [field]: value } : item
      )
    }));
  };

  const addCustomItem = (category) => {
    const newId = Math.max(...Object.values(checklistItems).flat().map(i => i.id)) + 1;
    const newItem = { id: newId, name: "", pass: null, qty: "", reason: "" };
    setChecklistItems(prev => ({
      ...prev,
      [category]: [...prev[category], newItem]
    }));
  };

  const removeCustomItem = (category, itemId) => {
    setChecklistItems(prev => ({
      ...prev,
      [category]: prev[category].filter(item => item.id !== itemId)
    }));
  };

  // คำนวณผลลัพธ์ QC อิงจาก Quantity ที่ตั้งต้นในตั๋ว
  const calculateQCResults = () => {
    const allItems = Object.values(checklistItems).flat();
    const checkedItems = allItems.filter(item => item.pass !== null);
    
    if (checkedItems.length === 0) {
      return { passQuantity: 0, failQuantity: 0, totalQuantity: 0, passRate: 0 };
    }

    // จำนวนชิ้นงานทั้งหมดจากตั๋ว (DB-first)
    const totalTicketQuantity = (typeof ticketData?.pass_quantity === 'number' && ticketData?.pass_quantity !== null)
      ? ticketData.pass_quantity
      : (ticketData?.quantity || 0);
    
    if (totalTicketQuantity === 0) {
      // ถ้าไม่มีข้อมูลตั๋ว ให้ใช้วิธีเดิม
      const passItems = checkedItems.filter(item => item.pass === true);
      const failItems = checkedItems.filter(item => item.pass === false);
      
      const passQuantity = passItems.reduce((sum, item) => sum + (parseInt(item.qty) || 1), 0);
      const failQuantity = failItems.reduce((sum, item) => sum + (parseInt(item.qty) || 1), 0);
      const totalQuantity = passQuantity + failQuantity;
      const passRate = totalQuantity > 0 ? Math.round((passQuantity / totalQuantity) * 100) : 0;

      return { passQuantity, failQuantity, totalQuantity, passRate };
    }

    // คำนวณใหม่: ผ่านไม่ต้องใส่จำนวน, ไม่ผ่านต้องใส่จำนวน แล้วนำมาลบกับจำนวนเต็ม
    const failItems = checkedItems.filter(item => item.pass === false);
    
    // สรุปจำนวนชิ้นงานที่ไม่ผ่านจาก qty ที่กรอก
    const failQuantity = failItems.reduce((sum, item) => sum + (parseInt(item.qty) || 0), 0);
    
    // จำนวนชิ้นงานที่ผ่าน = จำนวนเต็ม - จำนวนไม่ผ่าน
    const passQuantity = totalTicketQuantity - failQuantity;
    
    // อัตราการผ่าน
    const passRate = totalTicketQuantity > 0 ? Math.round((passQuantity / totalTicketQuantity) * 100) : 0;
    
    return { 
      passQuantity, 
      failQuantity, 
      totalQuantity: totalTicketQuantity, 
      passRate 
    };
  };

  const saveForm = async () => {
    // Validation: ตรวจสอบว่ามีการติ๊กอย่างน้อย 1 รายการ
    const allItems = Object.values(checklistItems).flat();
    const checkedItems = allItems.filter(item => item.pass !== null);
    
    if (checkedItems.length === 0) {
      alert(language === 'th' ? 'กรุณาตรวจสอบอย่างน้อย 1 รายการ' : 'Please check at least 1 item');
      return;
    }
    
    // Validation: ตรวจสอบว่ามีการกรอกข้อมูลแต่ยังไม่ได้ติ๊ก
    const itemsWithDataButNoCheck = allItems.filter(item => 
      item.pass === null && 
      ((item.qty && item.qty.trim() !== '' && item.qty !== '0') || (item.reason && item.reason.trim() !== ''))
    );
    
    if (itemsWithDataButNoCheck.length > 0) {
      alert(language === 'th' ? 'กรุณาเลือกผ่าน/ไม่ผ่านสำหรับรายการที่กรอกข้อมูลไว้' : 'Please select pass/fail for items you have entered data');
      return;
    }
    
    // Validation: ถ้าไม่ผ่านต้องมี reason และ qty
    const failedItemsWithoutReason = allItems.filter(item => item.pass === false && !item.reason.trim());
    if (failedItemsWithoutReason.length > 0) {
      alert(language === 'th' ? 'กรุณากรอกสาเหตุสำหรับรายการที่ไม่ผ่าน' : 'Please provide reasons for failed items');
      return;
    }
    
    const failedItemsWithoutQty = allItems.filter(item => item.pass === false && (!item.qty || item.qty === '0'));
    if (failedItemsWithoutQty.length > 0) {
      alert(language === 'th' ? 'กรุณากรอกจำนวนสำหรับรายการที่ไม่ผ่าน' : 'Please provide quantity for failed items');
      return;
    }

    // คำนวณผลลัพธ์ QC
    const qcResults = calculateQCResults();
    
    // Rework flow removed: always proceed to save QC session

    try {
      if (othersEditing) {
        showToast(language === 'th' ? 'มีผู้ใช้อื่นกำลังแก้ไขอยู่ กรุณารอสักครู่' : 'Someone else is editing. Please wait.', 'warning');
        return;
      }
      setSaving(true);
      
      const inspectorName = (user?.name || user?.email || "").trim();
      const inspectedDate = new Date().toISOString().split('T')[0];

      const payload = {
        formType: 'main_qc',
        header: {
          inspector: inspectorName,
          inspector_id: user?.id || null,
          inspectedDate,
          remark: `QC Form for ticket ${id}`
        },
        categories: {
          'วงกบ': checklistItems.frame.reduce((acc, item) => {
            if (item.pass !== null) {
              acc[item.name] = {
                pass: item.pass,
                qty: item.qty,
                reason: item.reason
              };
            }
            return acc;
          }, {}),
          'ประตู': checklistItems.door.reduce((acc, item) => {
            if (item.pass !== null) {
              acc[item.name] = {
                pass: item.pass,
                qty: item.qty,
                reason: item.reason
              };
            }
            return acc;
          }, {}),
          'สี': checklistItems.paint.reduce((acc, item) => {
            if (item.pass !== null) {
              acc[item.name] = {
                pass: item.pass,
                qty: item.qty,
                reason: item.reason
              };
            }
            return acc;
          }, {}),
          'เจาะอุปกรณ์': checklistItems.drilling.reduce((acc, item) => {
            if (item.pass !== null) {
              acc[item.name] = {
                pass: item.pass,
                qty: item.qty,
                reason: item.reason
              };
            }
            return acc;
          }, {})
        },
        // เพิ่ม passQuantity และ failQuantity เพื่ออัปเดต quantity
        passQuantity: Number(qcResults.passQuantity || 0),
        failQuantity: Number(qcResults.failQuantity || 0)
      };

      console.log('=== QC Form Debug ===');
      console.log('Payload:', payload);
      console.log('Checklist Items:', checklistItems);

      const resp = await fetch(`/api/tickets/${encodeURIComponent(id)}/qc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log('=== QC API Response ===');
      console.log('Response Status:', resp.status);
      console.log('Response OK:', resp.ok);

      if (resp.ok) {
        const responseData = await resp.json();
        console.log('Response Data:', responseData);
        try { localStorage.removeItem(storageKey); } catch {}
        showToast(language === 'th' ? 'บันทึกสำเร็จ' : 'Saved', 'success');
        // กลับไปหน้า QC หลักอัตโนมัติหลังบันทึกสำเร็จ
        router.replace('/qc');
        return;
      } else {
        const json = await resp.json().catch(() => ({}));
        console.log('Error Response:', json);
        showToast(`Save failed: ${json?.error || resp.status}`, 'error', 4000);
      }
    } catch (e) {
      console.error('=== QC Form Error ===');
      console.error('Error:', e);
      console.error('Error Message:', e.message);
      console.error('Error Stack:', e.stack);
      showToast(`Save failed: ${e.message}`, 'error', 4000);
    } finally {
      setSaving(false);
    }
  };

  // Rework order creation removed

  // จัดการการบันทึกแบบผ่านทั้งหมด
  const handlePassAll = async () => {
    try {
      setSaving(true);
      
      const inspectorName = (user?.name || user?.email || "").trim();
      const inspectedDate = new Date().toISOString().split('T')[0];

      const payload = {
        formType: 'main_qc',
        header: {
          inspector: inspectorName,
          inspectedDate,
          remark: `QC Form for ticket ${id}`
        },
        categories: {
          'วงกบ': checklistItems.frame.reduce((acc, item) => {
            if (item.pass !== null) {
              acc[item.name] = {
                pass: item.pass,
                qty: item.qty,
                reason: item.reason
              };
            }
            return acc;
          }, {}),
          'ประตู': checklistItems.door.reduce((acc, item) => {
            if (item.pass !== null) {
              acc[item.name] = {
                pass: item.pass,
                qty: item.qty,
                reason: item.reason
              };
            }
            return acc;
          }, {}),
          'สี': checklistItems.paint.reduce((acc, item) => {
            if (item.pass !== null) {
              acc[item.name] = {
                pass: item.pass,
                qty: item.qty,
                reason: item.reason
              };
            }
            return acc;
          }, {}),
          'เจาะอุปกรณ์': checklistItems.drilling.reduce((acc, item) => {
            if (item.pass !== null) {
              acc[item.name] = {
                pass: item.pass,
                qty: item.qty,
                reason: item.reason
              };
            }
            return acc;
          }, {})
        }
      };

      const resp = await fetch(`/api/tickets/${encodeURIComponent(id)}/qc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        const responseData = await resp.json();
        console.log('Response Data:', responseData);
        try { localStorage.removeItem(storageKey); } catch {}
        // กลับไปหน้า QC หลักอัตโนมัติหลังบันทึกสำเร็จ
        router.replace('/qc');
        return;
      } else {
        const json = await resp.json().catch(() => ({}));
        console.log('Error Response:', json);
        alert(`Save failed: ${json?.error || resp.status}`);
      }
    } catch (e) {
      console.error('=== QC Form Error ===');
      console.error('Error:', e);
      console.error('Error Message:', e.message);
      console.error('Error Stack:', e.stack);
      alert(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const clearForm = () => {
    if (confirm(language === 'th' ? 'ล้างฟอร์มทั้งหมด?' : 'Clear all form data?')) {
      setChecklistItems({
        frame: [
          { id: 1, name: "วัสดุตรงตามแบบ", pass: null, qty: "", reason: "" },
          { id: 2, name: "ขนาด", pass: null, qty: "", reason: "" },
          { id: 3, name: "ระยะบังใบ", pass: null, qty: "", reason: "" },
          { id: 4, name: "ตรงตามแบบ", pass: null, qty: "", reason: "" }
        ],
        door: [
          { id: 5, name: "วัสดุตรงตามแบบ", pass: null, qty: "", reason: "" },
          { id: 6, name: "ขนาด", pass: null, qty: "", reason: "" },
          { id: 7, name: "รูปแบบตรงตามแบบ", pass: null, qty: "", reason: "" },
          { id: 8, name: "ประตูไม่บิด โก่ง หรือ ห่อ", pass: null, qty: "", reason: "" },
          { id: 9, name: "แผ่นหน้าไม่หลุดจากโครงประตู", pass: null, qty: "", reason: "" },
          { id: 10, name: "แผ่นหน้าไม่เป็นคลื่น หรือมีรอยอื่นๆ", pass: null, qty: "", reason: "" },
          { id: 16, name: "ตรวจสอบโครง", pass: null, qty: "", reason: "" }
        ],
        paint: [
          { id: 11, name: "สีถูกต้องตามแบบ", pass: null, qty: "", reason: "" },
          { id: 12, name: "คุณภาพหลักการทำสี", pass: null, qty: "", reason: "" }
        ],
        drilling: [
          { id: 13, name: "ระยะเจาะตรงตามแบบ", pass: null, qty: "", reason: "" },
          { id: 14, name: "คุณภาพหลังการเจาะ", pass: null, qty: "", reason: "" },
          { id: 15, name: "รูปแบบการเปิดถูกต้องตามแบบ", pass: null, qty: "", reason: "" }
        ]
      });
      try { localStorage.removeItem(storageKey); } catch {}
    }
  };

  const renderCategory = (categoryKey, categoryName, items) => (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
        {categoryName}
        {categoryKey === 'door' && (
          <Link 
            href={`/qc/${id}/structure`} 
            className="ml-4 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
          >
            {language === 'th' ? 'ตรวจสอบโครง' : 'Inspect Structure'}
          </Link>
        )}
      </h3>
      
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-300 dark:border-slate-600">
          <thead className="bg-gray-50 dark:bg-slate-700">
            <tr>
              <th className="px-3 py-2 border text-left text-sm font-medium">รายการ</th>
              <th className="px-3 py-2 border text-center text-sm font-medium">ผ่าน</th>
              <th className="px-3 py-2 border text-center text-sm font-medium">ไม่ผ่าน</th>
              <th className="px-3 py-2 border text-center text-sm font-medium">จำนวน</th>
              <th className="px-3 py-2 border text-center text-sm font-medium">สาเหตุ</th>
              <th className="px-3 py-2 border text-center text-sm font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                <td className="px-3 py-2 border">
                  {item.name ? (
                    <span className="text-sm">{item.name}</span>
                  ) : (
                    <input
                      type="text"
                      className="w-full px-2 py-1 text-sm border rounded"
                      placeholder={language === 'th' ? 'กรอกรายการอื่นๆ' : 'Enter custom item'}
                      value={item.name}
                      onChange={e => updateItem(categoryKey, item.id, 'name', e.target.value)}
                      disabled={!qcStarted}
                    />
                  )}
                </td>
                <td className="px-3 py-2 border text-center">
                  <input
                    type="radio"
                    name={`pass_${item.id}`}
                    checked={item.pass === true}
                    onChange={() => {
                      updateItem(categoryKey, item.id, 'pass', true);
                      // ล้าง qty และ reason เมื่อเปลี่ยนเป็น "ผ่าน"
                      if (item.qty || item.reason) {
                        updateItem(categoryKey, item.id, 'qty', '');
                        updateItem(categoryKey, item.id, 'reason', '');
                      }
                    }}
                    className="w-4 h-4"
                    disabled={!qcStarted}
                  />
                </td>
                <td className="px-3 py-2 border text-center">
                  <input
                    type="radio"
                    name={`pass_${item.id}`}
                    checked={item.pass === false}
                    onChange={() => {
                      // set fail and default qty=1 if empty
                      updateItem(categoryKey, item.id, 'pass', false);
                      if (!item.qty || String(item.qty).trim() === '' || String(item.qty) === '0') {
                        updateItem(categoryKey, item.id, 'qty', '1');
                      }
                    }}
                    className="w-4 h-4"
                    disabled={!qcStarted}
                  />
                </td>
                <td className="px-3 py-2 border">
                  <input
                    type="number"
                    className="w-full px-2 py-1 text-sm border rounded disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 dark:disabled:bg-slate-800 dark:disabled:text-gray-500"
                    value={item.qty}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') { updateItem(categoryKey, item.id, 'qty', ''); return; }
                      const n = Math.max(0, parseInt(raw, 10) || 0);
                      updateItem(categoryKey, item.id, 'qty', String(n));
                    }}
                    placeholder="0"
                    disabled={!qcStarted || item.pass !== false}
                    onWheel={(e) => { e.currentTarget.blur(); }}
                    min={0}
                    step={1}
                    inputMode="numeric"
                    onKeyDown={(e) => {
                      const blocked = ['e','E','+','-'];
                      if (blocked.includes(e.key)) e.preventDefault();
                    }}
                  />
                </td>
                <td className="px-3 py-2 border">
                  <input
                    type="text"
                    className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-amber-400/60 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 dark:disabled:bg-slate-800 dark:disabled:text-gray-500 ${item.pass === false && !item.reason ? 'border-amber-500 bg-amber-50 placeholder-amber-400' : ''}`}
                    value={item.reason}
                    onChange={e => updateItem(categoryKey, item.id, 'reason', e.target.value)}
                    placeholder={language === 'th' ? 'สาเหตุ' : 'Reason'}
                    disabled={!qcStarted || item.pass !== false}
                  />
                </td>
                <td className="px-3 py-2 border text-center">
                  {!item.name && (
                    <button
                      onClick={() => removeCustomItem(categoryKey, item.id)}
                      className="px-2 py-1 text-red-600 hover:bg-red-100 rounded text-sm"
                      disabled={!qcStarted}
                    >
                      ลบ
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <button
        onClick={() => addCustomItem(categoryKey)}
        className="mt-2 px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded text-sm"
        disabled={!qcStarted}
      >
        + {language === 'th' ? 'เพิ่มรายการอื่นๆ' : 'Add custom item'}
      </button>
    </div>
  );

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/qc">
        <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-gray-50 dark:bg-slate-900">
          <div className="max-w-6xl mx-auto">
            {/* Toast */}
            {toast.open && (
              <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-md shadow ${
                toast.type === 'success' ? 'bg-emerald-600 text-white' :
                toast.type === 'error' ? 'bg-red-600 text-white' :
                toast.type === 'warning' ? 'bg-yellow-500 text-black' : 'bg-slate-700 text-white'
              }`}>
                {toast.message}
              </div>
            )}

            {/* Presence warning */}
            {othersEditing && (
              <div className="mb-3 p-3 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm">
                {language === 'th' ? 'มีผู้ใช้อื่นกำลังเปิดฟอร์มนี้: ' : 'Other editors: '} {collaborators.map(c => c.name || 'user').join(', ')}
              </div>
            )}

            {/* Document summary & report link */}
            {Array.isArray(history) && history.length > 0 && (
              <div className="mb-4 p-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{language === 'th' ? 'เอกสารการตรวจล่าสุด' : 'Latest QC Document'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(history[0]?.created_at || Date.now()).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const sid = history[0]?.id;
                        if (sid) window.open(`/qc/report/${encodeURIComponent(sid)}`, '_blank');
                      }}
                      className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                    >
                      {language === 'th' ? 'พิมพ์/บันทึก PDF' : 'Print/Save PDF'}
                    </button>
                    <button
                      onClick={() => {
                        const url = `/qc/history?ticket_no=${encodeURIComponent(id)}`;
                        window.open(url, '_blank');
                      }}
                      className="px-3 py-1.5 rounded-md border bg-white dark:bg-slate-800 dark:border-slate-700 text-sm"
                    >
                      {language === 'th' ? 'ประวัติการตรวจทั้งหมด' : 'All QC History'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Ticket Not Found Message */}
            {ticketNotFound && (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 mb-6 border border-red-200 dark:border-red-800 mt-8">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {language === 'th' ? 'ไม่พบตั๋ว' : 'Ticket Not Found'}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    {language === 'th' 
                      ? `ไม่พบตั๋วหมายเลข ${id} ในระบบ อาจถูกลบหรือไม่มีอยู่แล้ว` 
                      : `Ticket number ${id} was not found in the system. It may have been deleted or does not exist.`}
                  </p>
                  <Link
                    href="/qc"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    {language === 'th' ? 'กลับไปหน้า QC' : 'Back to QC Page'}
                  </Link>
                </div>
              </div>
            )}

            {/* Loading State */}
            {ticketLoading && !ticketNotFound && (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 mb-6">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">
                    {language === 'th' ? 'กำลังโหลดข้อมูลตั๋ว...' : 'Loading ticket data...'}
                  </p>
                </div>
              </div>
            )}

            {/* Main Content - Only show if ticket found */}
            {!ticketNotFound && !ticketLoading && (
            <>
            {/* Header */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <Link 
                  href="/qc" 
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {language === 'th' ? 'ย้อนกลับ' : 'Back'}
                </Link>
              </div>
              <h1 className="text-xl font-bold text-center mb-4 text-gray-800 dark:text-gray-200">
                เอกสารตรวจสอบคุณภาพระหว่างการผลิต/คุณภาพผลิตภัณฑ์
              </h1>
              <div className="text-center text-gray-600 dark:text-gray-400">
                <p className="text-lg font-medium">ตั๋ว #{id}</p>
                {ticketData && (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm">
                      <span className="font-medium">จำนวนที่ต้องผลิต:</span> 
                      <span className="ml-2 text-blue-600 dark:text-blue-400 font-semibold">
                        {(((typeof ticketData?.pass_quantity === 'number' && ticketData?.pass_quantity !== null) ? ticketData.pass_quantity : (ticketData?.quantity || 0)) || 0).toLocaleString()} ชิ้น
                      </span>
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">รายการ:</span> 
                      <span className="ml-2">{ticketData?.description || '-'}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* QC Start Button (hide when QC already completed) */}
            {!qcStarted && !qcCompleted && (
              <div className="relative overflow-hidden rounded-2xl p-6 mb-6 border dark:border-slate-700/60 shadow-sm bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/10 dark:to-yellow-900/10">
                {/* subtle grid pattern */}
                <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(theme(colors.yellow.500)_0.5px,transparent_0.5px)] [background-size:16px_16px]" />
                <div className="relative z-10 grid gap-4 md:grid-cols-[1fr_auto] items-center">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 rounded-xl bg-yellow-200/70 dark:bg-yellow-300/20 flex items-center justify-center text-yellow-700 dark:text-yellow-300">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-base md:text-lg font-semibold text-gray-800 dark:text-gray-100">
                        {language === 'th' ? 'ฟอร์มถูกล็อค' : 'Form is locked'}
                      </h3>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {language === 'th' ? 'กดปุ่มเพื่อเริ่มการตรวจสอบ QC ระบบจะอัปเดตสถานะเป็นกำลังดำเนินการ' : 'Press start to begin QC. Status will switch to in progress.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex md:justify-end">
                    <button
                      onClick={startQC}
                      disabled={startingQc}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors shadow-sm"
                    >
                      {startingQc ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          {language === 'th' ? 'กำลังเริ่ม...' : 'Starting...'}
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m-6-8h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2z" />
                          </svg>
                          {language === 'th' ? 'เริ่ม QC' : 'Start QC'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Readonly banner when QC completed */}
            {qcCompleted && (
              <div className="mb-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 px-4 py-3 text-sm">
                {language === 'th' ? 'ตั๋วนี้ตรวจ QC เสร็จแล้ว ข้อมูลถูกล็อค' : 'QC for this ticket is completed. Form is read-only.'}
              </div>
            )}

            {/* QC Results Summary */}
            {qcStarted && !qcCompleted && (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">
                  สรุปผลการตรวจสอบ QC
                </h3>
                {(() => {
                  const results = calculateQCResults();
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {results.totalQuantity.toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">จำนวนทั้งหมด</div>
                      </div>
                      <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {results.passQuantity.toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">ผ่าน QC</div>
                      </div>
                      <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                          {results.failQuantity.toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">ไม่ผ่าน QC</div>
                      </div>
                      <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                        <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                          {results.passRate}%
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">อัตราการผ่าน</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Form */}
            <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 ${(!qcStarted || qcCompleted) ? 'opacity-50 pointer-events-none' : ''}`}>
              {renderCategory('frame', 'หมวดวงกบ', checklistItems.frame)}
              {renderCategory('door', 'หมวดประตู', checklistItems.door)}
              {renderCategory('paint', 'หมวดสี', checklistItems.paint)}
              {renderCategory('drilling', 'หมวดเจาะอุปกรณ์', checklistItems.drilling)}

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-slate-700">
                {/* Inspector/date removed: auto-filled from user and current date */}
                <div className="flex gap-3">
                  {!qcCompleted && (
                  <button
                    onClick={saveForm}
                    disabled={saving || !qcStarted || qcCompleted}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-md font-medium"
                  >
                    {saving ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (language === 'th' ? 'บันทึก' : 'Save')}
                  </button>
                  )}
                  {!qcCompleted && (
                  <button
                    onClick={clearForm}
                    className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md font-medium"
                    disabled={!qcStarted || qcCompleted}
                  >
                    {language === 'th' ? 'ล้างฟอร์ม' : 'Clear Form'}
                  </button>
                  )}
                </div>
              </div>
            </div>

            {/* History - redesigned component only (remove duplicate table) */}
            <div className="mt-8">
              <QCHistoryLog ticketNo={id} />
            </div>
            </>
            )}
          </div>
        </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}