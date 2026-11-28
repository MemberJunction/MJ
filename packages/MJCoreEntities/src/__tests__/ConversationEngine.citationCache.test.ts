import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NormalizeUUID } from '@memberjunction/global';
import {
    ConversationEngine,
    type CachedParsedCitationsResult,
    type ConversationDetailCache,
} from '../engines/conversations';
import type { MJConversationDetailEntity } from '../generated/entity_subclasses';

function makeResult(label: string): CachedParsedCitationsResult {
    return {
        Citations: [
            {
                Index: 1,
                Kind: 'record',
                EntityName: 'MJ: Tasks',
                RecordID: 'task-1',
                Keys: { ID: 'task-1' },
                DisplayName: label,
                RawToken: `[[MJ: Tasks|task-1|${label}]]`,
            },
        ],
        Occurrences: [],
    };
}

describe('ConversationEngine citation memoization cache (zero RunView calls)', () => {
    const engine = ConversationEngine.Instance;

    beforeEach(() => {
        engine.ClearCache();
    });

    it('hits the WeakMap O(1) cache across repeated calls on the same detail instance and invalidates when text changes', () => {
        const detail = {
            ID: '11111111-0000-4000-8000-000000000001',
            ConversationID: '22222222-0000-4000-8000-000000000002',
        } as MJConversationDetailEntity;

        const parseFn = vi.fn((text: string) => makeResult(text));

        const first = engine.GetOrComputeMessageCitations(detail, 'See [[MJ: Tasks|task-1|Alpha]]', parseFn);
        const second = engine.GetOrComputeMessageCitations(detail, 'See [[MJ: Tasks|task-1|Alpha]]', parseFn);

        expect(parseFn).toHaveBeenCalledTimes(1);
        expect(second).toBe(first);

        // Mutated/streamed text triggers a fresh parse and updates the cache
        const updated = engine.GetOrComputeMessageCitations(detail, 'See [[MJ: Tasks|task-1|Beta]]', parseFn);
        expect(parseFn).toHaveBeenCalledTimes(2);
        expect(updated).not.toBe(first);
        expect(updated.Citations[0].DisplayName).toBe('See [[MJ: Tasks|task-1|Beta]]');

        // Subsequent call with updated text hits again
        const updatedAgain = engine.GetOrComputeMessageCitations(detail, 'See [[MJ: Tasks|task-1|Beta]]', parseFn);
        expect(parseFn).toHaveBeenCalledTimes(2);
        expect(updatedAgain).toBe(updated);
    });

    it('shares cached citations across distinct detail instances (Overlay <-> Full Workspace) when the conversation is in _detailCache', () => {
        const convId = 'AAAAAAAA-0000-4000-8000-000000000010';
        const detailId = 'BBBBBBBB-0000-4000-8000-000000000020';

        // Seed _detailCache for this conversation
        const detailCacheMap = (engine as unknown as { _detailCache: Map<string, ConversationDetailCache> })._detailCache;
        detailCacheMap.set(NormalizeUUID(convId), {
            Details: [],
            RawData: [],
            AgentRunsByDetailId: new Map(),
            UserAvatars: new Map(),
            RatingsByDetailId: new Map(),
            ArtifactsByDetailId: new Map(),
            LoadedAt: new Date(),
            PeripheralDataStale: false,
        });

        const overlayDetail = { ID: detailId, ConversationID: convId } as MJConversationDetailEntity;
        const workspaceDetail = { ID: detailId.toLowerCase(), ConversationID: convId.toLowerCase() } as MJConversationDetailEntity;
        const parseFn = vi.fn((text: string) => makeResult(text));

        const fromOverlay = engine.GetOrComputeMessageCitations(overlayDetail, 'Message A', parseFn);
        const fromWorkspace = engine.GetOrComputeMessageCitations(workspaceDetail, 'Message A', parseFn);

        expect(parseFn).toHaveBeenCalledTimes(1);
        expect(fromWorkspace).toBe(fromOverlay);

        // Invalidating the conversation clears its per-conversation citations map
        engine.InvalidateConversation(convId);
        const thirdDetail = { ID: detailId, ConversationID: convId } as MJConversationDetailEntity;
        engine.GetOrComputeMessageCitations(thirdDetail, 'Message A', parseFn);
        expect(parseFn).toHaveBeenCalledTimes(2);
    });

    it('evicts entries on InvalidateMessageCitations and ClearCache', () => {
        const detail = {
            ID: '33333333-0000-4000-8000-000000000003',
            ConversationID: '44444444-0000-4000-8000-000000000004',
        } as MJConversationDetailEntity;
        const parseFn = vi.fn((text: string) => makeResult(text));

        engine.GetOrComputeMessageCitations(detail, 'Text 1', parseFn);
        expect(parseFn).toHaveBeenCalledTimes(1);

        engine.InvalidateMessageCitations(detail);
        engine.GetOrComputeMessageCitations(detail, 'Text 1', parseFn);
        expect(parseFn).toHaveBeenCalledTimes(2);

        engine.ClearCache();
        engine.GetOrComputeMessageCitations(detail, 'Text 1', parseFn);
        expect(parseFn).toHaveBeenCalledTimes(3);
    });
});
