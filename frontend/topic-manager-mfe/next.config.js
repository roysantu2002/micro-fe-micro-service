const NextFederationPlugin = require("@module-federation/nextjs-mf");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config, options) {
    const { isServer } = options;

    config.plugins.push(
      new NextFederationPlugin({
        name: "topicManager",
        filename: "static/chunks/remoteEntry.js",
        exposes: {
          "./TopicManager": "./components/TopicManager",
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
