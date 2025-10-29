-- สร้างตาราง project_files สำหรับเก็บไฟล์ในแต่ละ Item Code
-- Run this SQL in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS project_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_item_id UUID NOT NULL REFERENCES project_items(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size TEXT,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'jpg', 'jpeg', 'png')),
  is_current BOOLEAN DEFAULT false,
  uploaded_by UUID,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- สร้าง indexes
CREATE INDEX IF NOT EXISTS idx_project_files_project_item_id ON project_files(project_item_id);
CREATE INDEX IF NOT EXISTS idx_project_files_is_current ON project_files(is_current);
CREATE INDEX IF NOT EXISTS idx_project_files_uploaded_at ON project_files(uploaded_at);

-- ตั้งค่า Row Level Security (RLS)
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถดูข้อมูลได้
CREATE POLICY "Users can view project files" ON project_files
    FOR SELECT USING (auth.role() = 'authenticated');

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถสร้างข้อมูลได้
CREATE POLICY "Users can create project files" ON project_files
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถอัปเดตข้อมูลได้
CREATE POLICY "Users can update project files" ON project_files
    FOR UPDATE USING (auth.role() = 'authenticated');

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถลบข้อมูลได้
CREATE POLICY "Users can delete project files" ON project_files
    FOR DELETE USING (auth.role() = 'authenticated');

-- สร้าง function สำหรับอัปโหลดไฟล์ (auto-set is_current)
CREATE OR REPLACE FUNCTION upload_project_file(
  p_project_item_id uuid,
  p_file_name text,
  p_file_path text,
  p_file_url text,
  p_file_size text,
  p_file_type text,
  p_uploaded_by uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_file_id uuid;
BEGIN
  -- Set all existing files in this item to is_current = false
  UPDATE project_files 
  SET is_current = false 
  WHERE project_item_id = p_project_item_id;
  
  -- Insert new file with is_current = true
  INSERT INTO project_files (
    project_item_id,
    file_name,
    file_path,
    file_url,
    file_size,
    file_type,
    is_current,
    uploaded_by
  ) VALUES (
    p_project_item_id,
    p_file_name,
    p_file_path,
    p_file_url,
    p_file_size,
    p_file_type,
    true,
    p_uploaded_by
  )
  RETURNING id INTO v_file_id;
  
  RETURN v_file_id;
END;
$$;

-- เพิ่ม comment
COMMENT ON TABLE project_files IS 'เก็บไฟล์ในแต่ละ Item Code (Subfolder)';
COMMENT ON COLUMN project_files.is_current IS 'true = ไฟล์ปัจจุบัน, false = ไฟล์เก่า';
COMMENT ON FUNCTION upload_project_file IS 'อัปโหลดไฟล์ใหม่และ set เป็นไฟล์ปัจจุบันอัตโนมัติ';

