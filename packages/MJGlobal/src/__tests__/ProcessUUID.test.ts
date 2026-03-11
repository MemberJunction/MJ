import { describe, it, expect, beforeEach } from 'vitest';
import { MJGlobal } from '../Global';
import { GetGlobalObjectStore } from '../util';

/**
 * Helper to clear the MJGlobal singleton from the global object store
 * so each test starts with a clean slate.
 */
function clearMJGlobalSingleton(): void {
    const g = GetGlobalObjectStore();
    if (g) {
        for (const key of Object.keys(g)) {
            if (key.startsWith('___SINGLETON__')) {
                delete g[key];
            }
        }
    }
}

describe('MJGlobal.ProcessUUID', () => {
    beforeEach(() => {
        clearMJGlobalSingleton();
    });

    it('should return a string', () => {
        const uuid = MJGlobal.Instance.ProcessUUID;
        expect(typeof uuid).toBe('string');
    });

    it('should return a valid UUID v4 format', () => {
        const uuid = MJGlobal.Instance.ProcessUUID;
        // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (y is 8, 9, a, or b)
        const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuid).toMatch(uuidV4Regex);
    });

    it('should return the same UUID on repeated calls (stable within a process)', () => {
        const uuid1 = MJGlobal.Instance.ProcessUUID;
        const uuid2 = MJGlobal.Instance.ProcessUUID;
        const uuid3 = MJGlobal.Instance.ProcessUUID;
        expect(uuid1).toBe(uuid2);
        expect(uuid2).toBe(uuid3);
    });

    it('should return a non-empty string', () => {
        const uuid = MJGlobal.Instance.ProcessUUID;
        expect(uuid.length).toBeGreaterThan(0);
        expect(uuid.length).toBe(36); // Standard UUID length with hyphens
    });

    it('should generate a new UUID for a new MJGlobal instance', () => {
        const uuid1 = MJGlobal.Instance.ProcessUUID;
        // Clear and get a fresh singleton
        clearMJGlobalSingleton();
        const uuid2 = MJGlobal.Instance.ProcessUUID;
        // Different singleton instances should get different UUIDs
        expect(uuid1).not.toBe(uuid2);
    });
});
