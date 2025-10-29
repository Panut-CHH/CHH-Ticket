"use client";

import React, { useState, useEffect } from "react";
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
  AlertCircle
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
  const [statusFilter, setStatusFilter] = useState("all");
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

  // โหลดข้อมูลโปรเจ็คจากฐานข้อมูล
  useEffect(() => {
    loadProjectsFromDatabase();
  }, []);

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

  // ตรวจสอบสิทธิ์สร้างโปรเจ็ค: SuperAdmin, Admin, Drawing (ไม่สนตัวพิมพ์ใหญ่/เล็ก)
  const normalizedRole = (user?.role || "").toString();
  const roleKey = normalizedRole.trim().toLowerCase();
  const canCreateProject = ["superadmin", "admin", "drawing"].includes(roleKey);

  // ฟิลเตอร์โปรเจ็ค (ค้นหาตาม Project Code / ชื่อไฟล์ / Description)
  const filteredProjects = projects.filter(project => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = (project.projectCode || "").toLowerCase().includes(q) ||
                          (project.fileName || "").toLowerCase().includes(q) ||
                          (project.description || "").toLowerCase().includes(q);
    return matchesSearch;
  });

  // สถิติโปรเจ็ค
  const stats = {
    total: projects.length,
    active: projects.filter(p => p.status === "active").length,
    completed: projects.filter(p => p.status === "completed").length,
    pending: projects.filter(p => p.status === "pending").length
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
        itemUnit: uploadForm.itemUnit || null
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
      <div className="max-w-7xl mx-auto px-4 py-6 animate-fadeInUp">
        {/* Header */}
        <div className="mb-8 animate-fadeInDown">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-md" style={{ background: "linear-gradient(135deg,#22d3a0,#1cb890)" }}>
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('manageProjects', language)}</h1>
              <p className="text-gray-600 dark:text-gray-400">{t('uploadBlueprintDesc', language)}</p>
            </div>
          </div>

          {/* ERP Connection Status */}
          {erpConnectionStatus && (
            <div className="mb-6">
              <div className={`p-4 rounded-lg border ${
                erpConnectionStatus.success 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  {erpConnectionStatus.success ? (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  )}
                  <span className={`font-medium ${
                    erpConnectionStatus.success 
                      ? 'text-green-800 dark:text-green-200' 
                      : 'text-red-800 dark:text-red-200'
                  }`}>
                    {erpConnectionStatus.success 
                      ? (language === 'th' ? 'เชื่อมต่อ ERP สำเร็จ' : 'ERP Connected Successfully')
                      : (language === 'th' ? 'ไม่สามารถเชื่อมต่อ ERP ได้' : 'ERP Connection Failed')
                    }
                  </span>
                  <button
                    onClick={checkErpConnection}
                    className="ml-auto text-xs px-2 py-1 bg-white dark:bg-slate-700 rounded border hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                  >
                    {language === 'th' ? 'ตรวจสอบใหม่' : 'Refresh'}
                  </button>
                </div>
                {erpConnectionStatus.error && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                    {erpConnectionStatus.error}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 animate-fadeInUpSmall" style={{ animationDelay: '0.1s' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                  <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.total}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{t('totalProjects', language)}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 animate-fadeInUpSmall" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.active}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{t('inProgressProjects', language)}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 animate-fadeInUpSmall" style={{ animationDelay: '0.3s' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.completed}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{t('completedProjects', language)}</div>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 animate-fadeInUpSmall" style={{ animationDelay: '0.4s' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.pending}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{t('pendingProjects', language)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 mb-6 animate-fadeInUpSmall" style={{ animationDelay: '0.5s' }}>
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('searchProject', language)}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {/* Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="all">{t('allStatus', language)}</option>
                  <option value="active">{t('inProgressProjects', language)}</option>
                  <option value="completed">{t('completedProjects', language)}</option>
                  <option value="pending">{t('pendingProjects', language)}</option>
                </select>
              </div>
            </div>

            {/* Upload Button - เฉพาะ Role SuperAdmin/Admin/Drawing */}
            {canCreateProject ? (
              <button
                onClick={() => setShowUploadModal(true)}
                className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all duration-300 hover:scale-105 hover:shadow-lg flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {t('createProject', language)}
              </button>
            ) : (
              <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 rounded-lg">
                {language === 'th' ? 'เฉพาะ SuperAdmin / Admin / Drawing เท่านั้น' : 'Only SuperAdmin / Admin / Drawing can create'} (Role: {normalizedRole || 'none'})
              </div>
            )}
          </div>
        </div>

        {/* Projects List */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-fadeInUpSmall" style={{ animationDelay: '0.6s' }}>
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('projectList', language)} ({filteredProjects.length})</h2>
          </div>
          
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {filteredProjects.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t('noProjectsFound', language)}</p>
              </div>
            ) : (
              filteredProjects.map((project, index) => (
                <div
                  key={project.id}
                  className="group p-6 transition-colors animate-fadeInUpSmall border-l-4 border-emerald-500/60 bg-gradient-to-r from-emerald-50/60 to-blue-50/40 dark:from-emerald-900/10 dark:to-blue-900/10 hover:from-emerald-100/60 hover:to-blue-100/40 dark:hover:from-emerald-900/20 dark:hover:to-blue-900/20"
                  style={{ animationDelay: `${0.7 + index * 0.1}s` }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Header: ชื่อโปรเจ็ค (ใหญ่) + Project Number badge */}
                      <div className="flex items-center gap-3 mb-2">
                        <FolderOpen className="w-5 h-5 text-emerald-600" />
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{project.projectName || '-'}</h3>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 border border-slate-200 dark:border-slate-600">
                          PN: {project.projectNumber || '-'}
                        </span>
                      </div>

                      {/* Meta */}
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {t('uploadDate', language)}: {new Date(project.uploadedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleViewProject(project.id)}
                        className="pressable inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/10 transition-colors text-xs font-medium"
                        title="เปิดโฟลเดอร์"
                      >
                        <FolderOpen className="w-4 h-4" />
                        <span className="hidden sm:inline">เปิดโฟลเดอร์</span>
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project)}
                        className="pressable inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/10 transition-colors text-xs font-medium"
                        title="ลบโฟลเดอร์"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">ลบโฟลเดอร์</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
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
        <div className="p-6 space-y-6">
          {/* Error Message */}
          {uploadError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">
                {typeof uploadError === 'object' ? JSON.stringify(uploadError) : uploadError}
              </p>
            </div>
          )}

          {/* Section 1: ข้อมูล Project */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                <span className="text-xl">📦</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('projectName', language)}</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('projectNumber', language)} *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="00215"
                    value={uploadForm.projectNumber}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, projectNumber: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    disabled={isUploading}
                  />
                  <button
                    type="button"
                    onClick={searchProjectCode}
                    disabled={isUploading || isSearchingProject || !uploadForm.projectNumber.trim()}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSearchingProject ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span className="text-sm">{t('searchProjectCode', language)}</span>
                  </button>
                </div>
                {projectSearchError && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                    {typeof projectSearchError === 'object' ? JSON.stringify(projectSearchError) : projectSearchError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('projectName', language)}
                </label>
                <input
                  type="text"
                  placeholder={language === 'th' ? 'ชื่อโครงการ (จาก API)' : 'Project Name (from API)'}
                  value={uploadForm.projectNameFromApi}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                  disabled
                />
              </div>
            </div>
          </div>

          {/* Section 2: สร้างรหัสสินค้า */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                <span className="text-xl">🏷️</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('itemCode', language)}</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('itemType', language)} *
                </label>
                <select
                  value={uploadForm.itemType}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, itemType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={isUploading}
                >
                  <option value="FG">{t('itemTypeFG', language)}</option>
                  <option value="SM">{t('itemTypeSM', language)}</option>
                  <option value="WP">{t('itemTypeWP', language)}</option>
                  <option value="EX">{t('itemTypeEX', language)}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('productCode', language)} *
                </label>
                <input
                  type="text"
                  placeholder="D01"
                  value={uploadForm.itemProductCode}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, itemProductCode: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={isUploading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('itemUnit', language)} *
                </label>
                <select
                  value={uploadForm.itemUnit}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, itemUnit: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={isUploading}
                >
                  <option value="D">{t('unitD', language)}</option>
                  <option value="F">{t('unitF', language)}</option>
                  <option value="S">{t('unitS', language)}</option>
                  <option value="P">{t('unitP', language)}</option>
                  <option value="W">{t('unitW', language)}</option>
                  <option value="M">{t('unitM', language)}</option>
                  <option value="O">{t('unitO', language)}</option>
                </select>
              </div>
            </div>

            {/* Generated Item Code Preview */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📋</span>
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">{t('generatedItemCode', language)}:</span>
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono">
                {generateItemCode() || <span className="text-gray-400 text-base">{language === 'th' ? 'กรุณากรอกข้อมูลด้านบน' : 'Please fill in the fields above'}</span>}
              </div>
            </div>
          </div>

          {/* Section 3 removed per new flow (upload and ERP verification will be handled later) */}

          {/* Upload Progress */}
          {isUploading && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
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

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={() => {
                setShowUploadModal(false);
                resetUploadForm();
              }}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              disabled={isUploading}
            >
              {t('cancel', language)}
            </button>
            <button
              onClick={simulateUpload}
              disabled={isUploading || !uploadForm.projectNumber || !uploadForm.itemProductCode}
              className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('save', language)}...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  {language === 'th' ? 'บันทึก' : 'Save'}
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
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('sureDeleteProject', language)} <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedProject?.name}</span>?
          </p>
          <p className="text-sm text-red-600 dark:text-red-400 mb-6">
            {t('actionCannotUndone', language)}
          </p>
          
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              {t('cancel', language)}
            </button>
            <button
              onClick={confirmDelete}
              className="pressable px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              {t('delete', language)}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
