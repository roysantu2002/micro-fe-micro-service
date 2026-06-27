import { useState } from "react";
import ContentWriter from "../components/ContentWriter";

export default function Home() {
  const [topicId, setTopicId] = useState("");
  const [activeTopicId, setActiveTopicId] = useState(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Content Writer (Standalone)
        </h1>
      </header>
      <main className="p-6">
        <div className="mb-6 flex gap-3">
          <input
            type="text"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            placeholder="Enter Topic ID"
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setActiveTopicId(topicId)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Load Content
          </button>
        </div>
        {activeTopicId && <ContentWriter topicId={activeTopicId} />}
      </main>
    </div>
  );
}
