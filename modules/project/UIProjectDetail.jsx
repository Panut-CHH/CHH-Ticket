"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";
import { getProjectById } from "@/utils/projectDb";
import { supabase } from "@/utils/supabaseClient";
import { 
  ArrowLeft,
  Plus,
  FolderDown,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Upload,
  FileText, 
  Image as ImageIcon,
  Download,
  Eye,
  Trash2,
  AlertCircle,
  X,
  Edit,
  Save,
  Pencil,
  DollarSign,
  CheckCircle
} from "lucide-react";
import Modal from "@/components/Modal";

// Helper function to check if user is admin or superadmin
const isAdminOrAbove = (user) => {
  if (!user) return false;
  const roles = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
  return roles.some(role => {
    const roleLower = String(role).toLowerCase();
    return roleLower === 'admin' || roleLower === 'superadmin';
  });
};

export default function UIProjectDetail({ projectId }) {
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  
  const [project, setProject] = useState(null);
  const [itemCodes, setItemCodes] = useState([]);
  const [expandedItems, setExpandedItems] = useState({});
  const [loading, setLoading] = useState(true);
  const [itemPrices, setItemPrices] = useState({}); // Store prices for each item: { itemCode: { productionPrice, pressPrice, framePrice, noFramePrice, sharpPrice, paintPrice } }
  
  // Modal states
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteItemModal, setShowDeleteItemModal] = useState(false);
  const [showDeleteFileModal, setShowDeleteFileModal] = useState(false);
  const [showViewFileModal, setShowViewFileModal] = useState(false);
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [showConfirmUpdateModal, setShowConfirmUpdateModal] = useState(false);
  const [showLaborPriceModal, setShowLaborPriceModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [pricingItem, setPricingItem] = useState(null);
  
  // Form states
  const [itemForm, setItemForm] = useState({
    itemType: "FG",
    itemProductCode: "",
    itemUnit: "D"
  });
  
  // Edit form states
  const [editForm, setEditForm] = useState({
    itemType: "FG",
    itemProductCode: "",
    itemUnit: "D"
  });
  
  // Preview update states
  const [previewUpdate, setPreviewUpdate] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const [uploadingItem, setUploadingItem] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Labor price states
  const [laborPrices, setLaborPrices] = useState({
    pressStation: { price: '', priceType: 'per_piece' },
    paintStation: { price: '', priceType: 'per_piece' },
    frameStation: { price: '', priceType: 'per_piece' },
    noFrameStation: { price: '', priceType: 'per_piece' },
    sharpStation: { price: '', priceType: 'per_piece' }
  });
  const [availableStations, setAvailableStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);

  // Product units states
  const [productUnits, setProductUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [newUnitForm, setNewUnitForm] = useState({ code: '', name_th: '', name_en: '' });
  const [isAddingUnit, setIsAddingUnit] = useState(false);
  const [addUnitError, setAddUnitError] = useState('');

  // Toast state
  const [toast, setToast] = useState({ open: false, type: "info", message: "" });
  const showToast = (message, type = "info", timeoutMs = 3000) => {
    setToast({ open: true, type, message });
    if (timeoutMs > 0) {
      setTimeout(() => setToast((t) => ({ ...t, open: false })), timeoutMs);
    }
  };

  // Load project data
  useEffect(() => {
    loadProjectData();
    loadProductUnits();
  }, [projectId]);

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

  const loadProjectData = async () => {
    setLoading(true);
    try {
      // Load project info
      const projectResult = await getProjectById(projectId);
      if (projectResult.success) {
        setProject(projectResult.data);
      }

      // Load item codes
      await loadItemCodes();
    } catch (error) {
      console.error('Error loading project:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadItemCodes = async () => {
    try {
      console.log('Loading item codes for project:', projectId);
      const response = await fetch(`/api/projects/${projectId}/items`);
      const result = await response.json();
      
      console.log('Item codes result:', result);
      
      if (result.success) {
        // Load files for each item
        const itemsWithFiles = await Promise.all(
          result.data.map(async (item) => {
            console.log('Loading files for item:', item.id);
            const filesResponse = await fetch(`/api/projects/items/${item.id}/files`);
            const filesResult = await filesResponse.json();
            console.log('Files result for', item.item_code, ':', filesResult);
            return {
              ...item,
              files: filesResult.success ? filesResult.data : []
            };
          })
        );
        console.log('Items with files:', itemsWithFiles);
        setItemCodes(itemsWithFiles);
        
        // Load labor prices for all items (only if admin)
        if (isAdminOrAbove(user)) {
          await loadItemPrices(itemsWithFiles);
        }
      }
    } catch (error) {
      console.error('Error loading item codes:', error);
    }
  };

  // Load labor prices for all items
  const loadItemPrices = async (items) => {
    try {
      // Find stations by name for production & color (รองรับทั้งชื่อเก่าและใหม่)
      const pressStation = availableStations.find(s => s.name_th === 'ปรับขนาด' || s.name_th === 'อัดบาน');
      const paintStation = availableStations.find(s => s.name_th === 'สี');
      const frameStation = availableStations.find(s => s.name_th === 'ประกอบวงกบ');
      const noFrameStation = availableStations.find(s => s.name_th === 'ไม่ประกอบวงกบ');
      const sharpStation = availableStations.find(s => s.name_th === 'ประกอบชุดชาร์ป');
      
      if (!pressStation && !paintStation && !frameStation && !noFrameStation && !sharpStation) {
        return; // Stations not found, skip loading prices
      }
      
      const pricesMap = {};
      
      // Load prices for each item
      await Promise.all(
        items.map(async (item) => {
          try {
            const response = await fetch(`/api/projects/items/labor-prices?itemCode=${encodeURIComponent(item.item_code)}`);
            const result = await response.json();
            
            // Helper to find price by station (returns null if not found)
            const findPrice = (station) => {
              if (!station || !result.success || !Array.isArray(result.data)) return null;
              const match = result.data.find(p => p.station_code === station.code);
              return match && typeof match.price === 'number' ? match.price : (match?.price ?? null);
            };
            
            const pressPrice = findPrice(pressStation);
            const framePrice = findPrice(frameStation);
            const noFramePrice = findPrice(noFrameStation);
            const sharpPrice = findPrice(sharpStation);
            const paintPrice = findPrice(paintStation);
            
            const productionPrice =
              (pressPrice || 0) +
              (framePrice || 0) +
              (noFramePrice || 0) +
              (sharpPrice || 0);
            
            pricesMap[item.item_code] = {
              productionPrice: productionPrice > 0 ? productionPrice : null,
              pressPrice: pressPrice,
              framePrice: framePrice,
              noFramePrice: noFramePrice,
              sharpPrice: sharpPrice,
              paintPrice: paintPrice
            };
          } catch (error) {
            console.error(`Error loading prices for ${item.item_code}:`, error);
            // Still create entry with null values on error
            pricesMap[item.item_code] = {
              productionPrice: null,
              pressPrice: null,
              framePrice: null,
              noFramePrice: null,
              sharpPrice: null,
              paintPrice: null
            };
          }
        })
      );
      
      setItemPrices(pricesMap);
    } catch (error) {
      console.error('Error loading item prices:', error);
    }
  };

  // Generate item code preview
  const generateItemCode = () => {
    if (!project?.project_number || !itemForm.itemType || !itemForm.itemProductCode || !itemForm.itemUnit) {
      return "";
    }
    return `${itemForm.itemType}-${project.project_number}-${itemForm.itemProductCode}-${itemForm.itemUnit}`;
  };

  // Generate item code preview for edit form
  const generateEditItemCode = () => {
    if (!project?.project_number || !editForm.itemType || !editForm.itemProductCode || !editForm.itemUnit) {
      return "";
    }
    return `${editForm.itemType}-${project.project_number}-${editForm.itemProductCode}-${editForm.itemUnit}`;
  };

  // Handle open edit modal
  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setEditForm({
      itemType: item.item_type || "FG",
      itemProductCode: item.item_product_code || "",
      itemUnit: item.item_unit || "D"
    });
    setPreviewUpdate(null);
    setShowEditItemModal(true);
  };

  // Preview update impact
  const handlePreviewUpdate = async () => {
    if (!editingItem || !editForm.itemProductCode) return;

    setIsLoadingPreview(true);
    try {
      const params = new URLSearchParams({
        itemType: editForm.itemType,
        itemProductCode: editForm.itemProductCode,
        itemUnit: editForm.itemUnit
      });
      
      const response = await fetch(`/api/projects/items/${editingItem.id}?${params}`);
      const result = await response.json();

      if (result.success) {
        setPreviewUpdate(result.data);
        // ถ้า item_code เปลี่ยน ให้แสดง confirmation dialog
        if (result.data.willChange) {
          setShowEditItemModal(false);
          setShowConfirmUpdateModal(true);
        } else {
          // ถ้า item_code ไม่เปลี่ยน บันทึกได้เลย
          handleUpdateItemCode();
        }
      }
    } catch (error) {
      console.error('Error previewing update:', error);
      alert(language === 'th' ? 'เกิดข้อผิดพลาดในการตรวจสอบ' : 'Error checking impact');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Handle update item code
  const handleUpdateItemCode = async () => {
    if (!editingItem || !editForm.itemProductCode) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/projects/items/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      const result = await response.json();

      if (result.success) {
        await loadItemCodes();
        setShowEditItemModal(false);
        setShowConfirmUpdateModal(false);
        setEditingItem(null);
        setPreviewUpdate(null);
        alert(language === 'th' 
          ? `อัปเดตสำเร็จ${result.data.ticketsUpdated > 0 ? ` (อัปเดต ${result.data.ticketsUpdated} tickets)` : ''}`
          : `Update successful${result.data.ticketsUpdated > 0 ? ` (updated ${result.data.ticketsUpdated} tickets)` : ''}`
        );
      } else {
        alert(result.error || (language === 'th' ? 'อัปเดตล้มเหลว' : 'Update failed'));
      }
    } catch (error) {
      console.error('Error updating item code:', error);
      alert(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Error occurred');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle add item code
  const handleAddItemCode = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemForm)
      });

      const result = await response.json();

      if (result.success) {
        await loadItemCodes();
        setShowAddItemModal(false);
        setItemForm({ itemType: "FG", itemProductCode: "", itemUnit: "D" });
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error('Error adding item code:', error);
      alert(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Error occurred');
    }
  };

  // Handle upload file
  const handleUploadFile = async () => {
    if (!uploadFile || !uploadingItem) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('uploadedBy', user?.id || '');

      setUploadProgress(30);

      const response = await fetch(`/api/projects/items/${uploadingItem.id}/upload`, {
        method: 'POST',
        body: formData
      });

      setUploadProgress(80);

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 413) {
          alert(language === 'th' ? 'ไฟล์ใหญ่เกินไป (สูงสุด 10MB)' : 'File too large (max 10MB)');
          return;
        }
        let errMsg = language === 'th' ? 'อัปโหลดล้มเหลว' : 'Upload failed';
        try {
          const err = JSON.parse(text);
          if (err?.error) errMsg = err.error;
        } catch {
          if (text) errMsg = text.slice(0, 200);
        }
        alert(errMsg);
        return;
      }

      const result = await response.json();

      if (result.success) {
        setUploadProgress(100);
        await loadItemCodes();
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadingItem(null);
        alert(t('uploadSuccess', language));
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert(language === 'th' ? 'อัปโหลดล้มเหลว' : 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle delete item code
  const handleDeleteItem = async () => {
    if (!selectedItem) return;

    try {
      const response = await fetch(`/api/projects/items/${selectedItem.id}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        await loadItemCodes();
        setShowDeleteItemModal(false);
        setSelectedItem(null);
        showToast(
          language === 'th' ? 'ลบ Subfolder สำเร็จ' : 'Subfolder deleted successfully',
          'success'
        );
      } else {
        showToast(
          result.error || (language === 'th' ? 'ลบล้มเหลว' : 'Delete failed'),
          'error'
        );
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      showToast(
        language === 'th' ? 'ลบล้มเหลว' : 'Delete failed',
        'error'
      );
    }
  };

  // Handle delete file
  const handleDeleteFile = async () => {
    if (!selectedFile) return;

    try {
      const response = await fetch(`/api/projects/items/${selectedFile.project_item_id}/files/${selectedFile.id}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        await loadItemCodes();
        setShowDeleteFileModal(false);
        setSelectedFile(null);
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      alert(language === 'th' ? 'ลบล้มเหลว' : 'Delete failed');
    }
  };

  // Toggle expand/collapse
  const toggleExpand = (itemId) => {
    setExpandedItems(prev => ({
            ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Get file icon
  const getFileIcon = (fileType) => {
    if (fileType === 'pdf') {
      return <FileText className="w-4 h-4 text-red-500" />;
    }
    return <ImageIcon className="w-4 h-4 text-blue-500" />;
  };

  // Load available stations for labor price setting
  useEffect(() => {
    loadAvailableStations();
  }, []);

  // Reload prices when itemCodes change and user is admin
  useEffect(() => {
    const isAdmin = isAdminOrAbove(user);
    if (isAdmin && itemCodes.length > 0 && availableStations.length > 0) {
      loadItemPrices(itemCodes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCodes.length, availableStations.length]);

  const loadAvailableStations = async () => {
    try {
      setLoadingStations(true);
      const { data, error } = await supabase
        .from('stations')
        .select('id, name_th, code, is_active')
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

  // Handle open labor price modal
  const handleOpenLaborPriceModal = async (item) => {
    setPricingItem(item);
    setShowLaborPriceModal(true);
    
    // Load existing prices for this item code
    setLoadingPrices(true);
    try {
      console.log('[Labor Prices] Opening modal for item:', item.item_code);
      console.log('[Labor Prices] Available stations count:', availableStations.length);
      console.log('[Labor Prices] Available stations:', availableStations.map(s => ({ name: s.name_th, code: s.code })));
      
      const response = await fetch(`/api/projects/items/labor-prices?itemCode=${encodeURIComponent(item.item_code)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      
      console.log('[Labor Prices] API response:', result);
      
      if (result.success && result.data) {
        // Find stations by name "ปรับขนาด", "สี", "ประกอบวงกบ", "ไม่ประกอบวงกบ", and "ประกอบชุดชาร์ป"
        const pressStation = availableStations.find(s => s.name_th === 'ปรับขนาด' || s.name_th === 'อัดบาน');
        const paintStation = availableStations.find(s => s.name_th === 'สี');
        const frameStation = availableStations.find(s => s.name_th === 'ประกอบวงกบ');
        const noFrameStation = availableStations.find(s => s.name_th === 'ไม่ประกอบวงกบ');
        const sharpStation = availableStations.find(s => s.name_th === 'ประกอบชุดชาร์ป');
        
        console.log('[Labor Prices] Found noFrameStation:', noFrameStation ? { name: noFrameStation.name_th, code: noFrameStation.code } : 'NOT FOUND');
        console.log('[Labor Prices] Price data from API:', result.data);
        
        const prices = {
          pressStation: { price: '', priceType: 'per_piece' },
          paintStation: { price: '', priceType: 'per_piece' },
          frameStation: { price: '', priceType: 'per_piece' },
          noFrameStation: { price: '', priceType: 'per_piece' },
          sharpStation: { price: '', priceType: 'per_piece' }
        };
        
        // Map existing prices to form
        result.data.forEach(priceData => {
          console.log('[Labor Prices] Processing price data:', { 
            station_code: priceData.station_code, 
            price: priceData.price, 
            price_type: typeof priceData.price,
            noFrameCode: noFrameStation?.code,
            matches: priceData.station_code === noFrameStation?.code
          });
          if (pressStation && priceData.station_code === pressStation.code) {
            prices.pressStation = {
              price: priceData.price !== null && priceData.price !== undefined ? String(priceData.price) : '',
              priceType: priceData.price_type || 'per_piece'
            };
          }
          if (paintStation && priceData.station_code === paintStation.code) {
            prices.paintStation = {
              price: priceData.price !== null && priceData.price !== undefined ? String(priceData.price) : '',
              priceType: priceData.price_type || 'per_piece'
            };
          }
          if (frameStation && priceData.station_code === frameStation.code) {
            prices.frameStation = {
              price: priceData.price !== null && priceData.price !== undefined ? String(priceData.price) : '',
              priceType: priceData.price_type || 'per_piece'
            };
          }
          if (noFrameStation && priceData.station_code === noFrameStation.code) {
            console.log('[Labor Prices] ✅ Matched noFrameStation!', {
              station_code: priceData.station_code,
              expected_code: noFrameStation.code,
              price: priceData.price,
              price_type: typeof priceData.price,
              isNull: priceData.price === null,
              isUndefined: priceData.price === undefined
            });
            // Convert price to string for input field - handle all cases
            let priceValue = '';
            if (priceData.price !== null && priceData.price !== undefined) {
              const numPrice = Number(priceData.price);
              if (!isNaN(numPrice)) {
                priceValue = String(numPrice);
              }
            }
            console.log('[Labor Prices] Converted price value for noFrameStation:', priceValue);
            prices.noFrameStation = {
              price: priceValue,
              priceType: priceData.price_type || 'per_piece'
            };
          }
          if (sharpStation && priceData.station_code === sharpStation.code) {
            prices.sharpStation = {
              price: priceData.price !== null && priceData.price !== undefined ? String(priceData.price) : '',
              priceType: priceData.price_type || 'per_piece'
            };
          }
        });
        
        console.log('[Labor Prices] Final prices state:', prices);
        console.log('[Labor Prices] noFrameStation final price:', prices.noFrameStation.price);
        setLaborPrices(prices);
      } else {
        // Reset to defaults if no prices found
        setLaborPrices({
          pressStation: { price: '', priceType: 'per_piece' },
          paintStation: { price: '', priceType: 'per_piece' },
          frameStation: { price: '', priceType: 'per_piece' },
          noFrameStation: { price: '', priceType: 'per_piece' },
          sharpStation: { price: '', priceType: 'per_piece' }
        });
      }
    } catch (error) {
      console.error('Error loading labor prices:', error);
      setLaborPrices({
        pressStation: { price: '', priceType: 'per_piece' },
        paintStation: { price: '', priceType: 'per_piece' },
        frameStation: { price: '', priceType: 'per_piece' },
        noFrameStation: { price: '', priceType: 'per_piece' },
        sharpStation: { price: '', priceType: 'per_piece' }
      });
    } finally {
      setLoadingPrices(false);
    }
  };

  // Handle save labor prices
  const handleSaveLaborPrices = async () => {
    if (!pricingItem) return;
    
    setSavingPrices(true);
    try {
      const pressStation = availableStations.find(s => s.name_th === 'ปรับขนาด' || s.name_th === 'อัดบาน');
      const paintStation = availableStations.find(s => s.name_th === 'สี');
      const frameStation = availableStations.find(s => s.name_th === 'ประกอบวงกบ');
      const noFrameStation = availableStations.find(s => s.name_th === 'ไม่ประกอบวงกบ');
      const sharpStation = availableStations.find(s => s.name_th === 'ประกอบชุดชาร์ป');
      
      console.log('[Save Labor Prices] Available stations:', availableStations.map(s => ({ name: s.name_th, code: s.code })));
      console.log('[Save Labor Prices] Found noFrameStation:', noFrameStation ? { name: noFrameStation.name_th, code: noFrameStation.code } : 'NOT FOUND');
      console.log('[Save Labor Prices] Current laborPrices.noFrameStation:', laborPrices.noFrameStation);
      
      if (!pressStation && !paintStation && !frameStation && !noFrameStation && !sharpStation) {
        alert(language === 'th' ? 'ไม่พบสถานีที่ต้องการในระบบ' : 'No stations found');
        setSavingPrices(false);
        return;
      }
      
      const pricesToSave = [];
      
      if (pressStation) {
        pricesToSave.push({
          station_code: pressStation.code,
          price: laborPrices.pressStation.price ? parseFloat(laborPrices.pressStation.price) : null,
          price_type: laborPrices.pressStation.priceType
        });
      }
      
      if (paintStation) {
        pricesToSave.push({
          station_code: paintStation.code,
          price: laborPrices.paintStation.price ? parseFloat(laborPrices.paintStation.price) : null,
          price_type: laborPrices.paintStation.priceType
        });
      }
      
      if (frameStation) {
        pricesToSave.push({
          station_code: frameStation.code,
          price: laborPrices.frameStation.price ? parseFloat(laborPrices.frameStation.price) : null,
          price_type: laborPrices.frameStation.priceType
        });
      }
      
      if (noFrameStation) {
        // Handle price conversion: empty string or invalid number should be null
        let noFramePrice = null;
        const priceStr = String(laborPrices.noFrameStation.price || '').trim();
        if (priceStr && priceStr !== '') {
          const parsed = parseFloat(priceStr);
          noFramePrice = isNaN(parsed) ? null : parsed;
        }
        
        console.log('[Save Labor Prices] Saving noFrameStation:', {
          station_code: noFrameStation.code,
          price: noFramePrice,
          price_type: laborPrices.noFrameStation.priceType,
          rawPrice: laborPrices.noFrameStation.price,
          priceStr: priceStr
        });
        pricesToSave.push({
          station_code: noFrameStation.code,
          price: noFramePrice,
          price_type: laborPrices.noFrameStation.priceType
        });
      } else {
        console.warn('[Save Labor Prices] noFrameStation not found, skipping save');
      }
      
      if (sharpStation) {
        pricesToSave.push({
          station_code: sharpStation.code,
          price: laborPrices.sharpStation.price ? parseFloat(laborPrices.sharpStation.price) : null,
          price_type: laborPrices.sharpStation.priceType
        });
      }
      
      console.log('[Save Labor Prices] Prices to save:', pricesToSave);
      
      const response = await fetch(`/api/projects/items/labor-prices?itemCode=${encodeURIComponent(pricingItem.item_code)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices: pricesToSave })
      });
      
      const result = await response.json();
      
      console.log('[Save Labor Prices] API response:', result);
      
      if (result.success) {
        alert(language === 'th' ? 'บันทึกราคาค่าแรงสำเร็จ' : 'Labor prices saved successfully');
        
        // Reload prices immediately after saving to verify
        if (pricingItem) {
          console.log('[Save Labor Prices] Reloading prices for item:', pricingItem.item_code);
          try {
            const reloadResponse = await fetch(`/api/projects/items/labor-prices?itemCode=${encodeURIComponent(pricingItem.item_code)}`, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            });
            const reloadResult = await reloadResponse.json();
            console.log('[Save Labor Prices] Reloaded prices:', reloadResult);
            
            // Update the form with reloaded data
            if (reloadResult.success && reloadResult.data) {
              const noFrameStation = availableStations.find(s => s.name_th === 'ไม่ประกอบวงกบ');
              const noFramePriceData = reloadResult.data.find(p => p.station_code === noFrameStation?.code);
              if (noFramePriceData) {
                console.log('[Save Labor Prices] Found noFrameStation in reloaded data:', noFramePriceData);
                setLaborPrices(prev => ({
                  ...prev,
                  noFrameStation: {
                    price: noFramePriceData.price !== null && noFramePriceData.price !== undefined ? String(noFramePriceData.price) : '',
                    priceType: noFramePriceData.price_type || 'per_piece'
                  }
                }));
              }
            }
          } catch (reloadError) {
            console.error('[Save Labor Prices] Error reloading prices:', reloadError);
          }
        }
        
        setShowLaborPriceModal(false);
        setPricingItem(null);
        // Reload prices after saving
        if (isAdminOrAbove(user) && itemCodes.length > 0) {
          await loadItemPrices(itemCodes);
        }
      } else {
        alert(language === 'th' ? 'บันทึกล้มเหลว: ' + (result.error || 'Unknown error') : 'Save failed: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving labor prices:', error);
      alert(language === 'th' ? 'เกิดข้อผิดพลาด: ' + error.message : 'Error: ' + error.message);
    } finally {
      setSavingPrices(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fffe] dark:bg-slate-900 flex items-center justify-center px-4">
        <div className="text-sm sm:text-base text-gray-600 dark:text-gray-400 text-center">{t('loading', language)}</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#f8fffe] dark:bg-slate-900 flex items-center justify-center px-4">
        <div className="text-sm sm:text-base text-gray-600 dark:text-gray-400 text-center break-words">{t('notFound', language)}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fffe] dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-6 container-safe">
        {/* Toast */}
        {toast.open && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-md shadow-lg flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' :
            toast.type === 'error' ? 'bg-red-600 text-white' :
            toast.type === 'warning' ? 'bg-yellow-500 text-black' : 'bg-slate-700 text-white'
          }`}>
            {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast({ ...toast, open: false })}
              className="ml-2 hover:opacity-70"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-4 sm:mb-6">
            <button
            onClick={() => router.push('/project')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors mb-3 sm:mb-4 text-sm sm:text-base"
            >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('backToProjects', language)}</span>
            </button>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                  <FolderOpen className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600 flex-shrink-0" />
                <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
                      {project.project_name || t('projectName', language)}
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 break-words">
                      Project Number: {project.project_number}
                    </p>
                </div>
              </div>
          </div>

            <button
                onClick={() => setShowAddItemModal(true)}
                className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                {t('addItemCode', language)}
            </button>
          </div>
              </div>
        </div>

        {/* Item Codes List */}
        <div className="space-y-4">
          {itemCodes.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-8 sm:p-12 border border-slate-200 dark:border-slate-700 text-center">
              <FolderDown className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-gray-400 opacity-50" />
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4 break-words">{t('noItemCodesYet', language)}</p>
                    <button 
                onClick={() => setShowAddItemModal(true)}
                className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors inline-flex items-center justify-center gap-2 w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
                    >
                <Plus className="w-4 h-4" />
                {t('addItemCode', language)}
                    </button>
              </div>
          ) : (
            itemCodes.map((item) => (
              <div key={item.id} className="relative pl-6">
                {/* Vertical guide line indicating parent folder */}
                <div className="pointer-events-none absolute left-3 top-0 bottom-0 w-px bg-emerald-500/30" />
                <div
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                >
                {/* Item Code Header - clickable anywhere to expand/collapse */}
                <div
                  className="group p-3 sm:p-4 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-900/10 dark:to-blue-900/10 border-b border-slate-200 dark:border-slate-700 cursor-pointer select-none"
                  onClick={() => toggleExpand(item.id)}
                  role="button"
                  aria-expanded={!!expandedItems[item.id]}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <button
                        onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                        className="p-1 hover:bg-white/50 dark:hover:bg-slate-700/50 rounded transition-colors cursor-pointer flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >
                        {expandedItems[item.id] ? (
                          <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        )}
                </button>
                      <FolderDown className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 break-all">
                            {item.item_code}
                          </h3>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(item);
                            }}
                            className="opacity-60 hover:opacity-100 transition-opacity p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 rounded flex-shrink-0 min-h-[32px] min-w-[32px] flex items-center justify-center"
                            title={language === 'th' ? 'แก้ไข' : 'Edit'}
                          >
                            <Pencil className="w-3 h-3 text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400" />
                          </button>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 break-words mt-1">
                          {t(`itemType${item.item_type}`, language)} | {t(`unit${item.item_unit}`, language)} 
                          <span className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-700 px-2 py-1 rounded ml-2 inline-block">
                            {item.files?.length || 0} {language === 'th' ? 'ไฟล์' : 'files'}
                              </span>
                        </p>
                        {/* Display prices for admin only */}
                        {isAdminOrAbove(user) && itemPrices[item.item_code] && (
                          <div className="mt-2 px-2 py-1 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
                            <span className="text-yellow-800 dark:text-yellow-200 font-medium">
                              {language === 'th' ? 'ราคาผลิต' : 'Production Price'}:{" "}
                              {(() => {
                                const p = itemPrices[item.item_code];
                                const value =
                                  p.productionPrice !== null && p.productionPrice !== undefined
                                    ? p.productionPrice
                                    : (p.pressPrice || 0) + (p.framePrice || 0) + (p.sharpPrice || 0);
                                return value > 0 ? value : '-';
                              })()}
                            </span>
                            <span className="text-yellow-700 dark:text-yellow-300 mx-2">|</span>
                            <span className="text-yellow-800 dark:text-yellow-200 font-medium">
                              {language === 'th' ? 'ราคาสี' : 'Color Price'}: {itemPrices[item.item_code].paintPrice !== null && itemPrices[item.item_code].paintPrice !== undefined ? itemPrices[item.item_code].paintPrice : '-'}
                            </span>
                          </div>
                        )}
                          </div>
                        </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                        {isAdminOrAbove(user) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenLaborPriceModal(item);
                            }}
                            className="pressable px-3 py-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-xs flex items-center justify-center gap-1 min-h-[44px] flex-1 sm:flex-none"
                          >
                            <DollarSign className="w-3 h-3" />
                            <span className="hidden sm:inline">{language === 'th' ? 'ตั้งราคาค่าแรง' : 'Set Labor Price'}</span>
                            <span className="sm:hidden">ราคา</span>
                          </button>
                        )}
                        <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadingItem(item);
                          setShowUploadModal(true);
                        }}
                        className="pressable px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-xs flex items-center justify-center gap-1 min-h-[44px] flex-1 sm:flex-none"
                      >
                        <Upload className="w-3 h-3" />
                        <span className="hidden sm:inline">{t('uploadFile', language)}</span>
                        <span className="sm:hidden">อัปโหลด</span>
                        </button>
                    <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItem(item);
                          setShowDeleteItemModal(true);
                        }}
                        className="pressable px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-xs flex items-center justify-center gap-1 min-h-[44px] flex-1 sm:flex-none"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span className="hidden sm:inline">{t('delete', language)}</span>
                        <span className="sm:hidden">ลบ</span>
                    </button>
                </div>
              </div>
                      </div>

                {/* Files Table */}
                {expandedItems[item.id] && (
                  <div className="p-3 sm:p-4">
                    {item.files && item.files.length > 0 ? (
                      <div className="overflow-x-auto -mx-3 sm:mx-0">
                        <div className="min-w-full inline-block align-middle">
                          {/* Mobile Card View */}
                          <div className="sm:hidden space-y-3">
                            {item.files.map((file) => (
                              <div
                                key={file.id}
                                className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-200 dark:border-slate-600"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {getFileIcon(file.file_type)}
                                    <span className="text-sm text-gray-900 dark:text-gray-100 break-words flex-1">
                                      {file.file_name}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
                                  <span>{file.file_size}</span>
                                  <span>•</span>
                                  <span>{new Date(file.uploaded_at).toLocaleDateString()}</span>
                                  {file.is_current ? (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                                      ✓ {t('currentFile', language)}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                      {t('oldFile', language)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                                  <button
                                    onClick={() => {
                                      console.log('View button clicked', file);
                                      setSelectedFile(file);
                                      setShowViewFileModal(true);
                                    }}
                                    className="flex-1 px-3 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors cursor-pointer text-xs font-medium flex items-center justify-center gap-1 min-h-[44px]"
                                    title={language === 'th' ? 'ดู' : 'View'}
                                  >
                                    <Eye className="w-4 h-4" />
                                    <span>ดู</span>
                                  </button>
                                  <a
                                    href={file.file_url}
                                    download
                                    className="flex-1 px-3 py-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors cursor-pointer text-xs font-medium flex items-center justify-center gap-1 min-h-[44px]"
                                    title={language === 'th' ? 'ดาวน์โหลด' : 'Download'}
                                  >
                                    <Download className="w-4 h-4" />
                                    <span>ดาวน์โหลด</span>
                                  </a>
                                  {!file.is_current && (
                                    <button
                                      onClick={() => {
                                        setSelectedFile(file);
                                        setShowDeleteFileModal(true);
                                      }}
                                      className="flex-1 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors cursor-pointer text-xs font-medium flex items-center justify-center gap-1 min-h-[44px]"
                                      title={language === 'th' ? 'ลบ' : 'Delete'}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      <span>ลบ</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {/* Desktop Table View */}
                          <table className="hidden sm:table w-full">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700 dark:text-gray-300">
                                  {language === 'th' ? 'ชื่อไฟล์' : 'File Name'}
                                </th>
                                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700 dark:text-gray-300">
                                  {language === 'th' ? 'ขนาด' : 'Size'}
                                </th>
                                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700 dark:text-gray-300">
                                  {language === 'th' ? 'สถานะ' : 'Status'}
                                </th>
                                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700 dark:text-gray-300">
                                  {language === 'th' ? 'วันที่อัปโหลด' : 'Uploaded'}
                                </th>
                                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-700 dark:text-gray-300">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.files.map((file) => (
                                <tr
                                  key={file.id}
                                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                >
                                  <td className="py-3 px-3">
                                    <div className="flex items-center gap-2">
                                      {getFileIcon(file.file_type)}
                                      <span className="text-sm text-gray-900 dark:text-gray-100 truncate max-w-xs">
                                        {file.file_name}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                      {file.file_size}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3">
                                    {file.is_current ? (
                                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                                        ✓ {t('currentFile', language)}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                        {t('oldFile', language)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                      {new Date(file.uploaded_at).toLocaleDateString()}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={() => {
                                          console.log('View button clicked', file);
                                          setSelectedFile(file);
                                          setShowViewFileModal(true);
                                        }}
                                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                                        title={language === 'th' ? 'ดู' : 'View'}
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                      <a
                                        href={file.file_url}
                                        download
                                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                                        title={language === 'th' ? 'ดาวน์โหลด' : 'Download'}
                                      >
                                        <Download className="w-4 h-4" />
                                      </a>
                                      {!file.is_current && (
                                        <button
                                          onClick={() => {
                                            setSelectedFile(file);
                                            setShowDeleteFileModal(true);
                                          }}
                                          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                                          title={language === 'th' ? 'ลบ' : 'Delete'}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 sm:py-8 text-center text-gray-500 dark:text-gray-400">
                        <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs sm:text-sm break-words">{t('noFilesYet', language)}</p>
                  </div>
                )}
                  </div>
                )}
              </div>
            </div>
            ))
                )}
              </div>
            </div>

      {/* Modal: Add Item Code */}
      <Modal
        open={showAddItemModal}
        onClose={() => setShowAddItemModal(false)}
        title={t('createNewItemCode', language)}
      >
        <div className="p-4 sm:p-6">
          <div className="space-y-4 mb-4 sm:mb-6">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('itemType', language)} *
              </label>
              <select
                value={itemForm.itemType}
                onChange={(e) => setItemForm(prev => ({ ...prev, itemType: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
              >
                <option value="FG">{t('itemTypeFG', language)}</option>
                <option value="SM">{t('itemTypeSM', language)}</option>
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
                value={itemForm.itemProductCode}
                onChange={(e) => setItemForm(prev => ({ ...prev, itemProductCode: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('itemUnit', language)} *
                </label>
                <div className="flex items-center gap-2">
                  {(() => {
                    const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
                    const isSuperAdmin = userRoles.some(r => String(r).toLowerCase() === 'superadmin');
                    return isSuperAdmin && productUnits.filter(u => u.is_custom).length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>{language === 'th' ? 'ลบหน่วยที่เพิ่มเอง' : 'Delete custom units'}</span>
                      </div>
                    );
                  })()}
                  {isAdminOrAbove(user) && (
                    <button
                      type="button"
                      onClick={() => setShowAddUnitModal(true)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{language === 'th' ? 'เพิ่มหน่วยสินค้า' : 'Add Unit'}</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <select
                  value={itemForm.itemUnit}
                  onChange={(e) => setItemForm(prev => ({ ...prev, itemUnit: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
                  disabled={loadingUnits}
                >
                  {productUnits.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.code} - {language === 'th' ? unit.name_th : (unit.name_en || unit.name_th)}
                      {unit.is_custom && ' (Custom)'}
                    </option>
                  ))}
                </select>
                {/* แสดงรายการ custom units พร้อมปุ่มลบ (เฉพาะ SuperAdmin) */}
                {(() => {
                  const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
                  const isSuperAdmin = userRoles.some(r => String(r).toLowerCase() === 'superadmin');
                  return isSuperAdmin && productUnits.filter(u => u.is_custom).length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {productUnits
                        .filter(u => u.is_custom)
                        .map((unit) => (
                          <div
                            key={unit.id}
                            className="flex items-center justify-between px-2 py-1.5 bg-gray-50 dark:bg-slate-700/50 rounded border border-gray-200 dark:border-slate-600"
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
                  );
                })()}
              </div>
            </div>

            {/* Preview */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 sm:p-4 border border-blue-200 dark:border-blue-800">
              <span className="text-xs sm:text-sm font-medium text-blue-900 dark:text-blue-100 block mb-1 break-words">
                {t('generatedItemCode', language)}:
              </span>
              <div className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400 font-mono break-all">
                {generateItemCode() || <span className="text-gray-400 text-xs sm:text-sm">{language === 'th' ? 'กรุณากรอกข้อมูล' : 'Please fill in data'}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button
              onClick={() => setShowAddItemModal(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
            >
              {t('cancel', language)}
            </button>
            <button
              onClick={handleAddItemCode}
              disabled={!itemForm.itemProductCode}
              className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
            >
              {t('save', language)}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Upload File */}
      <Modal
        open={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setUploadFile(null);
          setUploadingItem(null);
        }}
        title={`${t('uploadFileToItemCode', language)} ${uploadingItem?.item_code}`}
      >
        <div className="p-4 sm:p-6">
          <div className="mb-4">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 break-words">
              {t('selectFileToUpload', language)} *
              </label>
            <div className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-4 sm:p-6 text-center">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input" className="cursor-pointer block">
                <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 break-words">
                  {uploadFile ? (
                    <span className="text-emerald-600 font-medium break-all">{uploadFile.name}</span>
                  ) : (
                    language === 'th' ? 'คลิกเพื่อเลือกไฟล์' : 'Click to select file'
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG - Max 10MB</p>
              </label>
                      </div>
                  </div>
                  
                  {isUploading && (
            <div className="mb-4">
              <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                />
                      </div>
                    </div>
                  )}

          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button
              onClick={() => {
                setShowUploadModal(false);
                setUploadFile(null);
              }}
              disabled={isUploading}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
            >
              {t('cancel', language)}
            </button>
            <button
              onClick={handleUploadFile}
              disabled={!uploadFile || isUploading}
              className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
            >
              {isUploading ? `${language === 'th' ? 'กำลังอัปโหลด' : 'Uploading'}...` : t('uploadFile', language)}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Delete Item Code */}
      <Modal
        open={showDeleteItemModal}
        onClose={() => setShowDeleteItemModal(false)}
        title={t('confirmDeleteItemCode', language)}
      >
        <div className="p-4 sm:p-6">
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-2 break-words">
            {t('sureDeleteItemCode', language)}
          </p>
          <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 mb-4 break-all">
            {selectedItem?.item_code}
          </p>
          <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 mb-6 break-words">
            {t('allFilesWillBeDeleted', language)}
          </p>
          
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button
              onClick={() => setShowDeleteItemModal(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
            >
              {t('cancel', language)}
            </button>
            <button
              onClick={handleDeleteItem}
              className="pressable px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
            >
              {t('delete', language)}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Delete File */}
      <Modal
        open={showDeleteFileModal}
        onClose={() => setShowDeleteFileModal(false)}
        title={t('deleteFileConfirm', language)}
      >
        <div className="p-4 sm:p-6">
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4 break-words">
            {selectedFile?.file_name}
          </p>
          
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button
              onClick={() => setShowDeleteFileModal(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
            >
              {t('cancel', language)}
            </button>
            <button
              onClick={handleDeleteFile}
              className="pressable px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
            >
              {t('delete', language)}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Edit Item Code */}
      <Modal
        open={showEditItemModal}
        onClose={() => {
          setShowEditItemModal(false);
          setEditingItem(null);
          setPreviewUpdate(null);
        }}
        title={language === 'th' ? 'แก้ไขรหัสสินค้า' : 'Edit Product Code'}
        maxHeight="max-h-[85vh]"
        footer={editingItem ? (
          <div className="px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditItemModal(false);
                  setEditingItem(null);
                  setPreviewUpdate(null);
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
              >
                {t('cancel', language)}
              </button>
              <button
                onClick={async () => {
                  const newItemCode = generateEditItemCode();
                  // ถ้า item_code เปลี่ยน ต้องตรวจสอบผลกระทบก่อน
                  if (newItemCode && editingItem.item_code !== newItemCode) {
                    await handlePreviewUpdate();
                  } else {
                    // ถ้าไม่เปลี่ยน บันทึกได้เลย
                    await handleUpdateItemCode();
                  }
                }}
                disabled={!editForm.itemProductCode || isUpdating || isLoadingPreview}
                className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
              >
                {isUpdating || isLoadingPreview ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{isLoadingPreview ? (language === 'th' ? 'กำลังตรวจสอบ...' : 'Checking...') : (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{t('save', language)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
      >
        <div className="p-4 sm:p-6">
          {editingItem && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('itemType', language)} *
                </label>
                <select
                  value={editForm.itemType}
                  onChange={(e) => {
                    setEditForm(prev => ({ ...prev, itemType: e.target.value }));
                    setPreviewUpdate(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
                >
                  <option value="FG">{t('itemTypeFG', language)}</option>
                  <option value="SM">{t('itemTypeSM', language)}</option>
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
                  value={editForm.itemProductCode}
                  onChange={(e) => {
                    setEditForm(prev => ({ ...prev, itemProductCode: e.target.value.toUpperCase() }));
                    setPreviewUpdate(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent uppercase text-sm sm:text-base"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('itemUnit', language)} *
                  </label>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
                      const isSuperAdmin = userRoles.some(r => String(r).toLowerCase() === 'superadmin');
                      return isSuperAdmin && productUnits.filter(u => u.is_custom).length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>{language === 'th' ? 'ลบหน่วยที่เพิ่มเอง' : 'Delete custom units'}</span>
                        </div>
                      );
                    })()}
                    {isAdminOrAbove(user) && (
                      <button
                        type="button"
                        onClick={() => setShowAddUnitModal(true)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{language === 'th' ? 'เพิ่มหน่วยสินค้า' : 'Add Unit'}</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <select
                    value={editForm.itemUnit}
                    onChange={(e) => {
                      setEditForm(prev => ({ ...prev, itemUnit: e.target.value }));
                      setPreviewUpdate(null);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm sm:text-base"
                    disabled={loadingUnits}
                  >
                    {productUnits.map((unit) => (
                      <option key={unit.code} value={unit.code}>
                        {unit.code} - {language === 'th' ? unit.name_th : (unit.name_en || unit.name_th)}
                        {unit.is_custom && ' (Custom)'}
                      </option>
                    ))}
                  </select>
                  {/* แสดงรายการ custom units พร้อมปุ่มลบ (เฉพาะ SuperAdmin) */}
                  {(() => {
                    const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
                    const isSuperAdmin = userRoles.some(r => String(r).toLowerCase() === 'superadmin');
                    return isSuperAdmin && productUnits.filter(u => u.is_custom).length > 0 && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {productUnits
                          .filter(u => u.is_custom)
                          .map((unit) => (
                            <div
                              key={unit.id}
                              className="flex items-center justify-between px-2 py-1.5 bg-gray-50 dark:bg-slate-700/50 rounded border border-gray-200 dark:border-slate-600"
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
                    );
                  })()}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 sm:p-4 border border-blue-200 dark:border-blue-800">
                <span className="text-xs sm:text-sm font-medium text-blue-900 dark:text-blue-100 block mb-1 break-words">
                  {language === 'th' ? 'รหัสสินค้าใหม่' : 'New Item Code'}:
                </span>
                <div className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400 font-mono break-all">
                  {generateEditItemCode() || <span className="text-gray-400 text-xs sm:text-sm">{language === 'th' ? 'กรุณากรอกข้อมูล' : 'Please fill in data'}</span>}
                </div>
                {editingItem?.item_code && generateEditItemCode() && editingItem.item_code !== generateEditItemCode() && (
                  <div className="mt-2 pt-2 border-t border-blue-300 dark:border-blue-700">
                    <span className="text-xs text-blue-700 dark:text-blue-300 break-words">
                      {language === 'th' ? 'รหัสเดิม' : 'Old Code'}: <span className="font-mono break-all">{editingItem.item_code}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Show preview update info if available */}
              {previewUpdate && previewUpdate.willChange && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 sm:p-4 border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1 break-words">
                        {language === 'th' ? 'การเปลี่ยนแปลงนี้จะส่งผลกระทบ' : 'This change will affect'}
                      </p>
                      {previewUpdate.affectedTicketsCount > 0 && (
                        <p className="text-xs text-yellow-700 dark:text-yellow-300 break-words">
                          {language === 'th' 
                            ? `• ${previewUpdate.affectedTicketsCount} tickets จะถูกอัปเดตให้ใช้รหัสใหม่`
                            : `• ${previewUpdate.affectedTicketsCount} tickets will be updated to use the new code`
                          }
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal: Confirm Update (เมื่อ item_code จะเปลี่ยน) */}
      <Modal
        open={showConfirmUpdateModal}
        onClose={() => {
          setShowConfirmUpdateModal(false);
          setShowEditItemModal(true);
        }}
        title={language === 'th' ? 'ยืนยันการเปลี่ยนแปลงรหัสสินค้า' : 'Confirm Item Code Change'}
      >
        <div className="p-4 sm:p-6">
          {previewUpdate && (
            <>
              <div className="mb-4 sm:mb-6">
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 sm:p-4 border border-red-200 dark:border-red-800 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-red-800 dark:text-red-200 mb-2 break-words">
                        {language === 'th' ? 'การเปลี่ยนแปลงนี้จะส่งผลกระทบต่อระบบ' : 'This change will affect the system'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 break-words">
                      {language === 'th' ? 'รหัสสินค้าเดิม' : 'Old Item Code'}:
                    </p>
                    <p className="text-base sm:text-lg font-mono text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-slate-700 p-2 rounded break-all">
                      {previewUpdate.oldItemCode}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 break-words">
                      {language === 'th' ? 'รหัสสินค้าใหม่' : 'New Item Code'}:
                    </p>
                    <p className="text-base sm:text-lg font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded break-all">
                      {previewUpdate.newItemCode}
                    </p>
                  </div>

                  {previewUpdate.affectedTicketsCount > 0 && (
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 break-words">
                        {language === 'th' ? 'Tickets ที่จะถูกอัปเดต' : 'Tickets to be updated'}:
                      </p>
                      <p className="text-base sm:text-lg font-semibold text-blue-600 dark:text-blue-400">
                        {previewUpdate.affectedTicketsCount} {language === 'th' ? 'tickets' : 'tickets'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-words">
                        {language === 'th' 
                          ? 'Tickets ทั้งหมดที่ใช้รหัสเดิมจะถูกอัปเดตให้ใช้รหัสใหม่อัตโนมัติ'
                          : 'All tickets using the old code will be automatically updated to use the new code'
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3">
                <button
                  onClick={() => {
                    setShowConfirmUpdateModal(false);
                    setShowEditItemModal(true);
                  }}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
                >
                  {t('cancel', language)}
                </button>
                <button
                  onClick={handleUpdateItemCode}
                  disabled={isUpdating}
                  className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto text-sm sm:text-base min-h-[44px]"
                >
                  {isUpdating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{language === 'th' ? 'กำลังบันทึก...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{language === 'th' ? 'ยืนยันและบันทึก' : 'Confirm & Save'}</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* View File Modal - Minimal fullscreen-like */}
      <Modal 
        open={showViewFileModal} 
        onClose={() => setShowViewFileModal(false)} 
        hideHeader
        maxWidth="max-w-7xl"
        maxHeight="max-h-[88vh]"
      >
        {selectedFile && (
          <div className="relative w-full h-full p-0">
            {/* Close button */}
            <button
              onClick={() => setShowViewFileModal(false)}
              className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 px-3 py-1.5 bg-black/60 text-white rounded-md hover:bg-black/70 transition-colors text-xs sm:text-sm min-h-[44px]"
            >
              {language === 'th' ? 'ปิด' : 'Close'}
            </button>

            {/* Content */}
            <div className="w-full h-full">
              {selectedFile.file_type === 'pdf' ? (
                <iframe
                  src={`${selectedFile.file_url}#toolbar=0&navpanes=0&scrollbar=0`}
                  className="w-full h-[75vh] sm:h-[82vh]"
                  title={selectedFile.file_name}
                />
              ) : (
                <div className="w-full h-[75vh] sm:h-[82vh] flex items-center justify-center bg-black/5 dark:bg-black/20 p-2">
                  <img
                    src={selectedFile.file_url}
                    alt={selectedFile.file_name}
                    className="max-h-full max-w-full object-contain rounded"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Set Labor Price */}
      <Modal
        open={showLaborPriceModal}
        onClose={() => {
          setShowLaborPriceModal(false);
          setPricingItem(null);
          setLaborPrices({
            pressStation: { price: '', priceType: 'per_piece' },
            paintStation: { price: '', priceType: 'per_piece' },
            frameStation: { price: '', priceType: 'per_piece' },
            noFrameStation: { price: '', priceType: 'per_piece' },
            sharpStation: { price: '', priceType: 'per_piece' }
          });
        }}
        title={language === 'th' ? `ตั้งราคาค่าแรง - ${pricingItem?.item_code || ''}` : `Set Labor Price - ${pricingItem?.item_code || ''}`}
        maxWidth="max-w-2xl"
        maxHeight="max-h-[90vh]"
        footer={!loadingPrices ? (
          <div className="px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => {
                  setShowLaborPriceModal(false);
                  setPricingItem(null);
                  setLaborPrices({
                    pressStation: { price: '', priceType: 'per_piece' },
                    paintStation: { price: '', priceType: 'per_piece' },
                    frameStation: { price: '', priceType: 'per_piece' },
                    noFrameStation: { price: '', priceType: 'per_piece' },
                    sharpStation: { price: '', priceType: 'per_piece' }
                  });
                }}
                disabled={savingPrices}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors w-full sm:w-auto text-sm min-h-[44px]"
              >
                {t('cancel', language)}
              </button>
              <button
                onClick={handleSaveLaborPrices}
                disabled={savingPrices}
                className="pressable px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto text-sm min-h-[44px]"
              >
                {savingPrices ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{language === 'th' ? 'กำลังบันทึก...' : 'Saving...'}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{t('save', language)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
      >
        <div className="p-4 sm:p-6">
          {loadingPrices ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{language === 'th' ? 'กำลังโหลดราคา...' : 'Loading prices...'}</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 break-words">
                {language === 'th' 
                  ? 'ตั้งราคาค่าแรงสำหรับสถานี "ปรับขนาด", "สี", "ประกอบวงกบ", "ไม่ประกอบวงกบ", และ "ประกอบชุดชาร์ป" ราคานี้จะแสดงอัตโนมัติในหน้า ticket edit'
                  : 'Set labor prices for "Resize", "Paint", "Frame Assembly", "No Frame Assembly", and "Sharp Set Assembly" stations. These prices will automatically appear in ticket edit page'}
              </p>
              
              <div className="space-y-4">
                {/* Press Station (ปรับขนาด) */}
                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    {language === 'th' ? 'สถานี: ปรับขนาด' : 'Station: Resize'}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'th' ? 'ประเภทการคิดเงิน' : 'Price Type'} *
                      </label>
                      <div className="relative">
                        <select
                          value={laborPrices.pressStation.priceType}
                          onChange={(e) => setLaborPrices(prev => ({
                            ...prev,
                            pressStation: { ...prev.pressStation, priceType: e.target.value }
                          }))}
                          className="w-full appearance-none bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 cursor-pointer text-sm"
                        >
                          <option value="flat">{language === 'th' ? 'เหมาจ่าย' : 'Flat Rate'}</option>
                          <option value="per_piece">{language === 'th' ? 'ต่อชิ้น' : 'Per Piece'}</option>
                          <option value="per_hour">{language === 'th' ? 'รายชั่วโมง' : 'Per Hour'}</option>
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'th' ? 'ราคา' : 'Price'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={laborPrices.pressStation.price}
                        onChange={(e) => setLaborPrices(prev => ({
                          ...prev,
                          pressStation: { ...prev.pressStation, price: e.target.value }
                        }))}
                        placeholder="0.00"
                        className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
                        onWheel={(e) => e.target.blur()}
                      />
                    </div>
                  </div>
                </div>

                {/* Paint Station (สี) */}
                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    {language === 'th' ? 'สถานี: สี' : 'Station: Paint'}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'th' ? 'ประเภทการคิดเงิน' : 'Price Type'} *
                      </label>
                      <div className="relative">
                        <select
                          value={laborPrices.paintStation.priceType}
                          onChange={(e) => setLaborPrices(prev => ({
                            ...prev,
                            paintStation: { ...prev.paintStation, priceType: e.target.value }
                          }))}
                          className="w-full appearance-none bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 cursor-pointer text-sm"
                        >
                          <option value="flat">{language === 'th' ? 'เหมาจ่าย' : 'Flat Rate'}</option>
                          <option value="per_piece">{language === 'th' ? 'ต่อชิ้น' : 'Per Piece'}</option>
                          <option value="per_hour">{language === 'th' ? 'รายชั่วโมง' : 'Per Hour'}</option>
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'th' ? 'ราคา' : 'Price'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={laborPrices.paintStation.price}
                        onChange={(e) => setLaborPrices(prev => ({
                          ...prev,
                          paintStation: { ...prev.paintStation, price: e.target.value }
                        }))}
                        placeholder="0.00"
                        className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
                        onWheel={(e) => e.target.blur()}
                      />
                    </div>
                  </div>
                </div>

                {/* Frame Station (ประกอบวงกบ) */}
                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    {language === 'th' ? 'สถานี: ประกอบวงกบ' : 'Station: Frame Assembly'}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'th' ? 'ประเภทการคิดเงิน' : 'Price Type'} *
                      </label>
                      <div className="relative">
                        <select
                          value={laborPrices.frameStation.priceType}
                          onChange={(e) => setLaborPrices(prev => ({
                            ...prev,
                            frameStation: { ...prev.frameStation, priceType: e.target.value }
                          }))}
                          className="w-full appearance-none bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 cursor-pointer text-sm"
                        >
                          <option value="flat">{language === 'th' ? 'เหมาจ่าย' : 'Flat Rate'}</option>
                          <option value="per_piece">{language === 'th' ? 'ต่อชิ้น' : 'Per Piece'}</option>
                          <option value="per_hour">{language === 'th' ? 'รายชั่วโมง' : 'Per Hour'}</option>
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'th' ? 'ราคา' : 'Price'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={laborPrices.frameStation.price}
                        onChange={(e) => setLaborPrices(prev => ({
                          ...prev,
                          frameStation: { ...prev.frameStation, price: e.target.value }
                        }))}
                        placeholder="0.00"
                        className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
                        onWheel={(e) => e.target.blur()}
                      />
                    </div>
                  </div>
                </div>

                {/* No Frame Station (ไม่ประกอบวงกบ) */}
                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    {language === 'th' ? 'สถานี: ไม่ประกอบวงกบ' : 'Station: No Frame Assembly'}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'th' ? 'ประเภทการคิดเงิน' : 'Price Type'} *
                      </label>
                      <div className="relative">
                        <select
                          value={laborPrices.noFrameStation.priceType}
                          onChange={(e) => setLaborPrices(prev => ({
                            ...prev,
                            noFrameStation: { ...prev.noFrameStation, priceType: e.target.value }
                          }))}
                          className="w-full appearance-none bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 cursor-pointer text-sm"
                        >
                          <option value="flat">{language === 'th' ? 'เหมาจ่าย' : 'Flat Rate'}</option>
                          <option value="per_piece">{language === 'th' ? 'ต่อชิ้น' : 'Per Piece'}</option>
                          <option value="per_hour">{language === 'th' ? 'รายชั่วโมง' : 'Per Hour'}</option>
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'th' ? 'ราคา' : 'Price'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={laborPrices.noFrameStation.price}
                        onChange={(e) => setLaborPrices(prev => ({
                          ...prev,
                          noFrameStation: { ...prev.noFrameStation, price: e.target.value }
                        }))}
                        placeholder="0.00"
                        className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
                        onWheel={(e) => e.target.blur()}
                      />
                    </div>
                  </div>
                </div>

                {/* Sharp Station (ประกอบชุดชาร์ป) */}
                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    {language === 'th' ? 'สถานี: ประกอบชุดชาร์ป' : 'Station: Sharp Set Assembly'}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'th' ? 'ประเภทการคิดเงิน' : 'Price Type'} *
                      </label>
                      <div className="relative">
                        <select
                          value={laborPrices.sharpStation.priceType}
                          onChange={(e) => setLaborPrices(prev => ({
                            ...prev,
                            sharpStation: { ...prev.sharpStation, priceType: e.target.value }
                          }))}
                          className="w-full appearance-none bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 cursor-pointer text-sm"
                        >
                          <option value="flat">{language === 'th' ? 'เหมาจ่าย' : 'Flat Rate'}</option>
                          <option value="per_piece">{language === 'th' ? 'ต่อชิ้น' : 'Per Piece'}</option>
                          <option value="per_hour">{language === 'th' ? 'รายชั่วโมง' : 'Per Hour'}</option>
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {language === 'th' ? 'ราคา' : 'Price'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={laborPrices.sharpStation.price}
                        onChange={(e) => setLaborPrices(prev => ({
                          ...prev,
                          sharpStation: { ...prev.sharpStation, price: e.target.value }
                        }))}
                        placeholder="0.00"
                        className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
                        onWheel={(e) => e.target.blur()}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
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
