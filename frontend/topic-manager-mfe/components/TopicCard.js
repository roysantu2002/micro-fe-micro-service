const STATUS_STYLES = {
  draft: "bg-gray-100 text-gray-700",
  generating: "bg-yellow-100 text-yellow-800 animate-pulse",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function TopicCard({
  topic,
  onEdit,
  onDelete,
  onGenerate,
  onViewContent,
}) {
  const statusStyle = STATUS_STYLES[topic.status] || STATUS_STYLES.draft;

  return (
    <div className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-900">{topic.title}</h3>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyle}`}
        >
          {topic.status || "draft"}
        </span>
      </div>

      {topic.description && (
        <p className="text-gray-600 text-sm mb-3">{topic.description}</p>
      )}

      {topic.tags && topic.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {topic.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-3 border-t border-gray-100">
        <button
          onClick={() => onEdit(topic)}
          className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(topic.id)}
          className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
        >
          Delete
        </button>
        {topic.status !== "generating" && (
          <button
            onClick={() => onGenerate(topic.id)}
            className="px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded"
          >
            Generate Content
          </button>
        )}
        {topic.status === "completed" && onViewContent && (
          <button
            onClick={() => onViewContent(topic.id)}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            View Content
          </button>
        )}
      </div>
    </div>
  );
}
