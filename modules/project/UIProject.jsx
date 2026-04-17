"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { transformErpData } from "@/utils/erpApi";
import { getAllProjects, createProject, deleteProject, getProjectStats, getUserName } from "@/utils/projectDb";
import { supabase } from "@/utils/supabaseClient";
import {
  Plus,
  Search,
  Filter,
  Upload,
  FileText,
  Image,
  Calendar,
  User,
  Eye,
  Edit,
  Trash2,
  FolderOpen,
  CheckCircle,
  Clock,
  AlertCircle,
  FileWarning,
  ChevronDown,
  ChevronRight,
  Zap,
  Flame
} from "lucide-react";
import Modal from "@/components/Modal";

// เริ่มต้นด้วย array ว่าง - จะโหลดข้อมูลจาก API แทน
const getInitialProjects = () => [];

export default function UIProject() {
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [projects, setProjects] = useState(getInitialProjects());
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  
  // Upload states
  const [uploadForm, setUploadForm] = useState({
    file: null,
    projectName: "",
    rpdNo: "",
    description: "",
    // New fields for Project Code & Item Code system
    projectNumber: "",
    projectNameFromApi: "",
    itemType: "FG",
    itemProductCode: "",
    itemUnit: "D"
  });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  
  // Project Code API states
  const [isSearchingProject, setIsSearchingProject] = useState(false);
  const [projectSearchError, setProjectSearchError] = useState("");
  
  // ERP Integration states
  const [isErpLoading, setIsErpLoading] = useState(false);
  const [erpError, setErpError] = useState("");
  const [erpConnectionStatus, setErpConnectionStatus] = useState(null);

  // Pending drawings (items with no uploaded drawing files)
  const [pendingGroups, setPendingGroups] = useState([]);
  const [pendingTotals, setPendingTotals] = useState({ totalItems: 0, totalProjects: 0, totalUrgent: 0 });
  const [loadingPending, setLoadingPending] = useState(false);
  const [expandedPendingProjects, setExpandedPendingProjects] = useState({});
  const [activeTab, setActiveTab] = useState('projects'); // 'projects' | 'pending'

  // Product units states
  const [productUnits, setProductUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [showDeleteCustomUnitsBox, setShowDeleteCustomUnitsBox] = useState(false);
  const [newUnitForm, setNewUnitForm] = useState({ code: '', name_th: '', name_en: '' });
  const [isAddingUnit, setIsAddingUnit] = useState(false);
  const [addUnitError, setAddUnitError] = useState('');

  // Helper function to check if user is admin or superadmin
  const isAdminOrAbove = () => {
    if (!user) return false;
    const roles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    return roles.some(role => {
      const roleLower = String(role).toLowerCase();
      return roleLower === 'admin' || roleLower === 'superadmin';
    });
  };

  const isSuperAdmin = () => {
    if (!user) return false;
    const roles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    return roles.some(role => String(role).toLowerCase() === 'superadmin');
  };

  // โหลดข้อมูลโปรเจ็คจากฐานข้อมูล
  useEffect(() => {
    loadProjectsFromDatabase();
    loadProductUnits();
    loadPendingDrawings();
  }, []);

  // โหลดรายการ item ที่ยังไม่มีไฟล์แบบ
  const loadPendingDrawings = async () => {
    try {
      setLoadingPending(true);
      const response = await fetch('/api/projects/pending-files');
      const result = await response.json();
      if (result.success && result.data) {
        setPendingGroups(result.data.groups || []);
        setPendingTotals({
          totalItems: result.data.totalItems || 0,
          totalProjects: result.data.totalProjects || 0,
          totalUrgent: result.data.totalUrgent || 0
        });
      } else {
        setPendingGroups([]);
        setPendingTotals({ totalItems: 0, totalProjects: 0, totalUrgent: 0 });
      }
    } catch (error) {
      console.error('Error loading pending drawings:', error);
      setPendingGroups([]);
      setPendingTotals({ totalItems: 0, totalProjects: 0, totalUrgent: 0 });
    } finally {
      setLoadingPending(false);
    }
  };

  const togglePendingProject = (projectId) => {
    setExpandedPendingProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  // โหลดหน่วยสินค้าจาก API
  const loadProductUnits = async () => {
    try {
      setLoadingUnits(true);
      const response = await fetch('/api/product-units');
      const result = await response.json();
      if (result.success) {
        setProductUnits(result.data || []);
      } else {
        console.error('Failed to load product units:', result.error);
        // Fallback to default units if API fails
        setProductUnits([
          { code: 'D', name_th: 'ประตู', name_en: 'Door', is_custom: false },
          { code: 'F', name_th: 'วง', name_en: 'Frame', is_custom: false },
          { code: 'S', name_th: 'ชุดชาร์ป', name_en: 'Sharp Set', is_custom: false },
          { code: 'P', name_th: 'แผ่นตกแต่ง', name_en: 'Decorative Panel', is_custom: false },
          { code: 'W', name_th: 'ท่อน', name_en: 'Piece', is_custom: false },
          { code: 'M', name_th: 'บัว', name_en: 'Molding', is_custom: false },
          { code: 'O', name_th: 'อื่นๆ', name_en: 'Other', is_custom: false }
        ]);
      }
    } catch (error) {
      console.error('Error loading product units:', error);
      // Fallback to default units
      setProductUnits([
        { code: 'D', name_th: 'ประตู', name_en: 'Door', is_custom: false },
        { code: 'F', name_th: 'วง', name_en: 'Frame', is_custom: false },
        { code: 'S', name_th: 'ชุดชาร์ป', name_en: 'Sharp Set', is_custom: false },
        { code: 'P', name_th: 'แผ่นตกแต่ง', name_en: 'Decorative Panel', is_custom: false },
        { code: 'W', name_th: 'ท่อน', name_en: 'Piece', is_custom: false },
        { code: 'M', name_th: 'บัว', name_en: 'Molding', is_custom: false },
        { code: 'O', name_th: 'อื่นๆ', name_en: 'Other', is_custom: false }
      ]);
    } finally {
      setLoadingUnits(false);
    }
  };

  // เพิ่มหน่วยสินค้าใหม่
  const handleAddUnit = async () => {
    if (!newUnitForm.code || !newUnitForm.name_th) {
      setAddUnitError(language === 'th' ? 'กรุณากรอกรหัสและชื่อภาษาไทย' : 'Please enter code and Thai name');
      return;
    }

    setIsAddingUnit(true);
    setAddUnitError('');

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch('/api/product-units', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newUnitForm)
      });

      const result = await response.json();
      if (result.success) {
        setNewUnitForm({ code: '', name_th: '', name_en: '' });
        setShowAddUnitModal(false);
        await loadProductUnits(); // Reload units
      } else {
        setAddUnitError(result.error || (language === 'th' ? 'ไม่สามารถเพิ่มหน่วยสินค้าได้' : 'Failed to add product unit'));
      }
    } catch (error) {
      console.error('Error adding product unit:', error);
      setAddUnitError(language === 'th' ? 'เกิดข้อผิดพลาดในการเพิ่มหน่วยสินค้า' : 'Error adding product unit');
    } finally {
      setIsAddingUnit(false);
    }
  };

  // ลบหน่วยสินค้า (SuperAdmin เท่านั้น)
  const handleDeleteUnit = async (unitId) => {
    if (!confirm(language === 'th' ? 'คุณแน่ใจหรือไม่ว่าต้องการลบหน่วยสินค้านี้?' : 'Are you sure you want to delete this product unit?')) {
      return;
    }

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch(`/api/product-units/${unitId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();
      if (result.success) {
        await loadProductUnits(); // Reload units
      } else {
        alert(result.error || (language === 'th' ? 'ไม่สามารถลบหน่วยสินค้าได้' : 'Failed to delete product unit'));
      }
    } catch (error) {
      console.error('Error deleting product unit:', error);
      alert(language === 'th' ? 'เกิดข้อผิดพลาดในการลบหน่วยสินค้า' : 'Error deleting product unit');
    }
  };

  // ฟังก์ชันโหลดข้อมูลโปรเจ็คจากฐานข้อมูล
  const loadProjectsFromDatabase = async () => {
    try {
      const result = await getAllProjects();
      if (result.success) {
        // แปลงข้อมูลจากฐานข้อมูลให้ตรงกับรูปแบบที่ UI ใช้
        const formattedProjects = await Promise.all(result.data.map(async (project) => {
          // ดึงชื่อผู้ใช้
          const userName = await getUserName(project.uploaded_by);
          
          return {
            id: project.id,
            projectCode: project.project_code,
            fileName: project.file_name,
            filePath: project.file_path,
            fileUrl: project.file_url,
            uploadedAt: project.uploaded_at,
            created_at: project.created_at,
            uploadedBy: userName || project.uploaded_by || t('unknown', language),
            description: project.description,
            syncStatus: project.sync_status,
            rpdNo: project.project_number || project.item_code,
            fileSize: project.file_size,
            fileType: project.file_type,
            erpData: project.erp_data,
            lastSync: project.last_sync,
            // new fields
            projectNumber: project.project_number,
            projectName: project.project_name,
            itemCode: project.item_code,
            itemType: project.item_type,
            itemProductCode: project.item_product_code,
            itemUnit: project.item_unit
          };
        }));
        setProjects(formattedProjects);
      } else {
        console.error('Failed to load projects:', result.error);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  // ตรวจสอบการเชื่อมต่อ ERP เมื่อโหลดหน้า
  useEffect(() => {
    checkErpConnection();
  }, []);

  // ฟังก์ชันตรวจสอบการเชื่อมต่อ ERP
  const checkErpConnection = async () => {
    try {
      const response = await fetch('/api/erp/status');
      const result = await response.json();
      setErpConnectionStatus(result);
    } catch (error) {
      setErpConnectionStatus({
        success: false,
        error: 'Failed to check ERP connection'
      });
    }
  };

  // ฟังก์ชันค้นหา Project Code จาก API
  const searchProjectCode = async () => {
    if (!uploadForm.projectNumber.trim()) {
      setProjectSearchError(language === 'th' ? 'กรุณาใส่เลข Project Number' : 'Please enter Project Number');
      return;
    }

    setIsSearchingProject(true);
    setProjectSearchError("");

    try {
      const response = await fetch(`/api/project-code/${uploadForm.projectNumber}`);
      const result = await response.json();

      if (result.success && result.data) {
        // Update project name from API
        setUploadForm(prev => ({
          ...prev,
          projectNameFromApi: result.data.Name || result.data.name || ''
        }));
        setProjectSearchError("");
      } else {
        // Project not found but allow creating project
        const errorMsg = typeof result.error === 'object' ? JSON.stringify(result.error) : (result.error || t('projectNotFound', language));
        setProjectSearchError(language === 'th' ? 'ไม่พบโปรเจ็คโค้ดนี้ในระบบ ERP' : 'Project code not found in ERP system');
        setUploadForm(prev => ({
          ...prev,
          projectNameFromApi: ""
        }));
      }
    } catch (error) {
      const errorMsg = typeof error === 'object' ? (error?.message || JSON.stringify(error)) : String(error);
      setProjectSearchError(language === 'th' ? 'ไม่สามารถเชื่อมต่อกับระบบ ERP ได้ กรุณาลองใหม่อีกครั้ง' : 'Cannot connect to ERP system. Please try again.');
      setUploadForm(prev => ({
        ...prev,
        projectNameFromApi: ""
      }));
    } finally {
      setIsSearchingProject(false);
    }
  };

  // ฟังก์ชันสร้าง Item Code
  const generateItemCode = () => {
    const { projectNumber, itemType, itemProductCode, itemUnit } = uploadForm;
    
    if (!projectNumber || !itemType || !itemProductCode || !itemUnit) {
      return "";
    }

    return `${itemType}-${projectNumber}-${itemProductCode}-${itemUnit}`;
  };

  // ฟังก์ชันตรวจสอบ RPD No. กับ ERP
  const validateRpdWithErp = async (rpdNo) => {
    if (!rpdNo.trim()) return { valid: false, error: 'RPD No. is required' };
    
    setIsErpLoading(true);
    setErpError("");
    
    try {
      // ใช้ internal API route แทนการเรียก ERP API โดยตรง
      const response = await fetch(`/api/erp/production-order/${rpdNo}`);
      const result = await response.json();
      
      if (result.success) {
        const transformedData = transformErpData(result.data, rpdNo);
        return { 
          valid: true, 
          data: transformedData,
          message: 'RPD No. found in ERP system'
        };
      } else {
        return { 
          valid: false, 
          error: result.error || 'RPD No. not found in ERP system'
        };
      }
    } catch (error) {
      return { 
        valid: false, 
        error: 'Failed to validate RPD No. with ERP'
      };
    } finally {
      setIsErpLoading(false);
    }
  };

  // ตรวจสอบสิทธิ์สร้างโปรเจ็ค: SuperAdmin, Admin, Drawing, CNC (ไม่สนตัวพิมพ์ใหญ่/เล็ก)
  // Storage role cannot create/delete projects (view-only)
  const userRoles = user?.roles || (user?.role ? [user.role] : []);
  const normalizedRoles = userRoles.map(r => String(r).trim().toLowerCase());
  const hasStorageRole = normalizedRoles.some(r => r === 'storage');
  const canCreateProject = !hasStorageRole && normalizedRoles.some(r => ["superadmin", "admin", "drawing", "cnc"].includes(r));
  const canDeleteProject = !hasStorageRole && isAdminOrAbove();

  // Helper function to check if date is within range
  const isDateInRange = (date, range) => {
    if (!date) return false;
    const projectDate = new Date(date);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(todayStart);
    monthAgo.setDate(monthAgo.getDate() - 30);

    switch (range) {
      case "today":
        return projectDate >= todayStart;
      case "week":
        return projectDate >= weekAgo;
      case "month":
        return projectDate >= monthAgo;
      case "older":
        return projectDate < monthAgo;
      default:
        return true;
    }
  };

  // ฟิลเตอร์โปรเจ็ค (ค้นหาตาม Project Code / ชื่อไฟล์ / Description และวันที่)
  const filteredProjects = projects.filter(project => {
    // Search filter
    const q = searchTerm.toLowerCase();
    const matchesSearch = (project.projectCode || "").toLowerCase().includes(q) ||
                          (project.fileName || "").toLowerCase().includes(q) ||
                          (project.description || "").toLowerCase().includes(q) ||
                          (project.projectName || "").toLowerCase().includes(q) ||
                          (project.itemCode || "").toLowerCase().includes(q);
    
    // Date filter
    const matchesDate = dateFilter === "all" || isDateInRange(project.uploadedAt || project.created_at, dateFilter);
    
    return matchesSearch && matchesDate;
  });

  // เรียงจากเลขโปรเจ็ค (projectNumber) — เลขเยอะสุดขึ้นก่อน (มากไปน้อย)
  const sortedFilteredProjects = useMemo(() => {
    return [...filteredProjects].sort((a, b) => {
      const na = (a.projectNumber ?? a.projectCode ?? "").toString().trim();
      const nb = (b.projectNumber ?? b.projectCode ?? "").toString().trim();
      return nb.localeCompare(na, undefined, { numeric: true });
    });
  }, [filteredProjects]);

  // สถิติโปรเจ็คตามวันที่
  const stats = {
    total: projects.length,
    today: projects.filter(p => isDateInRange(p.uploadedAt || p.created_at, "today")).length,
    thisWeek: projects.filter(p => isDateInRange(p.uploadedAt || p.created_at, "week")).length,
    thisMonth: projects.filter(p => isDateInRange(p.uploadedAt || p.created_at, "month")).length
  };

  // ป้ายแสดงสถานะซิ้งค์ ERP (เหลือ 2 สถานะ: success/failed)
  const getSyncStatusBadge = (syncStatus) => {
    if (syncStatus === 'success') {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">Synced</span>;
    }
    return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">Failed</span>;
  };

  const handleViewProject = (projectId) => {
    router.push(`/project/${projectId}`);
  };

  const handleDeleteProject = (project) => {
    setSelectedProject(project);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (selectedProject) {
      try {
        const result = await deleteProject(selectedProject.id);
        
        if (result.success) {
          setProjects(projects.filter(p => p.id !== selectedProject.id));
          setShowDeleteModal(false);
          setSelectedProject(null);
          loadPendingDrawings();
        } else {
          alert(result.error || t('deleteFailed', language));
        }
      } catch (error) {
        alert(t('deleteFailed', language));
      }
    }
  };

  // File handling functions
  const handleFileSelect = (file) => {
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError(t('invalidFileType', language));
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setUploadError(t('fileTooLarge', language));
      return;
    }

    setUploadForm(prev => ({ ...prev, file }));
    setUploadError("");
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const simulateUpload = async () => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError("");
    setErpError("");

    try {
      // สำหรับ flow ใหม่: ไม่มีการอัปโหลดไฟล์และตรวจ ERP ในขั้นนี้
      const generatedItemCode = generateItemCode();
      if (!generatedItemCode) {
        setUploadError(language === 'th' ? 'ข้อมูลไม่ครบถ้วน' : 'Incomplete data');
        return;
      }

      // เตรียมข้อมูลสำหรับสร้างโปรเจ็คเหมือนเป็นโฟลเดอร์
      const projectData = {
        // ใช้ item code เป็นรหัสหลักที่แสดงในรายการ
        projectCode: generatedItemCode,
        rpdNo: null,
        fileName: null,
        filePath: null,
        fileUrl: null,
        fileSize: null,
        fileType: null,
        description: null,
        uploadedBy: user?.id || null,
        syncStatus: 'pending',
        erpData: null,
        lastSync: null,
        // New fields for Project Code & Item Code system
        projectNumber: uploadForm.projectNumber || null,
        projectName: uploadForm.projectNameFromApi || null,
        itemCode: generatedItemCode || null,
        itemType: uploadForm.itemType || null,
        itemProductCode: uploadForm.itemProductCode || null,
        itemUnit: uploadForm.itemUnit || null,
        // User info for logging
        userId: user?.id || null,
        userEmail: user?.email || null,
        userName: user?.name || null
      };

      // บันทึกลงฐานข้อมูล
      const result = await createProject(projectData);
      
      if (result.success) {
        console.log('Project created:', result.data);
        
        // ไม่สร้าง ticket อัตโนมัติ - ให้ระบบดึงจาก ERP แทน
        // Ticket จะถูกสร้างอัตโนมัติเมื่อมีข้อมูลจาก ERP API
        console.log('Project created successfully. Tickets will be synced from ERP automatically.');
        
        // สร้าง Item Code แรกอัตโนมัติ
        try {
          const itemResponse = await fetch(`/api/projects/${result.data.id}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemType: uploadForm.itemType,
              itemProductCode: uploadForm.itemProductCode,
              itemUnit: uploadForm.itemUnit
            })
          });
          
          const itemResult = await itemResponse.json();
          console.log('Item code creation result:', itemResult);
          
          if (!itemResult.success) {
            console.error('Failed to create item code:', itemResult.error);
          }
        } catch (error) {
          console.error('Failed to create initial item code:', error);
        }

        // อัปเดต UI ด้วยข้อมูลใหม่
        const newProject = {
          id: result.data.id,
          projectCode: result.data.project_code,
          fileName: result.data.file_name,
          filePath: result.data.file_path,
          fileUrl: result.data.file_url,
          uploadedAt: result.data.uploaded_at,
          created_at: result.data.created_at,
          uploadedBy: result.data.uploaded_by,
          description: result.data.description,
          syncStatus: result.data.sync_status,
          rpdNo: result.data.project_number || result.data.item_code,
          fileSize: result.data.file_size,
          fileType: result.data.file_type,
          erpData: result.data.erp_data,
          lastSync: result.data.last_sync,
          // include new fields for rendering
          projectNumber: result.data.project_number,
          projectName: result.data.project_name,
          itemCode: result.data.item_code,
          itemType: result.data.item_type,
          itemProductCode: result.data.item_product_code,
          itemUnit: result.data.item_unit
        };
        
        setProjects(prev => [newProject, ...prev]);
        loadPendingDrawings();

        // Reset form
        setUploadForm({
          file: null,
          projectName: "",
          rpdNo: "",
          description: "",
          projectNumber: "",
          projectNameFromApi: "",
          itemType: "FG",
          itemProductCode: "",
          itemUnit: "D"
        });
        setShowUploadModal(false);
        
        // Show success message
        alert(language === 'th' ? 'บันทึกโปรเจ็คสำเร็จ' : 'Project saved');
      } else {
        const errorMsg = typeof result.error === 'object' ? JSON.stringify(result.error) : (result.error || t('uploadFailed', language));
        setUploadError(errorMsg);
      }
      
    } catch (error) {
      const errorMsg = typeof error === 'object' ? (error?.message || JSON.stringify(error)) : String(error);
      setUploadError(`${t('uploadFailed', language)}: ${errorMsg}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const resetUploadForm = () => {
    setUploadForm({
      file: null,
      projectName: "",
      rpdNo: "",
      description: "",
      projectNumber: "",
      projectNameFromApi: "",
      itemType: "FG",
      itemProductCode: "",
      itemUnit: "D"
    });
    setUploadError("");
    setProjectSearchError("");
  };

  return (
    <div className="min-h-screen bg-[#f8fffe] dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-6 animate-fadeInUp container-safe">
        {/* Header */}
        <div className="mb-6 sm:mb-8 animate-fadeInDown">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-md flex-shrink-0" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
              <FolderOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t('manageProjects', language)}</h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">{t('uploadBlueprintDesc', language)}</p>
            </div>
            {/* Removed Dashboard button */}
          </div>

          {/* ERP Connection Status */}
          {erpConnectionStatus && (
            <div className="mb-4 sm:mb-6">
              <div className={`p-3 sm:p-4 rounded-lg border ${
                erpConnectionStatus.success 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {erpConnectionStatus.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                    )}
                    <span className={`font-medium text-sm sm:text-base break-words ${
                      erpConnectionStatus.success 
                        ? 'text-green-800 dark:text-green-200' 
                        : 'text-red-800 dark:text-red-200'
                    }`}>
                      {erpConnectionStatus.success 
                        ? (language === 'th' ? 'เชื่อมต่อ ERP สำเร็จ' : 'ERP Connected Successfully')
                        : (language === 'th' ? 'ไม่สามารถเชื่อมต่อ ERP ได้' : 'ERP Connection Failed')
                      }
                    </span>
                  </div>
                  <button
                    onClick={checkErpConnection}
                    className="text-xs sm:text-sm px-2 py-1 bg-white dark:bg-slate-700 rounded border hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors sm:ml-auto w-full sm:w-auto"
                  >
                    {language === 'th' ? 'ตรวจสอบใหม่' : 'Refresh'}
                  </button>
                </div>
                {erpConnectionStatus.error && (
                  <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 mt-2 break-words">
                    {erpConnectionStatus.error}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="project-stats-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700 animate-fadeInUpSmall" style={{ animationDelay: '0.1s' }}>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                  <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.total}</div>
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 break-words">{t('totalProjects', language)}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700 animate-fadeInUpSmall" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.today}</div>
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 break-words">{t('projectsToday', language)}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700 animate-fadeInUpSmall" style={{ animationDelay: '0.3s' }}>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.thisWeek}</div>
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 break-words">{t('projectsThisWeek', language)}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700 animate-fadeInUpSmall" style={{ animationDelay: '0.4s' }}>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.thisMonth}</div>
                  <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 break-words">{t('projectsThisMonth', language)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-700 mb-6 animate-fadeInUpSmall" style={{ animationDelay: '0.5s' }}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              {/* Search */}
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('searchProject', language)}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
                />
              </div>

              {/* Filter */}
              <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-shrink-0">
                <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="flex-1 sm:flex-none sm:min-w-[140px] px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
                >
                  <option value="all">{t('allDates', language)}</option>
                  <option value="today">{t('filterToday', language)}</option>
                  <option value="week">{t('filterThisWeek', language)}</option>
                  <option value="month">{t('filterThisMonth', language)}</option>
                  <option value="older">{t('filterOlder', language)}</option>
                </select>
              </div>
            </div>

            {/* Upload Button - เฉพาะ Role SuperAdmin/Admin/Drawing/CNC */}
            {canCreateProject ? (
              <button
                onClick={() => setShowUploadModal(true)}
                className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all duration-300 hover:scale-105 hover:shadow-lg flex items-center justify-center gap-2 w-full sm:w-auto text-sm sm:text-base"
              >
                <Upload className="w-4 h-4" />
                {t('createProject', language)}
              </button>
            ) : (
              <div className="px-4 py-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 rounded-lg break-words">
                {language === 'th' ? 'เฉพาะ SuperAdmin / Admin / Drawing / CNC เท่านั้น' : 'Only SuperAdmin / Admin / Drawing / CNC can create'} (Role: {normalizedRoles.join(', ') || user?.role || 'none'})
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 border-b border-slate-200 dark:border-slate-700 animate-fadeInUpSmall" style={{ animationDelay: '0.55s' }}>
          <div className="flex gap-1 sm:gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('projects')}
              className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm sm:text-base font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === 'projects'
                  ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>{t('projectList', language)}</span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {sortedFilteredProjects.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm sm:text-base font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === 'pending'
                  ? 'border-amber-500 text-amber-700 dark:text-amber-300'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <FileWarning className="w-4 h-4" />
              <span>{t('pendingDrawings', language)}</span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                {loadingPending ? '…' : pendingTotals.totalItems}
              </span>
              {pendingTotals.totalUrgent > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 urgent-glow border border-red-400">
                  <Flame className="w-3 h-3" />
                  {pendingTotals.totalUrgent}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Pending Drawings Panel */}
        {activeTab === 'pending' && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-fadeInUpSmall" style={{ animationDelay: '0.6s' }}>
            <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 break-words">
                    {t('pendingDrawings', language)}
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 break-words">
                    {t('pendingDrawingsDesc', language)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">
                    {pendingTotals.totalItems} {t('pendingItemsCount', language)}
                  </span>
                  <span className="hidden sm:inline-block px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {pendingTotals.totalProjects} {t('pendingProjectsCount', language)}
                  </span>
                </div>
              </div>
              {pendingTotals.totalUrgent > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40">
                  <Flame className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-red-700 dark:text-red-300 break-words">
                    {t('urgentLegend', language)}
                    <span className="ml-2 font-semibold">({pendingTotals.totalUrgent} {t('pendingItemsCount', language)})</span>
                  </span>
                </div>
              )}
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {loadingPending ? (
                <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  <div className="inline-block w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : pendingGroups.length === 0 ? (
                <div className="p-6 sm:p-8 text-center text-gray-500 dark:text-gray-400">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
                  <p className="text-sm sm:text-base">{t('noPendingDrawings', language)}</p>
                </div>
              ) : (
                pendingGroups.map((group) => {
                  const isOpen = expandedPendingProjects[group.projectId] ?? true;
                  return (
                    <div key={group.projectId} className="bg-white dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => togglePendingProject(group.projectId)}
                        className="w-full px-4 sm:px-6 py-3 flex items-center justify-between gap-3 hover:bg-amber-50/40 dark:hover:bg-amber-900/10 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                          <FolderOpen className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <span className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100 truncate">
                            {group.projectName || '-'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 border border-slate-200 dark:border-slate-600 flex-shrink-0">
                            PN: {group.projectNumber || '-'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {group.urgentCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-300 whitespace-nowrap">
                              <Flame className="w-3 h-3" />
                              {group.urgentCount}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">
                            {group.items.length} {t('pendingItemsCount', language)}
                          </span>
                        </div>
                      </button>

                      {isOpen && (
                        <ul className="px-4 sm:px-6 pb-3 pt-0 space-y-1.5">
                          {group.items.map((item) => (
                            <li
                              key={item.id}
                              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-colors ${
                                item.isUrgent
                                  ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 urgent-glow'
                                  : 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30'
                              }`}
                              title={item.isUrgent ? t('urgentUploadTooltip', language) : undefined}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {item.isUrgent ? (
                                  <Flame className="w-4 h-4 text-red-500 flex-shrink-0" />
                                ) : (
                                  <FileWarning className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                )}
                                <span className="font-mono text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">
                                  {item.itemCode}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] sm:text-xs bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 flex-shrink-0">
                                  {item.itemType}
                                </span>
                                {item.isUrgent && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-semibold bg-red-500 text-white flex-shrink-0">
                                    <Zap className="w-3 h-3" />
                                    <span className="hidden sm:inline">{t('urgentUpload', language)}</span>
                                  </span>
                                )}
                                {item.isUrgent && item.ticketNos?.length > 0 && (
                                  <span className="hidden md:inline text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                    RPD: {item.ticketNos.slice(0, 2).join(', ')}
                                    {item.ticketNos.length > 2 ? '…' : ''}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => handleViewProject(group.projectId)}
                                className={`pressable inline-flex items-center gap-1 px-2 py-1 rounded-md border transition-colors text-xs font-medium flex-shrink-0 ${
                                  item.isUrgent
                                    ? 'border-red-400 bg-red-500 text-white hover:bg-red-600'
                                    : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/10'
                                }`}
                                title={language === 'th' ? 'อัปไฟล์แบบ' : 'Upload drawing'}
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{language === 'th' ? 'อัปไฟล์' : 'Upload'}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Projects List */}
        {activeTab === 'projects' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-fadeInUpSmall" style={{ animationDelay: '0.6s' }}>
          <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 break-words">{t('projectList', language)} ({sortedFilteredProjects.length})</h2>
          </div>
          
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {sortedFilteredProjects.length === 0 ? (
              <div className="p-6 sm:p-8 text-center text-gray-500 dark:text-gray-400">
                <FolderOpen className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm sm:text-base">{t('noProjectsFound', language)}</p>
              </div>
            ) : (
              sortedFilteredProjects.map((project, index) => (
                <div
                  key={project.id}
                  className="group p-4 sm:p-6 transition-colors animate-fadeInUpSmall border-l-4 border-emerald-500/60 bg-gradient-to-r from-emerald-50/60 to-blue-50/40 dark:from-emerald-900/10 dark:to-blue-900/10 hover:from-emerald-100/60 hover:to-blue-100/40 dark:hover:from-emerald-900/20 dark:hover:to-blue-900/20"
                  style={{ animationDelay: `${0.7 + index * 0.1}s` }}
                >
                  <div className="project-list-item flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Header: ชื่อโปรเจ็ค (ใหญ่) + Project Number badge */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <FolderOpen className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                          <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 truncate min-w-0">{project.projectName || '-'}</h3>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 border border-slate-200 dark:border-slate-600 flex-shrink-0 w-fit">
                          PN: {project.projectNumber || '-'}
                        </span>
                      </div>

                      {/* Meta */}
                      <div className="text-xs text-gray-500 dark:text-gray-400 break-words">
                        {t('uploadDate', language)}: {new Date(project.uploadedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:ml-4 flex-shrink-0">
                      <button
                        onClick={() => handleViewProject(project.id)}
                        className="pressable inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/10 transition-colors text-xs font-medium w-full sm:w-auto min-h-[44px]"
                        title="เปิดโฟลเดอร์"
                      >
                        <FolderOpen className="w-4 h-4" />
                        <span className="hidden sm:inline">เปิดโฟลเดอร์</span>
                        <span className="sm:hidden">เปิด</span>
                      </button>
                      {canDeleteProject && (
                        <button
                          onClick={() => handleDeleteProject(project)}
                          className="pressable inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/10 transition-colors text-xs font-medium w-full sm:w-auto min-h-[44px]"
                          title="ลบโฟลเดอร์"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">ลบโฟลเดอร์</span>
                          <span className="sm:hidden">ลบ</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        )}
      </div>

      {/* Upload Modal */}
      <Modal
        open={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          resetUploadForm();
        }}
        title={t('createProject', language)}
        maxWidth="max-w-3xl"
      >
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Error Message */}
          {uploadError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 break-words">
                {typeof uploadError === 'object' ? JSON.stringify(uploadError) : uploadError}
              </p>
            </div>
          )}

          {/* Section 1: ข้อมูล Project */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xl">📦</span>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">{t('projectName', language)}</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('projectNumber', language)} *
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="00215"
                    value={uploadForm.projectNumber}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, projectNumber: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
                    disabled={isUploading}
                  />
                  <button
                    type="button"
                    onClick={searchProjectCode}
                    disabled={isUploading || isSearchingProject || !uploadForm.projectNumber.trim()}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto"
                  >
                    {isSearchingProject ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span className="text-xs sm:text-sm">{t('searchProjectCode', language)}</span>
                  </button>
                </div>
                {projectSearchError && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 break-words">
                    {typeof projectSearchError === 'object' ? JSON.stringify(projectSearchError) : projectSearchError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('projectName', language)}
                </label>
                <input
                  type="text"
                  placeholder={language === 'th' ? 'ชื่อโครงการ (จาก API)' : 'Project Name (from API)'}
                  value={uploadForm.projectNameFromApi}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-gray-600 dark:text-gray-400 cursor-not-allowed text-sm sm:text-base"
                  disabled
                />
              </div>
            </div>
          </div>

          {/* Section 2: สร้างรหัสสินค้า */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xl">🏷️</span>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">{t('itemCode', language)}</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('itemType', language)} *
                </label>
                <select
                  value={uploadForm.itemType}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, itemType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
                  disabled={isUploading}
                >
                  <option value="FG">{t('itemTypeFG', language)}</option>
                  <option value="RM">{t('itemTypeRM', language)}</option>
                  <option value="WP">{t('itemTypeWP', language)}</option>
                  <option value="EX">{t('itemTypeEX', language)}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('productCode', language)} *
                </label>
                <input
                  type="text"
                  placeholder="D01"
                  value={uploadForm.itemProductCode}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, itemProductCode: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent uppercase text-sm sm:text-base"
                  disabled={isUploading}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('itemUnit', language)} *
                </label>
                <select
                  value={uploadForm.itemUnit}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, itemUnit: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
                  disabled={isUploading || loadingUnits}
                >
                  {productUnits.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.code} - {language === 'th' ? unit.name_th : (unit.name_en || unit.name_th)}
                      {unit.is_custom && ' (Custom)'}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2 mt-2">
                  {isSuperAdmin() && productUnits.filter(u => u.is_custom).length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowDeleteCustomUnitsBox(prev => !prev)}
                        title={language === 'th' ? 'ลบหน่วยที่เพิ่มเอง' : 'Delete custom units'}
                        className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 flex-shrink-0" />
                        <span className="overflow-hidden max-w-0 opacity-0 group-hover:max-w-[11rem] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap text-xs">
                          {language === 'th' ? 'ลบหน่วยที่เพิ่มเอง' : 'Delete custom units'}
                        </span>
                      </button>
                      {showDeleteCustomUnitsBox && (
                        <div className="absolute left-0 top-full mt-1 z-20 min-w-[220px] rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-2 max-h-48 overflow-y-auto">
                          <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-slate-600">
                            {language === 'th' ? 'รายการหน่วยที่เพิ่มเอง' : 'Custom units list'}
                          </div>
                          <div className="space-y-0.5 px-2">
                            {productUnits
                              .filter(u => u.is_custom)
                              .map((unit) => (
                                <div
                                  key={unit.id}
                                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-700/50"
                                >
                                  <span className="text-xs text-gray-700 dark:text-gray-300">
                                    {unit.code} - {language === 'th' ? unit.name_th : (unit.name_en || unit.name_th)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (confirm(language === 'th' 
                                        ? `คุณแน่ใจหรือไม่ว่าต้องการลบหน่วยสินค้า "${unit.code} - ${unit.name_th}"?` 
                                        : `Are you sure you want to delete product unit "${unit.code} - ${unit.name_th}"?`)) {
                                        await handleDeleteUnit(unit.id);
                                      }
                                    }}
                                    className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                    title={language === 'th' ? 'ลบหน่วยสินค้านี้' : 'Delete this unit'}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {isAdminOrAbove() && !hasStorageRole && (
                    <button
                      type="button"
                      onClick={() => setShowAddUnitModal(true)}
                      title={language === 'th' ? 'เพิ่มหน่วยสินค้า' : 'Add Unit'}
                      className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <Plus className="w-4 h-4 flex-shrink-0" />
                      <span className="overflow-hidden max-w-0 opacity-0 group-hover:max-w-[8rem] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap text-xs">
                        {language === 'th' ? 'เพิ่มหน่วยสินค้า' : 'Add Unit'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Generated Item Code Preview */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 sm:p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg flex-shrink-0">📋</span>
                <span className="text-xs sm:text-sm font-medium text-blue-900 dark:text-blue-100 break-words">{t('generatedItemCode', language)}:</span>
              </div>
              <div className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono break-all">
                {generateItemCode() || <span className="text-gray-400 text-sm sm:text-base">{language === 'th' ? 'กรุณากรอกข้อมูลด้านบน' : 'Please fill in the fields above'}</span>}
              </div>
            </div>
          </div>

          {/* Section 3 removed per new flow (upload and ERP verification will be handled later) */}

          {/* Upload Progress */}
          {isUploading && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span>{t('uploading', language)}...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                <div 
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-end gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={() => {
                setShowUploadModal(false);
                resetUploadForm();
              }}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full sm:w-auto text-sm sm:text-base"
              disabled={isUploading}
            >
              {t('cancel', language)}
            </button>
            <button
              onClick={simulateUpload}
              disabled={isUploading || !uploadForm.projectNumber || !uploadForm.itemProductCode}
              className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm sm:text-base">{t('save', language)}...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span className="text-sm sm:text-base">{language === 'th' ? 'บันทึก' : 'Save'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t('confirmProjectDeletion', language)}
      >
        <div className="p-4 sm:p-6">
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4 break-words">
            {t('sureDeleteProject', language)} <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedProject?.name || selectedProject?.projectName}</span>?
          </p>
          <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 mb-6">
            {t('actionCannotUndone', language)}
          </p>
          
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full sm:w-auto text-sm sm:text-base"
            >
              {t('cancel', language)}
            </button>
            <button
              onClick={confirmDelete}
              className="pressable px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors w-full sm:w-auto text-sm sm:text-base"
            >
              {t('delete', language)}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Add Product Unit */}
      <Modal
        open={showAddUnitModal}
        onClose={() => {
          setShowAddUnitModal(false);
          setNewUnitForm({ code: '', name_th: '', name_en: '' });
          setAddUnitError('');
        }}
        title={language === 'th' ? 'เพิ่มหน่วยสินค้า' : 'Add Product Unit'}
        maxWidth="max-w-md"
        footer={
          <div className="flex flex-col sm:flex-row justify-end gap-3 px-4 sm:px-6 py-4">
            <button
              onClick={() => {
                setShowAddUnitModal(false);
                setNewUnitForm({ code: '', name_th: '', name_en: '' });
                setAddUnitError('');
              }}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full sm:w-auto text-sm sm:text-base"
              disabled={isAddingUnit}
            >
              {t('cancel', language)}
            </button>
            <button
              onClick={handleAddUnit}
              disabled={isAddingUnit || !newUnitForm.code || !newUnitForm.name_th}
              className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto text-sm sm:text-base"
            >
              {isAddingUnit ? (language === 'th' ? 'กำลังเพิ่ม...' : 'Adding...') : t('save', language)}
            </button>
          </div>
        }
      >
        <div className="p-4 sm:p-6 space-y-4">
          {addUnitError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{addUnitError}</p>
            </div>
          )}

          {/* แสดงตัวอย่างหน่วยสินค้าที่มีอยู่ */}
          {productUnits.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-2">
                {language === 'th' ? 'ตัวอย่างหน่วยสินค้าที่มีอยู่:' : 'Example existing units:'}
              </p>
              <div className="space-y-1">
                {productUnits.slice(0, 3).map((unit) => (
                  <div key={unit.code} className="text-xs text-blue-800 dark:text-blue-300">
                    <span className="font-mono font-semibold">{unit.code}</span>
                    {' - '}
                    <span>{unit.name_th}</span>
                    {unit.name_en && (
                      <>
                        {' / '}
                        <span className="italic">{unit.name_en}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {language === 'th' ? 'รหัสหน่วยสินค้า *' : 'Product Unit Code *'}
            </label>
            <input
              type="text"
              placeholder={productUnits.length > 0 
                ? `${productUnits[0]?.code || 'D'} (เช่น ${productUnits[0]?.code || 'D'})`
                : 'D'}
              value={newUnitForm.code}
              onChange={(e) => setNewUnitForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent uppercase text-sm sm:text-base"
              style={{ textTransform: 'uppercase' }}
              disabled={isAddingUnit}
            />
            {productUnits.length > 0 && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {language === 'th' ? 'ตัวอย่าง: ' : 'Example: '}
                {productUnits.slice(0, 3).map((u, i) => (
                  <span key={u.code}>
                    <span className="font-mono">{u.code}</span>
                    {i < 2 && ', '}
                  </span>
                ))}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {language === 'th' ? 'ชื่อภาษาไทย *' : 'Thai Name *'}
            </label>
            <input
              type="text"
              placeholder={productUnits.length > 0 
                ? `${productUnits[0]?.name_th || 'ประตู'} (เช่น ${productUnits[0]?.name_th || 'ประตู'})`
                : (language === 'th' ? 'ชื่อหน่วยสินค้า' : 'Product unit name')}
              value={newUnitForm.name_th}
              onChange={(e) => setNewUnitForm(prev => ({ ...prev, name_th: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
              disabled={isAddingUnit}
            />
            {productUnits.length > 0 && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {language === 'th' ? 'ตัวอย่าง: ' : 'Example: '}
                {productUnits.slice(0, 3).map((u, i) => (
                  <span key={u.code}>
                    {u.name_th}
                    {i < 2 && ', '}
                  </span>
                ))}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {language === 'th' ? 'ชื่อภาษาอังกฤษ' : 'English Name (Optional)'}
            </label>
            <input
              type="text"
              placeholder={productUnits.length > 0 && productUnits[0]?.name_en
                ? `${productUnits[0].name_en} (เช่น ${productUnits[0].name_en})`
                : (language === 'th' ? 'ชื่อหน่วยสินค้าภาษาอังกฤษ' : 'Product unit name in English')}
              value={newUnitForm.name_en}
              onChange={(e) => setNewUnitForm(prev => ({ ...prev, name_en: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
              disabled={isAddingUnit}
            />
            {productUnits.length > 0 && productUnits.some(u => u.name_en) && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {language === 'th' ? 'ตัวอย่าง: ' : 'Example: '}
                {productUnits.filter(u => u.name_en).slice(0, 3).map((u, i) => (
                  <span key={u.code}>
                    <span className="italic">{u.name_en}</span>
                    {i < productUnits.filter(u => u.name_en).slice(0, 3).length - 1 && ', '}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      </Modal>

    </div>
  );
}
