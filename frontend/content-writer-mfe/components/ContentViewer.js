const SECTION_LABELS = {
  hook: "Hook",
  scriptOutline: "Script Outline",
  keyPoints: "Key Points",
  callToAction: "Call to Action",
};

export default function ContentViewer({ content, onEdit }) {
  const sections = [
    { key: "hook", value: content.hook },
    { key: "scriptOutline", value: content.scriptOutline },
    { key: "keyPoints", value: content.keyPoints },
    { key: "callToAction", value: content.callToAction },
  ].filter((s) => s.value);

  if (sections.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No content generated yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map(({ key, value }) => (
        <div key={key} className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              {SECTION_LABELS[key] || key}
            </h3>
            {onEdit && (
              <button
                onClick={() => onEdit(key)}
                className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
              >
                Edit
              </button>
            )}
          </div>
          <div className="text-gray-700 whitespace-pre-wrap">{value}</div>
        </div>
      ))}
    </div>
  );
}
