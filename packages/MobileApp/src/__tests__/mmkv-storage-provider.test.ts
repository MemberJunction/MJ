import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        getString(): string | undefined { return undefined; }
        set(): void {}
        delete(): void {}
        getAllKeys(): string[] { return []; }
    },
}));

import { MMKVStorageProvider } from '../providers/mmkv-storage-provider';

describe('MMKVStorageProvider', () => {
    it('declares a store that outlives the app process, so the metadata snapshot is saved to it', () => {
        expect(new MMKVStorageProvider().SupportsCrossProcessPersistence).toBe(true);
    });
});
