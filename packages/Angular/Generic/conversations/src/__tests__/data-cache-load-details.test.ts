/**
 * Pins how DataCacheService.LoadConversationDetails merges loaded messages into its cache. The cache
 * spans every conversation loaded so far, and each loaded message used to be searched for in the
 * whole cache. Positions are now indexed once; these specs hold the merge to the same result: a
 * cached message with the same ID (in any case) is replaced in place, a new one is appended, and a
 * duplicate within one load replaces the copy appended a moment earlier.
 */
import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type UserInfo } from '@memberjunction/core';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { DataCacheService } from '../lib/services/data-cache.service';

const CONVO = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_CONVO = 'bbbbbbbb-0000-0000-0000-000000000002';
const A = 'cccccccc-0000-0000-0000-00000000000a';
const B = 'cccccccc-0000-0000-0000-00000000000b';
const C = 'cccccccc-0000-0000-0000-00000000000c';

const detail = (ID: string, ConversationID: string, Message: string) =>
    ({ ID, ConversationID, Message }) as unknown as MJConversationDetailEntity;

function loadReturning(rows: MJConversationDetailEntity[]) {
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: async () => ({ Success: true, Results: rows }),
    } as unknown as RunView);
}

describe('DataCacheService.LoadConversationDetails', () => {
    afterEach(() => vi.restoreAllMocks());

    it('replaces cached messages in place, appends new ones, and lets a later duplicate in one load win', async () => {
        const cache = new DataCacheService();
        loadReturning([detail(A, OTHER_CONVO, 'other'), detail(B, CONVO, 'b-old')]);
        await cache.LoadConversationDetails(OTHER_CONVO, {} as UserInfo);

        loadReturning([detail(B.toUpperCase(), CONVO, 'b-new'), detail(C, CONVO, 'c-first'), detail(C.toUpperCase(), CONVO, 'c-second')]);
        const loaded = await cache.LoadConversationDetails(CONVO, {} as UserInfo);

        expect(loaded.map(d => d.Message)).toEqual(['b-new', 'c-first', 'c-second']);
        expect(cache.GetCachedConversationDetails(CONVO).map(d => d.Message)).toEqual(['b-new', 'c-second']);
        expect(cache.GetCachedConversationDetails(OTHER_CONVO).map(d => d.Message)).toEqual(['other']);
        expect(cache.GetStats().conversationDetails).toBe(3);
    });
});
