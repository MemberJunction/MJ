/**
 * Tests for RemoveAppEntityMetadata's app-owned Application cleanup.
 *
 * An Open App's metadata-sync migration registers an `Application` (with a fixed UUID) that
 * groups the app's entities via `ApplicationEntity`. Removal historically deleted the link
 * rows + the entities but left the `Application` orphaned, so a reinstall's migration
 * re-INSERTed the same fixed UUID and failed with a PK collision. The fix deletes an
 * Application *wholly owned* by the removed schema (every link points at one of its entities),
 * best-effort and AFTER the atomic metadata commit; an Application that also groups OTHER
 * apps' entities, or one that still has FK dependents, is left intact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const submitSpy = vi.fn(async () => true);
const sharedTg = { Submit: submitSpy };

// Valid UUID-shaped IDs (NormalizeUUID is real, not mocked).
const ENT_1 = '11111111-1111-1111-1111-111111111111';
const ENT_2 = '22222222-2222-2222-2222-222222222222';
const ENT_OTHER = '99999999-9999-9999-9999-999999999999'; // belongs to a DIFFERENT app
const APP_OWNED = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; // all links → this schema's entities
const APP_SHARED = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; // also links a different app's entity

let appsLoadFilter: string | undefined; // ExtraFilter used to load Applications for deletion
const deletedAppIds: string[] = [];

class FakeApp {
    ID: string;
    Name: string;
    LatestResult = { CompleteMessage: '' };
    constructor(id: string) { this.ID = id; this.Name = `name-${id}`; }
    async Delete() { deletedAppIds.push(this.ID); return true; }
}
class FakeDeletable {
    TransactionGroup: unknown = undefined;
    async Delete() { return true; }
}

function runView(params: { EntityName: string; ExtraFilter?: string; ResultType?: string }) {
    const { EntityName, ExtraFilter = '', ResultType } = params;
    if (EntityName === 'MJ: Entities') {
        return [{ ID: ENT_1 }, { ID: ENT_2 }].map((r) => Object.assign(new FakeDeletable(), r));
    }
    if (EntityName === 'MJ: Entity Fields') {
        return ResultType === 'entity_object' ? [] : [];
    }
    if (EntityName === 'MJ: Application Entities') {
        if (ResultType === 'entity_object') {
            // The delete pass (queued into the tg) — return a deletable link row.
            return [new FakeDeletable()];
        }
        // FindAppOwnedApplications read passes:
        if (ExtraFilter.includes('EntityID IN')) {
            // Candidates linked to our entities: both owned + shared.
            return [{ ApplicationID: APP_OWNED }, { ApplicationID: APP_SHARED }];
        }
        // ApplicationID IN (candidates): ALL links per candidate.
        return [
            { ApplicationID: APP_OWNED, EntityID: ENT_1 },
            { ApplicationID: APP_OWNED, EntityID: ENT_2 },
            { ApplicationID: APP_SHARED, EntityID: ENT_1 },
            { ApplicationID: APP_SHARED, EntityID: ENT_OTHER }, // not ours → shared NOT owned
        ];
    }
    if (EntityName === 'MJ: Applications') {
        appsLoadFilter = ExtraFilter;
        const apps: FakeApp[] = [];
        if (ExtraFilter.includes(APP_OWNED)) apps.push(new FakeApp(APP_OWNED));
        if (ExtraFilter.includes(APP_SHARED)) apps.push(new FakeApp(APP_SHARED));
        return apps;
    }
    return []; // permissions, settings, relationships, schema info
}

vi.mock('@memberjunction/core', () => ({
    Metadata: class { async CreateTransactionGroup() { return sharedTg; } },
    RunView: class { async RunView(params: { EntityName: string; ExtraFilter?: string; ResultType?: string }) { return { Success: true, Results: runView(params) }; } },
    BaseEntity: class {},
    DatabaseProviderBase: class {},
    CompositeKey: class {},
}));

import { RemoveAppEntityMetadata } from '../install/install-orchestrator.js';

const user = {} as never;

beforeEach(() => {
    vi.clearAllMocks();
    submitSpy.mockResolvedValue(true);
    deletedAppIds.length = 0;
    appsLoadFilter = undefined;
});

describe('RemoveAppEntityMetadata — app-owned Application cleanup', () => {
    it('deletes only the Application wholly owned by the schema; leaves a shared one', async () => {
        const result = await RemoveAppEntityMetadata('app_schema', user);

        expect(result.Success).toBe(true);
        // Only the wholly-owned Application is loaded for deletion — the shared one is excluded.
        expect(appsLoadFilter).toContain(APP_OWNED);
        expect(appsLoadFilter).not.toContain(APP_SHARED);
        expect(deletedAppIds).toEqual([APP_OWNED]);
    });

    it('does not fail the removal when the owned Application delete is rejected (FK dependents)', async () => {
        // Simulate a leftover dependent: the Application's Delete() returns false.
        const RunViewMock = (await import('@memberjunction/core')).RunView as unknown as {
            prototype: { RunView: (p: { EntityName: string; ExtraFilter?: string; ResultType?: string }) => Promise<{ Success: boolean; Results: unknown[] }> };
        };
        const spy = vi.spyOn(RunViewMock.prototype, 'RunView').mockImplementation(async (p) => {
            if (p.EntityName === 'MJ: Applications') {
                const app = new FakeApp(APP_OWNED);
                app.Delete = async () => false; // rejected (has dependents)
                return { Success: true, Results: [app] };
            }
            return { Success: true, Results: runView(p) };
        });

        const result = await RemoveAppEntityMetadata('app_schema', user);
        expect(result.Success).toBe(true); // best-effort — remove still succeeds
        spy.mockRestore();
    });
});
