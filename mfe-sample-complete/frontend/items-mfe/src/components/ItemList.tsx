import { useState, useEffect } from 'react';
import { getItems, createItem, setTokenProvider, type Item } from '../lib/api';
import '../styles/global.css';

interface Props {
  getToken: () => Promise<string>;
}

export default function ItemList({ getToken }: Props) {
  // Register the token provider once — all API calls in api.ts will use it
  useEffect(() => {
    setTokenProvider(getToken);
  }, [getToken]);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await getItems();
      setItems(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const item = await createItem(newName.trim());
      setItems((prev) => [item, ...prev]);
      setNewName('');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Items</h2>

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
          placeholder="New item name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={creating}
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold">×</button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-gray-400 text-sm">No items yet — add one above.</p>
      ) : (
        <ul className="divide-y divide-gray-100 bg-white rounded-lg shadow">
          {items.map((item) => (
            <li key={item.id} className="px-4 py-3 flex justify-between items-center">
              <span className="font-medium text-gray-900 text-sm">{item.name}</span>
              <span className="text-xs text-gray-400">
                by {item.createdBy} · {new Date(item.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
