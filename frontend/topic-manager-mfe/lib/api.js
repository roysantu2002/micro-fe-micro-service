const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function fetchTopics() {
  const res = await fetch(`${API_BASE}/api/topics`);
  if (!res.ok) throw new Error("Failed to fetch topics");
  return res.json();
}

export async function fetchTopic(id) {
  const res = await fetch(`${API_BASE}/api/topics/${id}`);
  if (!res.ok) throw new Error("Failed to fetch topic");
  return res.json();
}

export async function createTopic(data) {
  const res = await fetch(`${API_BASE}/api/topics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create topic");
  return res.json();
}

export async function updateTopic(id, data) {
  const res = await fetch(`${API_BASE}/api/topics/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update topic");
  return res.json();
}

export async function deleteTopic(id) {
  const res = await fetch(`${API_BASE}/api/topics/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete topic");
}

export async function generateContent(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/generate`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to trigger content generation");
  return res.json();
}
