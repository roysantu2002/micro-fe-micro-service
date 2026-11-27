import { type ReactNode, useEffect } from 'react';
import { MsalProvider, useMsal, useIsAuthenticated, MsalAuthenticationTemplate } from '@azure/msal-react';
import { InteractionType, type AccountInfo } from '@azure/msal-browser';
import { PublicClientApplication } from '@azure/msal-browser';
import { AuthContext } from './AuthContext';
import { msalConfig, loginRequest, apiRequest } from './msalConfig';

const msalInstance = new PublicClientApplication(msalConfig);

function MsalAuthBridge({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const account: AccountInfo | null = accounts[0] ?? null;

  const getToken = async () => {
    if (!account) throw new Error('No account');
    const result = await instance.acquireTokenSilent({ ...apiRequest, account });
    return result.accessToken;
  };

  const user = account
    ? { name: account.name ?? account.username, email: account.username }
    : null;

  return (
    <MsalAuthenticationTemplate
      interactionType={InteractionType.Redirect}
      authenticationRequest={loginRequest}
    >
      <AuthContext.Provider
        value={{
          user,
          getToken,
          logout: () => instance.logoutRedirect(),
        }}
      >
        {children}
      </AuthContext.Provider>
    </MsalAuthenticationTemplate>
  );
}

export function MsalAuthProvider({ children }: { children: ReactNode }) {
  return (
    <MsalProvider instance={msalInstance}>
      <MsalAuthBridge>{children}</MsalAuthBridge>
    </MsalProvider>
  );
}
