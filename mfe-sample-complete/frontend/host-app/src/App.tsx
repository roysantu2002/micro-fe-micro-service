import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { useAuth, useHasRole } from './auth/AuthContext';

const ItemsMfeRemote = lazy(() => import('itemsMfe/ItemList'));

function NavBar() {
  const { user, roles, logout } = useAuth();
  const isAdmin = roles.includes('Admin');
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
      <span className="font-bold text-gray-900">MFE Sample</span>
      <Link to="/" className="text-sm text-gray-600 hover:text-blue-600">Home</Link>
      {isAdmin && (
        <Link to="/items" className="text-sm text-gray-600 hover:text-blue-600">Items</Link>
      )}
      <span className="ml-auto text-sm text-gray-500">{user?.name}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        isAdmin ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
      }`}>
        {roles[0] ?? 'No role'}
      </span>
      <button onClick={logout} className="text-sm text-gray-500 hover:text-red-600">
        Sign out
      </button>
    </nav>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-24 space-y-4">
      <div className="text-5xl">🚫</div>
      <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
      <p className="text-gray-500 text-sm text-center max-w-xs">
        You need the <span className="font-semibold text-blue-600">Admin</span> role
        to access the Items MFE. Contact your administrator to request access.
      </p>
    </div>
  );
}

function ItemsPage() {
  const { getToken } = useAuth();
  const isAdmin = useHasRole('Admin');

  if (!isAdmin) return <AccessDenied />;

  const getTokenWithLog = async () => {
    const token = await getToken();
    console.log('%c[HOST] Token acquired and passed to items-mfe', 'color: #2563eb; font-weight: bold');
    console.log('%c[HOST] Token value:', 'color: #2563eb', token);
    return token;
  };

  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-500">Loading Items MFE…</div>}>
      <ItemsMfeRemote getToken={getTokenWithLog} />
    </Suspense>
  );
}

function HomePage() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes('Admin');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}</h1>
      <p className="text-gray-600">
        Your role: <span className="font-semibold">{roles[0] ?? 'None assigned'}</span>
      </p>
      {isAdmin ? (
        <Link
          to="/items"
          className="inline-block bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700"
        >
          Go to Items →
        </Link>
      ) : (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-4 py-3">
          You have read-only access. Items MFE is disabled for your account.
        </p>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <main className="max-w-4xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/items" element={<ItemsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
