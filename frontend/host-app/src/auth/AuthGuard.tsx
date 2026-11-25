import { type ReactNode, useState } from 'react';

const MOCK_USER_KEY = 'mock_auth_user';

function MockLoginPage({ onLogin }: { onLogin: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white rounded-xl shadow-md p-10 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl">🧪</span>
          <span className="font-semibold text-gray-700">Mock Sign-in</span>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Local dev mode — enter any name to sign in.
        </p>
        <input
          type="text"
          placeholder="Your name (e.g. testuser)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onLogin(name.trim())}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        <button
          disabled={!name.trim()}
          onClick={() => onLogin(name.trim())}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}

function MockAuthGuard({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(
    () => sessionStorage.getItem(MOCK_USER_KEY)
  );
  if (!user) {
    return <MockLoginPage onLogin={name => {
      sessionStorage.setItem(MOCK_USER_KEY, name);
      setUser(name);
    }} />;
  }
  return <>{children}</>;
}

export function AuthGuard({ children }: { children: ReactNode }) {
  if (process.env.PUBLIC_DEV_SKIP_AUTH === 'true') {
    return <>{children}</>;
  }
  if (process.env.PUBLIC_MOCK_AUTH === 'true') {
    return <MockAuthGuard>{children}</MockAuthGuard>;
  }
  // Real MSAL — MsalAuthenticationTemplate is available because bootstrap.tsx
  // wraps the tree in MsalProvider only when this branch is active.
  const { MsalAuthenticationTemplate } = require('@azure/msal-react');
  const { InteractionType } = require('@azure/msal-browser');
  const { loginRequest } = require('./msalConfig');
  return (
    <MsalAuthenticationTemplate
      interactionType={InteractionType.Redirect}
      authenticationRequest={loginRequest}
    >
      {children}
    </MsalAuthenticationTemplate>
  );
}

// Exported so NavBar can display the mock username
export function getMockUser(): string | null {
  return sessionStorage.getItem(MOCK_USER_KEY);
}

export function clearMockUser(): void {
  sessionStorage.removeItem(MOCK_USER_KEY);
  window.location.href = '/';
}
