import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @tempfix/idb
vi.mock('@tempfix/idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn(),
  }),
}));

// Mock @memberjunction/core
vi.mock('@memberjunction/core', () => ({
  InMemoryLocalStorageProvider: class {
    private store = new Map<string, string>();
    async GetItem(key: string) { return this.store.get(key) || null; }
    async SetItem(key: string, value: string) { this.store.set(key, value); }
    async RemoveItem(key: string) { this.store.delete(key); }
    async Clear() { this.store.clear(); }
  },
}));

import { BrowserIndexedDBStorageProvider } from '../storage-providers';

describe('BrowserIndexedDBStorageProvider', () => {
  let provider: BrowserIndexedDBStorageProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new BrowserIndexedDBStorageProvider();
  });

  it('should create an instance', () => {
    expect(provider).toBeInstanceOf(BrowserIndexedDBStorageProvider);
  });

  it('should have GetItem method', () => {
    expect(typeof provider.GetItem).toBe('function');
  });

  it('should have SetItem method', () => {
    expect(typeof provider.SetItem).toBe('function');
  });

  it('should have Remove method', () => {
    expect(typeof provider.Remove).toBe('function');
  });
});
