import TopicCard from "./TopicCard";

export default function TopicList({
  topics,
  onEdit,
  onDelete,
  onGenerate,
  onViewContent,
  loading,
}) {
  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading topics...</div>
    );
  }

  if (!topics || topics.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No topics yet</p>
        <p className="text-gray-400 text-sm mt-1">
          Create your first topic to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {topics.map((topic) => (
        <TopicCard
          key={topic.id}
          topic={topic}
          onEdit={onEdit}
          onDelete={onDelete}
          onGenerate={onGenerate}
          onViewContent={onViewContent}
        />
      ))}
    </div>
  );
}
