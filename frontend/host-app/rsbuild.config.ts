import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

const topicManagerEntry = process.env.PUBLIC_TOPIC_MANAGER_REMOTE || 'http://localhost:3001/mf-manifest.json';
const contentWriterEntry = process.env.PUBLIC_CONTENT_WRITER_REMOTE || 'http://localhost:3002/mf-manifest.json';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'hostApp',
      remotes: {
        topicManager: `topicManager@${topicManagerEntry}`,
        contentWriter: `contentWriter@${contentWriterEntry}`,
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
    title: 'YouTube Content Planner',
  },
  server: {
    port: 3000,
    proxy: {
      '/mfe/topic-manager': {
        target: 'http://localhost:3001',
        pathRewrite: { '^/mfe/topic-manager': '' },
        changeOrigin: true,
      },
      '/mfe/content-writer': {
        target: 'http://localhost:3002',
        pathRewrite: { '^/mfe/content-writer': '' },
        changeOrigin: true,
      },
    },
  },
  output: {
    distPath: { root: 'dist' },
  },
});
