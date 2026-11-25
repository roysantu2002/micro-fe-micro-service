import { useState, useEffect, useCallback, useRef } from 'react';
import TopicList from './TopicList';
import TopicForm from './TopicForm';
import { fetchTopics, createTopic, updateTopic, deleteTopic, generateContent, type Topic } from '../lib/api';

interface Props {
  onViewContent?: (id: number) => void;
}

export default function TopicManager({ onViewContent }: Props) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [showForm, setShowForm] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTopics = useCallback(async () => {
    try {
      const data = await fetchTopics();
      setTopics(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  useEffect(() => {
    const hasGenerating = topics.some((t) => t.status === 'generating');
    if (hasGenerating) {
      pollingRef.current = setInterval(loadTopics, 3000);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [topics, loadTopics]);

  const handleCreate = async (data: Omit<Topic, 'id'>) => {
    await createTopic(data);
    setShowForm(false);
    await loadTopics();
  };

  const handleUpdate = async (data: Omit<Topic, 'id'>) => {
    if (!editingTopic) return;
    await updateTopic(editingTopic.id, data);
    setEditingTopic(null);
    await loadTopics();
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this topic?')) return;
    await deleteTopic(id);
    await loadTopics();
  };

  const handleGenerate = async (topicId: number) => {
    try {
      await generateContent(topicId);
      await loadTopics();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Topics</h2>
        <button
          onClick={() => { setEditingTopic(null); setShowForm(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + New Topic
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">×</button>
        </div>
      )}

      {(showForm || editingTopic) && (
        <TopicForm
          topic={editingTopic}
          onSubmit={editingTopic ? handleUpdate : handleCreate}
          onCancel={() => { setShowForm(false); setEditingTopic(null); }}
        />
      )}

      <TopicList
        topics={topics}
        loading={loading}
        onEdit={(topic) => { setEditingTopic(topic); setShowForm(false); }}
        onDelete={handleDelete}
        onGenerate={handleGenerate}
        onViewContent={onViewContent}
      />
    </div>
  );
}
