import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <Link
          href="/topics"
          className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Topic Manager
          </h2>
          <p className="text-gray-600">
            Create and manage your YouTube video topics. Organize ideas, add
            tags, and trigger AI content generation.
          </p>
        </Link>
        <Link
          href="/topics"
          className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Content Writer
          </h2>
          <p className="text-gray-600">
            View and edit AI-generated content for your topics. Select a topic
            from the Topic Manager to get started.
          </p>
        </Link>
      </div>
    </div>
  );
}
