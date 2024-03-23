export const W3A_ERROR_GENERIC = 'Web3AuthError';

export class Web3AuthError extends Error {
  public readonly codes: string[] = [W3A_ERROR_GENERIC];

  constructor(message: string, public readonly parentError?: any, public readonly code?: string) {
    super(message);

    if (code !== undefined) {
      this.codes.push(code);
    }
  }
}
