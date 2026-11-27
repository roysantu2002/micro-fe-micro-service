import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

const itemsMfeEntry = process.env.PUBLIC_ITEMS_MFE_REMOTE || 'http://localhost:3001/mf-manifest.json';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'hostApp',
      remotes: {
        itemsMfe: `itemsMfe@${itemsMfeEntry}`,
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        'react-router-dom': { singleton: true, requiredVersion: '^6.0.0' },
      },
    }),
  ],
  source: {
    entry: { index: './src/index.tsx' },
  },
  html: {
    title: 'MFE Sample — Host',
    tags: [
      {
        tag: 'script',
        children: 'window.process=window.process||{env:{NODE_ENV:"production"},browser:true,version:""};',
        head: true,
        prepend: true,
      },
    ],
  },
  server: {
    port: 3000,
    proxy: {
      '/mfe/items': {
        target: 'http://localhost:3002',
        pathRewrite: { '^/mfe/items': '' },
        changeOrigin: true,
      },
    },
  },
  output: {
    distPath: { root: 'dist' },
  },
});
