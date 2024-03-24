import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Address, Hex, getAddress, isAddressEqual } from 'viem';
import { usePublicClient, useWalletClient } from 'wagmi';

import { createJwtToken, verifyJwtToken } from '../lib/jwt';
import { Web3AuthError } from '../lib/errors/Web3AuthError';
import { W3A_ERROR_JWT_DECODING } from '../lib/errors/JwtDecodingError';

const LOCAL_STORAGE_AUTHORIZED_ADDRESS_KEY = '_web3_auth_authorized_address';
const LOCAL_STORAGE_JWT_TOKENS_KEY_PREFIX = '_web3_auth_jwt_token';

const buildJwtLocalStorageKey = (chainId: number, keySuffix?: string) =>
  `${LOCAL_STORAGE_JWT_TOKENS_KEY_PREFIX}_${chainId}${
    keySuffix === undefined || keySuffix.length === 0 ? '' : `_${keySuffix}`
  }`;

interface Props {
  signatureMessage: string;
  delegateXyzRights?: Hex;
  jwtTokenMaxValidity?: number; // ms
  jwtTokenStorageKeySuffix?: string;
  children: ReactNode;
}

const readAuthorizedAddress = () => {
  try {
    return getAddress(localStorage.getItem(LOCAL_STORAGE_AUTHORIZED_ADDRESS_KEY) ?? '');
  } catch (e) {
    // Invalid address...
    return undefined;
  }
};

const storeAuthorizedAddress = (address: Address) => {
  if (address === undefined) {
    localStorage.removeItem(LOCAL_STORAGE_AUTHORIZED_ADDRESS_KEY);

    return;
  }

  localStorage.setItem(LOCAL_STORAGE_AUTHORIZED_ADDRESS_KEY, address);
};

interface Web3AuthContext {
  signJwtToken: (expiration: number, scopes: [string, ...string[]]) => Promise<void>;
  clearJwtToken: () => void;
  activeJwtToken: string | null;
  authorizedAddress?: Address;
  signatureMessage: string;
  delegateXyzRights?: Hex;
  setAuthorizedAddress: (address: Address) => void;
}

// Contexts can only be created on the client...
const Web3AuthContext = createContext({} as Web3AuthContext);

export function useWeb3Auth() {
  return useContext(Web3AuthContext);
}

export function Web3AuthProvider({
  signatureMessage,
  delegateXyzRights,
  jwtTokenMaxValidity,
  jwtTokenStorageKeySuffix,
  children,
}: Props) {
  const [authorizedAddress, setAuthorizedAddress] = useState<Address>();
  const [activeJwtToken, setActiveJwtToken] = useState<string | null>(null);
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const localStorageKey = useMemo(() => {
    if (walletClient === undefined) {
      return null;
    }

    return buildJwtLocalStorageKey(walletClient.chain.id, jwtTokenStorageKeySuffix);
  }, [jwtTokenStorageKeySuffix, walletClient]);

  const signJwtToken = useCallback(
    async (expiration: number, scopes: [string, ...string[]]) => {
      if (localStorageKey === null || walletClient === undefined) {
        throw new Web3AuthError('Failed creating authentication token. Wallet not ready yet!');
      }

      const token = await createJwtToken({
        message: signatureMessage,
        address: authorizedAddress ?? walletClient.account.address,
        signer: walletClient,
        scopes,
        expiration,
      });

      localStorage.setItem(localStorageKey, token);
      setActiveJwtToken(token);
    },
    [authorizedAddress, signatureMessage, localStorageKey, walletClient],
  );

  const clearJwtToken = useCallback(() => {
    if (localStorageKey === null) {
      throw new Web3AuthError('Failed creating authentication token. Wallet not ready yet!');
    }

    localStorage.removeItem(localStorageKey);
    setActiveJwtToken(null);
  }, [localStorageKey]);

  useEffect(() => {
    if (authorizedAddress === undefined || activeJwtToken === null || publicClient === undefined) {
      return;
    }

    (async () => {
      let verificationResult = null;

      try {
        verificationResult = await verifyJwtToken({
          message: signatureMessage,
          token: activeJwtToken,
          web3Client: publicClient,
          delegateXyzRights,
          maxAllowedExpiration: jwtTokenMaxValidity === undefined ? undefined : Date.now() + jwtTokenMaxValidity,
        });
      } catch (e: any) {
        if (e.codes?.includes(W3A_ERROR_JWT_DECODING) !== true) {
          throw e;
        }
      }

      if (verificationResult === null || !isAddressEqual(verificationResult.walletAddress, authorizedAddress)) {
        clearJwtToken();

        return;
      }
    })();
  }, [authorizedAddress, activeJwtToken, publicClient]);

  useEffect(() => {
    if (localStorageKey === null) {
      return;
    }

    setActiveJwtToken(localStorage.getItem(localStorageKey));
  }, [localStorageKey]);

  useEffect(() => {
    setAuthorizedAddress(readAuthorizedAddress() ?? walletClient?.account.address);
  }, [walletClient?.account.address]);

  const value: Web3AuthContext = {
    ...{
      signJwtToken,
      clearJwtToken,
      activeJwtToken,
      authorizedAddress,
      signatureMessage,
      delegateXyzRights,
      setAuthorizedAddress: (address: Address) => {
        storeAuthorizedAddress(address);
        setAuthorizedAddress(address);
      },
    },
  };

  return <Web3AuthContext.Provider value={value}>{children}</Web3AuthContext.Provider>;
}
