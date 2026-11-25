import type { Topic } from '../lib/api';
import TopicCard from './TopicCard';

interface Props {
  topics: Topic[];
  loading: boolean;
  onEdit: (topic: Topic) => void;
  onDelete: (id: number) => void;
  onGenerate: (id: number) => void;
  onViewContent?: (id: number) => void;
}

export default function TopicList({ topics, loading, onEdit, onDelete, onGenerate, onViewContent }: Props) {
  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading topics…</div>;
  }

  if (topics.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No topics yet</p>
        <p className="text-gray-400 text-sm mt-1">Create your first topic to get started</p>
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
