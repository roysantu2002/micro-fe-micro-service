const API_BASE = process.env.PUBLIC_API_URL ?? 'http://localhost:8080';

export interface Content {
  topicId: number | string;
  hook?: string;
  scriptOutline?: string;
  keyPoints?: string;
  callToAction?: string;
  [key: string]: unknown;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const fetchContent = (topicId: number | string) =>
  request<Content>(`/api/topics/${topicId}/content`);

export const updateContent = (topicId: number | string, data: Content) =>
  request<Content>(`/api/topics/${topicId}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const regenerateContent = (topicId: number | string) =>
  request<{ message: string }>(`/api/topics/${topicId}/generate`, { method: 'POST' });
