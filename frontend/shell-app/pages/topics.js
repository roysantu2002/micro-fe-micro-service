import dynamic from "next/dynamic";
import { useRouter } from "next/router";

const TopicManager = dynamic(() => import("topicManager/TopicManager"), {
  ssr: false,
  loading: () => (
    <div className="text-center py-12 text-gray-500">
      Loading Topic Manager...
    </div>
  ),
});

export default function TopicsPage() {
  const router = useRouter();

  const handleViewContent = (topicId) => {
    router.push(`/content/${topicId}`);
  };

  return (
    <div>
      <TopicManager onViewContent={handleViewContent} />
    </div>
  );
}
