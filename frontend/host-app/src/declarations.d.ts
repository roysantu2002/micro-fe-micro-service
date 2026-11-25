declare module 'topicManager/App' {
  const App: React.ComponentType;
  export default App;
}

declare module 'topicManager/TopicManager' {
  const TopicManager: React.ComponentType<{ onViewContent?: (id: number) => void }>;
  export default TopicManager;
}

declare module 'contentWriter/App' {
  const App: React.ComponentType;
  export default App;
}

declare module 'contentWriter/ContentWriter' {
  const ContentWriter: React.ComponentType<{ topicId: number | string }>;
  export default ContentWriter;
}
