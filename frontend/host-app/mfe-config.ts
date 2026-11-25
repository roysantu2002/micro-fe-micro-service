export const MFE_CONFIG = {
  name: 'hostApp',
  remotes: {
    topicManager: {
      name: 'topicManager',
      entry: process.env.PUBLIC_TOPIC_MANAGER_REMOTE
        ?? 'http://localhost:3001/mf-manifest.json',
    },
    contentWriter: {
      name: 'contentWriter',
      entry: process.env.PUBLIC_CONTENT_WRITER_REMOTE
        ?? 'http://localhost:3002/mf-manifest.json',
    },
  },
} as const;
