-- Migration: เพิ่มฟิลด์ใหม่สำหรับระบบ Project Code และ Item Code
-- Run this SQL in Supabase SQL Editor

-- เพิ่มฟิลด์ใหม่ในตาราง projects
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS project_number TEXT,
ADD COLUMN IF NOT EXISTS project_name TEXT,
ADD COLUMN IF NOT EXISTS item_code TEXT,
ADD COLUMN IF NOT EXISTS item_type TEXT,
ADD COLUMN IF NOT EXISTS item_product_code TEXT,
ADD COLUMN IF NOT EXISTS item_unit TEXT;

-- allow creating folder-style project by relaxing NOT NULL for rpd_no and file_name
ALTER TABLE projects ALTER COLUMN rpd_no DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN file_name DROP NOT NULL;

-- สร้าง index สำหรับ project_number
CREATE INDEX IF NOT EXISTS idx_projects_project_number ON projects(project_number);

-- สร้าง index สำหรับ item_code
CREATE INDEX IF NOT EXISTS idx_projects_item_code ON projects(item_code);

-- เพิ่ม comment สำหรับแต่ละคอลัมน์ใหม่
COMMENT ON COLUMN projects.project_number IS 'เลข Project Number เช่น 00215';
COMMENT ON COLUMN projects.project_name IS 'ชื่อโครงการจาก API';
COMMENT ON COLUMN projects.item_code IS 'รหัสสินค้าที่สร้าง เช่น FG-00215-D01-D';
COMMENT ON COLUMN projects.item_type IS 'ประเภทสินค้า (FG/SM/WP/EX)';
COMMENT ON COLUMN projects.item_product_code IS 'รหัสสินค้า เช่น D01';
COMMENT ON COLUMN projects.item_unit IS 'หน่วยสินค้า (D/F/S/P/W/M/O)';

-- Update existing records (optional - set default values if needed)
-- UPDATE projects SET project_number = rpd_no WHERE project_number IS NULL;
