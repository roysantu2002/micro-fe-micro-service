export const MFE_CONFIG = {
  name: 'contentWriter',
  exposes: {
    './App': './src/App',
    './ContentWriter': './src/components/ContentWriter',
  },
} as const;
