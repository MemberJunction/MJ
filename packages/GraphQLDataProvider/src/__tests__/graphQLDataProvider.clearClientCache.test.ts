import { describe, it, expect, vi, afterEach } from 'vitest';
import { GraphQLDataProvider } from '../graphQLDataProvider';

/** An IndexedDB stand-in whose deletions succeed on the next tick. */
function fakeIndexedDB() {
    return {
        deleteDatabase: vi.fn(() => {
            const req: { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
            setTimeout(() => req.onsuccess?.(), 0);
            return req;
        }),
    };
}

describe('GraphQLDataProvider.ClearClientCache', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('deletes the MJ_Diagnostics database an earlier build left behind', async () => {
        const idb = fakeIndexedDB();
        vi.stubGlobal('indexedDB', idb);
        vi.stubGlobal('localStorage', { length: 0, key: () => null, removeItem: vi.fn() });

        await GraphQLDataProvider.ClearClientCache();

        expect(idb.deleteDatabase).toHaveBeenCalledWith('MJ_Metadata');
        expect(idb.deleteDatabase).toHaveBeenCalledWith('MJ_Diagnostics');
    });
});
