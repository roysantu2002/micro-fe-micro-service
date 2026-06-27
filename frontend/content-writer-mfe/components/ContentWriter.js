import { useState, useEffect, useCallback } from "react";
import ContentViewer from "./ContentViewer";
import ContentEditor from "./ContentEditor";
import { fetchContent, updateContent, regenerateContent } from "../lib/api";

export default function ContentWriter({ topicId }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingSection, setEditingSection] = useState(null);
  const [regenerating, setRegenerating] = useState(false);

  const loadContent = useCallback(async () => {
    if (!topicId) return;
    setLoading(true);
    try {
      const data = await fetchContent(topicId);
      setContent(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      setContent(null);
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const handleSave = async (sectionKey, value) => {
    const updated = { ...content, [sectionKey]: value };
    await updateContent(topicId, updated);
    setContent(updated);
    setEditingSection(null);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerateContent(topicId);
      // Poll until content is ready
      const poll = setInterval(async () => {
        try {
          const data = await fetchContent(topicId);
          if (data && data.hook) {
            setContent(data);
            setRegenerating(false);
            clearInterval(poll);
          }
        } catch {
          // Keep polling
        }
      }, 3000);
      // Stop polling after 60 seconds
      setTimeout(() => {
        clearInterval(poll);
        setRegenerating(false);
      }, 60000);
    } catch (err) {
      setError(err.message);
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Loading content...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">
          Content for Topic #{topicId}
        </h2>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
        >
          {regenerating ? "Regenerating..." : "Regenerate Content"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {editingSection && content ? (
        <ContentEditor
          sectionKey={editingSection}
          value={content[editingSection]}
          onSave={handleSave}
          onCancel={() => setEditingSection(null)}
        />
      ) : content ? (
        <ContentViewer
          content={content}
          onEdit={(key) => setEditingSection(key)}
        />
      ) : (
        !error && (
          <div className="text-center py-8 text-gray-500">
            No content available. Click &quot;Regenerate Content&quot; to
            generate.
          </div>
        )
      )}
    </div>
  );
}
