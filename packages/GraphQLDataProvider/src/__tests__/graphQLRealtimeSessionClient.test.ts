/**
 * Tests for the realtime-session transport client.
 *
 * What matters here, in order:
 * 1. the request/response methods NEVER throw and never write the email address or code to a log,
 * 2. the subscription hands callers only validated, typed events (and survives a newer server),
 * 3. the exact GraphQL operations and variable names match the server's resolvers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Observable, Subject, of, throwError } from 'rxjs';
import { LogError } from '@memberjunction/core';
import {
    GraphQLRealtimeSessionClient,
    IsKnownRealtimeSessionVerificationErrorCode,
} from '../graphQLRealtimeSessionClient';
import type { GraphQLDataProvider } from '../graphQLDataProvider';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn() };
});

const SESSION_ID = 'BBBBBBBB-0000-4000-8000-000000000001';
const SECRET_EMAIL = 'pat.secret@mj-example-test.com';
const SECRET_CODE = '482913';

const VERIFIED_PAYLOAD = { VerifiedEmail: 'pat@acme.com', VerifiedName: 'Pat', VerifiedAt: '2026-10-02T12:00:00.000Z', Method: 'code' };

interface Harness {
    client: GraphQLRealtimeSessionClient;
    execute: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
}

function harness(opts: { execute?: (doc: string, vars: Record<string, unknown>) => Promise<unknown>; subscribe?: (doc: string, vars: Record<string, unknown>) => Observable<unknown> } = {}): Harness {
    const execute = vi.fn(opts.execute ?? (async () => ({})));
    const subscribe = vi.fn(opts.subscribe ?? (() => of()));
    const provider = { ExecuteGQL: execute, Subscribe: subscribe } as unknown as GraphQLDataProvider;
    return { client: new GraphQLRealtimeSessionClient(provider), execute, subscribe };
}

/** Everything every LogError call was given, flattened — to prove sensitive input never reaches a log. */
function loggedText(): string {
    return JSON.stringify(vi.mocked(LogError).mock.calls.map((call) => call.map((arg) => (arg instanceof Error ? arg.message : arg))));
}

beforeEach(() => {
    vi.mocked(LogError).mockClear();
});

describe('GraphQLRealtimeSessionClient — request/response operations', () => {
    it('RequestVerification sends the documented mutation with the documented variables and returns a typed result', async () => {
        const h = harness({
            execute: async () => ({
                RequestRealtimeSessionVerification: {
                    Success: true, VerificationState: 'pending', ErrorCode: null, Message: null,
                    ExpiresAt: '2026-10-02T12:30:00.000Z', SendsRemaining: 2, AttemptsRemaining: null, RetryAfterSeconds: null,
                    VerifiedEmail: null, VerifiedAt: null, MaxSessionDeadlineIso: null,
                },
            }),
        });
        const result = await h.client.RequestVerification({ AgentSessionID: SESSION_ID, Name: 'Pat', Email: SECRET_EMAIL });

        const [document, variables] = h.execute.mock.calls[0];
        expect(document).toContain('mutation RequestRealtimeSessionVerification');
        expect(document).toContain('RequestRealtimeSessionVerification(agentSessionId: $agentSessionId, name: $name, email: $email)');
        expect(variables).toEqual({ agentSessionId: SESSION_ID, name: 'Pat', email: SECRET_EMAIL });
        expect(result).toEqual({ Success: true, VerificationState: 'pending', ExpiresAt: '2026-10-02T12:30:00.000Z', SendsRemaining: 2 });
        // null → absent, so callers can use `=== undefined` / optional chaining.
        expect('ErrorCode' in result).toBe(false);
    });

    it('SubmitVerificationCode sends the code mutation and carries a verified result through', async () => {
        const h = harness({
            execute: async () => ({
                SubmitRealtimeSessionVerificationCode: {
                    Success: true, VerificationState: 'verified', VerifiedEmail: 'pat@acme.com', VerifiedAt: '2026-10-02T12:01:00.000Z',
                    MaxSessionDeadlineIso: '2026-10-02T13:00:00.000Z',
                },
            }),
        });
        const result = await h.client.SubmitVerificationCode({ AgentSessionID: SESSION_ID, Code: SECRET_CODE });

        const [document, variables] = h.execute.mock.calls[0];
        expect(document).toContain('mutation SubmitRealtimeSessionVerificationCode');
        expect(variables).toEqual({ agentSessionId: SESSION_ID, code: SECRET_CODE });
        expect(result).toMatchObject({ Success: true, VerificationState: 'verified', VerifiedEmail: 'pat@acme.com', MaxSessionDeadlineIso: '2026-10-02T13:00:00.000Z' });
    });

    it('GetVerificationStatus sends the status QUERY with the session id', async () => {
        const h = harness({ execute: async () => ({ RealtimeSessionVerificationStatus: { Success: true, VerificationState: 'unverified' } }) });
        const result = await h.client.GetVerificationStatus(SESSION_ID);

        const [document, variables] = h.execute.mock.calls[0];
        expect(document).toContain('query RealtimeSessionVerificationStatus');
        expect(variables).toEqual({ agentSessionId: SESSION_ID });
        expect(result).toEqual({ Success: true, VerificationState: 'unverified' });
    });

    it('selects the same fields in all three operations (they cannot drift)', async () => {
        const h = harness({ execute: async () => ({ RealtimeSessionVerificationStatus: { Success: true, VerificationState: 'unverified' } }) });
        await h.client.RequestVerification({ AgentSessionID: SESSION_ID, Name: 'a', Email: 'b' });
        await h.client.SubmitVerificationCode({ AgentSessionID: SESSION_ID, Code: '1' });
        await h.client.GetVerificationStatus(SESSION_ID);
        const selections = h.execute.mock.calls.map(([doc]) => (doc as string).match(/\{([^{}]*)\}\s*\}\s*$/)?.[1].replace(/\s+/g, ' ').trim());
        expect(new Set(selections).size).toBe(1);
        expect(selections[0]).toContain('MaxSessionDeadlineIso');
    });

    it('passes server refusals through with their machine-readable code intact', async () => {
        const h = harness({
            execute: async () => ({
                RequestRealtimeSessionVerification: { Success: false, VerificationState: 'unverified', ErrorCode: 'consumer_domain', Message: 'Please use a business address.' },
            }),
        });
        const result = await h.client.RequestVerification({ AgentSessionID: SESSION_ID, Name: 'Pat', Email: 'pat@gmail.com' });
        expect(result).toEqual({ Success: false, VerificationState: 'unverified', ErrorCode: 'consumer_domain', Message: 'Please use a business address.' });
        expect(IsKnownRealtimeSessionVerificationErrorCode(result.ErrorCode)).toBe(true);
    });

    it('treats an unrecognised verification state as unverified rather than trusting it', async () => {
        const h = harness({ execute: async () => ({ RealtimeSessionVerificationStatus: { Success: true, VerificationState: 'superverified' } }) });
        expect((await h.client.GetVerificationStatus(SESSION_ID)).VerificationState).toBe('unverified');
    });

    it('never throws: a transport error becomes a transport_error result', async () => {
        const h = harness({ execute: async () => { throw new Error('socket hang up'); } });
        for (const result of [
            await h.client.RequestVerification({ AgentSessionID: SESSION_ID, Name: 'Pat', Email: SECRET_EMAIL }),
            await h.client.SubmitVerificationCode({ AgentSessionID: SESSION_ID, Code: SECRET_CODE }),
            await h.client.GetVerificationStatus(SESSION_ID),
        ]) {
            expect(result).toMatchObject({ Success: false, VerificationState: 'unverified', ErrorCode: 'transport_error' });
            expect(IsKnownRealtimeSessionVerificationErrorCode(result.ErrorCode)).toBe(true);
        }
    });

    it('treats an empty response as a failure, not a success', async () => {
        const h = harness({ execute: async () => ({}) });
        expect(await h.client.GetVerificationStatus(SESSION_ID)).toMatchObject({ Success: false, ErrorCode: 'transport_error' });
    });

    it('never writes the email address or the code to a log, even when a call fails', async () => {
        const h = harness({ execute: async () => { throw new Error('boom'); } });
        await h.client.RequestVerification({ AgentSessionID: SESSION_ID, Name: 'Pat', Email: SECRET_EMAIL });
        await h.client.SubmitVerificationCode({ AgentSessionID: SESSION_ID, Code: SECRET_CODE });
        expect(vi.mocked(LogError)).toHaveBeenCalledTimes(2);
        expect(loggedText()).not.toContain(SECRET_EMAIL);
        expect(loggedText()).not.toContain(SECRET_CODE);
    });
});

describe('GraphQLRealtimeSessionClient.SubscribeToSessionEvents', () => {
    const wire = (overrides: Record<string, unknown> = {}) => ({
        RealtimeSessionEvents: {
            Type: 'identity.verified',
            AgentSessionID: SESSION_ID,
            OccurredAt: '2026-10-02T12:01:00.000Z',
            PayloadJson: JSON.stringify(VERIFIED_PAYLOAD),
            ...overrides,
        },
    });

    it('subscribes with the documented operation and variables', () => {
        const h = harness({ subscribe: () => new Subject<unknown>() });
        h.client.SubscribeToSessionEvents(SESSION_ID).subscribe();
        const [document, variables] = h.subscribe.mock.calls[0];
        expect(document).toContain('subscription RealtimeSessionEvents');
        expect(document).toContain('RealtimeSessionEvents(agentSessionId: $agentSessionId)');
        expect(document).toContain('PayloadJson');
        expect(variables).toEqual({ agentSessionId: SESSION_ID });
    });

    it('is lazy: nothing is subscribed until the caller subscribes', () => {
        const h = harness({ subscribe: () => new Subject<unknown>() });
        const observable = h.client.SubscribeToSessionEvents(SESSION_ID);
        expect(h.subscribe).toHaveBeenCalledTimes(1); // the provider's cold observable is created…
        const inner = h.subscribe.mock.results[0].value as Subject<unknown>;
        expect(inner.observed).toBe(false); // …but nothing is attached to the socket yet
        const sub = observable.subscribe();
        expect(inner.observed).toBe(true);
        sub.unsubscribe();
        expect(inner.observed).toBe(false); // teardown reaches the provider
    });

    it('parses PayloadJson into a typed event', async () => {
        const h = harness({ subscribe: () => of(wire()) });
        const events: unknown[] = [];
        h.client.SubscribeToSessionEvents(SESSION_ID).subscribe((e) => events.push(e));
        expect(events).toEqual([{ Type: 'identity.verified', AgentSessionID: SESSION_ID, OccurredAt: '2026-10-02T12:01:00.000Z', Payload: VERIFIED_PAYLOAD }]);
    });

    it('drops (and logs) a malformed payload and a payload that fails its type guard — never a half-trusted event', () => {
        const subject = new Subject<unknown>();
        const h = harness({ subscribe: () => subject });
        const events: unknown[] = [];
        h.client.SubscribeToSessionEvents(SESSION_ID).subscribe((e) => events.push(e));
        subject.next(wire({ PayloadJson: '{not json' }));
        subject.next(wire({ PayloadJson: JSON.stringify({ VerifiedEmail: 5 }) }));
        subject.next({ RealtimeSessionEvents: null });
        subject.next(wire());
        expect(events).toHaveLength(1);
        expect(vi.mocked(LogError)).toHaveBeenCalledTimes(2);
    });

    it('delivers an event type it does not know as an unknown event, so a newer server never breaks it', () => {
        const h = harness({ subscribe: () => of(wire({ Type: 'future.thing', PayloadJson: JSON.stringify({ x: 1 }) })) });
        const events: Array<{ Type: string }> = [];
        h.client.SubscribeToSessionEvents(SESSION_ID).subscribe((e) => events.push(e));
        expect(events).toEqual([{ Type: 'future.thing', AgentSessionID: SESSION_ID, OccurredAt: '2026-10-02T12:01:00.000Z', Payload: { x: 1 } }]);
    });

    it('SubscribeToSessionEventsOfType narrows to one type with a typed payload', () => {
        const subject = new Subject<unknown>();
        const h = harness({ subscribe: () => subject });
        const verified: string[] = [];
        h.client.SubscribeToSessionEventsOfType(SESSION_ID, 'identity.verified').subscribe((e) => verified.push(e.Payload.VerifiedEmail));
        subject.next(wire({ Type: 'future.thing', PayloadJson: '{}' }));
        subject.next(wire());
        expect(verified).toEqual(['pat@acme.com']);
    });

    it('propagates a server refusal as an error on the observable (the subscription, not the socket, fails)', () => {
        const h = harness({ subscribe: () => throwError(() => new Error('Realtime session not found.')) });
        const errors: string[] = [];
        h.client.SubscribeToSessionEvents(SESSION_ID).subscribe({ error: (e: Error) => errors.push(e.message) });
        expect(errors).toEqual(['Realtime session not found.']);
    });

    it('completes when the provider completes (token-refresh recycle), so a consumer can re-subscribe', () => {
        const subject = new Subject<unknown>();
        const h = harness({ subscribe: () => subject });
        let completed = false;
        h.client.SubscribeToSessionEvents(SESSION_ID).subscribe({ complete: () => (completed = true) });
        subject.complete();
        expect(completed).toBe(true);
    });
});
