import { type ReactNode } from 'react';
import { MsalProvider, useMsal, MsalAuthenticationTemplate } from '@azure/msal-react';
import { InteractionType, type AccountInfo } from '@azure/msal-browser';
import { PublicClientApplication } from '@azure/msal-browser';
import { AuthContext, type AppRole } from './AuthContext';
import { msalConfig, loginRequest, apiRequest } from './msalConfig';

const msalInstance = new PublicClientApplication(msalConfig);

function MsalAuthBridge({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const account: AccountInfo | null = accounts[0] ?? null;

  // roles claim is injected by Entra ID when the user has been assigned an App Role
  const rawRoles = (account?.idTokenClaims as Record<string, unknown> | undefined)?.roles;
  const roles: AppRole[] = Array.isArray(rawRoles)
    ? rawRoles.filter((r): r is AppRole => r === 'Admin' || r === 'User')
    : [];

  console.log('%c[HOST] Signed-in user roles from token:', 'color: #2563eb; font-weight: bold', roles);

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
      <AuthContext.Provider value={{ user, roles, getToken, logout: () => instance.logoutRedirect() }}>
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
