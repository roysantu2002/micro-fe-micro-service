import type { ReactNode } from 'react';
import { MockAuthProvider } from './MockAuthProvider';
import { MsalAuthProvider } from './MsalAuthProvider';

const isMock = process.env.PUBLIC_MOCK_AUTH === 'true';

export function AuthProvider({ children }: { children: ReactNode }) {
  return isMock
    ? <MockAuthProvider>{children}</MockAuthProvider>
    : <MsalAuthProvider>{children}</MsalAuthProvider>;
}
