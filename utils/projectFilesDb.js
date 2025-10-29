/**
 * Project Files Database Service
 * จัดการข้อมูลไฟล์ในแต่ละ Item Code (Subfolder)
 */

import { supabase } from './supabaseClient';
import { supabaseServer } from './supabaseServer';

// Use server client for server-side operations
const db = typeof window === 'undefined' ? supabaseServer : supabase;

/**
 * ดึงไฟล์ทั้งหมดของ Item Code
 */
export async function getItemFiles(itemId) {
  try {
    const { data, error } = await db
      .from('project_files')
      .select('*')
      .eq('project_item_id', itemId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Error fetching item files:', error);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching item files:', error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * ดึงไฟล์ปัจจุบันของ Item Code
 */
export async function getCurrentFile(itemId) {
  try {
    const { data, error } = await db
      .from('project_files')
      .select('*')
      .eq('project_item_id', itemId)
      .eq('is_current', true)
      .maybeSingle();

    if (error) {
      console.error('Error fetching current file:', error);
      return { success: false, error: error.message, data: null };
    }

    // If no data returned (null), it means no current file
    return { success: true, data: data || null, error: null };
  } catch (error) {
    console.error('Error fetching current file:', error);
    return { success: false, error: error.message, data: null };
  }
}

/**
 * อัปโหลดไฟล์ใหม่ (ใช้ Database Function เพื่อ auto-set is_current)
 */
export async function uploadFile(fileData) {
  try {
    const { data, error } = await db.rpc('upload_project_file', {
      p_project_item_id: fileData.projectItemId,
      p_file_name: fileData.fileName,
      p_file_path: fileData.filePath,
      p_file_url: fileData.fileUrl,
      p_file_size: fileData.fileSize,
      p_file_type: fileData.fileType,
      p_uploaded_by: fileData.uploadedBy
    });

    if (error) {
      console.error('Error uploading file:', error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: { id: data }, error: null };
  } catch (error) {
    console.error('Error uploading file:', error);
    return { success: false, error: error.message, data: null };
  }
}

/**
 * ลบไฟล์ (เฉพาะไฟล์เก่า)
 */
export async function deleteFile(fileId) {
  try {
    // ตรวจสอบว่าไม่ใช่ไฟล์ปัจจุบัน
    const { data: fileData, error: checkError } = await db
      .from('project_files')
      .select('is_current, file_path')
      .eq('id', fileId)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking file:', checkError);
      return { success: false, error: checkError.message };
    }

    if (!fileData) {
      return { success: false, error: 'File not found' };
    }

    if (fileData.is_current) {
      return { 
        success: false, 
        error: 'Cannot delete current file. Please upload a new file first.' 
      };
    }

    // ลบไฟล์จาก Storage
    if (fileData.file_path) {
      const { error: storageError } = await supabase.storage
        .from('project-files')
        .remove([fileData.file_path]);

      if (storageError) {
        console.warn('Error deleting from storage:', storageError);
        // Continue even if storage deletion fails
      }
    }

    // ลบจากฐานข้อมูล
    const { error } = await db
      .from('project_files')
      .delete()
      .eq('id', fileId);

    if (error) {
      console.error('Error deleting file:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Error deleting file:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ดึงจำนวนไฟล์ทั้งหมดของ Item Code
 */
export async function getFileCount(itemId) {
  try {
    const { count, error } = await db
      .from('project_files')
      .select('*', { count: 'exact', head: true })
      .eq('project_item_id', itemId);

    if (error) {
      console.error('Error counting files:', error);
      return { success: false, error: error.message, count: 0 };
    }

    return { success: true, count: count || 0, error: null };
  } catch (error) {
    console.error('Error counting files:', error);
    return { success: false, error: error.message, count: 0 };
  }
}

