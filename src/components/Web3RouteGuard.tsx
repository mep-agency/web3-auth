import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, PropsWithChildren, ReactNode, useCallback } from 'react';
import { useAccountEffect } from 'wagmi';

import { useWeb3AuthToken } from '../hooks/useWeb3AuthToken';

type Web3RouteGuardProps = {
  loginRoute: string;
  loginSearchParams?: string[][];
  token: Parameters<typeof useWeb3AuthToken>[0];
  fallback?: ReactNode | undefined;
  logoutOnDisconnect?: boolean;
};

export const Web3RouteGuard = ({
  loginRoute,
  loginSearchParams = [],
  token: tokenOptions,
  fallback,
  logoutOnDisconnect = false,
  children,
}: PropsWithChildren<Web3RouteGuardProps>) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isVerifying, isAuthenticated, clear } = useWeb3AuthToken(tokenOptions);
  const currentUrl = `${pathname}?${searchParams}`;

  useAccountEffect({
    onDisconnect: useCallback(() => {
      if (!logoutOnDisconnect) {
        return;
      }

      clear();
    }, [logoutOnDisconnect, clear]),
  });

  useEffect(() => {
    if (isAuthenticated || isVerifying) {
      return;
    }

    loginSearchParams.push(['returnUrl', currentUrl]);
    const searchParams = new URLSearchParams(loginSearchParams).toString();

    // Redirect to the login page...
    router.push(`${loginRoute}?${searchParams}`);
  }, [isVerifying, isAuthenticated, currentUrl]);

  return isAuthenticated && children ? <>{children}</> : <>{fallback}</>;
};
