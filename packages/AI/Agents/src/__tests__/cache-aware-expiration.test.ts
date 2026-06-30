/**
 * Integration tests for the cache-aware message expiration guard in BaseAgent
 * (pruneAndCompactExpiredMessages + IsVolatileResultMessage).
 *
 * Following this package's standalone-mirror convention (see prompt-formatting.test.ts),
 * the prune guard is mirrored here but exercises the REAL @memberjunction/context-crush
 * PartitionStablePrefix primitive, so the cache-stability behavior is genuine.
 *
 * token optimization via @memberjunction/context-crush (CacheAligner-inspired)
 */
import { describe, it, expect } from 'vitest';
import { PartitionStablePrefix } from '@memberjunction/context-crush';

interface Meta {
    messageType?: string;
    expirationTurns?: number;
    expirationMode?: 'None' | 'Remove' | 'Compact';
    turnAdded?: number;
}
interface Msg {
    role: string;
    content: string;
    metadata?: Meta;
}

const VOLATILE_RESULT_TYPES = new Set([
    'action-result',
    'tool-result',
    'client-tool-result',
    'sub-agent-result',
    'loop-result',
]);

/** Mirror of BaseAgent.IsVolatileResultMessage. */
const isVolatileResult = (m: Msg): boolean =>
    m.metadata?.messageType !== undefined && VOLATILE_RESULT_TYPES.has(m.metadata.messageType);

/** Mirror of the cache-aware prune in BaseAgent.pruneAndCompactExpiredMessages (Remove path). */
function pruneVolatileTail(messages: Msg[], currentTurn: number): { deferred: number[]; removed: number[] } {
    const { Boundary } = PartitionStablePrefix(messages, (m) => !isVolatileResult(m));
    const toRemove: number[] = [];
    const deferred: number[] = [];

    for (let i = 0; i < messages.length; i++) {
        const meta = messages[i].metadata;
        if (meta?.expirationTurns == null) {
            continue;
        }
        if (meta.expirationMode === 'None') {
            continue;
        }
        const turnsAlive = currentTurn - (meta.turnAdded ?? 0);
        if (turnsAlive > meta.expirationTurns) {
            if (i < Boundary) {
                deferred.push(i);
                continue;
            }
            if (meta.expirationMode === 'Remove') {
                toRemove.push(i);
            }
        }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
        messages.splice(toRemove[i], 1);
    }
    return { deferred, removed: toRemove };
}

function anchor(id: number): Msg {
    return { role: 'user', content: `anchor-${id}`, metadata: { turnAdded: 0 } };
}
function expiredResult(id: number): Msg {
    return {
        role: 'user',
        content: `result-${id}`,
        metadata: { messageType: 'action-result', turnAdded: 0, expirationTurns: 1, expirationMode: 'Remove' },
    };
}
function freshResult(id: number): Msg {
    return {
        role: 'user',
        content: `result-${id}`,
        metadata: { messageType: 'action-result', turnAdded: 9, expirationTurns: 1, expirationMode: 'Remove' },
    };
}

describe('cache-aware message expiration', () => {
    it('keeps the stable prefix byte-identical across a prune cycle', () => {
        const messages: Msg[] = [anchor(0), anchor(1), expiredResult(2), freshResult(3)];
        const { Boundary } = PartitionStablePrefix(messages, (m) => !isVolatileResult(m));
        const prefixBefore = JSON.stringify(messages.slice(0, Boundary));

        pruneVolatileTail(messages, 5);

        const prefixAfter = JSON.stringify(messages.slice(0, Boundary));
        expect(prefixAfter).toBe(prefixBefore);
        expect(messages.slice(0, 2).map((m) => m.content)).toEqual(['anchor-0', 'anchor-1']);
    });

    it('still expires volatile-tail messages', () => {
        const messages: Msg[] = [anchor(0), expiredResult(1), freshResult(2)];
        const { removed } = pruneVolatileTail(messages, 5);
        expect(removed.length).toBe(1);
        expect(messages.map((m) => m.content)).toEqual(['anchor-0', 'result-2']);
    });

    it('defers expiry of an expirable message that sits inside the protected prefix', () => {
        // An injected context message (no result messageType) carrying expiration metadata,
        // positioned before the first volatile result — it anchors the cache prefix.
        const protectedContext: Msg = {
            role: 'user',
            content: 'injected-context',
            metadata: { turnAdded: 0, expirationTurns: 1, expirationMode: 'Remove' },
        };
        const messages: Msg[] = [anchor(0), protectedContext, expiredResult(2)];
        const { deferred, removed } = pruneVolatileTail(messages, 5);

        expect(deferred).toContain(1); // protectedContext deferred
        expect(messages.some((m) => m.content === 'injected-context')).toBe(true);
        expect(removed.length).toBe(1); // the volatile result was still removed
        expect(messages.some((m) => m.content === 'result-2')).toBe(false);
    });

    it('prunes nothing when the conversation is all anchors', () => {
        const messages: Msg[] = [anchor(0), anchor(1)];
        const before = JSON.stringify(messages);
        const { removed, deferred } = pruneVolatileTail(messages, 100);
        expect(removed).toHaveLength(0);
        expect(deferred).toHaveLength(0);
        expect(JSON.stringify(messages)).toBe(before);
    });

    it('treats a conversation that starts with a volatile message as fully volatile', () => {
        const messages: Msg[] = [expiredResult(0), anchor(1)];
        const { Boundary } = PartitionStablePrefix(messages, (m) => !isVolatileResult(m));
        expect(Boundary).toBe(0);
        const { removed } = pruneVolatileTail(messages, 5);
        expect(removed.length).toBe(1);
    });
});
