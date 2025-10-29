-- เพิ่ม columns สำหรับ Supabase Storage ใน projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS file_url TEXT;

-- เพิ่ม index สำหรับ file_path เพื่อการค้นหาที่เร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_projects_file_path ON projects(file_path);

-- เพิ่ม comment สำหรับ columns ใหม่
COMMENT ON COLUMN projects.file_path IS 'Path ของไฟล์ใน Supabase Storage';
COMMENT ON COLUMN projects.file_url IS 'Public URL ของไฟล์ที่อัปโหลดใน Supabase Storage';
