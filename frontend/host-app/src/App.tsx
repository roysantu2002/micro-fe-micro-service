import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { AuthGuard } from './auth/AuthGuard';

const TopicManagerRemote = lazy(() => import('topicManager/TopicManager'));
const ContentWriterRemote = lazy(() => import('contentWriter/ContentWriter'));

function LoadingFallback({ name }: { name: string }) {
  return (
    <div className="text-center py-12 text-gray-500">Loading {name}…</div>
  );
}

function NavBar() {
  const { instance, accounts } = useMsal();
  const user = accounts[0]?.name ?? accounts[0]?.username ?? 'User';

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
      <span className="font-bold text-gray-900">YT Content Planner</span>
      <Link to="/" className="text-gray-600 hover:text-blue-600 text-sm">Home</Link>
      <Link to="/topics" className="text-gray-600 hover:text-blue-600 text-sm">Topics</Link>
      <span className="ml-auto text-sm text-gray-500">{user}</span>
      <button
        onClick={() => instance.logoutRedirect()}
        className="text-sm text-gray-500 hover:text-red-600"
      >
        Sign out
      </button>
    </nav>
  );
}

function TopicsPage() {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<LoadingFallback name="Topic Manager" />}>
      <TopicManagerRemote onViewContent={(id) => navigate(`/content/${id}`)} />
    </Suspense>
  );
}

function ContentPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  if (!topicId) return null;
  return (
    <div>
      <button
        onClick={() => navigate('/topics')}
        className="mb-4 text-blue-600 hover:text-blue-800 text-sm"
      >
        ← Back to Topics
      </button>
      <Suspense fallback={<LoadingFallback name="Content Writer" />}>
        <ContentWriterRemote topicId={topicId} />
      </Suspense>
    </div>
  );
}

function HomePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <Link
          to="/topics"
          className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Topic Manager</h2>
          <p className="text-gray-600">
            Create and manage your YouTube video topics. Add tags and trigger AI content generation.
          </p>
        </Link>
        <Link
          to="/topics"
          className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Content Writer</h2>
          <p className="text-gray-600">
            View and edit AI-generated content for your topics. Select a topic to get started.
          </p>
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthGuard>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <NavBar />
          <main className="max-w-7xl mx-auto px-6 py-8">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/topics" element={<TopicsPage />} />
              <Route path="/content/:topicId" element={<ContentPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthGuard>
  );
}
