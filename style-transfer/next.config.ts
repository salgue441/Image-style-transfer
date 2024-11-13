import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  eslint: {
    dirs: ["app"],
  },
  webpack: (config, { isServer }) => {
    // Add node-loader
    config.module.rules.push({
      test: /\.node$/,
      loader: "node-loader",
    })

    // Exclude problematic packages from webpack
    config.externals = [
      ...(config.externals || []),
      {
        "@mapbox/node-pre-gyp": "commonjs @mapbox/node-pre-gyp",
        canvas: "commonjs canvas",
        "@tensorflow/tfjs-node": "commonjs @tensorflow/tfjs-node",
      },
    ]

    if (!isServer) {
      // Don't bundle these packages on the client side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
    }

    return config
  },
}

export default nextConfig
