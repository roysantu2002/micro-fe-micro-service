import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';

const ItemsMfeRemote = lazy(() => import('itemsMfe/ItemList'));

function NavBar() {
  const { user, logout } = useAuth();
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
      <span className="font-bold text-gray-900">MFE Sample</span>
      <Link to="/" className="text-sm text-gray-600 hover:text-blue-600">Home</Link>
      <Link to="/items" className="text-sm text-gray-600 hover:text-blue-600">Items</Link>
      <span className="ml-auto text-sm text-gray-500">{user?.name}</span>
      <button
        onClick={logout}
        className="text-sm text-gray-500 hover:text-red-600"
      >
        Sign out
      </button>
    </nav>
  );
}

function ItemsPage() {
  const { getToken } = useAuth();

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
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}</h1>
      <p className="text-gray-600">
        This app demonstrates end-to-end token sharing from the host app through a micro-frontend
        to a Spring Boot backend.
      </p>
      <Link
        to="/items"
        className="inline-block bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700"
      >
        Go to Items →
      </Link>
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
