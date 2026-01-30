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
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '/emojis/**'
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        pathname: '/**'
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/**'
      },
      {
        protocol: 'https',
        hostname: 'i.scdn.co',
        pathname: '/**'
      },
      {
        protocol: 'https',
        hostname: 'mosaic.scdn.co',
        pathname: '/**'
      },
      {
        protocol: 'https',
        hostname: 'i1.sndcdn.com',
        pathname: '/**'
      },
      ...(supabaseStoragePattern ? [supabaseStoragePattern] : [])
    ]
  }
};

export default nextConfig;
