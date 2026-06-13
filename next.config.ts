import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  /* config options here */
  allowedDevOrigins: [],
  compress: true,
  images: {
    remotePatterns: [],
  },
  // 增加API路由的请求体大小限制
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  serverExternalPackages: [],
};

export default nextConfig;
