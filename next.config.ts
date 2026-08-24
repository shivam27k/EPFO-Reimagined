import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Codex desktop browser reaches the local dev server through this LAN host.
  // Keep this narrowly scoped instead of allowing arbitrary development origins.
  allowedDevOrigins: ["192.168.31.158"],
};

export default nextConfig;
