import { Configuration, LogLevel } from '@azure/msal-browser';

const clientId = process.env.PUBLIC_ENTRA_CLIENT_ID ?? '';
const tenantId = process.env.PUBLIC_ENTRA_TENANT_ID ?? 'common';

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
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
  scopes: [
    'openid',
    'profile',
    'User.Read',
    ...(clientId ? [`api://${clientId}/access_as_user`] : []),
  ],
};

export const apiRequest = {
  scopes: clientId ? [`api://${clientId}/access_as_user`] : [],
};
