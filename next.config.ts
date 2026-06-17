import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  distDir: process.env.VERCEL ? ".next" : ".next-local",
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
