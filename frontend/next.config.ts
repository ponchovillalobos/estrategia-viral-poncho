import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // EMPAQUE (Tauri): "standalone" genera .next/standalone/server.js — un server
  // autocontenido (con sus node_modules mínimos) que el launcher de escritorio
  // arranca como sidecar. Sin esto, distribuir la app exigiría node_modules
  // completo (~700 MB).
  output: "standalone",
};

export default nextConfig;
