import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

const skipAuth = process.env.PUBLIC_DEV_SKIP_AUTH === 'true';
const isMock  = process.env.PUBLIC_MOCK_AUTH === 'true';

if (skipAuth || isMock) {
  // No MSAL provider needed — AuthGuard handles these modes internally
  ReactDOM.createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} else {
  // Real Azure AD — initialise MSAL and wrap the tree
  Promise.all([
    import('@azure/msal-browser'),
    import('@azure/msal-react'),
    import('./auth/msalConfig'),
  ]).then(([{ PublicClientApplication }, { MsalProvider }, { msalConfig }]) => {
    const msalInstance = new PublicClientApplication(msalConfig);
    ReactDOM.createRoot(rootEl).render(
      <StrictMode>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </StrictMode>
    );
  });
}
