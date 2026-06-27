import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import Link from "next/link";

const ContentWriter = dynamic(() => import("contentWriter/ContentWriter"), {
  ssr: false,
  loading: () => (
    <div className="text-center py-12 text-gray-500">
      Loading Content Writer...
    </div>
  ),
});

export default function ContentPage() {
  const router = useRouter();
  const { topicId } = router.query;

  if (!topicId) {
    return (
      <div className="text-center py-12 text-gray-500">Loading...</div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/topics"
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          &larr; Back to Topics
        </Link>
      </div>
      <ContentWriter topicId={topicId} />
    </div>
  );
}
