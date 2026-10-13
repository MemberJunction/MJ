/**
 * Discovery has to notice a 429 for a connector that wrote no rate-limit code.
 *
 * `IntrospectSchema` fans describes out to 8 concurrent by default and feeds each outcome to an
 * AIMD controller, which cuts the in-flight cap when an item reports `throttled`. That is the
 * mechanism that makes a discovery survive a vendor's rate limit instead of driving into it.
 *
 * It asked exactly one question to decide `throttled`: whether `ExtractRetryAfterMs` returned a
 * value. The base implementation returned `undefined` unconditionally and NO connector in the repo
 * overrode it — so the answer was "not a throttle" for every 429 MJ ever received, and the fan-out
 * stayed at 8 straight through. More describes failed, the enumeration came back short, and it came
 * back short for a reason that was entirely transient.
 *
 * These pin both halves of the fix: the classifier fallback that makes throttles visible without
 * any connector effort, and the standard `Retry-After` default that makes the back-off precise
 * when the vendor stated a number.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type ConnectionTestResult,
} from '../BaseIntegrationConnector';

const CI = { ID: 'ci-1', IntegrationID: 'int-1', Configuration: null } as unknown as MJCompanyIntegrationEntity;
const USER = {} as UserInfo;

/** A connector that writes no rate-limit code at all — i.e. every connector in this repo. */
class PlainConnector extends BaseIntegrationConnector {
    public ThrowFor = new Map<string, Error>();
    public ObjectNames = ['Alpha', 'Bravo', 'Charlie'];

    public get IntegrationName(): string { return 'Test'; }

    public async TestConnection(): Promise<ConnectionTestResult> { return { Success: true, Message: 'ok' }; }
    public async FetchChanges(_ctx: FetchContext): Promise<FetchBatchResult> {
        return { Records: [], HasMore: false };
    }
    public async DiscoverObjects(): Promise<ExternalObjectSchema[]> {
        return this.ObjectNames.map(Name => ({
            Name, Label: Name, SupportsIncrementalSync: false, SupportsWrite: false,
        }));
    }
    public async DiscoverFields(
        _ci: MJCompanyIntegrationEntity, objectName: string,
    ): Promise<ExternalFieldSchema[]> {
        const err = this.ThrowFor.get(objectName);
        if (err) throw err;
        return [{
            Name: 'Id', Label: 'Id', DataType: 'string',
            IsRequired: true, IsUniqueKey: true, IsReadOnly: true, IsPrimaryKey: true,
        }];
    }
}

/** Captures the structured events IntrospectSchema logs, so the assertions read real output. */
function captureEvents(): { events: Record<string, unknown>[]; restore: () => void } {
    const events: Record<string, unknown>[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        const first = args[0];
        if (typeof first !== 'string') return;
        try {
            const parsed = JSON.parse(first) as Record<string, unknown>;
            if (typeof parsed.event === 'string') events.push(parsed);
        } catch { /* not one of ours */ }
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    return { events, restore: () => { log.mockRestore(); warn.mockRestore(); } };
}

describe('discovery throttle recognition', () => {
    let cap: ReturnType<typeof captureEvents>;

    beforeEach(() => { cap = captureEvents(); });
    afterEach(() => { cap.restore(); vi.restoreAllMocks(); });

    it('recognises a 429 from the error TEXT, with no connector support whatsoever', () => {
        // Before the fix this object was skipped as an ordinary describe failure and the fan-out
        // never backed off.
        const c = new PlainConnector();
        c.ThrowFor.set('Bravo', new Error('Request failed with status code 429'));

        return c.IntrospectSchema(CI, USER).then(() => {
            const throttles = cap.events.filter(e => e.event === 'introspect.object.throttled');
            expect(throttles.length).toBe(1);
            expect(throttles[0].objectName).toBe('Bravo');
            expect(throttles[0].source).toBe('classifier');
        });
    });

    it('recognises the other phrasings a vendor uses', async () => {
        for (const message of ['Rate limit exceeded', 'You are being throttled', 'HTTP 429 Too Many Requests']) {
            cap.restore();
            cap = captureEvents();
            const c = new PlainConnector();
            c.ThrowFor.set('Alpha', new Error(message));

            await c.IntrospectSchema(CI, USER);

            expect(
                cap.events.some(e => e.event === 'introspect.object.throttled'),
                `"${message}" should read as a throttle`,
            ).toBe(true);
        }
    });

    it('does NOT treat an ordinary describe failure as a throttle', () => {
        // The distinction is the whole point — cutting concurrency on every error would make a
        // permission problem look like a rate limit and slow the discovery down for nothing.
        const c = new PlainConnector();
        c.ThrowFor.set('Bravo', new Error('Object Bravo: insufficient privileges'));

        return c.IntrospectSchema(CI, USER).then(() => {
            expect(cap.events.some(e => e.event === 'introspect.object.throttled')).toBe(false);
            // ...but it IS still recorded as a skip.
            expect(cap.events.some(e => e.event === 'introspect.object.skipped')).toBe(true);
        });
    });

    it('prefers the connector’s parsed Retry-After over the classifier when both apply', async () => {
        // A connector that DOES parse the vendor's signal gives a precise number; the classifier is
        // the floor beneath it, not a replacement for it.
        class PreciseConnector extends PlainConnector {
            public override ExtractRetryAfterMs(_error: unknown): number | undefined { return 4_000; }
        }
        const c = new PreciseConnector();
        c.ThrowFor.set('Charlie', new Error('slow down please'));   // text the classifier would NOT match

        await c.IntrospectSchema(CI, USER);

        const throttles = cap.events.filter(e => e.event === 'introspect.object.throttled');
        expect(throttles.length).toBe(1);
        expect(throttles[0].source).toBe('connector');
        expect(throttles[0].retryAfterMs).toBe(4_000);
    });

    it('reads a standard Retry-After header with no connector override at all', async () => {
        // The base ExtractRetryAfterMs now parses RFC 9110's header, so an HTTP connector that
        // simply lets its client's error propagate gets a precise back-off for free.
        const c = new PlainConnector();
        const err = Object.assign(new Error('Request failed with status code 429'), {
            response: { status: 429, headers: { 'retry-after': '30' } },
        });
        c.ThrowFor.set('Alpha', err);

        await c.IntrospectSchema(CI, USER);

        const throttles = cap.events.filter(e => e.event === 'introspect.object.throttled');
        expect(throttles.length).toBe(1);
        expect(throttles[0].source).toBe('connector');
        expect(throttles[0].retryAfterMs).toBe(30_000);
    });

    it('still returns everything that DID describe — a throttle is not an abandoned discovery', async () => {
        const c = new PlainConnector();
        c.ThrowFor.set('Bravo', new Error('429 rate limit'));

        const info = await c.IntrospectSchema(CI, USER);

        expect(info.Objects.map(o => o.ExternalName).sort()).toEqual(['Alpha', 'Charlie']);
    });
});
