import type { ReactNode } from 'react';
import { MsalAuthenticationTemplate, useMsal } from '@azure/msal-react';
import { InteractionType } from '@azure/msal-browser';
import { loginRequest } from './msalConfig';

function SigningIn() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-500">Signing in…</p>
    </div>
  );
}

function AuthError({ error }: { error: Error | null }) {
  const { instance } = useMsal();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-red-600">Authentication error: {error?.message}</p>
      <button
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        onClick={() => instance.loginRedirect(loginRequest)}
      >
        Retry sign-in
      </button>
    </div>
  );
}

export function AuthGuard({ children }: { children: ReactNode }) {
  return (
    <MsalAuthenticationTemplate
      interactionType={InteractionType.Redirect}
      authenticationRequest={loginRequest}
      errorComponent={AuthError}
      loadingComponent={SigningIn}
    >
      {children}
    </MsalAuthenticationTemplate>
  );
}
