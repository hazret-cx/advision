/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'sharp', 'playwright'],
  },
  api: {
    bodyParser: false, // needed for multer file uploads
  },
};

module.exports = nextConfig;
