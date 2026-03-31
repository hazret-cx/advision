/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'sharp', 'playwright', 'fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'],
  },
  api: {
    bodyParser: false, // needed for multer file uploads
  },
};

module.exports = nextConfig;
