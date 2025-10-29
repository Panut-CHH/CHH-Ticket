/**
 * Project Database Service
 * จัดการข้อมูลโปรเจ็คในฐานข้อมูล Supabase
 */

import { supabase } from './supabaseClient';

/**
 * โครงสร้างตาราง projects ใน Supabase
 * CREATE TABLE projects (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   -- project_code DEPRECATED (replaced by item_code)
 *   -- project_code TEXT NOT NULL,
 *   -- rpd_no DEPRECATED (removed from schema)
 *   file_name TEXT NOT NULL,
 *   file_size TEXT,
 *   file_type TEXT,
 *   description TEXT,
 *   uploaded_by TEXT NOT NULL,
 *   uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
 *   sync_status TEXT DEFAULT 'pending',
 *   erp_data JSONB,
 *   last_sync TIMESTAMP WITH TIME ZONE,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 */

/**
 * ดึงข้อมูลโปรเจ็คทั้งหมด
 */
export async function getAllProjects() {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching projects:', error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * ดึงข้อมูลโปรเจ็คตาม ID
 */
export async function getProjectById(projectId) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) {
      console.error('Error fetching project:', error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data, error: null };
  } catch (error) {
    console.error('Error fetching project:', error);
    return { success: false, error: error.message, data: null };
  }
}

/**
 * สร้างโปรเจ็คใหม่
 */
export async function createProject(projectData) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .insert([{
        // rpd_no removed from schema
        file_name: projectData.fileName || 'FOLDER',
        file_path: projectData.filePath || null,
        file_url: projectData.fileUrl || null,
        file_size: projectData.fileSize,
        file_type: projectData.fileType,
        description: projectData.description,
        uploaded_by: projectData.uploadedBy,
        sync_status: projectData.syncStatus || 'pending',
        erp_data: projectData.erpData || null,
        last_sync: projectData.lastSync || null,
        // New fields for Project Code and Item Code system
        project_number: projectData.projectNumber || null,
        project_name: projectData.projectName || null,
        item_code: projectData.itemCode || projectData.projectCode || null,
        item_type: projectData.itemType || null,
        item_product_code: projectData.itemProductCode || null,
        item_unit: projectData.itemUnit || null
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data, error: null };
  } catch (error) {
    console.error('Error creating project:', error);
    return { success: false, error: error.message, data: null };
  }
}

/**
 * อัปเดตโปรเจ็ค
 */
export async function updateProject(projectId, updateData) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      console.error('Error updating project:', error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data, error: null };
  } catch (error) {
    console.error('Error updating project:', error);
    return { success: false, error: error.message, data: null };
  }
}

/**
 * ลบโปรเจ็ค
 */
export async function deleteProject(projectId) {
  try {
    // 1. ดึง tickets ที่เชื่อมกับโปรเจ็คนี้
    const { data: tickets, error: ticketError } = await supabase
      .from('ticket')
      .select('no')
      .eq('project_id', projectId);

    if (ticketError) {
      console.warn('Error fetching tickets:', ticketError);
    }

    const ticketNumbers = tickets?.map(t => t.no) || [];

    if (ticketNumbers.length > 0) {
      // 2. ดึง rework_order_ids
      const { data: reworkOrders, error: reworkOrderError } = await supabase
        .from('rework_orders')
        .select('id')
        .in('ticket_no', ticketNumbers);

      if (reworkOrderError) {
        console.warn('Error fetching rework_orders:', reworkOrderError);
      }

      const reworkOrderIds = reworkOrders?.map(ro => ro.id) || [];

      if (reworkOrderIds.length > 0) {
        // 3. ลบ rework_roadmap
        const { error: roadmapError } = await supabase
          .from('rework_roadmap')
          .delete()
          .in('rework_order_id', reworkOrderIds);

        if (roadmapError) {
          console.warn('Error deleting rework_roadmap:', roadmapError);
        }

        // 4. อัปเดต ticket_station_flow ให้ rework_order_id เป็น null
        const { error: flowError } = await supabase
          .from('ticket_station_flow')
          .update({ rework_order_id: null })
          .in('ticket_no', ticketNumbers)
          .not('rework_order_id', 'is', null);

        if (flowError) {
          console.warn('Error updating ticket_station_flow:', flowError);
        }
      }
    }

    // 5. ลบโปรเจ็ค
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting project:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Error deleting project:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ค้นหาโปรเจ็คตามคำค้นหา
 */
export async function searchProjects(searchTerm) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .or(`item_code.ilike.%${searchTerm}%,file_name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error searching projects:', error);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: data || [], error: null };
  } catch (error) {
    console.error('Error searching projects:', error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * อัปเดตสถานะซิ้งค์ ERP
 */
export async function updateProjectSyncStatus(identifier, syncStatus, erpData = null) {
  try {
    const updateData = {
      sync_status: syncStatus,
      last_sync: new Date().toISOString()
    };

    if (erpData) {
      updateData.erp_data = erpData;
    }

    const isObject = typeof identifier === 'object' && identifier !== null;
    const idValue = isObject ? (identifier.id || null) : identifier;
    const itemCodeValue = isObject ? (identifier.itemCode || identifier.item_code || identifier.projectCode || identifier.project_code || null) : null;

    const isUuid = typeof idValue === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idValue);

    // Try update by id first (if UUID), else by item_code
    let query = supabase.from('projects').update(updateData);
    if (isUuid) {
      query = query.eq('id', idValue);
    } else if (itemCodeValue) {
      query = query.eq('item_code', itemCodeValue);
    } else {
      // If identifier is non-uuid string, treat as item_code
      if (typeof idValue === 'string') {
        query = query.eq('item_code', idValue);
      } else {
        return { success: false, error: 'Invalid identifier for updateProjectSyncStatus', data: null };
      }
    }

    // maybeSingle: returns null data instead of throwing when 0 rows
    const { data, error, status } = await query.select().maybeSingle();

    if (error) {
      console.error('Error updating sync status:', error?.message || error);
      return { success: false, error: error.message || String(error), data: null, status };
    }

    if (!data) {
      // Fallback: if first filter was id and failed, retry with item_code (when available)
      if (isUuid && (itemCodeValue || typeof idValue === 'string')) {
        const fallbackCode = itemCodeValue || idValue;
        const { data: data2, error: error2, status: status2 } = await supabase
          .from('projects')
          .update(updateData)
          .eq('item_code', fallbackCode)
          .select()
          .maybeSingle();

        if (error2) {
          console.error('Error updating sync status (fallback):', error2?.message || error2);
          return { success: false, error: error2.message || String(error2), data: null, status: status2 };
        }

        if (!data2) {
          return { success: false, error: 'Project not found for update', data: null, status: status2 };
        }

        return { success: true, data: data2, error: null };
      }

      return { success: false, error: 'Project not found for update', data: null, status };
    }

    return { success: true, data, error: null };
  } catch (error) {
    console.error('Error updating sync status:', error?.message || error);
    return { success: false, error: error.message || String(error), data: null };
  }
}

/**
 * ดึงสถิติโปรเจ็ค
 */
export async function getProjectStats() {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('sync_status');

    if (error) {
      console.error('Error fetching project stats:', error);
      return { success: false, error: error.message, data: null };
    }

    const stats = {
      total: data.length,
      synced: data.filter(p => p.sync_status === 'success').length,
      failed: data.filter(p => p.sync_status === 'failed').length,
      pending: data.filter(p => p.sync_status === 'pending').length
    };

    return { success: true, data: stats, error: null };
  } catch (error) {
    console.error('Error fetching project stats:', error);
    return { success: false, error: error.message, data: null };
  }
}

export async function getUserName(userId) {
  try {
    if (!userId) return null;

    // Validate UUID format to avoid RLS/API errors on invalid IDs
    const isUuid = typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) return null;

    // Prefer server-side function that merges auth.users and public.users
    const { data, error } = await supabase.rpc('get_user_name', { uid: userId });
    if (error) {
      console.error('Error fetching user name via rpc:', error?.message || error);
      return null;
    }
    return data || null;
  } catch (error) {
    console.error('Error fetching user name:', error?.message || error);
    return null;
  }
}

/**
 * บันทึกประวัติไฟล์เมื่อมีการอัปโหลดไฟล์ใหม่
 */
export async function saveFileHistory(projectId, fileData) {
  try {
    const { data, error } = await supabase
      .from('project_file_history')
      .insert([{
        project_id: projectId,
        file_name: fileData.fileName,
        file_path: fileData.filePath,
        file_url: fileData.fileUrl,
        file_size: fileData.fileSize,
        file_type: fileData.fileType,
        uploaded_by: fileData.uploadedBy
      }])
      .select()
      .single();

    if (error) {
      console.error('Error saving file history:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  } catch (error) {
    console.error('Error saving file history:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ดึงประวัติไฟล์ของโปรเจ็ค
 */
export async function getProjectFileHistory(projectId) {
  try {
    const { data, error } = await supabase
      .from('project_file_history')
      .select('*')
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Error fetching file history:', error);
      return { success: false, error: error.message, data: [] };
    }

    // กรองไฟล์ที่มีข้อมูลไม่สมบูรณ์
    const validFiles = (data || []).filter(file => 
      file.file_name && 
      file.file_size && 
      file.file_type && 
      file.file_url &&
      file.uploaded_at
    );

    return { success: true, data: validFiles, error: null };
  } catch (error) {
    console.error('Error fetching file history:', error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * ลบไฟล์ประวัติที่ไม่สมบูรณ์
 */
export async function cleanupIncompleteFileHistory(projectId) {
  try {
    const { error } = await supabase
      .from('project_file_history')
      .delete()
      .eq('project_id', projectId)
      .or('file_name.is.null,file_size.is.null,file_type.is.null,file_url.is.null,uploaded_at.is.null');

    if (error) {
      console.error('Error cleaning up file history:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Error cleaning up file history:', error);
    return { success: false, error: error.message };
  }
}
