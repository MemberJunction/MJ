/**
 * A PARTIAL enumeration must not carry deactivation authority.
 *
 * `IntrospectSchema` decides `IsAuthoritative` before a single describe runs — it means "every object
 * the credentials expose is in this list". But an object whose `DiscoverFields` throws is SKIPPED and
 * never reaches `result.Objects`, and the causes are routinely transient: a throttle, a read timeout,
 * a momentary permission blip.
 *
 * Downstream, `decideAbsentDeactivations` deactivates every ACTIVE object missing from an
 * authoritative refresh, because absence is supposed to prove the source dropped it. Leaving the flag
 * true after skips turns a transient describe failure into a silent DEACTIVATION of a live entity map
 * — the sync stops for that object and the run stays green.
 *
 * Everything discovered is still returned and still upserted; only the authority to deactivate on
 * absence is withdrawn, because that is the one action a later healthy refresh cannot undo.
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
import { decideAbsentDeactivations } from '../IntegrationSchemaSync';

const CI = { ID: 'ci-1', IntegrationID: 'int-1' } as unknown as MJCompanyIntegrationEntity;
const USER = {} as UserInfo;

/** Affirms authoritative discovery (a connector that really does list everything), and can fail
 *  DiscoverFields for named objects to simulate a throttle / timeout / permission blip. */
class AuthoritativeConnector extends BaseIntegrationConnector {
    public FailFor = new Set<string>();
    public ObjectNames = ['Alpha', 'Bravo', 'Charlie'];

    public get IntegrationName(): string { return 'Test'; }
    public override get DiscoveryIsAuthoritative(): boolean { return true; }

    public async TestConnection(): Promise<ConnectionTestResult> { return { Success: true }; }
    public async FetchChanges(_ctx: FetchContext): Promise<FetchBatchResult> {
        return { Records: [], HasMore: false };
    }
    public async DiscoverObjects(): Promise<ExternalObjectSchema[]> {
        return this.ObjectNames.map(Name => ({ Name, Label: Name, Fields: [] })) as ExternalObjectSchema[];
    }
    public async DiscoverFields(
        _ci: MJCompanyIntegrationEntity, objectName: string,
    ): Promise<ExternalFieldSchema[]> {
        if (this.FailFor.has(objectName)) {
            throw new Error(`HTTP 429 throttled while describing ${objectName}`);
        }
        return [{ Name: 'Id', Label: 'Id', Type: 'string', IsPrimaryKey: true }] as ExternalFieldSchema[];
    }
}

describe('IntrospectSchema authority after a partial enumeration', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('stays authoritative when every object describes cleanly', async () => {
        const c = new AuthoritativeConnector();
        const info = await c.IntrospectSchema(CI, USER);
        expect(info.Objects.map(o => o.ExternalName).sort()).toEqual(['Alpha', 'Bravo', 'Charlie']);
        expect(info.IsAuthoritative).toBe(true);
    });

    it('WITHDRAWS authority when any object is skipped', async () => {
        const c = new AuthoritativeConnector();
        c.FailFor.add('Bravo');
        const info = await c.IntrospectSchema(CI, USER);

        // The skipped object is genuinely absent from the result — that part is unchanged.
        expect(info.Objects.map(o => o.ExternalName).sort()).toEqual(['Alpha', 'Charlie']);
        // ...which is exactly why the result must no longer be allowed to deactivate on absence.
        expect(info.IsAuthoritative).toBe(false);
    });

    it('still returns everything that DID describe — discovery is not abandoned', async () => {
        const c = new AuthoritativeConnector();
        c.FailFor.add('Alpha');
        const info = await c.IntrospectSchema(CI, USER);
        expect(info.Objects).toHaveLength(2);
        expect(info.Objects.every(o => o.Fields.length > 0)).toBe(true);
    });

    it('says so loudly rather than silently downgrading', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const c = new AuthoritativeConnector();
        c.FailFor.add('Charlie');
        await c.IntrospectSchema(CI, USER);
        const said = warn.mock.calls.map(a => String(a[0])).join('\n');
        expect(said).toContain('NON-authoritative');
        expect(said).toContain('not deactivated');
    });

    it('end-to-end: the skipped object is NOT deactivated', async () => {
        const c = new AuthoritativeConnector();
        c.FailFor.add('Bravo');
        const info = await c.IntrospectSchema(CI, USER);

        // Feed the real decision function the way IntegrationSchemaSync does.
        const out = decideAbsentDeactivations({
            DeactivateAbsent: true,
            IsAuthoritative: info.IsAuthoritative,
            DiscoveredObjectNames: info.Objects.map(o => o.ExternalName),
            DiscoveredFieldNamesByObject: {},
            ActiveObjects: [
                { ID: 'o-alpha', Name: 'Alpha' },
                { ID: 'o-bravo', Name: 'Bravo' },
                { ID: 'o-charlie', Name: 'Charlie' },
            ],
            ActiveFieldsByObjectID: {},
            ObjectIDByName: { Alpha: 'o-alpha', Bravo: 'o-bravo', Charlie: 'o-charlie' },
        });

        // Before this fix: Bravo was absent from an "authoritative" list, so it was deactivated —
        // a live entity map turned off by a transient 429, behind a green run.
        expect(out.ObjectIDsToDeactivate).toEqual([]);
    });

    it('a clean authoritative refresh still deactivates a genuinely dropped object', async () => {
        // The guard must not disable deactivation altogether — that would trade one silent failure
        // for another (stale objects accumulating forever).
        const c = new AuthoritativeConnector();
        c.ObjectNames = ['Alpha', 'Charlie'];
        const info = await c.IntrospectSchema(CI, USER);
        expect(info.IsAuthoritative).toBe(true);

        const out = decideAbsentDeactivations({
            DeactivateAbsent: true,
            IsAuthoritative: info.IsAuthoritative,
            DiscoveredObjectNames: info.Objects.map(o => o.ExternalName),
            DiscoveredFieldNamesByObject: {},
            ActiveObjects: [
                { ID: 'o-alpha', Name: 'Alpha' },
                { ID: 'o-bravo', Name: 'Bravo' },
                { ID: 'o-charlie', Name: 'Charlie' },
            ],
            ActiveFieldsByObjectID: {},
            ObjectIDByName: { Alpha: 'o-alpha', Bravo: 'o-bravo', Charlie: 'o-charlie' },
        });
        expect(out.ObjectIDsToDeactivate).toEqual(['o-bravo']);
    });
});
