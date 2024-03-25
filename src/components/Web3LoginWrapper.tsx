import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, PropsWithChildren } from 'react';

import { useWeb3AuthToken } from '../hooks/useWeb3AuthToken';

type Web3LogiPageProps = {
  defaultTargetRoute?: string;
  token: Parameters<typeof useWeb3AuthToken>[0];
};

export const Web3LoginWrapper = ({
  defaultTargetRoute = '/',
  token: tokenOptions,
  children,
}: PropsWithChildren<Web3LogiPageProps>) => {
  const { isAuthenticated } = useWeb3AuthToken(tokenOptions);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const returnUrl = searchParams.get('returnUrl') || defaultTargetRoute;

    router.push(returnUrl);
  }, [isAuthenticated]);

  return children;
};
