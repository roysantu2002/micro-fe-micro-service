const NextFederationPlugin = require("@module-federation/nextjs-mf");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config, options) {
    const { isServer } = options;

    config.plugins.push(
      new NextFederationPlugin({
        name: "contentWriter",
        filename: "static/chunks/remoteEntry.js",
        exposes: {
          "./ContentWriter": "./components/ContentWriter",
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
