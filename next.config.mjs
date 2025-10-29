/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/overview",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
