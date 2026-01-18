import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Optimize package imports for better tree-shaking (bundle-barrel-imports rule)
  experimental: {
    optimizePackageImports: ['framer-motion', 'lucide-react'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.scdn.co',
        pathname: '/image/**',
      },
    ],
  },
};

export default nextConfig;
