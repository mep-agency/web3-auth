import { Account, Address, Hex, PublicClient, WalletClient, getAddress, isAddressEqual } from 'viem';

import { verifySignatureWithDelegation } from './signatures';
import { CacheController } from './jwt-cache';
import { JwtDecodingError } from './errors/JwtDecodingError';
import { Web3AuthError } from './errors/Web3AuthError';

const JWT_AUTH_TOKEN_HEADER: JwtHeader = {
  alg: 'WEB3_AUTH',
  typ: 'JWT',
};

/*
 * btoa(...) is not actually deprecated, it's marked as legacy as it doesn't
 * support non-ASCII strings. This is not a problem in our case and using this
 * implementation makes it possible for us to share a single library between
 * the clients and the server.
 *
 * @see https://github.com/nodejs/node/issues/40754
 */
const strToBase64 = (input: string) => btoa(input).replace(/=+$/, '');
const base64ToStr = (input: string) => atob(input);

const jsonToBase64 = (input: any) => strToBase64(JSON.stringify(input));
const base64toJson = (input: any) => JSON.parse(base64ToStr(input));

type JwtHeader = {
  alg: string;
  typ: string;
};

export type AuthJwtPayload = {
  chainId: number;
  walletAddress: Address;
  signerAddress: Address;
  scopes: [string, ...string[]];
  createdAt: number;
  exp: number;
};

type AuthJwt = [typeof JWT_AUTH_TOKEN_HEADER, AuthJwtPayload, Hex];

type Signer = {
  account?: Account;
  getChainId: WalletClient['getChainId'];
  signMessage: WalletClient['signMessage'];
};

export type JwtVerificationResult = {
  walletAddress: Address;
  signerAddress: Address;
  isDelegated: boolean;
  scopes: [string, ...string[]];
} | null;

const buildMessage = ({ message, payload }: { message: string; payload: AuthJwtPayload }) =>
  `${message}\n\n[Auth Token Details]\nScopes:\n${payload.scopes.map((scope) => `  - ${scope}\n`).join('')}Start: ${new Date(
    payload.createdAt,
  ).toUTCString()}\nEnd: ${new Date(payload.exp).toUTCString()}\nAddress: ${payload.walletAddress}\nSigner: ${
    payload.signerAddress
  }\nChain ID: ${payload.chainId}`;

const buildPayload = ({
  chainId,
  address,
  signer,
  scopes,
  exp,
}: {
  chainId: number;
  address: Address;
  signer: Address;
  scopes: [string, ...string[]];
  exp: number;
}): AuthJwtPayload => {
  const createdAt = Date.now();

  if (createdAt > exp) {
    throw new Web3AuthError('Expiration timestamp must be in the future');
  }

  return {
    chainId,
    walletAddress: getAddress(address),
    signerAddress: getAddress(signer),
    scopes,
    createdAt,
    exp,
  };
};

const decodeJwt = (token: string): { header: JwtHeader; payload: AuthJwtPayload; signature: Hex } => {
  try {
    const [header, payload, signature] = token
      .split('.')
      .map((slice, index) => (index !== 2 ? base64toJson(slice) : base64ToStr(slice))) as AuthJwt;

    return { header, payload, signature };
  } catch (e) {
    throw new JwtDecodingError(token, e);
  }
};

export const createJwtToken = async ({
  message,
  address,
  signer,
  scopes,
  expiration,
}: {
  message: string;
  address: Address;
  signer: Signer;
  scopes: [string, ...string[]];
  expiration: number;
}): Promise<string> => {
  if (signer.account === undefined) {
    throw new Web3AuthError('Invalid web3 client: an account is required in order to sign a token');
  }

  if (scopes.length < 1) {
    throw new Web3AuthError('JWT tokens must have at least one scope');
  }

  const payload = buildPayload({
    chainId: await signer.getChainId(),
    address,
    signer: signer.account.address,
    scopes,
    exp: expiration,
  });
  const signatureMessage = buildMessage({ message, payload });

  return `${jsonToBase64(JWT_AUTH_TOKEN_HEADER)}.${jsonToBase64(payload)}.${strToBase64(
    await signer.signMessage({ account: signer.account, message: signatureMessage }),
  )}`;
};

export const verifyJwtToken = async ({
  message,
  token,
  web3Client,
  delegateXyzRights,
  maxAllowedExpiration,
  cacheController,
}: {
  message: string;
  token: string;
  web3Client: PublicClient;
  delegateXyzRights?: Hex;
  maxAllowedExpiration?: number;
  cacheController?: CacheController;
}): Promise<JwtVerificationResult | null> => {
  const now = Date.now();
  const { header, payload, signature } = decodeJwt(token);

  // Is this a valid JWT token?
  if (header.alg !== JWT_AUTH_TOKEN_HEADER.alg || header.typ !== JWT_AUTH_TOKEN_HEADER.typ) {
    return null;
  }

  const result: JwtVerificationResult = {
    walletAddress: payload.walletAddress,
    signerAddress: payload.signerAddress,
    isDelegated: !isAddressEqual(payload.walletAddress, payload.signerAddress),
    scopes: payload.scopes,
  };

  // Check cache
  if (cacheController !== undefined && (await cacheController.isCachedAndStillValid(token))) {
    return result;
  }

  // Is the creation timestamp valid?
  if (payload.createdAt > now) {
    return null;
  }

  // Is the expiration timestamp valid?
  if ((maxAllowedExpiration !== undefined && payload.exp > maxAllowedExpiration) || payload.exp <= now) {
    return null;
  }

  // Does the chain ID match?
  if (payload.chainId !== web3Client.chain?.id) {
    return null;
  }

  // Is there at least one scope?
  if (payload.scopes.length < 1) {
    return null;
  }

  const verifiedAddress = await verifySignatureWithDelegation({
    walletAddress: payload.walletAddress,
    signerAddress: payload.signerAddress,
    message: buildMessage({ message, payload }),
    signature,
    web3Client,
    delegateXyzRights,
  });

  if (verifiedAddress === null || !isAddressEqual(verifiedAddress, payload.walletAddress)) {
    return null;
  }

  await cacheController?.cacheValidToken(token, payload.exp);

  return result;
};
