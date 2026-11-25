import { Configuration, LogLevel, ProtocolMode } from '@azure/msal-browser';

const isMock = process.env.PUBLIC_MOCK_AUTH === 'true';

// Mock mode: points to local mock-oauth2-server container (no Azure AD needed)
// Real mode: points to Azure Entra ID
const authority = isMock
  ? 'http://localhost:8787/default'
  : `https://login.microsoftonline.com/${process.env.PUBLIC_ENTRA_TENANT_ID ?? 'common'}`;

const clientId = isMock
  ? 'local-dev-client'
  : (process.env.PUBLIC_ENTRA_CLIENT_ID ?? '');

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority,
    knownAuthorities: isMock ? ['localhost:8787'] : [],
    protocolMode: isMock ? ProtocolMode.OIDC : ProtocolMode.AAD,
    allowHttp: isMock,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (_level, message, containsPii) => {
        if (!containsPii && _level === LogLevel.Error) console.error('[MSAL]', message);
      },
    },
  },
};

export const loginRequest = {
  scopes: ['openid', 'profile', 'User.Read'],
};
