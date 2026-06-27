import TopicManager from "../components/TopicManager";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Topic Manager (Standalone)
        </h1>
      </header>
      <main className="p-6">
        <TopicManager
          onViewContent={(topicId) => {
            alert(`View content for topic ${topicId} (standalone mode)`);
          }}
        />
      </main>
    </div>
  );
}
