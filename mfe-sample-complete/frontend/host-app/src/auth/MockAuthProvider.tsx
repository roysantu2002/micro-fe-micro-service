import { useState, type ReactNode } from 'react';
import { AuthContext, type AuthUser } from './AuthContext';

// Fake JWT-shaped token the backend accepts when MOCK_AUTH=true
const MOCK_TOKEN = 'mock-token-local-dev';

export function MockAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow p-8 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-gray-900">Mock Sign In</h1>
          <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
            Local dev mode — no real Azure login required
          </p>
          <input
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
            disabled={!name || !email}
            onClick={() => setUser({ name, email })}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        getToken: async () => MOCK_TOKEN,
        logout: () => setUser(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
