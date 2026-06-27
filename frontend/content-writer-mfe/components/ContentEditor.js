import { useState } from "react";

const SECTION_LABELS = {
  hook: "Hook",
  scriptOutline: "Script Outline",
  keyPoints: "Key Points",
  callToAction: "Call to Action",
};

export default function ContentEditor({ sectionKey, value, onSave, onCancel }) {
  const [text, setText] = useState(value || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(sectionKey, text);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Edit: {SECTION_LABELS[sectionKey] || sectionKey}
      </h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
      />
      <div className="flex gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
