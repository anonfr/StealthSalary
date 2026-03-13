import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    if (isServer) {
      config.externals = [...(config.externals ?? []), "pino-pretty", "lokijs", "encoding"];
    }
    return config;
  },
};

export default nextConfig;
