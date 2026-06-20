import { webcrypto } from 'node:crypto';

// uuid@14 (via @flode/transpiler) calls the global `crypto.randomUUID()`,
// which Vitest's node environment doesn't expose by default.
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

// Only import jest-dom if we're in a DOM environment
if (typeof window !== 'undefined') {
  try {
    // Dynamic import to avoid TypeScript resolution errors when jest-dom isn't installed
    await import('@testing' + '-library/jest-dom');
  } catch {
    // Ignore if jest-dom is not available
  }
}

export {};
