/**
 * Project Items Database Service
 * จัดการข้อมูล Item Code (Subfolder) ของแต่ละ Project
 */

import { supabase } from './supabaseClient';
import { supabaseServer } from './supabaseServer';

// Use server client for server-side operations
const db = typeof window === 'undefined' ? supabaseServer : supabase;

/**
 * ดึงข้อมูล Item Code ทั้งหมดของ Project
 */
export async function getAllProjectItems(projectId) {
  try {
    const { data, error } = await db
      .from('project_items')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching project items:', error);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching project items:', error);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * ดึงข้อมูล Item Code ตาม ID
 */
export async function getProjectItemById(itemId) {
  try {
    const { data, error } = await db
      .from('project_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (error) {
      console.error('Error fetching project item:', error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data, error: null };
  } catch (error) {
    console.error('Error fetching project item:', error);
    return { success: false, error: error.message, data: null };
  }
}

/**
 * สร้าง Item Code (Subfolder) ใหม่
 */
export async function createProjectItem(itemData) {
  try {
    const { data, error } = await db
      .from('project_items')
      .insert([{
        project_id: itemData.projectId,
        item_code: itemData.itemCode,
        item_type: itemData.itemType,
        item_product_code: itemData.itemProductCode,
        item_unit: itemData.itemUnit
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating project item:', error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data, error: null };
  } catch (error) {
    console.error('Error creating project item:', error);
    return { success: false, error: error.message, data: null };
  }
}

/**
 * ลบ Item Code (Subfolder) พร้อมไฟล์ทั้งหมด
 */
export async function deleteProjectItem(itemId) {
  try {
    const { error } = await db
      .from('project_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error('Error deleting project item:', error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Error deleting project item:', error);
    return { success: false, error: error.message };
  }
}

/**
 * นับจำนวนไฟล์ในแต่ละ Item Code
 */
export async function getProjectItemWithFileCount(projectId) {
  try {
    const { data, error } = await db
      .from('project_items')
      .select(`
        *,
        files:project_files(count)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching project items with file count:', error);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching project items with file count:', error);
    return { success: false, error: error.message, data: [] };
  }
}

