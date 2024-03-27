import { useCallback, useEffect, useState } from 'react';
import { Address, Hex, isAddressEqual } from 'viem';
import { usePublicClient, useWalletClient } from 'wagmi';
import { useLocalStorage, useSessionStorage } from '@uidotdev/usehooks';

import { JwtVerificationResult, createJwtToken, verifyJwtToken } from '../lib/jwt';
import { W3A_ERROR_JWT_DECODING } from '../lib/errors/JwtDecodingError';
import { Web3AuthError } from '../errors';

const ENCRYPTED_TOKEN_KEY_PREFIX = 'web3-auth.encrypted-token.';
const TOKEN_KEY_PREFIX = 'web3-auth.token.';
const TOKEN_DATA_KEY_PREFIX = 'web3-auth.token-data.';
const AUTHORIZED_ADDRESS_KEY_PREFIX = 'web3-auth.authorized-address.';

type UseWeb3AuthTokenParameters = {
  message: string;
  scopes: string[];
  key?: string;
  persist?: boolean;
  authorizedAddressStorageKey?: string;
  delegateXyzRights?: Hex;
  jwtTokenMaxValidity?: number; // ms
  encryption?: {
    encrypt: (token: string) => Promise<string> | string;
    decrypt: (encryptedToken: string) => Promise<string> | string;
  };
};

const dummyEncryption: NonNullable<UseWeb3AuthTokenParameters['encryption']> = {
  encrypt: (token) => token,
  decrypt: (encryptedToken) => encryptedToken,
};

export const useWeb3AuthToken = ({
  message,
  scopes,
  key = 'default',
  persist = false,
  authorizedAddressStorageKey = 'default',
  delegateXyzRights,
  jwtTokenMaxValidity,
  encryption = dummyEncryption,
}: UseWeb3AuthTokenParameters) => {
  const [authorizedAddress, setAuthorizedAddress] = useLocalStorage<Address | null>(
    AUTHORIZED_ADDRESS_KEY_PREFIX + authorizedAddressStorageKey,
    null,
  );
  const [encryptedToken, setEncryptedToken] =
    persist === true
      ? useLocalStorage<string | null>(ENCRYPTED_TOKEN_KEY_PREFIX + key, null)
      : useSessionStorage<string | null>(ENCRYPTED_TOKEN_KEY_PREFIX + key, null);
  const [token, setToken] = useSessionStorage<string | undefined>(TOKEN_KEY_PREFIX + key, undefined);
  const [tokenData, setTokenData] = useSessionStorage<JwtVerificationResult | undefined>(
    TOKEN_DATA_KEY_PREFIX + key,
    undefined,
  );
  const [isVerifying, setIsVerifying] = useState(true);
  const [isWaiting, setIsWaiting] = useState(false);
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const clear = useCallback(() => {
    setEncryptedToken(null);
    setIsVerifying(false);
  }, []);

  const sign = useCallback(
    async (expiration: number) => {
      if (walletClient === undefined) {
        throw new Web3AuthError('Failed creating authentication token. Wallet not ready yet!');
      }

      setIsWaiting(true);

      try {
        const token = await createJwtToken({
          message,
          address: authorizedAddress ?? walletClient.account.address,
          signer: walletClient,
          scopes,
          expiration,
        });

        setEncryptedToken(await encryption.encrypt(token));

        return token;
      } catch (e) {
        setIsWaiting(false);

        throw e;
      }
    },
    [authorizedAddress, message, JSON.stringify(scopes), encryption.encrypt, walletClient],
  );

  useEffect(() => {
    if (authorizedAddress !== null || walletClient?.account.address === undefined) {
      return;
    }

    setAuthorizedAddress(walletClient?.account.address);
  }, [walletClient?.account.address]);

  useEffect(() => {
    (async () => {
      try {
        setToken(encryptedToken !== null ? await encryption.decrypt(encryptedToken) : undefined);
      } catch (e) {
        clear();
      }
    })();
  }, [encryptedToken]);

  useEffect(() => {
    if (token === undefined) {
      setTokenData(undefined);
    }

    if (authorizedAddress === null || token === undefined || publicClient === undefined) {
      setIsVerifying(false);

      return;
    }

    setIsVerifying(true);

    (async () => {
      let verificationResult = null;

      try {
        verificationResult = await verifyJwtToken({
          message,
          token,
          web3Client: publicClient,
          scopes,
          strictScopes: true,
          delegateXyzRights,
          maxAllowedExpiration: jwtTokenMaxValidity === undefined ? undefined : Date.now() + jwtTokenMaxValidity,
        });
      } catch (e: any) {
        if (e.codes?.includes(W3A_ERROR_JWT_DECODING) !== true) {
          throw e;
        }
      }

      if (verificationResult === null || !isAddressEqual(verificationResult.walletAddress, authorizedAddress)) {
        clear();

        return;
      }

      setTokenData(verificationResult);
      setIsVerifying(false);
    })();
  }, [authorizedAddress, token, publicClient]);

  return {
    token: token ?? null,
    tokenData: tokenData ?? null,
    isVerifying,
    isWaiting,
    isAuthenticated: tokenData?.walletAddress !== undefined,
    clear,
    sign,
    authorizedAddress,
    setAuthorizedAddress,
  };
};
