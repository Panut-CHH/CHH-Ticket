-- สร้าง Storage bucket สำหรับ project files
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', true)
ON CONFLICT (id) DO NOTHING;

-- ตั้งค่า RLS policies สำหรับ project-files bucket

-- Policy 1: อนุญาตให้ authenticated users อัปโหลดไฟล์
CREATE POLICY "Authenticated users can upload project files" ON storage.objects
FOR INSERT 
WITH CHECK (
  bucket_id = 'project-files' 
  AND auth.role() = 'authenticated'
);

-- Policy 2: อนุญาตให้ authenticated users อัปเดตไฟล์ที่ตัวเองอัปโหลด
CREATE POLICY "Users can update their own project files" ON storage.objects
FOR UPDATE 
USING (
  bucket_id = 'project-files' 
  AND auth.role() = 'authenticated'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'project-files' 
  AND auth.role() = 'authenticated'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy 3: อนุญาตให้ authenticated users ลบไฟล์ที่ตัวเองอัปโหลด
CREATE POLICY "Users can delete their own project files" ON storage.objects
FOR DELETE 
USING (
  bucket_id = 'project-files' 
  AND auth.role() = 'authenticated'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy 4: อนุญาตให้ authenticated users อ่านไฟล์ทั้งหมด (public access)
CREATE POLICY "Authenticated users can view project files" ON storage.objects
FOR SELECT 
USING (
  bucket_id = 'project-files' 
  AND auth.role() = 'authenticated'
);

-- ตั้งค่าให้ bucket เป็น public เพื่อให้สามารถเข้าถึงไฟล์ได้โดยไม่ต้อง login
-- (ถ้าต้องการให้เป็น private ให้ลบ policy นี้)
CREATE POLICY "Public access to project files" ON storage.objects
FOR SELECT 
USING (bucket_id = 'project-files');
