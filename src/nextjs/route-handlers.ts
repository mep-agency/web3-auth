import { HandlerError, UserFetcher } from '@mep-agency/next-http';
import { Hex, PublicClient } from 'viem';

import { JwtVerificationResult, verifyJwtToken } from '../lib/jwt';
import { W3A_ERROR_JWT_DECODING } from '../lib/errors/JwtDecodingError';

type GeneratorParams = {
  signatureMessage: string;
  web3Client: PublicClient;
  delegateXyzRights?: Hex;
  jwtTokenMaxValidity?: number;
};

export const createWeb3UserFetcher = ({
  signatureMessage,
  web3Client,
  delegateXyzRights,
  jwtTokenMaxValidity,
}: GeneratorParams): UserFetcher<JwtVerificationResult> => {
  return async ({ request }) => {
    const authorizationHeader = request.headers.get('Authorization');

    if (authorizationHeader === null || authorizationHeader.length === 0) {
      throw new HandlerError({ title: 'No JWT token', status: 400 });
    }

    const [bearer, token] = authorizationHeader.split(' ');

    if (bearer.toLocaleLowerCase() !== 'bearer') {
      throw new HandlerError({ title: 'Invalid authorization header', status: 400 });
    }

    if (token === undefined || token.length === 0) {
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
