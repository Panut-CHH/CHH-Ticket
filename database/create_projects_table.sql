-- สร้างตาราง projects ใน Supabase
-- Run this SQL in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_code TEXT NOT NULL,
  rpd_no TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size TEXT,
  file_type TEXT,
  description TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'success', 'failed')),
  erp_data JSONB,
  last_sync TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- สร้าง indexes สำหรับการค้นหา
CREATE INDEX IF NOT EXISTS idx_projects_project_code ON projects(project_code);
CREATE INDEX IF NOT EXISTS idx_projects_rpd_no ON projects(rpd_no);
CREATE INDEX IF NOT EXISTS idx_projects_sync_status ON projects(sync_status);
CREATE INDEX IF NOT EXISTS idx_projects_uploaded_at ON projects(uploaded_at);

-- สร้าง function สำหรับอัปเดต updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- สร้าง trigger สำหรับอัปเดต updated_at อัตโนมัติ
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ตั้งค่า Row Level Security (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถดูข้อมูลได้
CREATE POLICY "Users can view projects" ON projects
    FOR SELECT USING (auth.role() = 'authenticated');

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถสร้างข้อมูลได้
CREATE POLICY "Users can create projects" ON projects
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถอัปเดตข้อมูลได้
CREATE POLICY "Users can update projects" ON projects
    FOR UPDATE USING (auth.role() = 'authenticated');

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถลบข้อมูลได้
CREATE POLICY "Users can delete projects" ON projects
    FOR DELETE USING (auth.role() = 'authenticated');

-- เพิ่มข้อมูลตัวอย่าง (optional)
INSERT INTO projects (project_code, rpd_no, file_name, file_size, file_type, description, uploaded_by, sync_status) VALUES
('00470-AD1.A-2-D', 'RPD2501-089', 'HOUSE_001.pdf', '2.5 MB', 'PDF', 'แบบแปลนบ้านเดี่ยว 2 ชั้น พื้นที่ 120 ตร.ม.', 'System Admin', 'success'),
('00471-BD2.B-3-E', 'RPD2501-090', 'CONDO_002.pdf', '3.2 MB', 'PDF', 'แบบแปลนคอนโดมิเนียม 8 ชั้น 120 ยูนิต', 'System Admin', 'pending'),
('00472-CD3.C-1-C', 'RPD2501-091', 'FACTORY_003.pdf', '4.1 MB', 'PDF', 'แบบแปลนโรงงานอุตสาหกรรม พื้นที่ 500 ตร.ม.', 'System Admin', 'failed')
ON CONFLICT DO NOTHING;
