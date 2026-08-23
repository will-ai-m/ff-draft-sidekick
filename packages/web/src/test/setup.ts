/**
 * Web-suite setup.
 *
 * Two things the environment does not give us:
 *
 * 1. Testing Library's automatic cleanup only registers itself when `afterEach` is a global, and
 *    this workspace deliberately runs vitest without `globals: true` — so the unmount between
 *    tests is wired explicitly here rather than left to a config flag.
 * 2. `localStorage`. Node 26 defines a `globalThis.localStorage` accessor that returns `undefined`
 *    unless the process was started with `--localstorage-file`, and it shadows the working one
 *    jsdom provides. Real browsers have storage, so the suite gets a minimal in-memory Storage
 *    rather than tests written around an absence that only exists under Node.
 */
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

class MemoryStorage implements Storage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

if (globalThis.localStorage === undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
});
