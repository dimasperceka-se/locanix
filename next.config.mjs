/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets the e2e test server build into its own folder next to a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
