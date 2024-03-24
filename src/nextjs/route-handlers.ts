import { HandlerError, UserFetcher } from '@mep-agency/next-http';
import { Hex, PublicClient } from 'viem';

import { JwtVerificationResult, verifyJwtToken } from '../lib/jwt';
import { W3A_ERROR_JWT_DECODING } from '../lib/errors/JwtDecodingError';

export const DEFAULT_HTTP_WEB3_AUTH_HEADER = 'x-web3-auth';

type GeneratorParams = {
  signatureMessage: string;
  web3Client: PublicClient;
  delegateXyzRights?: Hex;
  jwtTokenMaxValidity?: number;
  httpAuthHeader?: string;
};

export const createWeb3UserFetcher = ({
  signatureMessage,
  web3Client,
  delegateXyzRights,
  jwtTokenMaxValidity,
  httpAuthHeader = DEFAULT_HTTP_WEB3_AUTH_HEADER,
}: GeneratorParams): UserFetcher<JwtVerificationResult> => {
  return async ({ request }) => {
    const token = request.headers.get(httpAuthHeader);

    if (token === null) {
      throw new HandlerError({ title: 'No JWT token', status: 400 });
    }

    try {
      const verificationResult = await verifyJwtToken({
        message: signatureMessage,
        token,
        web3Client,
        delegateXyzRights,
        maxAllowedExpiration: jwtTokenMaxValidity === undefined ? undefined : Date.now() + jwtTokenMaxValidity,
      });

      if (verificationResult === null) {
        throw new HandlerError({ title: 'JWT verification failed', status: 400 });
      }

      return verificationResult;
    } catch (e: any) {
      if (e.codes?.includes(W3A_ERROR_JWT_DECODING) === true) {
        throw new HandlerError({ title: e.message, status: 400 });
      }

      throw e;
    }
  };
};
