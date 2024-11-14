import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  eslint: {
    dirs: ["app"],
  },
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.node$/,
      loader: "node-loader",
    })

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        "detect-libc": false,
        sharp: false,
        canvas: false,
      }
    }

    config.externals = [
      ...(config.externals || []),
      {
        sharp: "commonjs sharp",
        canvas: "commonjs canvas",
        "@mapbox/node-pre-gyp": "commonjs @mapbox/node-pre-gyp",
        "@tensorflow/tfjs-node": "commonjs @tensorflow/tfjs-node",
      },
    ]

    return config
  },
}

export default nextConfig
