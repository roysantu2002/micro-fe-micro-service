import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { MFE_CONFIG } from './mfe-config';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: MFE_CONFIG.name,
      exposes: MFE_CONFIG.exposes,
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
      },
    }),
  ],
  source: {
    entry: { index: './src/index.tsx' },
  },
  html: {
    title: 'Content Writer',
  },
  server: {
    port: 3002,
  },
  output: {
    assetPrefix: '/mfe/content-writer/',
    distPath: { root: 'dist' },
  },
});
