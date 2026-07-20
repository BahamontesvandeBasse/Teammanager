import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Aparte builddirectory per dev-sessie (env NEXT_DIST_DIR) zodat meerdere
  // `next dev`-instanties op deze map tegelijk kunnen draaien zonder lock-conflict.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
