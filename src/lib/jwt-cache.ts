import { Web3AuthError } from './errors/Web3AuthError';

export type CacheController = {
  start: () => Promise<void> | void;
  stop: () => Promise<void> | void;
  isCachedAndStillValid: (token: string) => Promise<boolean> | boolean;
  cacheValidToken: (token: string, expiration: number) => Promise<void> | void;
  cleanValidTokensExpirationCache: () => Promise<void> | void;
};

export const createDefaultCacheController = ({
  maxCacheSize = 10000,
  maxCacheTime = 60 * 60 * 1000, // 1h
}: {
  maxCacheSize?: number;
  maxCacheTime?: number;
}): CacheController => {
  let hasAlreadyStarted = false;
  const validTokensExpirationCache = new Map<string, number>();
  let cleaningLoopTimeout: ReturnType<typeof setTimeout>;

  const start = () => {
    if (hasAlreadyStarted) {
      throw new Web3AuthError('Cache controller has already been started!');
    }

    hasAlreadyStarted = true;

    const cleaningLoop = () => {
      cleaningLoopTimeout = setTimeout(async () => {
        await cleanValidTokensExpirationCache();

        await cleaningLoop();
      });
    };

    cleaningLoop();
  };

  const stop = () => {
    if (!hasAlreadyStarted) {
      throw new Web3AuthError('Cache controller is not running!');
    }

    clearTimeout(cleaningLoopTimeout);
  };

  const isCachedAndStillValid = (token: string) => {
    const cachedExpiration = validTokensExpirationCache.get(token);

    return cachedExpiration !== undefined && cachedExpiration > Date.now();
  };

  const cacheValidToken = (token: string, expiration: number) => {
    validTokensExpirationCache.set(
      token,
      /*
       * The JWT verification cannot be cached up to the expiration time or we
       * would lose the ability to revoke the access.
       */
      Math.min(expiration, Date.now() + maxCacheTime),
    );
  };

  const cleanValidTokensExpirationCache = () => {
    if (validTokensExpirationCache.size <= maxCacheSize) {
      return;
    }

    const now = Date.now();

    validTokensExpirationCache.forEach((value, key) => {
      if (value <= now) {
        validTokensExpirationCache.delete(key);
      }
    });
  };

  return {
    start,
    stop,
    isCachedAndStillValid,
    cacheValidToken,
    cleanValidTokensExpirationCache,
  };
};
