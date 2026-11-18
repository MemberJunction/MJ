import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEntity, BaseEntityEvent } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { GraphQLDataProvider } from '../graphQLDataProvider.js';

describe('GraphQLDataProvider cache sequence tracking and delta catch-up', () => {
    let provider: GraphQLDataProvider;
    let requestMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        provider = new GraphQLDataProvider();
        provider.ResetCacheSequenceState();
        requestMock = vi.fn();
        (provider as unknown as { _client: { request: typeof requestMock } })._client = {
            request: requestMock,
        };
        (provider as unknown as { _sessionId: string })._sessionId = 'client-session-1';
    });

    it('adopts initial sequence and serverProcessId without triggering catch-up', () => {
        const catchUpSpy = vi.spyOn(provider, 'CatchUpCacheInvalidations');
        provider.ProcessServerCacheSequenceHeader(42, 'srv-proc-1');

        expect(provider.LastCacheInvalidationSequence).toBe(42);
        expect(provider.LastCacheServerProcessId).toBe('srv-proc-1');
        expect(catchUpSpy).not.toHaveBeenCalled();
    });

    it('resets baseline sequence when serverProcessId changes across restarts', () => {
        const catchUpSpy = vi.spyOn(provider, 'CatchUpCacheInvalidations');
        provider.ProcessServerCacheSequenceHeader(100, 'srv-proc-1');
        provider.ProcessServerCacheSequenceHeader(5, 'srv-proc-2');

        expect(provider.LastCacheServerProcessId).toBe('srv-proc-2');
        expect(provider.LastCacheInvalidationSequence).toBe(5);
        expect(catchUpSpy).not.toHaveBeenCalled();
    });

    it('triggers CatchUpCacheInvalidations and dispatches remote-invalidate events on sequence gap', async () => {
        provider.ProcessServerCacheSequenceHeader(10, 'srv-proc-1');

        requestMock.mockResolvedValueOnce({
            GetCacheInvalidationsSince: {
                RequiresFullRefresh: false,
                CurrentSequence: 12,
                ServerProcessID: 'srv-proc-1',
                Events: [
                    {
                        EntityName: 'AI Models',
                        PrimaryKeyValues: '[{"FieldName":"ID","Value":"m-1"}]',
                        Action: 'save',
                        SourceServerID: 'srv-proc-1',
                        Timestamp: '2026-10-20T00:00:00.000Z',
                        OriginSessionID: 'other-session',
                        RecordData: '{"ID":"m-1","Name":"Claude"}',
                        Sequence: 11,
                    },
                    {
                        EntityName: 'AI Prompts',
                        PrimaryKeyValues: '[{"FieldName":"ID","Value":"p-1"}]',
                        Action: 'save',
                        SourceServerID: 'srv-proc-1',
                        Timestamp: '2026-10-20T00:00:01.000Z',
                        OriginSessionID: 'client-session-1', // self-originated -> skipped
                        Sequence: 12,
                    },
                ],
            },
        });

        const receivedEvents: BaseEntityEvent[] = [];
        const sub = MJGlobal.Instance.GetEventListener(false).subscribe((ev) => {
            if (ev.event === MJEventType.ComponentEvent && ev.eventCode === BaseEntity.BaseEventCode) {
                receivedEvents.push(ev.args as BaseEntityEvent);
            }
        });

        try {
            const success = await provider.CatchUpCacheInvalidations(10);
            expect(success).toBe(true);
            expect(provider.LastCacheInvalidationSequence).toBe(12);
            expect(receivedEvents).toHaveLength(1);
            expect(receivedEvents[0].entityName).toBe('AI Models');
            expect(receivedEvents[0].type).toBe('remote-invalidate');
        } finally {
            sub.unsubscribe();
        }
    });

    it('returns false when the server ring buffer requires a full refresh', async () => {
        provider.ProcessServerCacheSequenceHeader(10, 'srv-proc-1');
        requestMock.mockResolvedValueOnce({
            GetCacheInvalidationsSince: {
                RequiresFullRefresh: true,
                CurrentSequence: 9000,
                ServerProcessID: 'srv-proc-1',
                Events: [],
            },
        });

        const success = await provider.CatchUpCacheInvalidations(10);
        expect(success).toBe(false);
        expect(provider.LastCacheInvalidationSequence).toBe(9000);
    });
});
