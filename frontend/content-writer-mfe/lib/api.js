const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function fetchContent(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/content`);
  if (!res.ok) throw new Error("Failed to fetch content");
  return res.json();
}

export async function updateContent(topicId, data) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update content");
  return res.json();
}

export async function regenerateContent(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/generate`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to regenerate content");
  return res.json();
}
