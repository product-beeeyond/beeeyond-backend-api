/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'rate-limit-redis' {
  import { Store } from 'express-rate-limit';

  interface RedisStoreOptions {
    sendCommand: (...args: string[]) => Promise<any>;
    prefix?: string;
    resetExpireDateOnChange?: boolean;
    expiry?: number;
  }

  export default class RedisStore implements Store {
    constructor(options: RedisStoreOptions);

    // Required methods from Store
    increment(key: string): Promise<{ totalHits: number; resetTime: Date | undefined }>;
    decrement(key: string): void;
    resetKey(key: string): void;
    resetAll?(): void; // optional
  }
}
