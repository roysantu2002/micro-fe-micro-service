const API_BASE = process.env.PUBLIC_API_URL ?? 'http://localhost:8080';

export interface Item {
  id: number;
  name: string;
  createdBy: string;
  createdAt: string;
}

// Registered once by ItemList on mount — all API functions use it automatically
let tokenProvider: (() => Promise<string>) | null = null;

export function setTokenProvider(fn: () => Promise<string>) {
  tokenProvider = fn;
  console.log('%c[ITEMS-MFE] Token provider registered from host', 'color: #16a34a; font-weight: bold');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (tokenProvider) {
    const token = await tokenProvider();
    console.log(`%c[ITEMS-MFE] Sending request to ${path}`, 'color: #16a34a; font-weight: bold');
    console.log('%c[ITEMS-MFE] Bearer token in Authorization header:', 'color: #16a34a', token);
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    console.warn('[ITEMS-MFE] No token provider — request sent without Authorization header');
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

export const getItems = () => request<Item[]>('/api/items');

export const createItem = (name: string) =>
  request<Item>('/api/items', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
