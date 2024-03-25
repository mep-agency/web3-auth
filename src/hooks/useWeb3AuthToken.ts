import { useCallback, useEffect, useState } from 'react';
import { Address, Hex, isAddressEqual } from 'viem';
import { usePublicClient, useWalletClient } from 'wagmi';
import { useLocalStorage } from '@uidotdev/usehooks';

import { JwtVerificationResult, createJwtToken, verifyJwtToken } from '../lib/jwt';
import { W3A_ERROR_JWT_DECODING } from '../lib/errors/JwtDecodingError';
import { Web3AuthError } from '../errors';

const LOCAL_STORAGE_JWT_TOKENS_KEY_PREFIX = 'web3-auth.jwt-token.';
const LOCAL_STORAGE_AUTHORIZED_ADDRESS_KEY_PREFIX = 'web3-auth.authorized-address.';

type UseTokenParameters = {
  message: string;
  scopes: [string, ...string[]];
  storageKey?: string;
  authorizedAddressStorageKey?: string;
  delegateXyzRights?: Hex;
  jwtTokenMaxValidity?: number; // ms
  encryption?: {
    encrypt: (token: string | null) => Promise<string | null> | string | null;
    decrypt: (encryptedToken: string | null) => Promise<string | null> | string | null;
  };
};

const dummyEncryption: NonNullable<UseTokenParameters['encryption']> = {
  encrypt: (token) => token,
  decrypt: (encryptedToken) => encryptedToken,
};

export const useWeb3AuthToken = ({
  message,
  scopes,
  storageKey,
  authorizedAddressStorageKey = 'default',
  delegateXyzRights,
  jwtTokenMaxValidity,
  encryption = dummyEncryption,
}: UseTokenParameters) => {
  const [authorizedAddress, setAuthorizedAddress] = useLocalStorage<Address | null>(
    LOCAL_STORAGE_AUTHORIZED_ADDRESS_KEY_PREFIX + authorizedAddressStorageKey,
    null,
  );
  const [encryptedToken, saveEncryptedToken] =
    storageKey === undefined
      ? useState<string | null>(null)
      : useLocalStorage<string | null>(LOCAL_STORAGE_JWT_TOKENS_KEY_PREFIX + storageKey, null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<JwtVerificationResult | null>(null);
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const clear = useCallback(() => {
    saveEncryptedToken(null);
    setTokenData(null);
  }, [saveEncryptedToken]);

  const sign = useCallback(
    async (expiration: number) => {
      if (walletClient === undefined) {
        throw new Web3AuthError('Failed creating authentication token. Wallet not ready yet!');
      }

      const token = await createJwtToken({
        message,
        address: authorizedAddress ?? walletClient.account.address,
        signer: walletClient,
        scopes,
        expiration,
      });

      saveEncryptedToken(await encryption.encrypt(token));

      return token;
    },
    [authorizedAddress, message, JSON.stringify(scopes), encryption.encrypt, saveEncryptedToken, walletClient],
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
        setToken(await encryption.decrypt(encryptedToken));
      } catch (e) {
        clear();
      }
    })();
  }, [encryptedToken]);

  useEffect(() => {
    if (authorizedAddress === null || token === null || publicClient === undefined) {
      return;
    }

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
    })();
  }, [authorizedAddress, token, publicClient]);

  return {
    token,
    tokenData,
    clear,
    sign,
    authorizedAddress,
    setAuthorizedAddress,
  };
};
