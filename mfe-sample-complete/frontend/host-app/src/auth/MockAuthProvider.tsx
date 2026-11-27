import { useState, type ReactNode } from 'react';
import { AuthContext, type AuthUser, type AppRole } from './AuthContext';

const MOCK_TOKEN = 'mock-token-local-dev';

interface SignedInState { user: AuthUser; roles: AppRole[] }

export function MockAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SignedInState | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('Admin');

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow p-8 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-gray-900">Mock Sign In</h1>
          <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
            Local dev mode — pick a role to test access control
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
          <div className="flex gap-2">
            {(['Admin', 'User'] as AppRole[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex-1 py-2 rounded text-sm border transition-colors ${
                  role === r
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
            disabled={!name || !email}
            onClick={() => setState({ user: { name, email }, roles: [role] })}
          >
            Sign in as {role}
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        roles: state.roles,
        getToken: async () => MOCK_TOKEN,
        logout: () => setState(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
