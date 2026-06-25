import { webcrypto } from 'node:crypto';

// uuid@14 calls the global `crypto.randomUUID()`. Vitest's node environment
// doesn't expose it by default, unlike a plain Node process or a browser.
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}
