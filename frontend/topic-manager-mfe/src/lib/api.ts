const API_BASE = process.env.PUBLIC_API_URL ?? 'http://localhost:8080';

export interface Topic {
  id: number;
  title: string;
  description?: string;
  tags?: string[];
  status?: 'draft' | 'generating' | 'completed' | 'failed';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const fetchTopics = () => request<Topic[]>('/api/topics');

export const fetchTopic = (id: number) => request<Topic>(`/api/topics/${id}`);

export const createTopic = (data: Omit<Topic, 'id'>) =>
  request<Topic>('/api/topics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const updateTopic = (id: number, data: Partial<Topic>) =>
  request<Topic>(`/api/topics/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const deleteTopic = (id: number) =>
  fetch(`${API_BASE}/api/topics/${id}`, { method: 'DELETE' }).then((r) => {
    if (!r.ok) throw new Error(`Failed to delete topic ${id}`);
  });

export const generateContent = (topicId: number) =>
  request<{ message: string }>(`/api/topics/${topicId}/generate`, { method: 'POST' });
