"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Search, Filter, Edit, User, Clock, Loader, FileText, AlertCircle, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { t, translations } from "@/utils/translations";
import { supabase } from "@/utils/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { canPerformActions } from "@/utils/rolePermissions";

export default function UITicket() {
  const router = useRouter();
  const { language } = useLanguage();
  const { user } = useAuth();
  const canAction = canPerformActions(user?.roles || user?.role);

  // Reload data when page becomes visible (เมื่อกลับมาจากหน้า edit)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setRefreshTrigger(prev => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [erpTickets, setErpTickets] = useState([]);
  const [activeTab, setActiveTab] = useState("open");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [itemCodes, setItemCodes] = useState([]);
  const [groupedByItem, setGroupedByItem] = useState([]);
  const [projectMapByItemCode, setProjectMapByItemCode] = useState(new Map());
  const [expandedItems, setExpandedItems] = useState(new Set());
  // Filters
  const [showFilter, setShowFilter] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState(new Set());
  const [selectedPriorities, setSelectedPriorities] = useState(new Set());
  const [hasDueDateOnly, setHasDueDateOnly] = useState(false);
  const [selectedItemCodes, setSelectedItemCodes] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // โหลดรายการโปรเจ็คจาก Supabase เพื่อดึง RPD No. ที่เกี่ยวข้อง
  useEffect(() => {
    let active = true;
    const loadProjectsAndErp = async () => {
      try {
        setLoadingInitial(true);
        setErrorMessage("");
        // 1. ดึง projects (item_codes)
        const { data: projects, error: projectError } = await supabase
          .from('projects')
          .select('id, item_code, project_number, project_name, description')
          .order('created_at', { ascending: false });
        
        if (projectError) throw projectError;
        
        const itemCodes = projects
          .map(p => p.item_code)
          .filter(code => code && code.trim().length > 0);
        
        // รวม item codes จาก project_items ด้วย (ครอบคลุมกรณีเพิ่ม item ภายหลัง)
        // สร้าง projectIdMap เพื่อ map project_items.project_id -> project
        const projectIdMap = new Map(projects.map(p => [p.id, p]));
        try {
          const { data: projectItems, error: projectItemsError } = await supabase
            .from('project_items')
            .select('project_id, item_code');
          
          if (!projectItemsError && Array.isArray(projectItems)) {
            for (const it of projectItems) {
              if (it?.item_code) {
                itemCodes.push(it.item_code);
              }
            }
          }
        } catch {}
        
        // ทำให้ itemCodes เป็น unique และคงลำดับล่าสุดไว้
        const itemCodesSet = Array.from(new Set(itemCodes.filter(Boolean)));
        
        if (!itemCodesSet.length) {
          if (active) setErpTickets([]);
          return;
        }
        
        // สร้าง project map: map item_code -> project (รองรับทั้ง projects.item_code และ project_items.item_code)
        const projectMap = new Map();
        projects.forEach(p => {
          if (p.item_code) {
            projectMap.set(p.item_code, p);
          }
        });
        // เติมจาก project_items
        try {
          const { data: projectItems, error: projectItemsError } = await supabase
            .from('project_items')
            .select('project_id, item_code');
          
          if (!projectItemsError && Array.isArray(projectItems)) {
            for (const it of projectItems) {
              const proj = projectIdMap.get(it.project_id);
              if (proj && it?.item_code && !projectMap.has(it.item_code)) {
                projectMap.set(it.item_code, proj);
              }
            }
          }
        } catch {}

        // เก็บ projectMap ไว้ใช้ในมุมมองแบบ grouped ด้วย
        setProjectMapByItemCode(projectMap);

        // 2. เรียก ERP API ด้วย /all endpoint (Real-time)
        let erpTickets = [];
        try {
          const resp = await fetch('/api/erp/production-orders/all');
          
          if (resp.ok) {
            const json = await resp.json();
            const allTickets = json.data || [];
            
            // Filter ตาม item_codes
            erpTickets = allTickets.filter(ticket => {
              const sourceNo = ticket?.Source_No || ticket?.Item_No || ticket?.itemCode;
              return sourceNo && itemCodesSet.includes(sourceNo);
            });
            
            console.log(`✅ Fetched ${erpTickets.length} tickets from ERP (filtered from ${allTickets.length} total)`);
          } else {
            throw new Error(`ERP API failed: ${resp.status}`);
          }
        } catch (erpError) {
          console.warn('ERP API failed:', erpError.message);
          // Fallback: ใช้ข้อมูลจาก DB
        }
        
        // 3. ดึง tickets ที่มีอยู่ใน DB (เฉพาะที่มี RPD No. จริง)
        const { data: dbTickets } = await supabase
          .from('ticket')
          .select(`
            *,
            projects (
              id, item_code, project_number, project_name
            )
          `)
          .not('no', 'like', 'TICKET-%'); // ไม่ดึง tickets ที่สร้างจาก project_id
        
        const dbTicketMap = new Map((dbTickets || []).map(t => [t.no, t]));
        
        // 4. ตรวจสอบ RPD ใหม่ → บันทึกเข้า DB อัตโนมัติ
        const newTickets = [];
        for (const erpTicket of erpTickets) {
          const rpdNo = erpTicket.No || erpTicket.no || erpTicket.RPD_No;
          const itemCode = erpTicket.Source_No || erpTicket.itemCode;
          
          // ไม่ log debug เพราะสร้าง noise
          if (false && rpdNo === 'RPD2510-199') {
            console.log('🔍 Debug ERP data for RPD2510-199:', {
              Due_Date: erpTicket.Due_Date,
              Delivery_Date: erpTicket.Delivery_Date,
              Ending_Date: erpTicket.Ending_Date,
              Quantity: erpTicket.Quantity,
              Description: erpTicket.Description,
              Source_No: erpTicket.Source_No
            });
          }
          
          if (!dbTicketMap.has(rpdNo)) {
            // RPD ใหม่! บันทึกเข้า DB
            const project = projectMap.get(itemCode);
            
            try {
              const ticketData = {
                no: rpdNo,
                source_no: itemCode,
                project_id: project?.id || null,
                quantity: Number(erpTicket.Quantity || 0),
                due_date: erpTicket.Due_Date || erpTicket.Delivery_Date || erpTicket.Ending_Date || null,
                description: erpTicket.Description || null,
                description_2: erpTicket.Description_2 || null,
                status: 'Pending',
                priority: 'Medium',
                customer_name: erpTicket.Customer_Name || null
              };
              
              // ไม่ log debug เพราะสร้าง noise
              
              // ใช้ upsert แทน insert เพื่อป้องกัน duplicate key error
              // onConflict: 'no' หมายความว่าถ้า no ซ้ำกันให้ update แทน
              const { data: savedTicket, error: saveError } = await supabase
                .from('ticket')
                .upsert(ticketData, { onConflict: 'no' })
                .select()
                .single();
              
              if (!saveError && savedTicket) {
                newTickets.push(savedTicket);
                dbTicketMap.set(rpdNo, savedTicket);
                console.log(`✅ Auto-saved new ticket: ${rpdNo}`);
                
                // แจ้งเตือน admin เมื่อมี ticket ใหม่จาก ERP import
                // เช็คว่าเป็น ticket ใหม่จริงๆ (ไม่ใช่แค่ update)
                try {
                  const { data: existingTicket } = await supabase
                    .from('ticket')
                    .select('created_at')
                    .eq('no', rpdNo)
                    .single();
                  
                  // ถ้า created_at ใกล้เคียงกับเวลาปัจจุบันมาก (ภายใน 5 วินาที) แสดงว่าเป็น ticket ใหม่
                  const isNewTicket = existingTicket && 
                    new Date() - new Date(existingTicket.created_at) < 5000;
                  
                  if (isNewTicket) {
                    const projectName = projectMap.get(itemCode)?.project_name || null;
                    await fetch('/api/notifications/create-ticket', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ticketNo: rpdNo,
                        projectName,
                        source: 'ERP Import'
                      })
                    }).catch(() => {}); // Silent fail - notification is optional
                  }
                } catch (notifError) {
                  // Silent fail - notification is optional
                }
              } else if (saveError?.code === '23505') {
                // Duplicate key error - ticket มีอยู่แล้ว ใช้ข้อมูลที่มีอยู่
                // ไม่ log เพราะมี ticket หลายตัวที่ already exists (ปกติ)
                const { data: existingTicket } = await supabase
                  .from('ticket')
                  .select('*')
                  .eq('no', rpdNo)
                  .single();
                
                if (existingTicket) {
                  dbTicketMap.set(rpdNo, existingTicket);
                  console.log(`✅ Found existing ticket: ${rpdNo}`);
                }
              } else {
                console.error(`❌ Failed to save ticket ${rpdNo}:`, saveError);
              }
            } catch (saveError) {
              // จัดการ duplicate key error ที่อาจเกิดขึ้นใน catch block
              if (saveError?.code === '23505') {
                // ไม่ log เพราะมี ticket หลายตัวที่ already exists (ปกติ)
                try {
                  const { data: existingTicket } = await supabase
                    .from('ticket')
                    .select('*')
                    .eq('no', rpdNo)
                    .single();
                  
                  if (existingTicket) {
                    dbTicketMap.set(rpdNo, existingTicket);
                    console.log(`✅ Found existing ticket: ${rpdNo}`);
                  }
                } catch (fetchError) {
                  console.error(`Error fetching existing ticket ${rpdNo}:`, fetchError);
                }
              } else {
                console.error(`Error saving ticket ${rpdNo}:`, saveError);
              }
            }
          } else {
            // ไม่ log เพราะมี ticket หลายตัวที่ already exists (ปกติ)
          }
        }
        
        // 5. Merge ข้อมูล ERP + DB
        const mapped = erpTickets
          .filter(r => r && (r.No || r.no || r.RPD_No))
          .map(erpRecord => {
            const rpdNo = erpRecord.No || erpRecord.no || erpRecord.RPD_No;
            const dbTicket = dbTicketMap.get(rpdNo);
            const isNew = newTickets.some(t => t.no === rpdNo);
            
            // แปลงข้อมูลจาก ERP ก่อน
            const erpMapped = mapErpRecordToTicket(erpRecord, projectMap);

            // ถ้า ticket จากฐานข้อมูลมี project ที่ join มา ให้ใช้ชื่อโปรเจ็คจากนั้นแทนเลขโค้ด
            const dbProjectName =
              dbTicket?.projects?.project_name ||
              dbTicket?.projects?.description ||
              null;
            
            return {
              // ข้อมูลจาก ERP (ล่าสุด)
              ...erpMapped,
              // บังคับใช้ชื่อโปรเจ็คจาก DB ถ้ามี (จะได้เป็น "Bristal Bangkok" แทน 00051)
              projectName: dbProjectName || erpMapped.projectName,
              
              // ข้อมูลจาก DB (station flow, status, assignments)
              project_id: dbTicket?.project_id,
              status: dbTicket?.status || 'Pending',
              started_at: dbTicket?.started_at,
              finished_at: dbTicket?.finished_at,
              
              // Flags
              isNew: isNew,
              inDatabase: !!dbTicket
            };
          });

        // 6. เพิ่มตั๋วจาก DB ที่ไม่มีใน ERP (เช่น RPD2510-029)
        const erpTicketNumbers = new Set(
          erpTickets
            .map(r => r?.No || r?.no || r?.RPD_No)
            .filter(Boolean)
        );
        
        const dbOnlyTickets = Array.from(dbTicketMap.values())
          .filter(dbTicket => {
            const ticketNo = dbTicket.no;
            // ไม่รวม tickets ที่สร้างจาก project_id (TICKET-%) และไม่รวมที่อยู่ใน ERP แล้ว
            return ticketNo && 
                   !ticketNo.startsWith('TICKET-') && 
                   !erpTicketNumbers.has(ticketNo);
          })
          .map(dbTicket => {
            const rpdNo = dbTicket.no;
            const itemCode = dbTicket.source_no || '';
            
            // หา project จาก projectMap
            const project = itemCode ? projectMap.get(itemCode) : null;
            const dbProjectName =
              dbTicket.projects?.project_name ||
              dbTicket.projects?.description ||
              project?.project_name ||
              project?.description ||
              null;
            
            // สร้าง ticket object ในรูปแบบเดียวกับ ERP tickets
            return {
              id: rpdNo,
              rpd: rpdNo,
              title: dbTicket.description || '',
              priority: dbTicket.priority || 'ยังไม่ได้กำหนด Priority',
              priorityClass: dbTicket.priority === "High" || dbTicket.priority === "High Priority"
                ? "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                : dbTicket.priority === "Medium" || dbTicket.priority === "Medium Priority"
                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                : dbTicket.priority === "Low" || dbTicket.priority === "Low Priority"
                ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
              status: dbTicket.status || 'Pending',
              statusClass: dbTicket.status === 'Finish' 
                ? 'text-green-600'
                : dbTicket.status === 'In Progress'
                ? 'text-blue-600'
                : 'text-blue-600',
              assignee: '-',
              time: '',
              route: itemCode || rpdNo,
              routeClass: 'bg-blue-100 text-blue-800',
              dueDate: dbTicket.due_date || '',
              quantity: typeof dbTicket.pass_quantity === 'number' && dbTicket.pass_quantity !== null
                ? dbTicket.pass_quantity
                : (dbTicket.quantity || 0),
              itemCode: itemCode,
              projectCode: itemCode || rpdNo,
              projectName: dbProjectName || dbTicket.description || rpdNo,
              description: dbTicket.description || '',
              description2: dbTicket.description_2 || '',
              customerName: dbTicket.customer_name || '',
              project_id: dbTicket.project_id,
              started_at: dbTicket.started_at,
              finished_at: dbTicket.finished_at,
              roadmap: [],
              stations: [],
              bom: [],
              // Flags
              isNew: false,
              inDatabase: true,
              isDbOnly: true // Flag เพื่อระบุว่าเป็นตั๋วจาก DB เท่านั้น
            };
          });
        
        // รวมตั๋วจาก ERP และตั๋วจาก DB ที่ไม่มีใน ERP
        const allTickets = [...mapped, ...dbOnlyTickets];
        
        // ไม่ log เพราะสร้าง noise

        if (active) setErpTickets(allTickets);
      } catch (e) {
        console.error('Load tickets failed', e);
        if (active) setErrorMessage(typeof e === 'object' ? (e?.message || JSON.stringify(e)) : String(e));
      } finally {
        if (active) setLoadingInitial(false);
      }
    };

    loadProjectsAndErp();
    return () => { active = false; };
  }, [refreshTrigger]);

  // โหลด item codes และ ERP ทั้งหมด แล้ว map เป็นกลุ่มตาม itemcode
  useEffect(() => {
    let active = true;
    const loadItemCodesAndErpAll = async () => {
      try {
        // ดึง item_code ทั้งหมดจาก project_items
        const { data: items, error: itemsError } = await supabase
          .from('project_items')
          .select('item_code');
        if (itemsError) throw itemsError;

        const codes = [...new Set((items || []).map(i => i?.item_code).filter(Boolean))];
        if (active) setItemCodes(codes);

        // ถ้าไม่มี item code ให้จบ
        if (!codes.length) {
          if (active) setGroupedByItem([]);
          return;
        }

        // ลองเรียก ERP ทั้งหมดจาก API ภายใน แต่ถ้าไม่ได้ก็ใช้ข้อมูลจากฐานข้อมูลแทน
        let grouped = [];
        try {
          const resp = await fetch('/api/erp/production-orders/all');
          if (!resp.ok) throw new Error(`Failed to fetch ERP all: ${resp.status}`);
          const json = await resp.json();
          const erpList = Array.isArray(json?.data) ? json.data : [];

          // ทำกลุ่ม: itemcode -> [ticket objects]
          const groups = new Map();
          for (const rec of erpList) {
            const sourceNo = rec?.Source_No || rec?.Item_No || rec?.Item_Code || '';
            if (!sourceNo || !codes.includes(sourceNo)) continue;
            
            // แปลงข้อมูล ERP เป็น ticket object เหมือนเดิม แต่ใช้ projectMapByItemCode
            const ticket = mapErpRecordToTicket(rec, projectMapByItemCode || new Map());
            
            if (!groups.has(sourceNo)) groups.set(sourceNo, []);
            groups.get(sourceNo).push(ticket);
          }

          grouped = [...groups.entries()].map(([code, tickets]) => ({
            itemCode: code,
            rpdCount: tickets.length,
            items: tickets
          }));
        } catch (erpError) {
          console.warn('ERP API failed for grouped view, using database data instead:', erpError.message);
          
          // ใช้ข้อมูลจากฐานข้อมูลแทน ERP
          const groups = new Map();
          for (const code of codes) {
            // หาโปรเจ็คที่มี item_code นี้
            const { data: projects } = await supabase
              .from('projects')
              .select('project_number, project_name, item_code, description')
              .eq('item_code', code);
            
            if (projects && projects.length > 0) {
              const tickets = projects.map(p => {
                const projectId = p.project_number || p.item_code;
                return {
                  id: projectId,
                  title: p.project_name || p.description || `Project ${projectId}`,
                  priority: "ยังไม่ได้กำหนด Priority",
                  priorityClass: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
                  status: "Pending",
                  statusClass: "text-blue-600",
                  assignee: "-",
                  time: "",
                  route: projectId,
                  routeClass: "bg-blue-100 text-blue-800",
                  dueDate: "",
                  quantity: 0,
                  rpd: projectId,
                  itemCode: code,
                  projectCode: code,
                  projectName: p.project_name || p.description || `Project ${projectId}`,
                  description: p.project_name || p.description || `Project ${projectId}`,
                  description2: "",
                  shortcutDimension1: "",
                  shortcutDimension2: code,
                  locationCode: "",
                  startingDateTime: "",
                endingDateTime: "",
                bwkRemainingConsumption: 0,
                searchDescription: p.project_name || p.description || `Project ${projectId}`,
                erpCode: `ERP-${code}`,
                projectId: code,
                customerName: "",
                bom: [],
                stations: [],
                roadmap: [],
              };
              });
              
              groups.set(code, tickets);
            }
          }

          grouped = [...groups.entries()].map(([code, tickets]) => ({
            itemCode: code,
            rpdCount: tickets.length,
            items: tickets
          }));
        }

        if (active) setGroupedByItem(grouped);
      } catch (e) {
        console.error('Load item codes & ERP all failed', e);
        if (active) setErrorMessage(typeof e === 'object' ? (e?.message || JSON.stringify(e)) : String(e));
      }
    };

    loadItemCodesAndErpAll();
    return () => { active = false; };
  }, [refreshTrigger]);

  // State สำหรับข้อมูลจาก Supabase
  const [dbTickets, setDbTickets] = useState([]);
  const [dbStationFlows, setDbStationFlows] = useState([]);
  const [dbBoms, setDbBoms] = useState([]); // BOM data

  // โหลดข้อมูล tickets และ station flows จาก Supabase
  useEffect(() => {
    let active = true;
    const loadDbTickets = async () => {
      try {
        // ดึงข้อมูล tickets แบบง่ายก่อน (ไม่ join ซับซ้อน) - ไม่ดึง tickets ที่สร้างจาก project_id
        const { data: tickets, error } = await supabase
          .from('ticket')
          .select('*')
          .not('no', 'like', 'TICKET-%') // ไม่ดึง tickets ที่สร้างจาก project_id
          .order('no', { ascending: false });

        if (error) {
          console.error('Error loading tickets from database:', error);
          console.error('Error details:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
          return;
        }

        if (active && tickets) {
          // แปลงข้อมูลให้อยู่ในรูปแบบที่ใช้งานง่าย
          const processed = tickets.map(ticket => ({
            no: ticket.no,
            priority: ticket.priority === "High" ? "High Priority" : ticket.priority === "Low" ? "Low Priority" : "Medium Priority",
            customerName: ticket.customer_name,
            stations: [], // เริ่มต้นเป็น array ว่าง - จะโหลดแยกทีหลัง
          }));
          setDbTickets(processed);
        }
      } catch (e) {
        console.error('Failed to load tickets from database:', e);
        console.error('Exception details:', {
          message: e.message,
          stack: e.stack,
          name: e.name
        });
        if (active) setErrorMessage(typeof e === 'object' ? (e?.message || JSON.stringify(e)) : String(e));
      }
    };

    loadDbTickets();
    return () => { active = false; };
  }, [refreshTrigger]);

  // โหลด station flows แยกต่างหาก (เฉพาะเมื่อมีข้อมูลจริง)
  useEffect(() => {
    let active = true;
    const loadStationFlows = async () => {
      try {
        // เช็คก่อนว่ามีข้อมูลใน ticket_station_flow หรือไม่
        const { count, error: countError } = await supabase
          .from('ticket_station_flow')
          .select('*', { count: 'exact', head: true });

        if (countError) {
          console.log('No ticket_station_flow table or no data yet:', countError.message);
          if (active) setDbStationFlows([]);
          return;
        }

        // ถ้าไม่มีข้อมูลเลย ไม่ต้องโหลด
        if (!count || count === 0) {
          console.log('No station flows data yet - waiting for admin to add stations');
          if (active) setDbStationFlows([]);
          return;
        }

        // โหลด station flows (ไม่ join assignments เพราะไม่มี foreign key relationship)
        // ใช้ pagination เพื่อให้แน่ใจว่าได้ข้อมูลทั้งหมด (Supabase default limit = 1000)
        let allFlows = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
          const { data: flows, error: flowError } = await supabase
            .from('ticket_station_flow')
            .select(`
              *,
              stations (
                name_th,
                code
              )
            `)
            .order('step_order', { ascending: true })
            .range(from, from + pageSize - 1);
          
          if (flowError) {
            console.error('Failed to load station flows:', flowError);
            if (active) setDbStationFlows([]);
            return;
          }
          
          if (flows && flows.length > 0) {
            allFlows = allFlows.concat(flows);
            from += pageSize;
            hasMore = flows.length === pageSize; // ถ้าได้ครบ pageSize แสดงว่าอาจมีข้อมูลเพิ่ม
          } else {
            hasMore = false;
          }
        }
        
        const flows = allFlows;

        if (active) {
          // Load assignments separately and merge with flows
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
              `);
              
            if (assignmentError) {
              console.warn('Assignment query failed:', assignmentError.message);
              // Try simpler query without join
              const { data: simpleData } = await supabase
                .from('ticket_assignments')
                .select('ticket_no, station_id, step_order, technician_id');
              
              if (simpleData && simpleData.length > 0) {
                // Get technician names separately
                const technicianIds = [...new Set(simpleData.map(a => a.technician_id))];
                const { data: userData } = await supabase
                  .from('users')
                  .select('id, name')
                  .in('id', technicianIds);
                
                // Merge data
                assignments = simpleData.map(assignment => ({
                  ...assignment,
                  users: userData?.find(u => u.id === assignment.technician_id) || null
                }));
              }
            } else {
              assignments = assignmentData || [];
            }
          } catch (err) {
            console.warn('Failed to load assignments separately:', err.message);
          }

          // Create assignment map by ticket_no + station_id + step_order
          const assignmentMap = {};
          assignments.forEach(assignment => {
            const key = `${assignment.ticket_no}-${assignment.station_id}-${assignment.step_order}`;
            assignmentMap[key] = assignment.users?.name || '';
          });

          // Merge assignments with flows
          const flowsWithAssignments = flows?.map(flow => {
            // ใช้ trim() เพื่อให้แน่ใจว่าไม่มี space หรือ format ต่างกัน
            const flowTicketNo = String(flow.ticket_no || '').trim();
            const flowStationId = String(flow.station_id || '').trim();
            const flowStepOrder = Number(flow.step_order) || 0;
            
            const assignment = assignments.find(a => {
              const aTicketNo = String(a.ticket_no || '').trim();
              const aStationId = String(a.station_id || '').trim();
              const aStepOrder = Number(a.step_order) || 0;
              
              return aTicketNo === flowTicketNo && 
                     aStationId === flowStationId && 
                     aStepOrder === flowStepOrder;
            });
            
            return {
              ...flow,
              ticket_assignments: assignment && assignment.technician_id ? [{
                technician_id: assignment.technician_id,
                users: {
                  id: assignment.users?.id || assignment.technician_id,
                  name: assignment.users?.name || assignmentMap[`${flowTicketNo}-${flowStationId}-${flowStepOrder}`] || ''
                }
              }] : []
            };
          }) || [];

          setDbStationFlows(flowsWithAssignments);
          const totalFlows = flowsWithAssignments?.length || 0;
          
          // Debug: ตรวจสอบจำนวน flows ต่อ ticket และหา ticket ที่มี flows มากกว่า 7
          const flowsByTicket = flowsWithAssignments.reduce((acc, flow) => {
            const ticketNo = String(flow.ticket_no || '').trim();
            if (!acc[ticketNo]) acc[ticketNo] = [];
            acc[ticketNo].push(flow);
            return acc;
          }, {});
          
          const ticketsWithManyFlows = Object.entries(flowsByTicket)
            .filter(([ticketNo, ticketFlows]) => ticketFlows.length > 7)
            .map(([ticketNo, ticketFlows]) => ({ ticketNo, count: ticketFlows.length }));
          
          // แสดง log เฉพาะเมื่อมี ticket ที่มี flows มากกว่า 7
          if (ticketsWithManyFlows.length > 0) {
            console.log(`🔍 [ROADMAP] Found ${ticketsWithManyFlows.length} tickets with >7 flows. Total flows loaded: ${totalFlows}`);
          }
        }
      } catch (e) {
        console.error('Failed to load station flows:', e);
        if (active) setDbStationFlows([]);
        if (active) setErrorMessage(typeof e === 'object' ? (e?.message || JSON.stringify(e)) : String(e));
      }
    };

    loadStationFlows();
    return () => { active = false; };
  }, [refreshTrigger]);

  // State สำหรับเก็บข้อมูล BOM และ Assignment ที่เช็คแล้ว (key = ticket_no)
  const [ticketBomStatus, setTicketBomStatus] = useState(new Map());
  const [ticketAssignmentStatus, setTicketAssignmentStatus] = useState(new Map());

  // โหลด BOM status สำหรับแต่ละ ticket โดยตรง
  const checkTicketBom = useCallback(async (ticketNo) => {
    if (!ticketNo) return false;
    try {
      const { data, error } = await supabase
        .from('ticket_bom')
        .select('ticket_no')
        .eq('ticket_no', ticketNo)
        .limit(1);
      
      if (error) {
        console.warn(`[BOM CHECK] Error checking BOM for ${ticketNo}:`, error);
        return false;
      }
      
      const hasBom = data && data.length > 0;
      setTicketBomStatus(prev => {
        const newMap = new Map(prev);
        newMap.set(ticketNo, hasBom);
        return newMap;
      });
      return hasBom;
    } catch (e) {
      console.warn(`[BOM CHECK] Exception checking BOM for ${ticketNo}:`, e);
      return false;
    }
  }, []);

  // โหลด Assignment status สำหรับแต่ละ ticket โดยตรง
  const checkTicketAssignment = useCallback(async (ticketNo) => {
    if (!ticketNo) return false;
    try {
      // เช็คว่ามี ticket_station_flow สำหรับ ticket นี้หรือไม่
      const { data: flows, error: flowError } = await supabase
        .from('ticket_station_flow')
        .select('id, ticket_no, station_id, step_order')
        .eq('ticket_no', ticketNo)
        .limit(1);
      
      if (flowError) {
        console.warn(`[ASSIGNMENT CHECK] Error checking flows for ${ticketNo}:`, flowError);
        return false;
      }
      
      if (!flows || flows.length === 0) {
        // ไม่มี station flow = ไม่ต้องเช็ค assignment
        setTicketAssignmentStatus(prev => {
          const newMap = new Map(prev);
          newMap.set(ticketNo, false);
          return newMap;
        });
        return false;
      }
      
      // ถ้ามี station flow แล้ว เช็คว่ามี assignment หรือไม่
      const { data: assignments, error: assignError } = await supabase
        .from('ticket_assignments')
        .select('technician_id')
        .eq('ticket_no', ticketNo)
        .not('technician_id', 'is', null)
        .limit(1);
      
      if (assignError) {
        console.warn(`[ASSIGNMENT CHECK] Error checking assignments for ${ticketNo}:`, assignError);
        return false;
      }
      
      const hasAssignment = assignments && assignments.length > 0 && assignments.some(a => a.technician_id);
      setTicketAssignmentStatus(prev => {
        const newMap = new Map(prev);
        newMap.set(ticketNo, hasAssignment);
        return newMap;
      });
      return hasAssignment;
    } catch (e) {
      console.warn(`[ASSIGNMENT CHECK] Exception checking assignment for ${ticketNo}:`, e);
      return false;
    }
  }, []);

  // โหลด BOM data จาก Supabase (เก็บไว้สำหรับใช้ในกรณีอื่น)
  useEffect(() => {
    let active = true;
    const loadBoms = async () => {
      try {
        const { data: boms, error } = await supabase
          .from('ticket_bom')
          .select('ticket_no')
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('Error loading BOMs:', error);
          if (active) setDbBoms([]);
          return;
        }

        if (active) {
          // สร้าง Set ของ ticket_no ที่มี BOM
          const ticketsWithBom = new Set((boms || []).map(b => b.ticket_no));
          setDbBoms(Array.from(ticketsWithBom));
          console.log(`Loaded BOM data for ${ticketsWithBom.size} tickets`);
        }
      } catch (e) {
        console.error('Failed to load BOMs:', e);
        if (active) setDbBoms([]);
      }
    };

    loadBoms();
    return () => { active = false; };
  }, [refreshTrigger]);

  // รวมข้อมูลจาก Supabase และ localStorage ซ้อนทับบน ERP tickets
  const tickets = useMemo(() => {
    return erpTickets.map((t) => {
      const merged = { ...t };
      const ticketNo = String(t.id || t.rpd).replace('#','').trim();
      
      // ดึงข้อมูลจาก Supabase ก่อน
      const dbTicket = dbTickets.find(db => String(db.no || '').trim() === ticketNo);
      
      // เช็คว่ามี BOM หรือไม่ - ใช้ข้อมูลจาก ticketBomStatus หรือเช็คจาก dbBoms เป็น fallback
      const bomStatus = ticketBomStatus.get(ticketNo);
      const hasBom = bomStatus !== undefined 
        ? bomStatus 
        : dbBoms.some(bomNo => String(bomNo || '').trim() === ticketNo);
      merged.hasBom = hasBom;
      
      // เช็คว่า ticket อยู่ใน database หรือไม่
      merged.inDatabase = !!dbTicket;
      
      // หา station flows ที่เกี่ยวข้องกับ ticket นี้ (เช็คทุกกรณี ไม่ใช่แค่เมื่อมี dbTicket)
      // ใช้ trim() เพื่อให้แน่ใจว่าไม่มี space หรือ format ต่างกัน
      // เรียงลำดับตาม step_order เพื่อให้แน่ใจว่าได้ลำดับที่ถูกต้อง
      const ticketFlows = Array.isArray(dbStationFlows) 
        ? dbStationFlows
            .filter(flow => String(flow.ticket_no || '').trim() === ticketNo)
            .sort((a, b) => {
              const orderA = Number(a.step_order) || 0;
              const orderB = Number(b.step_order) || 0;
              return orderA - orderB;
            })
        : [];
      
      // เช็คว่ามี station flow หรือไม่
      merged.hasStationFlow = ticketFlows.length > 0;
      
      // เช็คว่ามี assignment หรือไม่ - ใช้ข้อมูลจาก ticketAssignmentStatus หรือเช็คจาก ticketFlows เป็น fallback
      const assignmentStatus = ticketAssignmentStatus.get(ticketNo);
      let hasAssignment = false;
      
      if (assignmentStatus !== undefined) {
        hasAssignment = assignmentStatus;
      } else {
        // Fallback: เช็คจาก ticketFlows
        hasAssignment = ticketFlows.length > 0 && ticketFlows.some(flow => {
          if (flow.ticket_assignments && Array.isArray(flow.ticket_assignments) && flow.ticket_assignments.length > 0) {
            const assignment = flow.ticket_assignments[0];
            return assignment.technician_id || assignment.users?.name || assignment.users?.id;
          }
          return false;
        });
      }
      
      merged.hasAssignment = hasAssignment;
      
      // ไม่ log debug เพราะสร้าง noise
      
      // ไม่ log assignment debug เพราะสร้าง noise มาก
      
      if (dbTicket) {
        // ใช้ข้อมูลจาก database
        if (dbTicket.customerName) merged.customerName = dbTicket.customerName;
        if (dbTicket.priority) {
          merged.priority = dbTicket.priority;
          // อัปเดต priorityClass ตาม priority ที่ผู้ใช้ตั้ง
          if (dbTicket.priority === "High Priority") {
            merged.priorityClass = "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
          } else if (dbTicket.priority === "Medium Priority") {
            merged.priorityClass = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
          } else if (dbTicket.priority === "Low Priority") {
            merged.priorityClass = "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
          } else {
            merged.priorityClass = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
          }
        }
      }
      
      if (ticketFlows.length > 0) {
        // สร้าง roadmap จาก station flows
        merged.roadmap = ticketFlows.map((flow) => ({
          step: flow.stations?.name_th || "",
          status: flow.status || "pending",
          technician: flow.ticket_assignments?.[0]?.users?.name || ""
        }));
        
        // Debug: ตรวจสอบเฉพาะเมื่อมีปัญหา (flows มากกว่า 7 แต่ roadmap ไม่ครบ)
        if (ticketFlows.length > 7 && merged.roadmap.length !== ticketFlows.length) {
          console.warn(`⚠️ [ROADMAP] Ticket ${ticketNo}: ${ticketFlows.length} flows but only ${merged.roadmap.length} roadmap steps created`);
        } else if (ticketFlows.length > 7) {
          // Log เฉพาะเมื่อมี flows มากกว่า 7 และ roadmap ถูกต้อง
          console.log(`✅ [ROADMAP] Ticket ${ticketNo}: ${ticketFlows.length} flows → ${merged.roadmap.length} roadmap steps`);
        }
        
        // คำนวณสถานะตามการ assign และความคืบหน้า
        const stations = ticketFlows.map(flow => ({
          name: flow.stations?.name_th || "",
          technician: flow.ticket_assignments?.[0]?.users?.name || "",
          status: flow.status || "pending"
        }));
        // กำหนด assignee ให้โชว์บนการ์ด: แสดงเฉพาะช่างของสถานีปัจจุบัน
        const currentFlow = ticketFlows.find(f => f.status === 'current');
        let primaryAssignee = currentFlow?.ticket_assignments?.[0]?.users?.name || '';
        if (!primaryAssignee) {
          // หากยังไม่เริ่มงาน (ไม่มี current) ให้แสดงช่างของสถานีแรกตามลำดับ
          const firstFlow = ticketFlows[0];
          primaryAssignee = firstFlow?.ticket_assignments?.[0]?.users?.name || '';
        }
        merged.assignee = primaryAssignee || '-';
        merged.status = calculateTicketStatus(stations, merged.roadmap);
        merged.statusClass = getStatusClass(merged.status);
      } else {
        // ถ้าไม่มี station flows ใน database ให้ใช้ roadmap เดิมจาก ERP
        // ไม่ log เพราะมี ticket หลายตัวที่ยังไม่มี station flows (ปกติ)
        // ตั้งสถานะเป็น Pending เพื่อให้รู้ว่าต้องรอ Admin เพิ่มสถานี
        if (!merged.status || merged.status === "Pending") {
          merged.status = "Pending";
          merged.statusClass = "text-blue-600";
        }
      }
      
      return merged;
    });
  }, [erpTickets, dbTickets, dbStationFlows, dbBoms, ticketBomStatus, ticketAssignmentStatus]);

  // Trigger การเช็ค BOM และ Assignment สำหรับทุก ticket เมื่อ tickets เปลี่ยน
  useEffect(() => {
    if (tickets.length === 0) return;
    
    // สร้าง Set ของ ticket_no ที่ต้องเช็ค
    const ticketNos = tickets
      .map(t => String(t.id || t.rpd).replace('#','').trim())
      .filter(Boolean);
    
    // เช็ค BOM และ Assignment สำหรับทุก ticket
    ticketNos.forEach(ticketNo => {
      // เช็ค BOM ถ้ายังไม่เช็ค
      const bomChecked = ticketBomStatus.has(ticketNo);
      if (!bomChecked) {
        checkTicketBom(ticketNo);
      }
      
      // เช็ค Assignment ถ้ายังไม่เช็ค
      const assignmentChecked = ticketAssignmentStatus.has(ticketNo);
      if (!assignmentChecked) {
        // เช็คเฉพาะเมื่อมี station flow
        const ticket = tickets.find(t => String(t.id || t.rpd).replace('#','').trim() === ticketNo);
        if (ticket?.hasStationFlow) {
          checkTicketAssignment(ticketNo);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets.length, erpTickets.length, refreshTrigger, checkTicketBom, checkTicketAssignment]);

  // ฟังก์ชันคำนวณสถานะตั๋ว
  function calculateTicketStatus(stations, roadmap) {
    if (!Array.isArray(stations) || stations.length === 0) {
      return "Pending"; // ยังไม่ได้เพิ่มสถานี
    }

    // ตรวจสอบว่ามีการ assign ช่างหรือไม่
    const hasAssignedTechnicians = stations.some(station => 
      station.technician && station.technician.trim() !== ""
    );

    if (!hasAssignedTechnicians) {
      return "Pending"; // มีสถานีแต่ยังไม่ได้ assign ช่าง
    }

    // ตรวจสอบความคืบหน้าใน roadmap
    if (Array.isArray(roadmap) && roadmap.length > 0) {
      const hasCurrentStep = roadmap.some(step => step.status === 'current');
      const allCompleted = roadmap.every(step => step.status === 'completed');
      
      if (allCompleted) {
        return "Finish"; // เสร็จสิ้นทุกสถานี
      } else if (hasCurrentStep) {
        return "In Progress"; // มีขั้นตอนที่กำลังดำเนินการ
      }
    }

    return "Released"; // มีการ assign แล้วแต่ยังไม่เริ่มทำงาน
  }

  // ฟังก์ชันแปลงวันที่ให้อ่านง่าย
  const formatDate = (dateString) => {
    if (!dateString) return 'ไม่ระบุ';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'ไม่ระบุ';
      
      // แปลงเป็นรูปแบบ DD/MM/YYYY
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      
      return `${day}/${month}/${year}`;
    } catch (error) {
      return 'ไม่ระบุ';
    }
  };

  // ฟังก์ชันกำหนดสีสถานะ
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

  function mapErpRecordToTicket(record, projectMap = new Map()) {
    // รองรับรูปแบบที่ API อาจห่อข้อมูลไว้ชั้นนึง
    const rec = record && record.data ? record.data : record;
    const rpdNo = rec?.No || rec?.no || rec?.RPD_No || rec?.rpdNo || rec?.orderNumber || rec?.Order_No || rec?.No_ || rec?.id;
    const quantity = Number(rec?.Quantity ?? rec?.quantity ?? 0);
    const dueDate = rec?.Due_Date || rec?.Delivery_Date || rec?.deliveryDate || rec?.Ending_Date_Time || rec?.Ending_Date || null;
    
    // ไม่ log debug เพราะสร้าง noise
    if (false && rpdNo === 'RPD2510-199') {
      console.log('🔍 Debug Due_Date for RPD2510-199:', {
        Delivery_Date: rec?.Delivery_Date,
        deliveryDate: rec?.deliveryDate,
        Ending_Date_Time: rec?.Ending_Date_Time,
        Ending_Date: rec?.Ending_Date,
        Due_Date: rec?.Due_Date,
        finalDueDate: dueDate
      });
    }
    const itemCode = rec?.Source_No || rec?.Item_No || rec?.itemCode || rec?.Item_Code || rec?.Source_Item || "";
    const description = rec?.Description || rec?.description || "";
    const description2 = (rec?.Description_2 || rec?.description2 || "").replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
    const erpProjectCode = rec?.Shortcut_Dimension_2_Code || rec?.Project_Code || rec?.projectCode || rec?.Project || "";
    const shortcutDimension1 = rec?.Shortcut_Dimension_1_Code || "";
    const startingDateTime = rec?.Starting_Date_Time || rec?.Start_Date || "";
    const endingDateTime = rec?.Ending_Date_Time || rec?.End_Date || "";
    const route = rec?.Routing_No || rec?.Routing || rec?.Route || "";

    // หาชื่อโปรเจ็คจาก projectMap โดยใช้ item_code
    const project = projectMap.get(itemCode);
    const projectCode = project?.item_code || erpProjectCode;
    const projectName = project?.project_name || project?.description || erpProjectCode;

    const priority = "ยังไม่ได้กำหนด Priority"; // ค่าตั้งต้น ให้แก้ไขได้ในหน้า edit
    const priorityClass = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";

    // เริ่มต้น roadmap จาก route แบบง่าย ๆ หากไม่มีข้อมูล ให้ว่าง
    const roadmap = Array.isArray(rec?.Operations)
      ? rec.Operations.map(op => ({ step: op?.Description || op?.description || op?.Operation_No || "", status: "pending" }))
      : [];

    // สถานะเริ่มต้นเป็น Pending (จะถูกอัปเดตจาก localStorage)
    const status = "Pending";
    const statusClass = "text-blue-600";

    return {
      id: rpdNo,
      title: description,
      priority,
      priorityClass,
      status,
      statusClass,
      assignee: "-",
      time: "",
      route,
      routeClass: "bg-blue-100 text-blue-800",
      dueDate: dueDate || "",
      quantity: quantity || 0,
      rpd: rpdNo,
      itemCode,
      projectCode,
      projectName, // เพิ่มชื่อโปรเจ็ค
      description,
      description2,
      shortcutDimension1,
      shortcutDimension2: projectCode,
      locationCode: rec?.Location_Code || rec?.Location || "",
      startingDateTime,
      endingDateTime,
      bwkRemainingConsumption: Number(rec?.BWK_Remaining_Consumption || 0),
      searchDescription: rec?.Search_Description || rec?.Search || description,
      erpCode: projectCode ? `ERP-${projectCode}` : "",
      projectId: projectCode,
      customerName: rec?.Customer_Name || rec?.customerName || "",
      bom: Array.isArray(rec?.BOM) ? rec.BOM : [],
      stations: Array.isArray(rec?.Stations) ? rec.Stations : [],
      roadmap,
    };
  }

  const priorityRank = (p) => {
    if (p === "High Priority") return 0;
    if (p === "Medium Priority") return 1;
    if (p === "Low Priority") return 2;
    return 3;
  };

  // Filter predicate
  const filterPredicate = (t) => {
    // Status filter
    if (selectedStatuses.size > 0 && !selectedStatuses.has(t.status)) return false;
    // Priority filter
    if (selectedPriorities.size > 0 && !selectedPriorities.has(t.priority)) return false;
    // Due date filter
    if (hasDueDateOnly && !t.dueDate) return false;
    // Item code filter
    if (selectedItemCodes.size > 0 && !selectedItemCodes.has(t.itemCode)) return false;
    return true;
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStatuses.size > 0) count += 1;
    if (selectedPriorities.size > 0) count += 1;
    if (hasDueDateOnly) count += 1;
    if (selectedItemCodes.size > 0) count += 1;
    return count;
  }, [selectedStatuses, selectedPriorities, hasDueDateOnly, selectedItemCodes]);

  const matchSearch = (t) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (t.id || "").toLowerCase().includes(q) ||
      (t.title || "").toLowerCase().includes(q) ||
      (t.assignee || "").toLowerCase().includes(q) ||
      (t.rpd || "").toLowerCase().includes(q) ||
      (t.itemCode || "").toLowerCase().includes(q) ||
      (t.projectCode || "").toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q)
    );
  };

  const isNotIssued = (t) => {
    // ตั๋วที่ยังไม่ได้จ่าย = ตั๋วที่อยู่ในสถานะ Pending
    // (ยังไม่ได้เพิ่มสถานี หรือ ยังไม่ได้ assign ช่าง)
    return t.status === "Pending";
  };

  const { openTickets, closedTickets } = useMemo(() => {
    const filtered = tickets.filter(matchSearch).filter(filterPredicate);
    const opens = filtered.filter((t) => t.status !== "Finish");
    const closed = filtered.filter((t) => t.status === "Finish");
    return { openTickets: opens, closedTickets: closed };
  }, [tickets, searchTerm, selectedStatuses, selectedPriorities, hasDueDateOnly, selectedItemCodes]);

  // Merge station flows เข้ากับ tickets ใน groupedByItem
  const groupedByItemWithFlows = useMemo(() => {
    // ไม่ log เพราะสร้าง noise
    
    return groupedByItem.map(group => ({
      ...group,
      items: group.items.map(ticket => {
        const merged = { ...ticket };
        
        // ดึงข้อมูลจาก Supabase ก่อน
        const dbTicket = dbTickets.find(db => db.no === String(ticket.id || ticket.rpd).replace('#',''));
        
        if (dbTicket) {
          // ใช้ข้อมูลจาก database
          if (dbTicket.customerName) merged.customerName = dbTicket.customerName;
          if (dbTicket.priority) {
            merged.priority = dbTicket.priority;
            // อัปเดต priorityClass ตาม priority ที่ผู้ใช้ตั้ง
            if (dbTicket.priority === "High Priority") {
              merged.priorityClass = "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
            } else if (dbTicket.priority === "Medium Priority") {
              merged.priorityClass = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
            } else if (dbTicket.priority === "Low Priority") {
              merged.priorityClass = "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
            } else {
              merged.priorityClass = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
            }
          }
          
          // หา station flows ที่เกี่ยวข้องกับ ticket นี้
          // เรียงลำดับตาม step_order เพื่อให้แน่ใจว่าได้ลำดับที่ถูกต้อง
          const ticketFlows = Array.isArray(dbStationFlows) 
            ? dbStationFlows
                .filter(flow => {
                  const flowTicketNo = String(flow.ticket_no || '').trim();
                  const ticketId = String(ticket.id || ticket.rpd || '').trim().replace('#', '');
                  return flowTicketNo === ticketId;
                })
                .sort((a, b) => {
                  const orderA = Number(a.step_order) || 0;
                  const orderB = Number(b.step_order) || 0;
                  return orderA - orderB;
                })
            : [];
          
          if (ticketFlows.length > 0) {
            const ticketId = String(ticket.id || ticket.rpd || '').trim().replace('#', '');
            
            // สร้าง roadmap จาก station flows
            merged.roadmap = ticketFlows.map((flow) => ({
              step: flow.stations?.name_th || "",
              status: flow.status || "pending",
              technician: flow.ticket_assignments?.[0]?.users?.name || ""
            }));
            
            // Debug: ตรวจสอบเฉพาะเมื่อมีปัญหา (flows มากกว่า 7 แต่ roadmap ไม่ครบ)
            if (ticketFlows.length > 7 && merged.roadmap.length !== ticketFlows.length) {
              console.warn(`⚠️ [ROADMAP] Ticket ${ticketId}: ${ticketFlows.length} flows but only ${merged.roadmap.length} roadmap steps created`);
            } else if (ticketFlows.length > 7) {
              // Log เฉพาะเมื่อมี flows มากกว่า 7 และ roadmap ถูกต้อง
              console.log(`✅ [ROADMAP] Ticket ${ticketId}: ${ticketFlows.length} flows → ${merged.roadmap.length} roadmap steps`);
            }
            
            // คำนวณสถานะตามการ assign และความคืบหน้า
            const stations = ticketFlows.map(flow => ({
              name: flow.stations?.name_th || "",
              technician: flow.ticket_assignments?.[0]?.users?.name || "",
              status: flow.status || "pending"
            }));
            // กำหนด assignee ให้โชว์บนการ์ด: แสดงเฉพาะช่างของสถานีปัจจุบัน
            const currentFlow = ticketFlows.find(f => f.status === 'current');
            let primaryAssignee = currentFlow?.ticket_assignments?.[0]?.users?.name || '';
            if (!primaryAssignee) {
              // หากยังไม่เริ่มงาน (ไม่มี current) ให้แสดงช่างของสถานีแรกตามลำดับ
              const firstFlow = ticketFlows[0];
              primaryAssignee = firstFlow?.ticket_assignments?.[0]?.users?.name || '';
            }
            merged.assignee = primaryAssignee || '-';
            merged.status = calculateTicketStatus(stations, merged.roadmap);
            merged.statusClass = getStatusClass(merged.status);
            merged.hasStationFlow = true;
          } else {
            // ถ้าไม่มี station flows ใน database ให้ใช้ roadmap เดิมจาก ERP
            // ไม่ log เพราะมี ticket หลายตัวที่ยังไม่มี station flows (ปกติ)
            // ตั้งสถานะเป็น Pending เพื่อให้รู้ว่าต้องรอ Admin เพิ่มสถานี
            merged.status = "Pending";
            merged.statusClass = "text-blue-600";
            merged.hasStationFlow = false;
          }
        }
        
        return merged;
      })
    }));
  }, [groupedByItem, dbTickets, dbStationFlows]);

  // คำนวณจำนวนตั๋วที่เปิดจากข้อมูลใหม่ที่จัดกลุ่มตาม Item Code
  const groupedTicketsCount = useMemo(() => {
    if (!groupedByItemWithFlows.length) return 0;
    return groupedByItemWithFlows.reduce((total, group) => {
      const filteredItems = group.items
        .filter(ticket => ticket.status !== "Finish") // กรองเฉพาะตั๋วที่เปิด
        .filter(ticket => {
          if (!searchTerm) return true;
          const q = searchTerm.toLowerCase();
          return (
            (ticket.id || "").toLowerCase().includes(q) ||
            (ticket.title || "").toLowerCase().includes(q) ||
            (ticket.rpd || "").toLowerCase().includes(q) ||
            (ticket.itemCode || "").toLowerCase().includes(q) ||
            (ticket.description || "").toLowerCase().includes(q)
          );
        })
        .filter(filterPredicate);
      return total + filteredItems.length;
    }, 0);
  }, [groupedByItemWithFlows, searchTerm, selectedStatuses, selectedPriorities, hasDueDateOnly, selectedItemCodes]);

  // คำนวณตั๋วที่ปิดจากข้อมูลใหม่ที่จัดกลุ่มตาม Item Code
  const closedTicketsFromGrouped = useMemo(() => {
    if (!groupedByItemWithFlows.length) return [];
    const allTickets = groupedByItemWithFlows.flatMap(group => group.items);
    const filtered = allTickets.filter(ticket => ticket.status === "Finish").filter(filterPredicate);
    return filtered.filter(ticket => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        (ticket.id || "").toLowerCase().includes(q) ||
        (ticket.title || "").toLowerCase().includes(q) ||
        (ticket.rpd || "").toLowerCase().includes(q) ||
        (ticket.itemCode || "").toLowerCase().includes(q) ||
        (ticket.description || "").toLowerCase().includes(q)
      );
    });
  }, [groupedByItemWithFlows, searchTerm, selectedStatuses, selectedPriorities, hasDueDateOnly, selectedItemCodes]);

  // กำหนด tabs
  const tabs = [
    {
      id: "open",
      label: language === 'th' ? 'ตั๋วทั้งหมดที่เปิด' : 'All Open Tickets',
      count: groupedTicketsCount > 0 ? groupedTicketsCount : openTickets.length,
      data: openTickets,
      emptyMessage: language === 'th' ? 'ไม่พบตั๋วที่เปิด' : 'No open tickets found',
      emptySubMessage: language === 'th' ? 'กรุณาอัปโหลดแบบแปลนในหน้า Project ก่อน' : 'Please upload blueprints in Project page first'
    },
    {
      id: "closed",
      label: language === 'th' ? 'ตั๋วทั้งหมดที่ปิด' : 'All Closed Tickets',
      count: closedTicketsFromGrouped.length > 0 ? closedTicketsFromGrouped.length : closedTickets.length,
      data: closedTicketsFromGrouped.length > 0 ? closedTicketsFromGrouped : closedTickets,
      emptyMessage: language === 'th' ? 'ไม่พบตั๋วที่ปิด' : 'No closed tickets found',
      emptySubMessage: language === 'th' ? 'ยังไม่มีตั๋วที่ปิด' : 'No closed tickets yet'
    }
  ];

  const currentTab = tabs.find(tab => tab.id === activeTab);

  function TicketCard({ ticket, onEdit, onDelete, ticketBomStatus, ticketAssignmentStatus, projectMapByItemCode }) {
    const cleanedRpd = String(ticket.rpd || ticket.id || '').replace(/^#/, '').trim();
    const editHref = `/tickets/${encodeURIComponent(cleanedRpd)}/edit`;
    const currentIndex = ticket.roadmap.findIndex((step) => step.status === 'current');
    const currentTech = currentIndex >= 0 ? ticket.roadmap[currentIndex]?.technician : undefined;
    const firstPendingIndex = ticket.roadmap.findIndex((s) => s.status !== 'completed');
    
    // ข้ามการหาจาก mock projects เดิม
    return (
      <div className="ticket-card bg-white dark:bg-slate-800 rounded-lg shadow-sm p-3 sm:p-4 border border-gray-200 dark:border-slate-700 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden max-w-full">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 dark:text-gray-100">{ticket.id}</h3>
              {/* ข้อมูลรหัสต่างๆ - ย้ายมาด้านบนข้างๆ เลขตั๋ว (ลบ RPD ออกเพราะซ้ำกับเลขตั๋ว) */}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] sm:text-xs text-gray-600 dark:text-gray-400">
                {ticket.itemCode && (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-gray-500 dark:text-gray-400">Item</span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">{ticket.itemCode}</span>
                  </span>
                )}
                {/* เอา Project name ด้านบนออกเพราะไปแสดงตรงไอคอนคนด้านล่างแล้ว */}
              </div>
            </div>
             {/* ข้อมูลที่ย้ายมาจากด้านบน - ใส่ในกรอบ */}
             <div className="mb-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
               <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] sm:text-xs text-gray-600 dark:text-gray-400">
                <span className={`text-xs px-2 py-1 rounded-full ${ticket.priorityClass}`}>
                  {ticket.priority}
                </span>
                  <span className="inline-flex items-center gap-1 font-medium text-blue-700 dark:text-blue-300">
                    <User className="w-3 h-3" />
                  {/* ใช้ชื่อโปรเจ็คจาก projectMapByItemCode เป็นหลัก แสดงตรงไอคอนคน (ตำแหน่งที่ต้องการ) */}
                  {(() => {
                    const projectFromMap = projectMapByItemCode instanceof Map
                      ? projectMapByItemCode.get(ticket.itemCode)
                      : null;
                    const displayProjectName =
                      projectFromMap?.project_name ||
                      projectFromMap?.description ||
                      ticket.projectName ||
                      ticket.customerName;
                    return displayProjectName || (language === 'th' ? 'ไม่ระบุโปรเจ็ค' : 'Unknown project');
                  })()}
                  </span>
                <span className="inline-flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300">
                  จำนวน: {ticket.quantity} ชิ้น
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{t('dueDate', language)}: {formatDate(ticket.dueDate)}</span>
                </span>
                {/* Warning: ยังไม่ได้จ่ายวัตถุดิบ (ไม่มี BOM) */}
                {(() => {
                  const ticketNo = String(ticket.id || ticket.rpd).replace('#','').trim();
                  // ใช้ข้อมูลจาก ticketBomStatus โดยตรง (มี priority สูงกว่า ticket.hasBom)
                  const bomStatus = ticketBomStatus.get(ticketNo);
                  const actualHasBom = bomStatus !== undefined ? bomStatus : (ticket.hasBom || false);
                  
                  return !actualHasBom ? (
                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-3 h-3" />
                      <span>{language === 'th' ? 'ยังไม่ได้กรอกข้อมูล' : 'Information not filled in'}</span>
                    </span>
                  ) : null;
                })()}
                {/* Warning: ยังไม่ได้มอบหมายงานให้ช่าง */}
                {(() => {
                  const ticketNo = String(ticket.id || ticket.rpd).replace('#','').trim();
                  const hasStationFlow = ticket.hasStationFlow || false;
                  // ใช้ข้อมูลจาก ticketAssignmentStatus โดยตรง (มี priority สูงกว่า ticket.hasAssignment)
                  const assignmentStatus = ticketAssignmentStatus.get(ticketNo);
                  const actualHasAssignment = assignmentStatus !== undefined 
                    ? assignmentStatus 
                    : (ticket.hasAssignment || false);
                  const inDatabase = ticket.inDatabase || false;
                  const status = ticket.status || 'Pending';
                  
                  // เงื่อนไขการแสดง warning:
                  // แสดง warning เฉพาะเมื่อ:
                  // 1. มี station flow แต่ยังไม่มี assignment (ไม่ว่าสถานะจะเป็นอะไร)
                  // 2. ยังไม่มี station flow แต่มี ticket ใน DB และ status เป็น Pending
                  // ไม่แสดง warning เมื่อ:
                  // - มี assignment แล้ว (ไม่ว่าจะมี station flow หรือไม่)
                  // - Status เป็น Released, In Progress, หรือ Finish (เพราะแสดงว่ามีการทำงานแล้ว)
                  const shouldShow = 
                    (hasStationFlow && !actualHasAssignment) || 
                    (!hasStationFlow && inDatabase && status === 'Pending' && !actualHasAssignment);
                  
                  // ไม่ log debug เพราะสร้าง noise
                  if (false && ticketNo === 'RPD2510-199') {
                    console.log('[ASSIGNMENT WARNING DEBUG]', {
                      ticketNo,
                      hasStationFlow,
                      actualHasAssignment,
                      assignmentStatus,
                      ticketHasAssignment: ticket.hasAssignment,
                      inDatabase,
                      status,
                      shouldShow,
                      ticketObject: {
                        hasStationFlow: ticket.hasStationFlow,
                        hasAssignment: ticket.hasAssignment,
                        inDatabase: ticket.inDatabase
                      }
                    });
                  }
                  
                  return shouldShow ? (
                    <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400">
                      <AlertCircle className="w-3 h-3" />
                      <span>{language === 'th' ? 'ยังไม่ได้มอบหมายงานให้ช่าง' : 'Not assigned to technician yet'}</span>
                    </span>
                  ) : null;
                })()}
               </div>
             </div>

            {/* Description และ Description_2 แยกกันชัดเจน */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm sm:text-base font-medium text-gray-800 dark:text-gray-200">
                  {ticket.title}
                </h4>
                
                {/* Badge สำหรับ ticket ใหม่ */}
                {ticket.isNew && (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full dark:bg-green-900/20 dark:text-green-300">
                    ใหม่!
                  </span>
                )}
                
                {/* Badge สำหรับ ticket ที่ยังไม่มี station flow */}
                {!ticket.hasStationFlow && (
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full dark:bg-yellow-900/20 dark:text-yellow-300">
                    ยังไม่ได้เริ่มงาน
                  </span>
                )}
              </div>
              
               {ticket.description2 && (
                 <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 italic">
                   {ticket.description2}
                 </p>
               )}
            </div>
            
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-1">
                <span className={`animate-pulse ${ticket.statusClass}`}>●</span>
                <span>{ticket.status}</span>
              </div>
              <div className="flex items-center gap-1">
                <User className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>{ticket.assignee}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>{ticket.time}</span>
              </div>
            </div>
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100 dark:border-slate-700 min-w-0">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">{t('productionPath', language)}:</span>
              </div>
              {/* แสดง roadmap ในกล่องแยกที่จำกัดความกว้าง แต่สามารถ scroll ได้ */}
              {/* ล็อคความกว้างกล่อง roadmap ไม่ให้ขยายเต็มจอ แล้วให้เลื่อนซ้ายขวาเฉพาะด้านใน */}
              <div className="w-full max-w-[960px] mx-auto overflow-hidden border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4">
                {/* กล่อง scroll ล็อคความกว้างเท่ากับกล่องด้านนอก */}
                <div className="w-full overflow-x-auto overflow-y-hidden pb-2 roadmap-scroll">
                  {/* เนื้อหา roadmap ใช้ inline-flex ให้ยาวเฉพาะในกล่อง scroll นี้ */}
                  <div className="inline-flex items-center gap-2 sm:gap-2 lg:gap-3">
                    {ticket.roadmap.map((step, stepIndex) => (
                      <div key={stepIndex} className="flex items-center flex-shrink-0 relative">
                        <div className="flex flex-col items-center">
                          <div className="relative group">
                            <div className={`rounded-full border-2 transition-all duration-300 ${
                              step.status === 'completed'
                                ? 'w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-3.5 md:h-3.5 lg:w-3.5 lg:h-3.5 xl:w-4 xl:h-4 bg-gradient-to-br from-emerald-400 to-emerald-600 border-emerald-500 shadow-md'
                                : step.status === 'current'
                                ? 'w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-4 md:h-4 lg:w-4 lg:h-4 xl:w-4 xl:h-4 bg-amber-500 border-amber-500 shadow-lg shadow-amber-500/30 animate-pulse ring-2 ring-amber-300/40'
                                : 'w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3 md:h-3 lg:w-3 lg:h-3 xl:w-3 xl:h-3 bg-gray-200 border-gray-200'
                            }`} />
                            {(step.status === 'completed' || step.status === 'current') && (
                              <div className={`${step.status === 'completed' ? 'bg-emerald-400/30' : 'bg-amber-400/30'} absolute -inset-1 rounded-full blur-md opacity-50 pointer-events-none`} />
                            )}
                          </div>
                          <div className={`mt-1.5 sm:mt-2 text-[10px] sm:text-[11px] md:text-[10px] lg:text-[10px] xl:text-xs px-1.5 sm:px-2 py-1 bg-white dark:bg-slate-800 rounded border text-center min-w-fit transition-transform duration-200 ${
                            step.status === 'completed'
                              ? 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700 shadow-[0_1px_6px_rgba(16,185,129,0.12)]'
                              : step.status === 'current'
                              ? 'text-amber-600 dark:text-amber-400 font-medium border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 shadow-[0_1px_6px_rgba(245,158,11,0.16)]'
                              : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-slate-700'
                          } group-hover:-translate-y-0.5`}>
                            <div className="font-medium">{stepIndex + 1}.</div>
                            <div className="text-[10px] sm:text-[10px] md:text-[10px] lg:text-[10px] xl:text-xs leading-tight">{step.step}</div>
                          </div>
                        </div>
                        {stepIndex < ticket.roadmap.length - 1 && (() => {
                          const next = ticket.roadmap[stepIndex + 1];
                          const isCompleted = step.status === 'completed';
                          const hasCurrent = currentIndex >= 0;
                          const connectsToCurrent = isCompleted && (next?.status === 'current' || (!hasCurrent && firstPendingIndex === stepIndex + 1));
                          let connectorClass = 'road-connector';
                          if (isCompleted) connectorClass += ' road-connector--completed';
                          if (connectsToCurrent) connectorClass += ' road-connector--active';
                          return (
                            <div className={`w-8 sm:w-10 md:w-10 lg:w-10 xl:w-16 mx-1 sm:mx-2 lg:mx-2 xl:mx-3 ${connectorClass}`}>
                              {connectsToCurrent && (
                                <>
                                  <div className="road-connector__fill" />
                                  <div className="road-connector__beam" />
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-2 sm:mt-3 p-2 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <div className="flex flex-col gap-2 sm:gap-1 text-xs sm:text-[12px] md:text-[12px] lg:text-[12px] xl:text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 dark:text-gray-400">{language === 'th' ? 'ขั้นตอนปัจจุบัน:' : 'Current Step:'}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {ticket.roadmap.find(step => step.status === 'current')?.step || 
                       ticket.roadmap.find(step => step.status === 'completed')?.step || 
                       (language === 'th' ? 'รอเริ่มต้น' : 'Waiting to start')}
                    </span>
                    {ticket.roadmap.find(step => step.status === 'current') && (
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">
                        {language === 'th' ? 'กำลังดำเนินการ' : 'In Progress'}
                      </span>
                    )}
                  </div>
                  {currentTech && (
                    <div className="inline-flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <User className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="text-xs sm:text-sm">{language === 'th' ? 'ช่างประจำสถานี:' : 'Station Technician:'} <span className="font-medium">{currentTech}</span></span>
                    </div>
                  )}
                  {!currentTech && ticket.roadmap.find(step => step.status === 'current') && (
                    <div className="inline-flex items-center gap-2 text-orange-600 dark:text-orange-400">
                      <User className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="text-xs sm:text-sm">{language === 'th' ? 'ยังไม่ได้มอบหมายช่าง' : 'No technician assigned'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 w-full lg:w-auto lg:flex-shrink-0" style={{ minWidth: 0, maxWidth: '100%' }}>
            {canAction ? (
              <Link
                href={editHref}
                onClick={(e) => e.stopPropagation()}
                className="px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all duration-150 bg-blue-600 hover:bg-blue-700 text-white hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <Edit className="w-3 h-3" />
                <span>{t('editTicket', language)}</span>
              </Link>
            ) : (
              <span
                className="px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 bg-gray-400 text-white opacity-50 cursor-not-allowed"
                aria-disabled
              >
                <Edit className="w-3 h-3" />
                <span>{t('editTicket', language)}</span>
              </span>
            )}
            {canAction && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(ticket); }}
                disabled={isDeleting}
                className="px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all duration-150 bg-red-600 hover:bg-red-700 text-white hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3 h-3" />
                <span>{t('deleteTicket', language)}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleEdit = (ticket) => {
    try {
      // ใช้ RPD No. แทน project_number
      const rpdNo = ticket.rpd || ticket.id || "";
      const cleanedRpd = rpdNo.replace(/^#/,'');
      router.push(`/tickets/${encodeURIComponent(cleanedRpd)}/edit`);
    } catch (e) {
      console.error("Navigate to edit failed", e);
    }
  };

  const handleRequestDelete = (ticket) => {
    if (!canAction) return;
    setDeleteTarget(ticket);
    setShowDeleteConfirm(true);
  };

  const handleCloseDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const ticketId = String(deleteTarget.rpd || deleteTarget.id || '').replace(/^#/, '').trim();
      let authHeader = {};
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.access_token) {
          authHeader = { Authorization: `Bearer ${currentSession.access_token}` };
        }
      } catch (e) {
        console.warn('Failed to get auth session for delete', e);
      }

      const resp = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, { method: 'DELETE', headers: { ...authHeader } });
      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(json?.error || t('deleteError', language) || 'Delete failed');
      }

      setShowDeleteConfirm(false);
      setDeleteTarget(null);
      // รีเฟรชข้อมูล
      setRefreshTrigger(prev => prev + 1);
      // ลบออกจาก state ทันทีเพื่อให้ UI ตอบสนองเร็ว
      setErpTickets(prev => prev.filter(t => {
        const id = String(t.rpd || t.id || '').replace(/^#/, '').trim();
        return id !== ticketId;
      }));
    } catch (e) {
      console.error('Delete ticket failed', e);
      setErrorMessage(typeof e === 'object' ? (e?.message || JSON.stringify(e)) : String(e));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLoadMore = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 1500);
  };

  const toggleItemExpansion = (itemCode) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemCode)) {
        newSet.delete(itemCode);
      } else {
        newSet.add(itemCode);
      }
      return newSet;
    });
  };

  return (
    <div className="min-h-screen px-3 sm:px-4 py-4 sm:py-5 md:px-6 md:py-7 animate-fadeInUp overflow-x-hidden">
      <div className="max-w-6xl mx-auto w-full tickets-zoom">
      {/* Header */}
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-gray-100">{t('ticketList', language)}</h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-2">{t('ticketListDesc', language)}</p>
        {loadingInitial && (
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูลตั๋วจาก ERP…</div>
        )}
        {!!errorMessage && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {typeof errorMessage === 'object' ? JSON.stringify(errorMessage) : errorMessage}
          </div>
        )}
        
        {/* คำอธิบายการทำงาน */}
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">{t('howSystemWorks', language)}:</h3>
              <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <li>• {translations[language].systemInstructions[0]}</li>
                <li>• {translations[language].systemInstructions[1]}</li>
                <li>• {translations[language].systemInstructions[2]}</li>
                <li>• {translations[language].systemInstructions[3]}</li>
              </ul>
            </div>
          </div>
        </div>
      </header>
      
      {/* Search and Filter Section */}
      <div className="mb-4 sm:mb-6 animate-fadeInDown">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            </div>
            <input 
              type="text" 
              className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:scale-[1.02] text-sm sm:text-base text-gray-900 dark:text-gray-100"
              placeholder={t('searchTickets', language)}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {/* Filter Button */}
          <button onClick={() => setShowFilter(v => !v)} className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm sm:text-base text-gray-900 dark:text-gray-100">
            <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>{t('filter', language)}</span>
            {activeFilterCount > 0 && (
              <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">{activeFilterCount}</span>
            )}
          </button>
        </div>
        {showFilter && (
          <div className="mt-3 p-3 sm:p-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg animate-fadeInDown">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Status filter */}
              <div>
                <div className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">{language === 'th' ? 'สถานะ' : 'Status'}</div>
                {['Pending','Released','In Progress','Finish'].map(st => (
                  <label key={st} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-1">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.has(st)}
                      onChange={(e) => {
                        setSelectedStatuses(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(st); else next.delete(st);
                          return next;
                        });
                      }}
                    />
                    <span>{st}</span>
                  </label>
                ))}
              </div>
              {/* Priority filter */}
              <div>
                <div className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">{language === 'th' ? 'ความสำคัญ' : 'Priority'}</div>
                {['High Priority','Medium Priority','Low Priority','ยังไม่ได้กำหนด Priority'].map(pr => (
                  <label key={pr} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-1">
                    <input
                      type="checkbox"
                      checked={selectedPriorities.has(pr)}
                      onChange={(e) => {
                        setSelectedPriorities(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(pr); else next.delete(pr);
                          return next;
                        });
                      }}
                    />
                    <span>{pr}</span>
                  </label>
                ))}
              </div>
              {/* Due date filter */}
              <div>
                <div className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">{language === 'th' ? 'วันกำหนดส่ง' : 'Due Date'}</div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-1">
                  <input type="checkbox" checked={hasDueDateOnly} onChange={(e) => setHasDueDateOnly(e.target.checked)} />
                  <span>{language === 'th' ? 'แสดงเฉพาะที่มีวันกำหนดส่ง' : 'Only with due date'}</span>
                </label>
              </div>
              {/* Item code filter */}
              <div>
                <div className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">Item Code</div>
                <div className="max-h-32 overflow-auto pr-1 border border-gray-100 dark:border-slate-700 rounded">
                  {[...new Set(groupedByItemWithFlows.map(g => g.itemCode))].sort().map(code => (
                    <label key={code} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 px-2 py-1">
                      <input
                        type="checkbox"
                        checked={selectedItemCodes.has(code)}
                        onChange={(e) => {
                          setSelectedItemCodes(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(code); else next.delete(code);
                            return next;
                          });
                        }}
                      />
                      <span className="font-mono">{code}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
                onClick={() => setShowFilter(false)}
              >
                {language === 'th' ? 'ใช้ตัวกรอง' : 'Apply'}
              </button>
              <button
                className="px-3 py-2 text-sm bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-800 dark:text-gray-200 rounded"
                onClick={() => {
                  setSelectedStatuses(new Set());
                  setSelectedPriorities(new Set());
                  setHasDueDateOnly(false);
                  setSelectedItemCodes(new Set());
                }}
              >
                {language === 'th' ? 'ล้างค่า' : 'Clear'}
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Tabs Navigation */}
      <div className="mb-6">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
                <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                  activeTab === tab.id
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6" style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
        {loadingInitial ? (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              <div className="text-lg font-medium text-gray-700 dark:text-gray-300">กำลังโหลดข้อมูลตั๋ว...</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">กรุณารอสักครู่</div>
            </div>
          </div>
        ) : currentTab ? (
          <div className="space-y-4" style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
            {/* แสดงผลแบบกลุ่มตาม Item Code ก่อน */}
            {activeTab === "open" && groupedByItemWithFlows.length > 0 && (
              <div className="mb-6" style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  {language === 'th' ? 'จัดกลุ่มตาม Item Code' : 'Grouped by Item Code'}
                </h2>
                <div className="space-y-4" style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
                  {groupedByItemWithFlows
                    .filter(g => {
                      // กรองตามสถานะตั๋วก่อน
                      const relevantTickets = activeTab === "open"
                        ? g.items.filter(ticket => ticket.status !== "Finish")
                        : g.items.filter(ticket => ticket.status === "Finish");
                      
                      // ถ้าไม่มีตั๋วที่เกี่ยวข้อง ไม่ต้องแสดง Item Code นี้
                      if (relevantTickets.length === 0) return false;
                      
                      // กรองตาม search term
                      if (!searchTerm) return true;
                      const q = searchTerm.toLowerCase();
                      const inItems = relevantTickets.some(ticket => 
                        (ticket.id || '').toLowerCase().includes(q) ||
                        (ticket.title || '').toLowerCase().includes(q) ||
                        (ticket.rpd || '').toLowerCase().includes(q) ||
                        (ticket.itemCode || '').toLowerCase().includes(q) ||
                        (ticket.description || '').toLowerCase().includes(q)
                      );
                      return (g.itemCode || '').toLowerCase().includes(q) || inItems;
                    })
                    .sort((a, b) => a.itemCode.localeCompare(b.itemCode))
                    .map((g, i) => {
                      const isExpanded = expandedItems.has(g.itemCode);
                      return (
                        <div
                          key={g.itemCode}
                          className="ticket-card bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 animate-fadeInUpSmall"
                          style={{ animationDelay: `${0.06 * (i + 1)}s` }}
                        >
                          {/* Header with collapse/expand button */}
                          <div 
                            className="flex items-center justify-between p-4 sm:p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                            onClick={() => toggleItemExpansion(g.itemCode)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                )}
                                {(() => {
                                  const projectFromMap = projectMapByItemCode instanceof Map
                                    ? projectMapByItemCode.get(g.itemCode)
                                    : null;
                                  const displayProjectName =
                                    projectFromMap?.project_name ||
                                    projectFromMap?.description ||
                                    '';
                                  return (
                                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                                      <span className="font-mono">{g.itemCode}</span>
                                      {displayProjectName && (
                                        <span className="ml-2 text-sm font-normal text-blue-300">
                                          {displayProjectName}
                                        </span>
                                      )}
                                    </h3>
                                  );
                                })()}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                                  {(() => {
                                    const relevantTickets = activeTab === "open"
                                      ? g.items.filter(ticket => ticket.status !== "Finish")
                                      : g.items.filter(ticket => ticket.status === "Finish");
                                    const relevantCount = relevantTickets.length;
                                    const totalQuantity = relevantTickets.reduce((sum, ticket) => sum + (Number(ticket.quantity) || 0), 0);
                                    return `${relevantCount} ${language === 'th' ? 'ตั๋ว' : 'tickets'}${totalQuantity > 0 ? ` • ${totalQuantity.toLocaleString()} ${language === 'th' ? 'ชิ้น' : 'pcs'}` : ''}`;
                                  })()}
                                </span>
                                {(() => {
                                  // คำนวณจำนวน RPD ที่ยังไม่กรอกข้อมูล (ไม่มีสถานี)
                                  const relevantTickets = activeTab === "open"
                                    ? g.items.filter(ticket => ticket.status !== "Finish")
                                    : g.items.filter(ticket => ticket.status === "Finish");
                                  
                                  const missingStationCount = relevantTickets.filter(ticket => {
                                    // เช็คว่ามี station flow หรือไม่
                                    return !ticket.hasStationFlow;
                                  }).length;
                                  
                                  if (missingStationCount > 0) {
                                    return (
                                      <span className="inline-flex items-center justify-center text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                                        {language === 'th' ? `ยังไม่กรอกข้อมูล ${missingStationCount} ตั๋ว` : `${missingStationCount} tickets missing info`}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {isExpanded ? (language === 'th' ? 'คลิกเพื่อย่อ' : 'Click to collapse') : (language === 'th' ? 'คลิกเพื่อขยาย' : 'Click to expand')}
                            </div>
                          </div>
                          
                          {/* Collapsible content */}
                          {isExpanded && (() => {
                            // กรองเฉพาะตั๋วที่เปิดเมื่อ activeTab === "open"
                            const displayItems = activeTab === "open" 
                              ? g.items.filter(ticket => ticket.status !== "Finish")
                              : g.items;
                            
                            return (
                              <div className="px-4 sm:px-5 pb-4 sm:pb-5 border-t border-gray-100 dark:border-slate-700" style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
                                <div className="space-y-3 pt-3" style={{ width: '100%', minWidth: 0 }}>
                                  {displayItems.map((ticket, ticketIndex) => (
                                    <div key={ticket.id} className="animate-fadeInUpSmall" style={{ animationDelay: `${0.06 * (ticketIndex + 1)}s`, width: '100%', minWidth: 0 }}>
                                      <TicketCard
                                        ticket={ticket}
                                        onEdit={handleEdit}
                                        onDelete={handleRequestDelete}
                                        ticketBomStatus={ticketBomStatus}
                                        ticketAssignmentStatus={ticketAssignmentStatus}
                                        projectMapByItemCode={projectMapByItemCode}
                                      />
                                    </div>
                                  ))}
                                  {displayItems.length === 0 && (
                                    <div className="py-4 text-center text-xs text-gray-500 bg-gray-50 dark:bg-slate-700 rounded-lg">
                                      {language === 'th' ? 'ไม่พบ RPD ที่เกี่ยวข้อง' : 'No related RPDs'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
            
            {/* แสดงผลแบบกลุ่มตาม Item Code สำหรับแท็บ "ปิด" */}
            {activeTab === "closed" && groupedByItemWithFlows.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  {language === 'th' ? 'จัดกลุ่มตาม Item Code' : 'Grouped by Item Code'}
                </h2>
                <div className="space-y-4" style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
                  {groupedByItemWithFlows
                    .filter(g => {
                      // กรองตามสถานะตั๋วก่อน
                      const relevantTickets = activeTab === "open"
                        ? g.items.filter(ticket => ticket.status !== "Finish")
                        : g.items.filter(ticket => ticket.status === "Finish");
                      
                      // ถ้าไม่มีตั๋วที่เกี่ยวข้อง ไม่ต้องแสดง Item Code นี้
                      if (relevantTickets.length === 0) return false;
                      
                      // กรองตาม search term
                      if (!searchTerm) return true;
                      const q = searchTerm.toLowerCase();
                      const inItems = relevantTickets.some(ticket => 
                        (ticket.id || '').toLowerCase().includes(q) ||
                        (ticket.title || '').toLowerCase().includes(q) ||
                        (ticket.rpd || '').toLowerCase().includes(q) ||
                        (ticket.itemCode || '').toLowerCase().includes(q) ||
                        (ticket.description || '').toLowerCase().includes(q)
                      );
                      return (g.itemCode || '').toLowerCase().includes(q) || inItems;
                    })
                    .sort((a, b) => a.itemCode.localeCompare(b.itemCode))
                    .map((g, i) => {
                      const isExpanded = expandedItems.has(g.itemCode);
                      return (
                        <div key={g.itemCode} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 animate-fadeInUpSmall" style={{ animationDelay: `${0.06 * (i + 1)}s`, width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
                          {/* Header with collapse/expand button */}
                          <div 
                            className="flex items-center justify-between p-4 sm:p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                            onClick={() => toggleItemExpansion(g.itemCode)}
                            style={{ minWidth: 0, maxWidth: '100%' }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                )}
                                {(() => {
                                  const projectFromMap = projectMapByItemCode instanceof Map
                                    ? projectMapByItemCode.get(g.itemCode)
                                    : null;
                                  const displayProjectName =
                                    projectFromMap?.project_name ||
                                    projectFromMap?.description ||
                                    '';
                                  return (
                                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                                      <span className="font-mono">{g.itemCode}</span>
                                      {displayProjectName && (
                                        <span className="ml-2 text-sm font-normal text-blue-300">
                                          {displayProjectName}
                                        </span>
                                      )}
                                    </h3>
                                  );
                                })()}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                                  {(() => {
                                    const relevantTickets = activeTab === "open"
                                      ? g.items.filter(ticket => ticket.status !== "Finish")
                                      : g.items.filter(ticket => ticket.status === "Finish");
                                    const relevantCount = relevantTickets.length;
                                    const totalQuantity = relevantTickets.reduce((sum, ticket) => sum + (Number(ticket.quantity) || 0), 0);
                                    return `${relevantCount} ${language === 'th' ? 'ตั๋ว' : 'tickets'}${totalQuantity > 0 ? ` • ${totalQuantity.toLocaleString()} ${language === 'th' ? 'ชิ้น' : 'pcs'}` : ''}`;
                                  })()}
                                </span>
                                {(() => {
                                  // คำนวณจำนวน RPD ที่ยังไม่กรอกข้อมูล (ไม่มีสถานี)
                                  const relevantTickets = activeTab === "open"
                                    ? g.items.filter(ticket => ticket.status !== "Finish")
                                    : g.items.filter(ticket => ticket.status === "Finish");
                                  
                                  const missingStationCount = relevantTickets.filter(ticket => {
                                    // เช็คว่ามี station flow หรือไม่
                                    return !ticket.hasStationFlow;
                                  }).length;
                                  
                                  if (missingStationCount > 0) {
                                    return (
                                      <span className="inline-flex items-center justify-center text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                                        {language === 'th' ? `ยังไม่กรอกข้อมูล ${missingStationCount} ตั๋ว` : `${missingStationCount} tickets missing info`}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {isExpanded ? (language === 'th' ? 'คลิกเพื่อย่อ' : 'Click to collapse') : (language === 'th' ? 'คลิกเพื่อขยาย' : 'Click to expand')}
                            </div>
                          </div>
                          
                          {/* Collapsible content */}
                          {isExpanded && (() => {
                            // กรองเฉพาะตั๋วที่ปิดเมื่อ activeTab === "closed"
                            const displayItems = activeTab === "open" 
                              ? g.items.filter(ticket => ticket.status !== "Finish")
                              : g.items.filter(ticket => ticket.status === "Finish");
                            
                            return (
                              <div className="px-4 sm:px-5 pb-4 sm:pb-5 border-t border-gray-100 dark:border-slate-700" style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
                                <div className="space-y-3 pt-3" style={{ width: '100%', minWidth: 0 }}>
                                  {displayItems.map((ticket, ticketIndex) => (
                                    <div key={ticket.id} className="animate-fadeInUpSmall" style={{ animationDelay: `${0.06 * (ticketIndex + 1)}s`, width: '100%', minWidth: 0 }}>
                                      <TicketCard
                                        ticket={ticket}
                                        onEdit={handleEdit}
                                        onDelete={handleRequestDelete}
                                        ticketBomStatus={ticketBomStatus}
                                        ticketAssignmentStatus={ticketAssignmentStatus}
                                        projectMapByItemCode={projectMapByItemCode}
                                      />
                                    </div>
                                  ))}
                                  {displayItems.length === 0 && (
                                    <div className="py-4 text-center text-xs text-gray-500 bg-gray-50 dark:bg-slate-700 rounded-lg">
                                      {language === 'th' ? 'ไม่พบ RPD ที่เกี่ยวข้อง' : 'No related RPDs'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
            
            {/* แสดงผลตั๋วปกติ - แสดงเฉพาะเมื่อไม่มีข้อมูลจาก Item Code */}
            {activeTab === "open" && groupedTicketsCount === 0 && currentTab.data.map((t, i) => (
              <div key={t.id} className="animate-fadeInUpSmall" style={{ animationDelay: `${0.06 * (i + 1)}s` }}>
                <TicketCard
                  ticket={t}
                  onEdit={handleEdit}
                  onDelete={handleRequestDelete}
                  ticketBomStatus={ticketBomStatus}
                  ticketAssignmentStatus={ticketAssignmentStatus}
                  projectMapByItemCode={projectMapByItemCode}
                />
              </div>
            ))}
            
            {/* แสดงข้อความว่างเฉพาะเมื่อไม่มีข้อมูลทั้งจาก Item Code และตั๋วปกติ */}
            {activeTab === "open" && groupedTicketsCount === 0 && currentTab.data.length === 0 && (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{currentTab.emptyMessage}</p>
                <p className="text-xs text-gray-400">{currentTab.emptySubMessage}</p>
              </div>
            )}
            
            {/* แสดงผลตั๋วปกติสำหรับแท็บอื่นๆ - แสดงเฉพาะเมื่อไม่มี Item Code grouping */}
            {activeTab !== "open" && (() => {
              // สำหรับแท็บ "ปิด" ให้แสดงตั๋วแบบปกติเฉพาะเมื่อไม่มี Item Code grouping
              if (activeTab === "closed") {
                const hasGroupedClosedTickets = groupedByItemWithFlows.some(g => {
                  const closedTickets = g.items.filter(ticket => ticket.status === "Finish");
                  return closedTickets.length > 0;
                });
                
                if (hasGroupedClosedTickets) {
                  return null; // ไม่แสดงตั๋วแบบปกติเพราะมี Item Code grouping แล้ว
                }
              }
              
              // แสดงตั๋วแบบปกติเมื่อไม่มี Item Code grouping
              if (currentTab.data.length === 0) {
                return (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{currentTab.emptyMessage}</p>
                    <p className="text-xs text-gray-400">{currentTab.emptySubMessage}</p>
                  </div>
                );
              }
              
              return currentTab.data.map((t, i) => (
                <div key={t.id} className="animate-fadeInUpSmall" style={{ animationDelay: `${0.06 * (i + 1)}s` }}>
                  <TicketCard
                    ticket={t}
                    onEdit={handleEdit}
                    onDelete={handleRequestDelete}
                    ticketBomStatus={ticketBomStatus}
                    ticketAssignmentStatus={ticketAssignmentStatus}
                    projectMapByItemCode={projectMapByItemCode}
                  />
                </div>
              ));
            })()}
          </div>
        ) : null}
      </div>
      
      {/* Load More Button */}
      {currentTab && currentTab.data.length > 10 && (
        <div className="mt-6 sm:mt-8 text-center">
          <button 
            onClick={handleLoadMore}
            disabled={isLoading}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-all duration-200 hover:-translate-y-1 hover:shadow-md font-medium text-gray-700 dark:text-gray-300 disabled:opacity-50 text-sm sm:text-base"
          >
            <span className="flex items-center gap-2">
              <Loader className={`w-3 h-3 sm:w-4 sm:h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? t('loading', language) : (language === 'th' ? 'โหลดเพิ่มเติม' : 'Load More')}
            </span>
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-slate-700">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('confirmDelete', language) || 'Confirm Delete'}
              </h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {(t('deleteConfirmMessage', language) || 'Are you sure you want to delete ticket {ticketId}?').replace(
                  '{ticketId}',
                  String(deleteTarget?.rpd || deleteTarget?.id || '').replace(/^#/, '') || ''
                )}
              </p>
            </div>
            <div className="p-4 flex justify-end gap-3">
              <button
                onClick={handleCloseDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-60"
              >
                {t('cancel', language)}
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-60"
              >
                {isDeleting ? (language === 'th' ? 'กำลังลบ...' : 'Deleting...') : (t('deleteTicket', language) || 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

