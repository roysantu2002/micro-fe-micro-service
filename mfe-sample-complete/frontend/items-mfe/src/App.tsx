import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import ItemList from './components/ItemList';
import './styles/global.css';

// Standalone dev mode — uses a mock token so you can run the MFE alone
const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <StrictMode>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <ItemList getToken={async () => 'mock-token-local-dev'} />
      </div>
    </StrictMode>
  );
}
