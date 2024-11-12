import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  eslint: {
    dirs: ["app"],
  },
  webpack: (config) => {
    config.externals = [
      ...(config.externals || []),
      {
        "@tensorflow/tfjs-node": "commonjs @tensorflow/tfjs-node",
        sharp: "commonjs sharp",
      },
    ]
    return config
  },
}

export default nextConfig
