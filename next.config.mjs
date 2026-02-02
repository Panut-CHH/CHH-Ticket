/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      /** ขยาย limit สำหรับ upload ไฟล์ (default 1MB → 10MB ตามที่ API route ตรวจสอบ) */
      bodySizeLimit: '10mb',
    },
  },
  // redirect เก่าต้องย้ายไป middleware.js เพื่อยกเว้น localhost
};

export default nextConfig;
