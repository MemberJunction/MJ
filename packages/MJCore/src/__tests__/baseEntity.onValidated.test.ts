/**
 * Tests for EntitySaveOptions.OnValidated — the optimistic-UI hook that fires after all
 * pre-flight checks pass (Validate / ValidateAsync / PreSave hooks) but before the DB write.
 *
 * Uses the same mock-provider scaffolding as hooks.integration.test.ts so no database is
 * required. This file also doubles as the "deliberate Save failure" harness referenced in
 * guides/OPTIMISTIC_UI_SAVE_PATTERN.md: the mock provider's Save is a vi.fn whose resolved
 * value (or rejection) we control to exercise the success and rollback paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClearAllDataHooks } from '../generic/dataHooks';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderConfigDataBase } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { BaseEntity } from '../generic/baseEntity';
import { EntitySaveOptions } from '../generic/interfaces';

class TestEntity extends BaseEntity {}

const TEST_ROLE_ID = 'role-test-1';
const MOCK_METADATA = {
    Applications: [],
    Entities: [
        {
            ID: 'entity-customers', Name: 'Customers', SchemaName: 'dbo', BaseView: 'vwCustomers', BaseTable: 'Customers',
            IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
            EntityFields: [
                { ID: 'f-cust-1', EntityID: 'entity-customers', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: 'f-cust-2', EntityID: 'entity-customers', Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2 },
            ],
            EntityPermissions: [
                { EntityID: 'entity-customers', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            ],
        },
    ],
    get EntityFields() { return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityFields'] as unknown[]) || []); },
    get EntityPermissions() { return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityPermissions'] as unknown[]) || []); },
    EntityFieldValues: [], EntityRelationships: [], EntitySettings: [], ApplicationEntities: [], ApplicationSettings: [],
    Roles: [{ ID: TEST_ROLE_ID, Name: 'TestRole' }], RowLevelSecurityFilters: [], AuditLogTypes: [], Authorizations: [],
    QueryCategories: [], Queries: [], QueryFields: [], QueryPermissions: [], QueryEntities: [], QueryParameters: [],
    EntityDocumentTypes: [], Libraries: [], ExplorerNavigationItems: [],
};

function makeUser(id = 'user-1'): UserInfo {
    const u = new UserInfo();
    u.ID = id; u.Name = 'Test User'; u.Email = `${id}@test.com`; u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [new UserRoleInfo({ UserID: id, RoleID: TEST_ROLE_ID, Role: 'TestRole' })];
    return u;
}

describe('EntitySaveOptions.OnValidated', () => {
    let provider: TestMetadataProvider;

    beforeEach(async () => {
        ClearAllDataHooks();
        provider = new TestMetadataProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(MOCK_METADATA);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
    });
    afterEach(() => ClearAllDataHooks());

    /**
     * Builds a saveable entity. `validateSucceeds=false` forces validation failure;
     * `saveBehavior` lets a test make the persist resolve true/false or reject. The `sequence`
     * array records the relative ordering of the OnValidated callback vs. the actual persist.
     */
    function createSaveableEntity(opts?: { validateSucceeds?: boolean; sequence?: string[] }): { entity: BaseEntity; saveSpy: ReturnType<typeof vi.fn> } {
        const entityInfo = provider.Entities.find(e => e.Name === 'Customers')!;
        const entity = new TestEntity(entityInfo);
        Object.defineProperty(entity, 'ActiveUser', { get: () => makeUser(), configurable: true });
        Object.defineProperty(entity, 'IsSaved', { get: () => true, configurable: true });

        const saveSpy = vi.fn().mockImplementation(async () => {
            opts?.sequence?.push('persisted');
            return { ID: '1', Name: 'changed-value' };
        });
        Object.defineProperty(entity, 'ProviderToUse', { get: () => ({ Save: saveSpy }), configurable: true });

        vi.spyOn(entity, 'Validate').mockReturnValue({ Success: opts?.validateSucceeds !== false, Errors: [] } as never);
        vi.spyOn(entity as never, 'RaiseEvent').mockImplementation(() => {});
        vi.spyOn(entity as never, 'finalizeSave').mockReturnValue(true);
        return { entity, saveSpy };
    }

    const opts = (extra: Partial<EntitySaveOptions>): EntitySaveOptions =>
        Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true }, extra);

    it('fires OnValidated exactly once, after validation passes and BEFORE the persist', async () => {
        const sequence: string[] = [];
        const { entity, saveSpy } = createSaveableEntity({ sequence });
        const onValidated = vi.fn(() => sequence.push('validated'));

        const ok = await entity.Save(opts({ OnValidated: onValidated }));

        expect(ok).toBe(true);
        expect(onValidated).toHaveBeenCalledTimes(1);
        expect(saveSpy).toHaveBeenCalledTimes(1);
        expect(sequence).toEqual(['validated', 'persisted']); // render hook strictly precedes the DB write
    });

    it('passes the entity instance to the callback', async () => {
        const { entity } = createSaveableEntity();
        let received: unknown;
        await entity.Save(opts({ OnValidated: (e) => { received = e; } }));
        expect(received).toBe(entity);
    });

    it('does NOT fire OnValidated when validation fails (and does not persist)', async () => {
        const { entity, saveSpy } = createSaveableEntity({ validateSucceeds: false });
        const onValidated = vi.fn();

        const ok = await entity.Save(opts({ OnValidated: onValidated }));

        expect(ok).toBe(false);
        expect(onValidated).not.toHaveBeenCalled();
        expect(saveSpy).not.toHaveBeenCalled();
    });

    it('does NOT fire OnValidated when the record is not dirty (save is skipped)', async () => {
        const { entity, saveSpy } = createSaveableEntity();
        const onValidated = vi.fn();

        // No IgnoreDirtyState and no field changes -> nothing to save.
        const ok = await entity.Save(Object.assign(new EntitySaveOptions(), { OnValidated: onValidated }));

        expect(ok).toBe(true);
        expect(onValidated).not.toHaveBeenCalled();
        expect(saveSpy).not.toHaveBeenCalled();
    });

    it('swallows a throwing OnValidated so a UI bug can never abort the persist', async () => {
        const { entity, saveSpy } = createSaveableEntity();
        const onValidated = vi.fn(() => { throw new Error('UI render blew up'); });

        const ok = await entity.Save(opts({ OnValidated: onValidated }));

        expect(ok).toBe(true);            // save still succeeded
        expect(saveSpy).toHaveBeenCalled(); // persist still happened
    });

    it('reports failure when the persist itself fails — the rollback signal for optimistic UI', async () => {
        const { entity, saveSpy } = createSaveableEntity();
        saveSpy.mockRejectedValueOnce(new Error('DB write failed')); // persist blows up after OnValidated fired
        const onValidated = vi.fn();

        const ok = await entity.Save(opts({ OnValidated: onValidated }));

        expect(onValidated).toHaveBeenCalledTimes(1); // optimistic render already happened...
        expect(ok).toBe(false);                       // ...and Save returns false -> caller rolls it back
    });
});
