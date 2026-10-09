/**
 * Unit tests for the per-modality usage {@link RealtimeClientSessionService.AccumulatePromptRunUsage} stores on the
 * co-agent prompt run: the relayed input and output blocks add into `ModelSpecificResponseDetails.RealtimeUsage`
 * beside every other key (pricing's `CostLines` included), an update carrying only avatar video seconds is stored, and
 * the stored output video seconds never exceed the run's elapsed time plus 30 seconds.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as coreModule from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { RealtimeClientSessionService } from '../realtime/realtime-client-session-service';

const contextUser = { ID: 'user-1', Email: 'u@example.com' } as unknown as UserInfo;

/** The prompt run fields the usage write reads and writes, backed by one stored row so each write loads the last. */
interface StoredRun {
    TokensPrompt: number | null;
    TokensCompletion: number | null;
    TokensUsed: number | null;
    RunAt: Date;
    ModelSpecificResponseDetails: string | null;
    Messages: string | null;
}

function makeStoredRun(overrides: Partial<StoredRun> = {}): StoredRun {
    return { TokensPrompt: 0, TokensCompletion: 0, TokensUsed: 0, RunAt: new Date(), ModelSpecificResponseDetails: null, Messages: null, ...overrides };
}

/** A provider whose every `GetEntityObject` is a fresh entity that loads from and saves to `store`. */
function storeProvider(store: StoredRun): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async () => {
            const entity: Record<string, unknown> = {
                ID: 'pr-1',
                LatestResult: { CompleteMessage: '' },
                Load: async () => {
                    Object.assign(entity, store);
                    return true;
                },
                Save: async () => {
                    for (const key of Object.keys(store) as Array<keyof StoredRun>) {
                        (store as unknown as Record<string, unknown>)[key] = entity[key];
                    }
                    return true;
                },
            };
            return entity;
        }),
    } as unknown as IMetadataProvider;
}

function storedDetails(store: StoredRun): Record<string, unknown> {
    return JSON.parse(store.ModelSpecificResponseDetails ?? '{}') as Record<string, unknown>;
}

describe('RealtimeClientSessionService.AccumulatePromptRunUsage: per-modality details', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('adds the relayed blocks into the usage record, and the tokens into the columns', async () => {
        const store = makeStoredRun();
        const svc = new RealtimeClientSessionService();
        const provider = storeProvider(store);

        await svc.AccumulatePromptRunUsage('pr-1', 100, 6292, contextUser, provider, {
            Input: { TextTokens: 60, AudioTokens: 40 },
            Output: { AudioTokens: 100, VideoTokens: 6192 },
        });
        const ok = await svc.AccumulatePromptRunUsage('pr-1', 0, 0, contextUser, provider, { Output: { VideoSeconds: 1.5 } });

        expect(ok).toBe(true);
        expect(store.TokensPrompt).toBe(100);
        expect(store.TokensCompletion).toBe(6292);
        expect(storedDetails(store)).toEqual({
            RealtimeUsage: { Input: { TextTokens: 60, AudioTokens: 40 }, Output: { AudioTokens: 100, VideoTokens: 6192, VideoSeconds: 1.5 } },
        });
    });

    it('keeps CostLines and every other key a late relay finds in the details', async () => {
        const store = makeStoredRun({
            ModelSpecificResponseDetails: JSON.stringify({ RealtimeUsage: { Output: { VideoSeconds: 10 } }, CostLines: [{ Modality: null, Cost: 0.1 }], Other: 'kept' }),
        });
        await new RealtimeClientSessionService().AccumulatePromptRunUsage('pr-1', 0, 0, contextUser, storeProvider(store), { Output: { VideoSeconds: 2 } });

        expect(storedDetails(store)).toEqual({
            RealtimeUsage: { Output: { VideoSeconds: 12 } },
            CostLines: [{ Modality: null, Cost: 0.1 }],
            Other: 'kept',
        });
    });

    it("caps the stored output video seconds at the run's elapsed time plus 30 s, and logs it", async () => {
        const logStatus = vi.spyOn(coreModule, 'LogStatus').mockImplementation(() => undefined);
        const store = makeStoredRun({ RunAt: new Date(Date.now() - 60_000) });
        await new RealtimeClientSessionService().AccumulatePromptRunUsage('pr-1', 0, 0, contextUser, storeProvider(store), { Output: { VideoSeconds: 500 } });

        const seconds = (storedDetails(store)['RealtimeUsage'] as { Output: { VideoSeconds: number } }).Output.VideoSeconds;
        expect(seconds).toBeGreaterThanOrEqual(90);
        expect(seconds).toBeLessThan(91);
        expect(logStatus.mock.calls.filter((call) => String(call[0]).includes('stored seconds are capped'))).toHaveLength(1);
    });

    it('leaves seconds within the elapsed time alone', async () => {
        const store = makeStoredRun({ RunAt: new Date(Date.now() - 60_000) });
        await new RealtimeClientSessionService().AccumulatePromptRunUsage('pr-1', 0, 0, contextUser, storeProvider(store), { Output: { VideoSeconds: 59.5 } });

        expect(storedDetails(store)).toEqual({ RealtimeUsage: { Output: { VideoSeconds: 59.5 } } });
    });

    it('leaves the details untouched for a token-only relay', async () => {
        const store = makeStoredRun({ ModelSpecificResponseDetails: '{"Other":1}' });
        await new RealtimeClientSessionService().AccumulatePromptRunUsage('pr-1', 5, 3, contextUser, storeProvider(store));

        expect(store.ModelSpecificResponseDetails).toBe('{"Other":1}');
        expect(store.TokensUsed).toBe(8);
    });

    it('never overwrites details that are not a JSON object, and still stores the tokens', async () => {
        vi.spyOn(coreModule, 'LogError').mockImplementation(() => undefined);
        const store = makeStoredRun({ ModelSpecificResponseDetails: 'plain text' });
        const ok = await new RealtimeClientSessionService().AccumulatePromptRunUsage('pr-1', 5, 3, contextUser, storeProvider(store), { Output: { VideoSeconds: 2 } });

        expect(ok).toBe(true);
        expect(store.ModelSpecificResponseDetails).toBe('plain text');
        expect(store.TokensPrompt).toBe(5);
    });

    it('serializes with transcript appends: neither the details nor the messages are lost', async () => {
        const store = makeStoredRun();
        const provider = storeProvider(store);
        const svc = new RealtimeClientSessionService();
        const writes: Array<Promise<boolean>> = [];
        for (let i = 0; i < 6; i++) {
            writes.push(svc.AppendPromptRunMessage('pr-1', 'user', `turn ${i}`, false, contextUser, provider));
            writes.push(svc.AccumulatePromptRunUsage('pr-1', 10, 1, contextUser, provider, { Output: { VideoSeconds: 0.5 } }));
        }
        await Promise.all(writes);

        expect(JSON.parse(store.Messages ?? '[]')).toHaveLength(6);
        expect(storedDetails(store)).toEqual({ RealtimeUsage: { Output: { VideoSeconds: 3 } } });
        expect(store.TokensPrompt).toBe(60);
    });
});
