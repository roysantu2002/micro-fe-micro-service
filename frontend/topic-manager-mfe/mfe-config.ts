export const MFE_CONFIG = {
  name: 'topicManager',
  exposes: {
    './App': './src/App',
    './TopicManager': './src/components/TopicManager',
  },
} as const;
