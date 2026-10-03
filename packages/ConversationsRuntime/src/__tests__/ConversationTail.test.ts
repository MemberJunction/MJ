/**
 * Tests for the per-message read cursor (MJ #4222).
 *
 * The cursor is the whole point of this class: it turns "re-read the run" into "read what I have
 * not seen". Two rules keep it correct under the conditions it exists for — an unreliable network:
 *
 * 1. **Advance only on a successful read.** A failed call must cost a repeat, never a gap. If the
 *    cursor moved on failure, the events in that window would be skipped permanently.
 * 2. **Never move backwards.** A server that echoes a lower sequence must not cause a replay.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConversationTailResult } from '@memberjunction/graphql-dataprovider';

const { mockTail } = vi.hoisted(() => ({ mockTail: vi.fn() }));

// The provider singleton loads transport config at import; the two symbols this class actually
// uses are mocked so the cursor logic can be tested on its own.
vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: { Instance: {} },
    GraphQLConversationClient: class {
        public async TailConversationEvents(detailId: string, sinceSeq: number): Promise<ConversationTailResult> {
            return mockTail(detailId, sinceSeq);
        }
    },
}));

import { ConversationTail } from '../streaming/ConversationTail';

const DETAIL = 'A1111111-1111-1111-1111-111111111111';
const OTHER = 'B2222222-2222-2222-2222-222222222222';

const ok = (latestSeq: number, extra: Partial<ConversationTailResult> = {}): ConversationTailResult => ({
    Success: true,
    Message: '',
    Events: [],
    LatestSeq: latestSeq,
    IsInFlight: true,
    ...extra,
});

const failed = (latestSeq: number): ConversationTailResult => ({
    Success: false,
    Message: 'transport down',
    Events: [],
    LatestSeq: latestSeq,
    IsInFlight: true,
});

describe('ConversationTail', () => {
    beforeEach(() => {
        mockTail.mockReset();
    });

    it('reads from 0 the first time', async () => {
        mockTail.mockResolvedValue(ok(4));
        const tail = new ConversationTail();

        await tail.Tail(DETAIL);

        expect(mockTail).toHaveBeenCalledWith(DETAIL, 0);
    });

    it('resumes from the highest sequence already seen', async () => {
        mockTail.mockResolvedValueOnce(ok(4)).mockResolvedValueOnce(ok(9));
        const tail = new ConversationTail();

        await tail.Tail(DETAIL);
        await tail.Tail(DETAIL);

        expect(mockTail).toHaveBeenNthCalledWith(2, DETAIL, 4);
        expect(tail.CursorFor(DETAIL)).toBe(9);
    });

    it('does not advance the cursor on a failed read', async () => {
        mockTail.mockResolvedValueOnce(ok(6)).mockResolvedValueOnce(failed(6));
        const tail = new ConversationTail();

        await tail.Tail(DETAIL);
        await tail.Tail(DETAIL);

        expect(tail.CursorFor(DETAIL)).toBe(6);
        // A third call must re-read the same window rather than skipping past it.
        mockTail.mockResolvedValueOnce(ok(8));
        await tail.Tail(DETAIL);
        expect(mockTail).toHaveBeenNthCalledWith(3, DETAIL, 6);
    });

    it('never moves the cursor backwards', async () => {
        mockTail.mockResolvedValueOnce(ok(10)).mockResolvedValueOnce(ok(3));
        const tail = new ConversationTail();

        await tail.Tail(DETAIL);
        await tail.Tail(DETAIL);

        expect(tail.CursorFor(DETAIL)).toBe(10);
    });

    it('keeps cursors independent per message', async () => {
        mockTail.mockResolvedValueOnce(ok(5)).mockResolvedValueOnce(ok(2));
        const tail = new ConversationTail();

        await tail.Tail(DETAIL);
        await tail.Tail(OTHER);

        expect(tail.CursorFor(DETAIL)).toBe(5);
        expect(tail.CursorFor(OTHER)).toBe(2);
    });

    it('forgets one message without disturbing the others', async () => {
        mockTail.mockResolvedValueOnce(ok(5)).mockResolvedValueOnce(ok(2));
        const tail = new ConversationTail();
        await tail.Tail(DETAIL);
        await tail.Tail(OTHER);

        tail.Forget(DETAIL);

        expect(tail.CursorFor(DETAIL)).toBe(0);
        expect(tail.CursorFor(OTHER)).toBe(2);
    });

    it('clears every cursor on reset', async () => {
        mockTail.mockResolvedValue(ok(5));
        const tail = new ConversationTail();
        await tail.Tail(DETAIL);
        await tail.Tail(OTHER);

        tail.Reset();

        expect(tail.CursorFor(DETAIL)).toBe(0);
        expect(tail.CursorFor(OTHER)).toBe(0);
    });
});
