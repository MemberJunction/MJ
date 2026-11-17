/**
 * Two physical copies of this package in one process (a pnpm install can resolve one per
 * peer-dependency variant) must read each other's module-level bookkeeping: ClassFactory keeps the
 * first registered copy of a class, so the agent type reading a decision can come from another copy
 * than the runner that recorded it. Each copy is modelled by re-importing the module after
 * `vi.resetModules()`, which gives it fresh module state.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ChatResult } from '@memberjunction/ai';

async function loadCopy<T>(path: string): Promise<T> {
    vi.resetModules();
    return (await import(path)) as T;
}

describe('module-level bookkeeping shared by every copy of @memberjunction/ai-prompts', () => {
    it('a tool-calling decision recorded by one copy is read by another', async () => {
        type Gate = typeof import('../nativeToolCallingGate');
        const recorder = await loadCopy<Gate>('../nativeToolCallingGate');
        const reader = await loadCopy<Gate>('../nativeToolCallingGate');
        expect(reader).not.toBe(recorder);
        const result = {} as ChatResult;

        recorder.RecordToolCallingDecision(result, { useNativeTools: true, mode: 'NativeImplicit', controlFlow: 'implicit', toolResults: true });

        expect(reader.GetToolCallingDecision(result)?.toolResults).toBe(true);
    });

    it('a sent-prefix fingerprint recorded by one copy is read by another', async () => {
        type Prefix = typeof import('../replayedReasoningPrefix');
        const recorder = await loadCopy<Prefix>('../replayedReasoningPrefix');
        const reader = await loadCopy<Prefix>('../replayedReasoningPrefix');
        const result = {} as ChatResult;

        recorder.RecordSentPrefixFingerprint(result, 'prefix-A');

        expect(reader.GetSentPrefixFingerprint(result)).toBe('prefix-A');
    });
});
