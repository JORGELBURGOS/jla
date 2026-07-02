/** @type {import('next').NextConfig} */
module.exports = {
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'rpnojrciduhapvvvuqgb.supabase.co' }]
  }
}
