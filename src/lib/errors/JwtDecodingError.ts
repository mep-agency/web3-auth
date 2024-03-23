import { Web3AuthError } from './Web3AuthError';

export const W3A_ERROR_JWT_DECODING = 'JwtDecodingError';

export class JwtDecodingError extends Web3AuthError {
  constructor(public readonly token: string, parentError?: any) {
    super('Failed decoding JWT token', parentError, W3A_ERROR_JWT_DECODING);
  }
}
