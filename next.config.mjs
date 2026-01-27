/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      /** ขยาย limit สำหรับ upload ไฟล์ (default 1MB → 10MB ตามที่ API route ตรวจสอบ) */
      bodySizeLimit: '10mb',
    },
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        destination: "https://chh-ticket.evergreenchh.tech/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
