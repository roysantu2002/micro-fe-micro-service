import ContentWriter from './components/ContentWriter';
import './styles/global.css';

export default function App() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <ContentWriter topicId={0} />
    </div>
  );
}
