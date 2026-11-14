/**
 * Unit tests for BrowserIndexedDBStorageProvider structured-clone methods:
 * SetObject and GetObject (Wave 5.4).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserIndexedDBStorageProvider } from '../storage-providers';

async function resetIDB(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('MJ_Metadata');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
    });
}

describe('BrowserIndexedDBStorageProvider SetObject and GetObject (Wave 5.4)', () => {
    let provider: BrowserIndexedDBStorageProvider;

    beforeEach(async () => {
        await resetIDB();
        provider = new BrowserIndexedDBStorageProvider();
        await provider.GetItem('__warmup__', 'default');
    });

    it('implements SetObject and GetObject methods', () => {
        expect(typeof provider.SetObject).toBe('function');
        expect(typeof provider.GetObject).toBe('function');
    });

    it('round-trips complex nested objects via SetObject and GetObject', async () => {
        const payload = {
            id: 'meta-1',
            entities: [
                { id: 'e1', name: 'User', fields: ['ID', 'Name', 'Email'], active: true },
                { id: 'e2', name: 'Order', fields: ['ID', 'Total', 'CreatedAt'], active: false },
            ],
            nested: {
                createdAt: new Date('2026-11-14T02:00:00Z'),
                tags: new Set(['system', 'core']),
                counts: new Map([['alpha', 10], ['beta', 20]]),
            },
        };

        await provider.SetObject('complex_meta', payload, 'Metadata');
        const retrieved = await provider.GetObject<typeof payload>('complex_meta', 'Metadata');

        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe('meta-1');
        expect(retrieved!.entities.length).toBe(2);
        expect(retrieved!.entities[0].name).toBe('User');
        expect(retrieved!.nested.createdAt).toBeInstanceOf(Date);
        expect(retrieved!.nested.createdAt.toISOString()).toBe('2026-11-14T02:00:00.000Z');
        expect(retrieved!.nested.tags).toBeInstanceOf(Set);
        expect(retrieved!.nested.tags.has('core')).toBe(true);
        expect(retrieved!.nested.counts).toBeInstanceOf(Map);
        expect(retrieved!.nested.counts.get('beta')).toBe(20);
    });

    it('returns null for missing keys on GetObject', async () => {
        const result = await provider.GetObject('non_existent_key', 'Metadata');
        expect(result).toBeNull();
    });

    it('supports category isolation with SetObject and GetObject', async () => {
        const objA = { role: 'admin' };
        const objB = { role: 'guest' };

        await provider.SetObject('shared_key', objA, 'RunViewCache');
        await provider.SetObject('shared_key', objB, 'Metadata');

        const outA = await provider.GetObject<typeof objA>('shared_key', 'RunViewCache');
        const outB = await provider.GetObject<typeof objB>('shared_key', 'Metadata');

        expect(outA?.role).toBe('admin');
        expect(outB?.role).toBe('guest');
    });

    it('is interoperable with SetItem and GetItem', async () => {
        const obj = { message: 'hello world', num: 42 };

        await provider.SetObject('interop_key', obj, 'Metadata');
        const viaGetItem = await provider.GetItem<typeof obj>('interop_key', 'Metadata');
        expect(viaGetItem).toEqual(obj);

        await provider.SetItem('interop_key_2', obj, 'Metadata');
        const viaGetObject = await provider.GetObject<typeof obj>('interop_key_2', 'Metadata');
        expect(viaGetObject).toEqual(obj);
    });
});
