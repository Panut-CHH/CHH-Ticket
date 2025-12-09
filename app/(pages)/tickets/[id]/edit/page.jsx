"use client";

import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { GripVertical, Save, Plus, Trash2, User, DollarSign, Calendar, ChevronDown, ArrowLeft, FileText, Info, Loader, Settings } from "lucide-react";
import Modal from "@/components/Modal";
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useEffect as useClientEffect } from "react";
import { getRoleDisplayName, getAllAvailableRoles } from "@/utils/rolePermissions";

export default function EditTicketPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const ticketId = params?.id;

  const [stations, setStations] = useState([]);
  const [priority, setPriority] = useState("Medium Priority");
  const [customerName, setCustomerName] = useState(""); // เพิ่มฟิลด์ชื่อลูกค้า
  const [technicians, setTechnicians] = useState([]);
  const [loadingTechs, setLoadingTechs] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Load available stations from database
  const [availableStations, setAvailableStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [showNewStationModal, setShowNewStationModal] = useState(false);
  const [newStationName, setNewStationName] = useState("");
  const [creatingStation, setCreatingStation] = useState(false);
  
  // Allowed roles modal state
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedStationForRole, setSelectedStationForRole] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [savingRoles, setSavingRoles] = useState(false);
  
  // ดึงข้อมูล ERP ตาม ticketId (RPD No.) จาก API ภายใน
  const [ticketData, setTicketData] = useState(null);
  const [ticketView, setTicketView] = useState(null); // normalized for UI
  const [projectData, setProjectData] = useState(null);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [loadingTicket, setLoadingTicket] = useState(true);
  const [errorTicket, setErrorTicket] = useState("");
  // BOM state
  const [bom, setBom] = useState([{ material_name: '', quantity: '', unit: 'PCS' }]);
  const [loadingBom, setLoadingBom] = useState(false);

  useClientEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoadingTicket(true);
        setErrorTicket("");
        if (!ticketId) return;
        
        // ลองหาด้วย RPD No. ก่อน
        let ticket = null;
        let error = null;
        
        // 1. ลองหาด้วย RPD No. (no field)
        const { data: ticketByRpd, error: rpdError } = await supabase
          .from('ticket')
          .select(`
            *,
            projects (
              id, item_code, project_number, project_name
            )
          `)
          .eq('no', ticketId)
          .maybeSingle();
        
        if (!rpdError && ticketByRpd) {
          ticket = ticketByRpd;
        } else {
          // 2. ถ้าไม่เจอ ลองหาด้วย project_number
          const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, item_code, project_number, project_name')
            .eq('project_number', ticketId)
            .maybeSingle();
          
          if (!projectError && project) {
            // หา ticket ที่เกี่ยวข้องกับ project นี้
            const { data: ticketByProject, error: ticketError } = await supabase
              .from('ticket')
              .select(`
                *,
                projects (
                  id, item_code, project_number, project_name
                )
              `)
              .eq('project_id', project.id)
              .maybeSingle();
            
            if (!ticketError && ticketByProject) {
              ticket = ticketByProject;
            } else {
              // สร้าง ticket จำลองจาก project data
              ticket = {
                no: ticketId,
                project_id: project.id,
                source_no: project.item_code,
                description: project.project_name,
                quantity: 0,
                status: 'Pending',
                priority: 'Medium',
                customer_name: '',
                due_date: null,
                projects: project
              };
            }
          }
        }
        
        if (!ticket) {
          // Fallback: ลองดึงจาก ERP โดยใช้ RPD No. แล้ว map ผ่าน project_items/projects
          try {
            let authHeader = {};
            try {
              const { data: { session: currentSession } } = await supabase.auth.getSession();
              if (currentSession?.access_token) {
                authHeader = { Authorization: `Bearer ${currentSession.access_token}` };
              }
            } catch {}
            
            const resp = await fetch('/api/erp/production-orders/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeader },
              body: JSON.stringify({ rpdNumbers: [ticketId] })
            });
            
            if (resp.ok) {
              const json = await resp.json();
              const first = Array.isArray(json?.data) ? json.data[0] : null;
              const erpRecord = first?.data || null;
              
              const rpdNo = ticketId;
              const sourceNo = erpRecord?.Source_No || erpRecord?.Item_No || erpRecord?.itemCode || null;
              const description = erpRecord?.Description || null;
              const qty = Number(erpRecord?.Quantity || 0);
              const due = erpRecord?.Due_Date || erpRecord?.Delivery_Date || erpRecord?.Ending_Date || null;
              
              if (sourceNo) {
                // หา project จาก projects.item_code
                let project = null;
                const { data: projectDirect } = await supabase
                  .from('projects')
                  .select('id, item_code, project_number, project_name')
                  .eq('item_code', sourceNo)
                  .maybeSingle();
                
                if (projectDirect) {
                  project = projectDirect;
                } else {
                  // หา project ผ่าน project_items
                  const { data: projectItem } = await supabase
                    .from('project_items')
                    .select('project_id')
                    .eq('item_code', sourceNo)
                    .maybeSingle();
                  
                  if (projectItem?.project_id) {
                    const { data: projById } = await supabase
                      .from('projects')
                      .select('id, item_code, project_number, project_name')
                      .eq('id', projectItem.project_id)
                      .maybeSingle();
                    if (projById) project = projById;
                  }
                }
                
                if (project) {
                  ticket = {
                    no: rpdNo,
                    project_id: project.id,
                    source_no: sourceNo,
                    description: description,
                    quantity: qty,
                    status: 'Pending',
                    priority: 'Medium',
                    customer_name: '',
                    due_date: due,
                    projects: project
                  };
                }
              }
            }
          } catch {}
        }
        
        if (!ticket) {
          throw new Error(`Ticket or project not found: ${ticketId}`);
        }
        
        if (active) {
          setTicketData(ticket);
          setTicketView({
            id: ticket.no,
            title: ticket.description || `Ticket ${ticket.no}`,
            rpd: ticket.no,
            itemCode: ticket.source_no,
            projectCode: ticket.projects?.item_code,
            projectName: ticket.projects?.project_name,
            quantity: ticket.quantity || 0,
            dueDate: ticket.due_date || "",
            description: ticket.description || "",
            description2: ticket.description_2 || "",
            // ชื่อลูกค้าให้ดึงจากชื่อโปรเจ็คเสมอ
            customerName: ticket?.projects?.project_name || "",
            priority: ticket.priority || "Medium",
            status: ticket.status || "Pending"
          });
          // โหลดข้อมูลโปรเจ็คที่เกี่ยวข้อง
          if (ticket.source_no) {
            await loadProjectData(ticket.source_no);
          }
        }
      } catch (e) {
        console.error(e);
        if (active) setErrorTicket(e?.message || 'Failed to load ticket');
      } finally {
        if (active) setLoadingTicket(false);
      }
    };
    load();
    return () => { active = false; };
  }, [ticketId]);

  // Load BOM items for this ticket
  useEffect(() => {
    let active = true;
    async function loadBom() {
      if (!ticketId) return;
      try {
        setLoadingBom(true);
        let authHeader = {};
        try {
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (currentSession?.access_token) {
            authHeader = { Authorization: `Bearer ${currentSession.access_token}` };
          }
        } catch {}
        const resp = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/bom`, { headers: { ...authHeader } });
        if (resp.ok) {
          const json = await resp.json();
          const rows = Array.isArray(json?.data) ? json.data : [];
          if (active) {
            if (rows.length > 0) {
              // ถ้ามีข้อมูลใน database ให้ใช้ข้อมูลนั้น (มี priority สูงกว่า localStorage)
              const dbBom = rows.map(r => ({ material_name: r.material_name || '', quantity: Number(r.quantity) || '', unit: r.unit || 'PCS' }));
              setBom(dbBom);
              // ลบข้อมูลจาก localStorage เพราะข้อมูลใน database มี priority สูงกว่า
              try {
                localStorage.removeItem(`ticket_${ticketId}_bom`);
                console.log('[LOCALSTORAGE] Removed BOM from localStorage (using database data)');
              } catch (e) {
                console.warn('[LOCALSTORAGE] Failed to remove BOM from localStorage:', e);
              }
            } else {
              // ไม่มีข้อมูลใน database - ใช้ข้อมูลจาก localStorage (ถ้ามี) หรือค่าเริ่มต้น
              const savedBom = localStorage.getItem(`ticket_${ticketId}_bom`);
              if (savedBom) {
                try {
                  const parsed = JSON.parse(savedBom);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    setBom(parsed);
                    console.log('[LOCALSTORAGE] Using BOM from localStorage');
                    return;
                  }
                } catch (e) {
                  console.warn('[LOCALSTORAGE] Failed to parse saved BOM:', e);
                }
              }
              setBom([{ material_name: '', quantity: '', unit: 'PCS' }]);
            }
          }
        }
      } catch {}
      finally { if (active) setLoadingBom(false); }
    }
    loadBom();
    return () => { active = false; };
  }, [ticketId]);

  // โหลดข้อมูลโปรเจ็คที่เกี่ยวข้องกับ item_code (ใช้ระบบใหม่เหมือนหน้า production)
  const loadProjectData = async (itemCode) => {
    try {
      if (!itemCode) {
        console.log('[TICKET EDIT] No itemCode provided, skipping project data load');
        return;
      }
      
      console.log('[TICKET EDIT] Loading project data for itemCode:', itemCode);
      
      // First get project_item_id from project_items table
      const { data: projectItemData, error: projectItemError } = await supabase
        .from('project_items')
        .select('id')
        .eq('item_code', itemCode)
        .single();
      
      console.log('[TICKET EDIT] Project item data:', projectItemData, 'Error:', projectItemError);
      
      if (!projectItemError && projectItemData) {
        // Then get file from project_files table
        const { data: projectFileData, error: projectFileError } = await supabase
          .from('project_files')
          .select('file_name, file_url, file_path, uploaded_at, file_size, file_type')
          .eq('project_item_id', projectItemData.id)
          .eq('is_current', true)
          .maybeSingle();
        
        console.log('[TICKET EDIT] Project file data:', projectFileData, 'Error:', projectFileError);
        
        if (!projectFileError && projectFileData) {
          setProjectData(projectFileData);
          console.log('[TICKET EDIT] ✅ Project data loaded successfully');
        } else {
          console.log('[TICKET EDIT] ❌ No project file found');
        }
      } else {
        console.log('[TICKET EDIT] ❌ No project item found for itemCode:', itemCode);
      }
    } catch (err) {
      console.error('Error loading project data:', err);
    }
  };

  // โหลดข้อมูลจาก localStorage เมื่อ component mount (ก่อนโหลดจาก database)
  // ใช้เฉพาะเมื่อยังไม่มีข้อมูลใน database
  useEffect(() => {
    if (!ticketId) return;
    
    // โหลด stations จาก localStorage เฉพาะตอน initial load (ก่อนโหลดจาก database)
    // ข้อมูลจาก database จะมี priority สูงกว่าและจะ override ข้อมูลนี้
    try {
      const savedStations = localStorage.getItem(`ticket_${ticketId}_stations`);
      if (savedStations) {
        try {
          const parsed = JSON.parse(savedStations);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log('[LOCALSTORAGE] Loaded stations from localStorage (initial load):', parsed);
            setStations(parsed);
          }
        } catch (e) {
          console.warn('[LOCALSTORAGE] Failed to parse saved stations:', e);
        }
      }
    } catch (err) {
      console.warn('[LOCALSTORAGE] Error loading stations from localStorage:', err);
    }
  }, [ticketId]); // รันเฉพาะเมื่อ ticketId เปลี่ยน (initial load)

  // บันทึก stations ลง localStorage เมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    if (!ticketId || stations.length === 0) return;
    
    try {
      localStorage.setItem(`ticket_${ticketId}_stations`, JSON.stringify(stations));
      console.log('[LOCALSTORAGE] Saved stations to localStorage');
    } catch (err) {
      console.warn('[LOCALSTORAGE] Error saving stations to localStorage:', err);
    }
  }, [stations, ticketId]);

  // บันทึก BOM ลง localStorage เมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    if (!ticketId) return;
    
    try {
      // บันทึกเฉพาะเมื่อมีข้อมูล (ไม่ใช่แค่ empty array)
      const hasData = bom.some(item => 
        (item.material_name && item.material_name.trim() !== '') || 
        (item.quantity && item.quantity !== '')
      );
      
      if (hasData || bom.length > 1) {
        localStorage.setItem(`ticket_${ticketId}_bom`, JSON.stringify(bom));
        console.log('[LOCALSTORAGE] Saved BOM to localStorage');
      }
    } catch (err) {
      console.warn('[LOCALSTORAGE] Error saving BOM to localStorage:', err);
    }
  }, [bom, ticketId]);

  // ตั้งค่า priority และ customerName เริ่มต้นจากข้อมูลตั๋ว และโหลดข้อมูลจาก Supabase
  useEffect(() => {
    if (ticketView && ticketId) {
      loadTicketFromDatabase();
    }
  }, [ticketView, ticketId]);

  // Populate labor prices when stations and availableStations are ready
  useEffect(() => {
    if (ticketView?.itemCode && stations.length > 0 && availableStations.length > 0 && !loadingStations) {
      // Check if there are any "อัดบาน" or "สี" stations without prices
      const pressStation = availableStations.find(s => s.name_th === 'อัดบาน');
      const paintStation = availableStations.find(s => s.name_th === 'สี');
      const hasPressOrPaintWithoutPrice = stations.some(s => {
        const isPress = pressStation && s.name === 'อัดบาน';
        const isPaint = paintStation && s.name === 'สี';
        return (isPress || isPaint) && (!s.price || s.price === '' || s.price === null);
      });
      
      if (hasPressOrPaintWithoutPrice) {
        // Use a small delay to avoid multiple calls when stations array changes rapidly
        const timeoutId = setTimeout(() => {
          populateLaborPricesFromDatabase(stations, ticketView.itemCode);
        }, 300);
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [ticketView?.itemCode, stations.length, availableStations.length, loadingStations]);

  const loadTicketFromDatabase = async () => {
    try {
      // โหลดข้อมูล ticket แบบง่ายก่อน (ไม่ join ซับซ้อน)
      const { data: ticketData, error } = await supabase
        .from('ticket')
        .select('*')
        .eq('no', ticketId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = not found, ซึ่งไม่ถือเป็น error
        console.error('Error loading ticket from database:', error);
      }

      let hasStationFlows = false;

      if (ticketData) {
        // มีข้อมูลใน database - ใช้ข้อมูลจาก database
        const dbPriority = ticketData.priority === "High" ? "High Priority" 
          : ticketData.priority === "Low" ? "Low Priority" 
          : "Medium Priority";
        setPriority(dbPriority);
        // ตั้งชื่อลูกค้าจากชื่อโปรเจ็ค (ผ่าน ticketView ที่มี projectName อยู่แล้ว)
        setCustomerName(ticketView?.projectName || ticketData.customer_name || "");

        // โหลด station flows แยกต่างหาก
        try {
          // Query with join, but fallback to simpler query if join fails
          let stationFlows = null;
          {
            const { data, error } = await supabase
              .from('ticket_station_flow')
              .select(`
                *,
                stations (
                  name_th,
                  code
                )
              `)
              .eq('ticket_no', ticketId)
              .order('step_order', { ascending: true });

            if (error) {
              console.warn('Join query failed for ticket flows, fallback:', error?.message || error);
              const { data: fallback, error: fallbackError } = await supabase
                .from('ticket_station_flow')
                .select(`
                  *,
                  stations (
                    name_th,
                    code
                  )
                `)
                .eq('ticket_no', ticketId)
                .order('step_order', { ascending: true });
              if (fallbackError) {
                console.log('No station flows found for this ticket:', fallbackError.message);
                // ไม่ return ออกไป ให้ไปเช็ค localStorage แทน
              } else {
                stationFlows = fallback;
              }
            } else {
              stationFlows = data;
            }
          }

          if (stationFlows && stationFlows.length > 0) {
            // Load assignments separately since join might fail
            let assignments = [];
            try {
              // Use simple query without join first
              const { data: simpleData, error: simpleError } = await supabase
                .from('ticket_assignments')
                .select('station_id, technician_id')
                .eq('ticket_no', ticketId);
              
              console.log('Simple assignment query result:', simpleData, simpleError);
              
              if (simpleData && simpleData.length > 0) {
                // Get technician names separately
                const technicianIds = [...new Set(simpleData.map(a => a.technician_id))];
                console.log('Technician IDs to fetch:', technicianIds);
                
                const { data: userData, error: userError } = await supabase
                  .from('users')
                  .select('id, name')
                  .in('id', technicianIds);
                
                console.log('User data query result:', userData, userError);
                
                // Merge data
                assignments = simpleData.map(assignment => ({
                  ...assignment,
                  users: userData?.find(u => u.id === assignment.technician_id) || null
                }));
                
                console.log('Final assignments after merge:', assignments);
              }
            } catch (err) {
              console.warn('Failed to load assignments separately:', err.message);
            }

            // Create maps of station_id to technician id and name
            const technicianNameByStationId = {};
            const technicianIdByStationId = {};
            assignments.forEach(assignment => {
              technicianNameByStationId[assignment.station_id] = assignment.users?.name || '';
              technicianIdByStationId[assignment.station_id] = assignment.technician_id || '';
            });
            
            console.log('Loaded assignments for ticket:', ticketId, assignments);
            console.log('Technician name map:', technicianNameByStationId);
            console.log('Technician id map:', technicianIdByStationId);

            const toLocalInput = (iso) => {
              if (!iso) return "";
              try {
                const d = new Date(iso);
                if (isNaN(d.getTime())) return "";
                const pad = (n) => String(n).padStart(2, '0');
                const yyyy = d.getFullYear();
                const mm = pad(d.getMonth() + 1);
                const dd = pad(d.getDate());
                const hh = pad(d.getHours());
                const mi = pad(d.getMinutes());
                return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
              } catch { return ""; }
            };

            const dbStations = stationFlows.map((flow, idx) => ({
              id: String(idx + 1),
              name: flow.stations?.name_th || "",
              technician: technicianNameByStationId[flow.station_id] || "",
              technicianId: technicianIdByStationId[flow.station_id] || "",
              priceType: flow.price_type || "flat",
              price: flow.price || '',
              completionTime: toLocalInput(flow.completed_at) || "",
            }));
            
            console.log('Setting stations with data from database:', dbStations);
            // ถ้ามีข้อมูลใน database ให้ใช้ข้อมูลนั้น (มี priority สูงกว่า localStorage)
            // แต่ยังต้อง populate ราคาค่าแรงจากฐานข้อมูลถ้ายังไม่มีราคา
            await populateLaborPricesFromDatabase(dbStations, ticketView?.itemCode);
            setStations(dbStations);
            hasStationFlows = true;
            // ลบข้อมูลจาก localStorage เพราะข้อมูลใน database มี priority สูงกว่า
            try {
              localStorage.removeItem(`ticket_${ticketId}_stations`);
              console.log('[LOCALSTORAGE] Removed stations from localStorage (using database data)');
            } catch (e) {
              console.warn('[LOCALSTORAGE] Failed to remove stations from localStorage:', e);
            }
          }
        } catch (flowErr) {
          console.log('Error loading station flows:', flowErr.message);
          // ไม่มี station flows - ให้ใช้ข้อมูลจาก localStorage (ถ้ามี)
        }
      }

      // ถ้าไม่มี station flows ใน database ให้ลองโหลดจาก localStorage
      if (!hasStationFlows) {
        try {
          const savedStations = localStorage.getItem(`ticket_${ticketId}_stations`);
          if (savedStations) {
            try {
              const parsed = JSON.parse(savedStations);
              if (Array.isArray(parsed) && parsed.length > 0) {
                console.log('[LOCALSTORAGE] Loading stations from localStorage (no database data):', parsed);
                setStations(parsed);
                // Populate labor prices for stations from localStorage
                if (ticketView?.itemCode) {
                  await populateLaborPricesFromDatabase(parsed, ticketView.itemCode);
                }
              }
            } catch (e) {
              console.warn('[LOCALSTORAGE] Failed to parse saved stations:', e);
            }
          }
        } catch (err) {
          console.warn('[LOCALSTORAGE] Error loading stations from localStorage:', err);
        }
      }

      // ไม่มีข้อมูลทั้ง database ให้ตั้งค่าเริ่มต้นจาก ERP view
      // ถ้ามีข้อมูลใน localStorage จะถูกโหลดข้างบนแล้ว
      // แต่ยังต้อง populate ราคาค่าแรงจากฐานข้อมูล
      if (!hasStationFlows && ticketView?.itemCode && stations.length > 0) {
        await populateLaborPricesFromDatabase(stations, ticketView.itemCode);
      }

      // ถ้าไม่มีข้อมูลทั้ง database และ localStorage ให้ตั้งค่าเริ่มต้น
      if (!hasStationFlows && stations.length === 0) {
        const customerNameErp = ticketView?.customerName || "";
        setPriority("Medium Priority");
        setCustomerName(customerNameErp);
      }
    } catch (err) {
      console.error('Error in loadTicketFromDatabase:', err);
      // ตั้งค่าเริ่มต้นหากเกิดข้อผิดพลาด
      const customerNameErp = ticketView?.customerName || "";
      setPriority("Medium Priority");
      setCustomerName(customerNameErp);
    }
  };

  function normalizeErpRecord(rec, rpdNo) {
    if (!rec) return null;
    const itemCode = rec?.Item_No || rec?.Source_No || rec?.itemCode || rec?.Item_Code || rec?.Source_Item || "-";
    const projectCode = rec?.Shortcut_Dimension_2_Code || rec?.Project_Code || rec?.projectCode || rec?.Project || "-";
    const quantity = rec?.Quantity ?? rec?.quantity ?? 0;
    const dueDate = rec?.Delivery_Date || rec?.Ending_Date_Time || rec?.Ending_Date || rec?.Due_Date || "-";
    const status = rec?.Status || rec?.status || "-";
    const description = rec?.Description || rec?.description || "-";
    const description2 = rec?.Description_2 || rec?.description2 || "";
    const customerName = rec?.Customer_Name || rec?.customerName || "";
    return { rpd: rpdNo, itemCode, projectCode, quantity, dueDate, status, description, description2, customerName };
  }

  // เปิดไฟล์ preview
  const handlePreviewFile = () => {
    if (projectData?.file_url) {
      setShowFilePreview(true);
    }
  };

  // ปิดไฟล์ preview
  const handleClosePreview = () => {
    setShowFilePreview(false);
  };
  // Load technicians
  useEffect(() => {
    const fetchTechnicians = async () => {
      try {
        setLoadingTechs(true);
        const { data, error } = await supabase
          .from('users')
          .select('id, name, role, roles, status')
          .eq('status', 'active')
          .or('roles.ov.{Production,Painting,Packing},role.in.(Production,Painting,Packing)')
          .order('name', { ascending: true });
        if (error) {
          console.error('Failed to load technicians:', error);
          return;
        }
        setTechnicians(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load technicians:', err);
      } finally {
        setLoadingTechs(false);
      }
    };
    fetchTechnicians();
  }, []);

  // Load available stations from database
  useEffect(() => {
    loadAvailableStations();
  }, []);

  const loadAvailableStations = async () => {
    try {
      setLoadingStations(true);
      const { data, error } = await supabase
        .from('stations')
        .select('id, name_th, code, is_active, allowed_roles')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (error) {
        console.error('Failed to load stations:', error);
        return;
      }
      
      setAvailableStations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load stations:', err);
    } finally {
      setLoadingStations(false);
    }
  };

  // Populate labor prices from database for stations
  const populateLaborPricesFromDatabase = async (currentStations, itemCode) => {
    if (!itemCode || !currentStations || currentStations.length === 0) return;
    
    try {
      // ดึงราคาค่าแรงจากฐานข้อมูล
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/labor-prices`);
      const result = await response.json();
      
      if (!result.success || !result.data || result.data.length === 0) {
        console.log('[LABOR_PRICE] No labor prices found for item code:', itemCode);
        return;
      }
      
      // สร้าง map จาก station code ไปยัง price และ price_type
      const priceMap = new Map();
      result.data.forEach(priceData => {
        priceMap.set(priceData.station_code, {
          price: priceData.price,
          price_type: priceData.price_type
        });
      });
      
      // หา station codes สำหรับ "อัดบาน" และ "สี"
      const pressStation = availableStations.find(s => s.name_th === 'อัดบาน');
      const paintStation = availableStations.find(s => s.name_th === 'สี');
      
      // อัปเดตราคาใน stations ที่มีชื่อตรงกับ "อัดบาน" หรือ "สี" และยังไม่มีราคา
      const updatedStations = currentStations.map(station => {
        // ตรวจสอบว่าเป็นสถานี "อัดบาน" หรือ "สี"
        const isPressStation = pressStation && (station.name === 'อัดบาน');
        const isPaintStation = paintStation && station.name === 'สี';
        
        if (!isPressStation && !isPaintStation) {
          return station; // ไม่ใช่สถานีที่ต้องการ populate ราคา
        }
        
        // ถ้ามีราคาอยู่แล้ว (มีค่า) ไม่ต้อง override
        if (station.price && station.price !== '' && station.price !== null) {
          console.log(`[LABOR_PRICE] Station "${station.name}" already has price:`, station.price);
          return station;
        }
        
        // หา station code ที่เหมาะสม
        const stationCode = isPressStation ? pressStation?.code : paintStation?.code;
        if (!stationCode) return station;
        
        const priceData = priceMap.get(stationCode);
        if (!priceData) {
          console.log(`[LABOR_PRICE] No price data found for station "${station.name}" with code "${stationCode}"`);
          return station;
        }
        
        console.log(`[LABOR_PRICE] Populating price for station "${station.name}":`, priceData);
        return {
          ...station,
          price: priceData.price || '',
          priceType: priceData.price_type || 'flat'
        };
      });
      
      // อัปเดต stations state ถ้ามีการเปลี่ยนแปลง
      const hasChanges = updatedStations.some((s, idx) => 
        s.price !== currentStations[idx]?.price || 
        s.priceType !== currentStations[idx]?.priceType
      );
      
      if (hasChanges) {
        console.log('[LABOR_PRICE] Updating stations with labor prices from database');
        setStations(updatedStations);
      }
    } catch (error) {
      console.error('[LABOR_PRICE] Error populating labor prices:', error);
      // ไม่ throw error เพราะเป็น feature เพิ่มเติม
    }
  };

  // Create new station
  const createNewStation = async () => {
    if (!newStationName.trim()) {
      alert('กรุณาใส่ชื่อสถานี');
      return;
    }

    setCreatingStation(true);
    try {
      const response = await fetch('/api/stations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_th: newStationName.trim(),
          name_en: '',
          department: '',
          estimated_hours: 0
        })
      });

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        alert('ไม่สามารถสร้างสถานีได้: ' + (result.error || 'Unknown error'));
        return;
      }

      // Reload stations list
      await loadAvailableStations();
      
      // Close modal and reset
      setShowNewStationModal(false);
      setNewStationName("");
      
      if (result.existed) {
        alert(`สถานี "${newStationName.trim()}" มีอยู่แล้วในระบบ`);
      } else {
        alert(`✅ สร้างสถานี "${result.data.name_th}" สำเร็จ! (รหัส: ${result.data.code})`);
      }
    } catch (error) {
      console.error('Error creating station:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setCreatingStation(false);
    }
  };

  // Open role configuration modal
  const openRoleModal = (stationName) => {
    const station = availableStations.find(s => s.name_th === stationName);
    if (!station) return;
    
    setSelectedStationForRole(station);
    // Load current allowed_roles
    const currentRoles = Array.isArray(station.allowed_roles) ? station.allowed_roles : [];
    setSelectedRoles(currentRoles);
    setShowRoleModal(true);
  };

  // Save allowed roles for station
  const saveAllowedRoles = async () => {
    if (!selectedStationForRole) return;
    
    setSavingRoles(true);
    try {
      let authHeader = {};
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.access_token) {
          authHeader = { Authorization: `Bearer ${currentSession.access_token}` };
        }
      } catch {}

      const response = await fetch(`/api/stations/${selectedStationForRole.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({
          allowed_roles: selectedRoles.length > 0 ? selectedRoles : null
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        alert('ไม่สามารถบันทึกการตั้งค่าได้: ' + (result.error || 'Unknown error'));
        return;
      }

      // Reload stations to get updated allowed_roles
      await loadAvailableStations();
      
      // Update selectedStationForRole with new data
      setSelectedStationForRole({
        ...selectedStationForRole,
        allowed_roles: result.data.allowed_roles
      });

      alert('บันทึกการตั้งค่าแล้ว! ✅');
      setShowRoleModal(false);
    } catch (error) {
      console.error('Error saving allowed roles:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setSavingRoles(false);
    }
  };

  // Filter technicians based on station's allowed_roles
  const getFilteredTechnicians = (stationName) => {
    const station = availableStations.find(s => s.name_th === stationName);
    
    // If no station or no allowed_roles, show all technicians
    if (!station || !station.allowed_roles || !Array.isArray(station.allowed_roles) || station.allowed_roles.length === 0) {
      return technicians;
    }

    // Filter technicians that have at least one role in allowed_roles
    return technicians.filter(tech => {
      // Check single role field
      const techRole = tech.role;
      if (techRole && station.allowed_roles.includes(techRole)) {
        return true;
      }

      // Check roles array field
      const techRoles = tech.roles;
      if (Array.isArray(techRoles)) {
        return techRoles.some(role => station.allowed_roles.includes(role));
      }

      return false;
    });
  };

  function onDragStart(e, index) {
    e.dataTransfer.setData("text/plain", String(index));
  }

  function onDragOver(e) {
    e.preventDefault();
  }

  function onDrop(e, index) {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isNaN(fromIndex)) return;

    if (fromIndex === index) return;
    const updated = [...stations];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(index, 0, moved);
    setStations(updated);
  }

  // Helper function to check if station should hide technician dropdown (like QC)
  // QC, CNC, และ Packing ไม่ต้อง assign เป็นบุคคล - คนที่มี Role เห็นตั๋วได้เลย
  const shouldHideTechnicianDropdown = (stationName) => {
    if (!stationName) return false;
    const nameLower = String(stationName).toLowerCase().trim();
    // เช็คทั้งชื่อตรงๆ และชื่อที่อาจมีคำเหล่านี้รวมอยู่ด้วย
    return nameLower === 'qc' || 
           nameLower === 'cnc' || 
           nameLower.includes('cnc') || 
           nameLower === 'packing' || 
           nameLower.includes('packing') || 
           nameLower.includes('แพ็ค');
  };

  function updateStation(index, updates) {
    setStations((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
    // useEffect will handle populating prices automatically when station name changes
  }

  function addStation() {
    const defaultStationName = availableStations.length > 0 ? availableStations[0].name_th : "";
    const newStation = {
      id: String(stations.length + 1),
      name: defaultStationName,
      technician: "",
      technicianId: "",
      priceType: "flat",
      price: '',
      completionTime: "",
    };
    
    setStations((prev) => [...prev, newStation]);
    // useEffect will handle populating prices automatically
  }

  function removeStation(index) {
    setStations((prev) => prev.filter((_, i) => i !== index));
  }


  async function saveChanges() {
    setSaving(true);
    try {
      console.log('[SAVE] Starting save process...');
      console.log('[SAVE] Stations to save:', stations);
      
      // ตรวจสอบว่ามี stations หรือไม่
      if (!stations || stations.length === 0) {
        alert('กรุณาเพิ่มสถานีอย่างน้อย 1 สถานี');
        setSaving(false);
        return;
      }

      // Note: อนุญาตให้มีสถานีซ้ำได้แล้ว (สำหรับกรณี return แก้ไข)

      // ตรวจสอบ session ก่อน
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[SAVE] Current session:', session?.user?.email, 'Role:', session?.user?.user_metadata?.role);

      // ตรวจสอบว่ามี user ในตาราง users หรือไม่
      if (session?.user) {
        const { data: userRecord } = await supabase
          .from('users')
          .select('id, name, email, role, roles')
          .eq('id', session.user.id)
          .single();
        console.log('[SAVE] User record in database:', userRecord);
      }

      // เรียก API เพื่อบันทึกข้อมูล (ใช้ Service Role Key ที่ bypass RLS)
      // แนบ access token ไปกับคำขอ เพื่อให้ API ตรวจสอบสิทธิ์จากฝั่งเซิร์ฟเวอร์ได้
      let authHeader = {};
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.access_token) {
          authHeader = { Authorization: `Bearer ${currentSession.access_token}` };
        }
      } catch {}

      const payload = {
        priority,
        customerName,
        stations,
        ticketView,
      };

      console.log('[SAVE] Payload to send:', payload);

      const response = await fetch(`/api/tickets/${ticketId}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify(payload),
      });

      console.log('[SAVE] Response status:', response.status);
      
      const result = await response.json();
      console.log('[SAVE] API Response:', result);

      if (!response.ok || !result.success) {
        console.error('[SAVE] Error saving ticket:', result.error);
        alert('ไม่สามารถบันทึกข้อมูลตั๋วได้: ' + (result.error || 'Unknown error'));
        return;
      }

      // Save BOM (separate endpoint)
      try {
        let authHeader2 = {};
        try {
          const { data: { session: currentSession2 } } = await supabase.auth.getSession();
          if (currentSession2?.access_token) {
            authHeader2 = { Authorization: `Bearer ${currentSession2.access_token}` };
          }
        } catch {}
        const cleanBom = (Array.isArray(bom) ? bom : [])
          .filter(r => String(r.material_name || '').trim() !== '')
          .map(r => ({ material_name: String(r.material_name).trim(), quantity: Number(r.quantity) || 0, unit: (r.unit && String(r.unit).trim()) || 'PCS' }));
        const bomResp = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/bom/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader2 },
          body: JSON.stringify({ bom: cleanBom })
        });
        const bomJson = await bomResp.json();
        if (!bomResp.ok || !bomJson.success) {
          console.error('[SAVE] Error saving BOM:', bomJson.error);
          alert('บันทึกตั๋วสำเร็จ แต่บันทึก BOM ไม่สำเร็จ: ' + (bomJson.error || 'Unknown error'));
          return;
        }
      } catch (e) {
        console.error('[SAVE] Exception saving BOM:', e);
        alert('บันทึกตั๋วสำเร็จ แต่บันทึก BOM ไม่สำเร็จ');
        return;
      }

      // ลบข้อมูลจาก localStorage เมื่อบันทึกสำเร็จ (เพราะข้อมูลถูกบันทึกลง database แล้ว)
      try {
        localStorage.removeItem(`ticket_${ticketId}_stations`);
        localStorage.removeItem(`ticket_${ticketId}_bom`);
        console.log('[LOCALSTORAGE] Removed data from localStorage after successful save');
      } catch (e) {
        console.warn('[LOCALSTORAGE] Failed to remove data from localStorage:', e);
      }

      console.log("[SAVE] Saved ticket to database successfully");
      alert('บันทึกข้อมูลสำเร็จ! ✅');
      router.push(`/tickets`);
    } catch (error) {
      console.error('[SAVE] Error saving changes:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Top Bar */}
        <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/tickets" className="px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 inline-flex items-center gap-2 text-sm text-gray-900 dark:text-gray-100 dark:text-gray-100">
            <ArrowLeft className="w-4 h-4" /> กลับรายการตั๋ว
          </Link>
          <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">เลขตั๋ว</div>
          <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">#{ticketId}</div>
        </div>
        <button 
          onClick={saveChanges} 
          disabled={saving}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              กำลังบันทึก...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              บันทึก
            </>
          )}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
        {/* ข้อมูล ERP จาก API - แสดงแบบ Read Only */}
        {loadingTicket ? (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="flex items-center gap-3">
              <Loader className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
              <div>
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">กำลังโหลดข้อมูล ERP…</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">กำลังดึงข้อมูล {ticketId} จากระบบ ERP กรุณารอสักครู่</p>
              </div>
            </div>
          </div>
        ) : ticketView ? (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="flex items-start gap-3 mb-4">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">ข้อมูลจาก ERP System</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">ข้อมูลนี้ดึงมาจาก ERP และไม่สามารถแก้ไขได้</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-sm text-blue-600 dark:text-blue-400 mb-1 block font-medium">RPD</label>
                <div className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100">
                  {ticketView.rpd}
                </div>
              </div>
              <div>
                <label className="text-sm text-blue-600 dark:text-blue-400 mb-1 block font-medium">Item Code</label>
                <div className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100">
                  {ticketView.itemCode}
                </div>
              </div>
              <div>
                <label className="text-sm text-blue-600 dark:text-blue-400 mb-1 block font-medium">Project Code</label>
                <div className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100">
                  {ticketView.projectCode}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-sm text-blue-600 dark:text-blue-400 mb-1 block font-medium">จำนวนชิ้น</label>
                <div className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100">
                  {ticketView.quantity} ชิ้น
                </div>
              </div>
              <div>
                <label className="text-sm text-blue-600 dark:text-blue-400 mb-1 block font-medium">กำหนดส่ง</label>
                <div className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100">
                  {ticketView.dueDate}
                </div>
              </div>
              <div>
                <label className="text-sm text-blue-600 dark:text-blue-400 mb-1 block font-medium">สถานะ</label>
                <div className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100">
                  {ticketView.status}
                </div>
              </div>
            </div>
            
            <div className="mb-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-sm text-blue-600 dark:text-blue-400 mb-1 block font-medium">Description</label>
                  <div className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 min-h-[60px]">
                    {ticketView.description}
                  </div>
                </div>
                {ticketView?.description2 && (
                  <div>
                    <label className="text-sm text-blue-600 dark:text-blue-400 mb-1 block font-medium">Description_2</label>
                    <div className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 min-h-[60px]">
                      {ticketView.description2}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">ไม่พบข้อมูลตั๋ว</h3>
                <p className="text-sm text-red-700 dark:text-red-300">ไม่สามารถโหลดข้อมูลตั๋ว {ticketId} ได้</p>
              </div>
            </div>
          </div>
        )}

        {/* Document section - แบบแปลนจะดึงมาจากหน้า Project อัตโนมัติ */}
        <div className="mb-6">
          <button 
            onClick={() => setShowFilePreview(true)} 
            disabled={!projectData?.file_url}
            className={`w-full px-6 py-3 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 shadow-sm ${projectData?.file_url ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800' : 'bg-gray-100 dark:bg-slate-600 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-gray-200 dark:border-slate-700'}`}
          >
            <FileText className="w-5 h-5" />
            {projectData?.file_url ? `ดูแบบแปลน: ${projectData.file_name}` : 'ไม่มีแบบแปลน'}
          </button>
          {projectData?.file_url && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
              แบบแปลนจะดึงมาจากหน้า Project โดยอัตโนมัติตาม item code
            </div>
          )}
        </div>

        {/* Priority & Customer Section - แก้ไขได้เพราะไม่ได้มาจาก ERP */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">การตั้งค่าเพิ่มเติม</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">ระดับความสำคัญ</label>
                  <div className="relative">
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full appearance-none bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 cursor-pointer"
                    >
                      <option value="High Priority">High Priority</option>
                      <option value="Medium Priority">Medium Priority</option>
                      <option value="Low Priority">Low Priority</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ระดับความสำคัญสามารถแก้ไขได้</p>
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">ชื่อลูกค้า / บริษัท</label>
              <input
                type="text"
                value={customerName}
                readOnly
                disabled
                placeholder="ดึงจากชื่อโปรเจ็คอัตโนมัติ"
                className="w-full bg-gray-100 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-600 dark:text-gray-300"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ดึงจากชื่อโปรเจ็คโดยอัตโนมัติ</p>
            </div>
          </div>
        </div>

        {/* Section divider */}
        <div className="mt-8 mb-4 border-t border-gray-200 dark:border-slate-700" />

        {/* Stations list */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">สถานีงาน (ลากเรียงลำดับได้)</h3>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowNewStationModal(true)} 
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> สร้างรายการสถานีใหม่
            </button>
            <button onClick={addStation} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> เพิ่มเส้นทางสถานี
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {stations.map((s, index) => (
            <div key={`${s.id}-${index}`} draggable onDragStart={(e) => onDragStart(e, index)} onDragOver={onDragOver} onDrop={(e) => onDrop(e, index)} className="border border-gray-200 rounded-xl p-4 bg-white dark:bg-slate-800 flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm">
              <div className="flex items-center gap-2 shrink-0">
                <GripVertical className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 w-6 text-center">{index + 1}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 flex-1">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 block">สถานี</label>
                    {s.name && availableStations.find(st => st.name_th === s.name) && (
                      <button
                        onClick={() => openRoleModal(s.name)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 inline-flex items-center gap-1"
                        title="กำหนด Role ที่สามารถ Assign ได้"
                      >
                        <Settings className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      value={availableStations.find(st => st.name_th === s.name) ? s.name : "__loading__"}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateStation(index, { name: v });
                      }}
                      className="w-full appearance-none bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 cursor-pointer"
                      disabled={loadingStations}
                    >
                      {loadingStations ? (
                        <option value="__loading__">กำลังโหลดสถานี...</option>
                      ) : (
                        <>
                          {availableStations.map((st) => (
                            <option key={st.id} value={st.name_th}>{st.name_th}</option>
                          ))}
                          {availableStations.length === 0 && (
                            <option value="">ไม่มีสถานี - กรุณาสร้างใหม่</option>
                          )}
                        </>
                      )}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  </div>
                </div>

                {!shouldHideTechnicianDropdown(s.name) && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1 block">ช่าง</label>
                    <div className="relative">
                      <select value={s.technicianId || ''} onChange={(e) => {
                        const techId = e.target.value || '';
                        const filteredTechs = getFilteredTechnicians(s.name);
                        const techName = filteredTechs.find(t => String(t.id) === String(techId))?.name || '';
                        updateStation(index, { technicianId: techId, technician: techName });
                      }} className="w-full appearance-none bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 cursor-pointer">
                        <option value="">- เลือกช่าง -</option>
                        {loadingTechs ? (
                          <option value="" disabled>กำลังโหลดรายชื่อ...</option>
                        ) : (
                          (() => {
                            const filteredTechs = getFilteredTechnicians(s.name);
                            return filteredTechs.length > 0 ? (
                              filteredTechs.map((tech) => (
                                <option key={tech.id} value={tech.id}>{tech.name}</option>
                              ))
                            ) : (
                              <option value="" disabled>ไม่มีช่างที่ตรงตาม Role ที่กำหนด</option>
                            );
                          })()
                        )}
                      </select>
                      <User className="w-4 h-4 absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                )}

                {!shouldHideTechnicianDropdown(s.name) && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1 block">การคิดเงิน</label>
                    <div className="relative">
                      <select value={s.priceType} onChange={(e) => updateStation(index, { priceType: e.target.value })} className="w-full appearance-none bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 cursor-pointer">
                        <option value="flat">เหมาจ่าย</option>
                        <option value="per_piece">ต่อชิ้น</option>
                        <option value="per_hour">รายชั่วโมง</option>
                      </select>
                      <DollarSign className="w-4 h-4 absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                )}

                {!shouldHideTechnicianDropdown(s.name) && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1 block">ราคา</label>
                    <input type="number" value={s.price} onChange={(e) => {
                      const v = e.target.value === '' ? '' : Number(e.target.value);
                      updateStation(index, { price: v });
                    }} onWheel={(e) => e.target.blur()} className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2" />
                  </div>
                )}

                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-1 block">เวลาที่จะเสร็จ</label>
                  <DatePicker
                    selected={s.completionTime ? new Date(s.completionTime) : null}
                    onChange={(date) => {
                      const iso = date && !isNaN(date.getTime()) ? date.toISOString() : '';
                      updateStation(index, { completionTime: iso });
                    }}
                    showTimeSelect
                    timeFormat="HH:mm"
                    timeIntervals={15}
                    dateFormat="yyyy-MM-dd HH:mm"
                    placeholderText="เลือกวันเวลา"
                    className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <button onClick={() => removeStation(index)} className="shrink-0 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-sm inline-flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> ลบ
              </button>
            </div>
          ))}
        </div>

        {/* Section divider */}
        <div className="mt-8 mb-4 border-t border-gray-200 dark:border-slate-700" />

        {/* BOM Section (moved under stations) */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">BOM วัตถุดิบ</h3>
          <div className="space-y-2">
            {loadingBom && (
              <div className="text-sm text-gray-500 dark:text-gray-400">กำลังโหลด BOM...</div>
            )}
            {bom.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center">
                <div className="md:col-span-3">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">ชื่อวัตถุดิบ</label>
                  <input
                    type="text"
                    value={row.material_name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBom(prev => prev.map((r,i)=> i===idx ? { ...r, material_name: v } : r));
                    }}
                    placeholder="เช่น ไม้ยาง, แผ่น MDF"
                    className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">จำนวน</label>
                  <input
                    type="number"
                    min={0}
                    value={row.quantity}
                    onChange={(e)=>{
                      const v = e.target.value === '' ? '' : Number(e.target.value);
                      setBom(prev => prev.map((r,i)=> i===idx ? { ...r, quantity: v } : r));
                    }}
                    onWheel={(e) => e.target.blur()}
                    className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">หน่วย</label>
                  <div className="relative">
                    <select
                      value={row.unit}
                      onChange={(e)=>{
                        const v = e.target.value;
                        setBom(prev => prev.map((r,i)=> i===idx ? { ...r, unit: v } : r));
                      }}
                      className="w-full appearance-none bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 cursor-pointer"
                    >
                      <option value="PCS">PCS (ชิ้น)</option>
                      <option value="KG">KG (กิโลกรัม)</option>
                      <option value="M">M (เมตร)</option>
                      <option value="M2">M2 (ตารางเมตร)</option>
                      <option value="L">L (ลิตร)</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div className="md:col-span-1 flex items-end">
                  <button
                    onClick={() => setBom(prev => prev.filter((_,i)=> i!==idx))}
                    className="shrink-0 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-sm inline-flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button
              onClick={() => setBom(prev => [...prev, { material_name: '', quantity: '', unit: 'PCS' }])}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> เพิ่มรายการวัตถุดิบ
            </button>
          </div>
        </div>

        {/* Bottom save */}
        <div className="flex items-center justify-end mt-6">
          <button 
            onClick={saveChanges}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                บันทึก
              </>
            )}
          </button>
        </div>
        </div>

        {/* New Station Modal */}
        <Modal
          open={showNewStationModal}
          onClose={() => {
            setShowNewStationModal(false);
            setNewStationName("");
          }}
          title="สร้างรายการสถานีใหม่"
        >
          <div className="p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              สร้างสถานีใหม่ที่ยังไม่มีในระบบ สถานีที่สร้างจะถูกบันทึกลงฐานข้อมูลและสามารถใช้ได้กับทุกตั๋ว
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ชื่อสถานี (ภาษาไทย) *
              </label>
              <input
                type="text"
                value={newStationName}
                onChange={(e) => setNewStationName(e.target.value)}
                placeholder="เช่น: ขัดกระดาษทราย, ติดขอบ, ทำสีซ้ำ"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                autoFocus
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && newStationName.trim()) {
                    createNewStation();
                  }
                }}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewStationModal(false);
                  setNewStationName("");
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                disabled={creatingStation}
              >
                ยกเลิก
              </button>
              <button
                onClick={createNewStation}
                disabled={creatingStation || !newStationName.trim()}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creatingStation ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    กำลังสร้าง...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    สร้างสถานี
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>

        {/* Allowed Roles Configuration Modal */}
        <Modal
          open={showRoleModal}
          onClose={() => {
            setShowRoleModal(false);
            setSelectedStationForRole(null);
            setSelectedRoles([]);
          }}
          title={`กำหนด Role ที่สามารถ Assign ได้ - ${selectedStationForRole?.name_th || ''}`}
        >
          <div className="p-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              เลือก Role ที่ต้องการให้แสดงใน dropdown เมื่อเลือกสถานีนี้ ถ้าไม่เลือกอะไร = แสดงทุกคน
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                เลือก Role ที่สามารถ Assign ได้:
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 dark:border-slate-600 rounded-lg p-3">
                {getAllAvailableRoles().map((role) => {
                  const isChecked = selectedRoles.includes(role);
                  return (
                    <label
                      key={role}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-slate-700 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRoles([...selectedRoles, role]);
                          } else {
                            setSelectedRoles(selectedRoles.filter(r => r !== role));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {getRoleDisplayName(role)}
                      </span>
                    </label>
                  );
                })}
              </div>
              {selectedRoles.length > 0 && (
                <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                  เลือกแล้ว {selectedRoles.length} Role: {selectedRoles.map(r => getRoleDisplayName(r)).join(', ')}
                </p>
              )}
              {selectedRoles.length === 0 && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  ไม่ได้เลือก Role ใด = จะแสดงทุกคนใน dropdown
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRoleModal(false);
                  setSelectedStationForRole(null);
                  setSelectedRoles([]);
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                disabled={savingRoles}
              >
                ยกเลิก
              </button>
              <button
                onClick={saveAllowedRoles}
                disabled={savingRoles}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {savingRoles ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    บันทึก
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>

        {/* File Preview Modal */}
        <Modal 
          open={showFilePreview} 
          onClose={handleClosePreview} 
          hideHeader
          maxWidth="max-w-7xl"
          maxHeight="max-h-[88vh]"
        >
          {projectData?.file_url ? (
            <div className="relative w-full h-full p-0">
              {/* Close button */}
              <button
                onClick={handleClosePreview}
                className="absolute top-3 right-3 z-10 px-3 py-1.5 bg-black/60 text-white rounded-md hover:bg-black/70 transition-colors"
              >
                ปิด
              </button>

              {/* Content */}
              <div className="w-full h-full">
                {projectData.file_type === 'pdf' ? (
                  <iframe
                    src={`${projectData.file_url}#toolbar=0&navpanes=0&scrollbar=0`}
                    className="w-full h-[82vh]"
                    title={projectData.file_name}
                  />
                ) : (
                  <div className="w-full h-[82vh] flex items-center justify-center bg-black/5 dark:bg-black/20">
                    <img
                      src={projectData.file_url}
                      alt={projectData.file_name}
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
      </div>
    );
}
