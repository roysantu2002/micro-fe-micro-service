const NextFederationPlugin = require("@module-federation/nextjs-mf");

const TOPIC_MANAGER_URL =
  process.env.NEXT_PUBLIC_TOPIC_MANAGER_URL || "http://localhost:3001";
const CONTENT_WRITER_URL =
  process.env.NEXT_PUBLIC_CONTENT_WRITER_URL || "http://localhost:3002";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config, options) {
    const { isServer } = options;

    config.plugins.push(
      new NextFederationPlugin({
        name: "shellApp",
        filename: "static/chunks/remoteEntry.js",
        remotes: {
          topicManager: `topicManager@${TOPIC_MANAGER_URL}/_next/static/${
            isServer ? "ssr" : "chunks"
          }/remoteEntry.js`,
          contentWriter: `contentWriter@${CONTENT_WRITER_URL}/_next/static/${
            isServer ? "ssr" : "chunks"
          }/remoteEntry.js`,
        },
        shared: {},
        extraOptions: {
          exposePages: false,
        },
      })
    );

    return config;
  },
};

module.exports = nextConfig;
