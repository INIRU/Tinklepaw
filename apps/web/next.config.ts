import type { NextConfig } from 'next';

const supabaseStoragePattern = (() => {
  const raw = process.env.SUPABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return {
      protocol: (u.protocol.replace(':', '') || 'https') as 'http' | 'https',
      hostname: u.hostname,
      pathname: '/storage/v1/object/public/**'
    };
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '/avatars/**'
      },
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '/embed/avatars/**'
      },
      ...(supabaseStoragePattern ? [supabaseStoragePattern] : [])
    ]
  }
};

export default nextConfig;
