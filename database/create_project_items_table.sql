-- สร้างตาราง project_items สำหรับเก็บ Item Code (Subfolder)
-- Run this SQL in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS project_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('FG', 'SM', 'WP', 'EX')),
  item_product_code TEXT NOT NULL,
  item_unit TEXT NOT NULL CHECK (item_unit IN ('D', 'F', 'S', 'P', 'W', 'M', 'O')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, item_code)
);

-- สร้าง indexes
CREATE INDEX IF NOT EXISTS idx_project_items_project_id ON project_items(project_id);
CREATE INDEX IF NOT EXISTS idx_project_items_item_code ON project_items(item_code);

-- สร้าง function สำหรับอัปเดต updated_at
CREATE OR REPLACE FUNCTION update_project_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- สร้าง trigger
DROP TRIGGER IF EXISTS update_project_items_updated_at ON project_items;
CREATE TRIGGER update_project_items_updated_at
    BEFORE UPDATE ON project_items
    FOR EACH ROW
    EXECUTE FUNCTION update_project_items_updated_at();

-- ตั้งค่า Row Level Security (RLS)
ALTER TABLE project_items ENABLE ROW LEVEL SECURITY;

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถดูข้อมูลได้
CREATE POLICY "Users can view project items" ON project_items
    FOR SELECT USING (auth.role() = 'authenticated');

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถสร้างข้อมูลได้
CREATE POLICY "Users can create project items" ON project_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถอัปเดตข้อมูลได้
CREATE POLICY "Users can update project items" ON project_items
    FOR UPDATE USING (auth.role() = 'authenticated');

-- สร้าง policy ให้ผู้ใช้ที่ authenticated สามารถลบข้อมูลได้
CREATE POLICY "Users can delete project items" ON project_items
    FOR DELETE USING (auth.role() = 'authenticated');

-- เพิ่ม comment
COMMENT ON TABLE project_items IS 'เก็บ Item Code (Subfolder) ของแต่ละ Project';
COMMENT ON COLUMN project_items.item_code IS 'รหัสสินค้าแบบเต็ม เช่น FG-00215-D01-D';
COMMENT ON COLUMN project_items.item_type IS 'ประเภทสินค้า: FG, SM, WP, EX';
COMMENT ON COLUMN project_items.item_product_code IS 'รหัสสินค้า เช่น D01';
COMMENT ON COLUMN project_items.item_unit IS 'หน่วยสินค้า: D, F, S, P, W, M, O';

