/**
 * IS-A PROMOTION over the wire — the server half.
 *
 * Promotion = an EXISTING parent row gains a subtype ("this Animal is now also a Dog"). Over
 * GraphQL it arrives as the child's CREATE mutation carrying the EXISTING parent's primary key,
 * because in IS-A the shared key IS the relationship — the child has no key of its own to mint.
 *
 * The defect: `ResolverBase.CreateRecord` did `GetEntityObject` + `NewRecord()` + `SetMany(input)`.
 * `NewRecord()` recurses into the parent chain and flags the PARENT as new too; `SetMany` then only
 * overwrites the key. The parent therefore saved as a CREATE — a second copy of a row that already
 * exists — instead of the child being attached to the existing row.
 *
 * These tests drive the REAL `CreateRecord` with REAL `BaseEntity` / `EntityInfo` objects over a
 * fake provider that (a) constructs entities exactly as `ProviderBase.GetEntityObject` does
 * (construct → Config → InitializeParentEntity → NewRecord), (b) holds one existing Animal row for
 * `Load`, and (c) records every `Save` it receives — entity, create-vs-update, key — which is the
 * observable the bug corrupts.
 */
// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    BaseEntity,
    CompositeKey,
    DatabaseProviderBase,
    EntityInfo,
    EntitySaveOptions,
    FieldPermissionAccess,
    IMetadataProvider,
    Metadata,
    UserInfo,
} from '@memberjunction/core';
import type { PubSubEngine } from 'type-graphql';
import { ResolverBase } from '../generic/ResolverBase.js';
import type { UserPayload } from '../types.js';

// ────────────────────────────────────────────────────────────────────────────
// Fixtures — a real two-level IS-A pair: Animals (root) ← Dogs (child), plus a standalone entity
// ────────────────────────────────────────────────────────────────────────────

const ROLE_ID = 'D1D2D3D4-0000-4000-8000-00000000R0LE';
const USER_ID = 'D1D2D3D4-0000-4000-8000-00000000USER';
const ANIMAL_ENTITY_ID = 'D1D2D3D4-0000-4000-8000-000000000001';
const DOG_ENTITY_ID = 'D1D2D3D4-0000-4000-8000-000000000002';
const TOY_ENTITY_ID = 'D1D2D3D4-0000-4000-8000-000000000003';
/** The Animal row that already exists in the database. */
const EXISTING_ANIMAL_ID = 'E1E2E3E4-0000-4000-8000-00000000AAAA';
/** A well-formed key that matches NO row. */
const MISSING_ANIMAL_ID = 'E1E2E3E4-0000-4000-8000-00000000FFFF';

interface FieldSpec {
    EntityID: string;
    Name: string;
    Type: string;
    Sequence: number;
    IsPrimaryKey?: boolean;
    AllowsNull?: boolean;
    AllowUpdateAPI?: boolean;
    IsVirtual?: boolean;
    /** Field-level security rows (only read on an entity with EnableFieldLevelSecurity). */
    EntityFieldPermissions?: Record<string, unknown>[];
}

function field(spec: FieldSpec): Record<string, unknown> {
    return {
        ID: `EF-${spec.EntityID}-${spec.Sequence}`,
        EntityID: spec.EntityID,
        Name: spec.Name,
        Type: spec.Type,
        Length: null,
        IsPrimaryKey: spec.IsPrimaryKey ?? false,
        IsSoftPrimaryKey: false,
        IsSoftForeignKey: false,
        AllowsNull: spec.AllowsNull ?? true,
        AllowUpdateAPI: spec.AllowUpdateAPI ?? false,
        DefaultValue: null,
        AutoIncrement: false,
        IsVirtual: spec.IsVirtual ?? false,
        IsNameField: false,
        ValueListType: 'None',
        Sequence: spec.Sequence,
        Status: 'Active',
        EntityFieldValues: [],
        EntityFieldPermissions: spec.EntityFieldPermissions ?? [],
    };
}

/**
 * One field-level permission row for the test role. On an FLS-enabled entity a field with NO rows
 * is denied, so every non-key field of such an entity gets an explicit row.
 */
function fieldPermission(fieldName: string, access: { read?: string; update?: string; create?: string }): Record<string, unknown> {
    const sequence: Record<string, number> = { Name: 2, MicrochipNumber: 3 }; // matches field()'s `EF-<entity>-<sequence>` ids
    return {
        ID: `fperm-${fieldName}`,
        EntityFieldID: `EF-${ANIMAL_ENTITY_ID}-${sequence[fieldName]}`,
        RoleID: ROLE_ID,
        ReadAccess: access.read ?? FieldPermissionAccess.Allow,
        UpdateAccess: access.update ?? FieldPermissionAccess.Allow,
        CreateAccess: access.create ?? FieldPermissionAccess.Allow,
    };
}

function permission(entityID: string): Record<string, unknown> {
    return { ID: `perm-${entityID}`, EntityID: entityID, RoleID: ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true };
}

function entityData(overrides: {
    ID: string; Name: string; BaseTable: string; ParentID: string | null; EntityFields: Record<string, unknown>[];
    EnableFieldLevelSecurity?: boolean; AllowMultipleSubtypes?: boolean;
}): Record<string, unknown> {
    return {
        ID: overrides.ID,
        Name: overrides.Name,
        BaseTable: overrides.BaseTable,
        BaseView: `vw${overrides.BaseTable}s`,
        SchemaName: 'Shelter',
        VirtualEntity: false,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        IncludeInAPI: true,
        AllowMultipleSubtypes: overrides.AllowMultipleSubtypes ?? false,
        EnableFieldLevelSecurity: overrides.EnableFieldLevelSecurity ?? false,
        ParentID: overrides.ParentID,
        Status: 'Active',
        EntityFields: overrides.EntityFields,
        EntityPermissions: [permission(overrides.ID)],
        EntityRelationships: [],
        EntitySettings: [],
    };
}

/**
 * Fixture options. `nameLockedByFls`: Animals runs with field-level security ON and the test role
 * may READ but neither UPDATE nor CREATE `Name` (every other field stays open). `overlapping`:
 * Animals allows multiple subtypes.
 */
function buildEntities(options: { nameLockedByFls?: boolean; overlapping?: boolean } = {}): EntityInfo[] {
    const fls = options.nameLockedByFls === true;
    const animals = entityData({
        ID: ANIMAL_ENTITY_ID, Name: 'Animals', BaseTable: 'Animal', ParentID: null,
        EnableFieldLevelSecurity: fls,
        AllowMultipleSubtypes: options.overlapping === true,
        EntityFields: [
            field({ EntityID: ANIMAL_ENTITY_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Sequence: 1 }),
            field({ EntityID: ANIMAL_ENTITY_ID, Name: 'Name', Type: 'nvarchar', AllowsNull: false, AllowUpdateAPI: true, Sequence: 2,
                EntityFieldPermissions: fls ? [fieldPermission('Name', { update: FieldPermissionAccess.Deny, create: FieldPermissionAccess.Deny })] : [] }),
            field({ EntityID: ANIMAL_ENTITY_ID, Name: 'MicrochipNumber', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, Sequence: 3,
                EntityFieldPermissions: fls ? [fieldPermission('MicrochipNumber', {})] : [] }),
        ],
    });
    // Mirrors what CodeGen emits for an IS-A child: its OWN `ID` PK (shared with the parent), its
    // own columns, and the parent's data fields as virtual, updatable mirrors.
    const dogs = entityData({
        ID: DOG_ENTITY_ID, Name: 'Dogs', BaseTable: 'Dog', ParentID: ANIMAL_ENTITY_ID,
        EntityFields: [
            field({ EntityID: DOG_ENTITY_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Sequence: 1 }),
            field({ EntityID: DOG_ENTITY_ID, Name: 'IsHouseTrained', Type: 'bit', AllowsNull: true, AllowUpdateAPI: true, Sequence: 2 }),
            field({ EntityID: DOG_ENTITY_ID, Name: 'Name', Type: 'nvarchar', AllowsNull: false, AllowUpdateAPI: true, IsVirtual: true, Sequence: 3 }),
            field({ EntityID: DOG_ENTITY_ID, Name: 'MicrochipNumber', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, IsVirtual: true, Sequence: 4 }),
        ],
    });
    const toys = entityData({
        ID: TOY_ENTITY_ID, Name: 'Toys', BaseTable: 'Toy', ParentID: null,
        EntityFields: [
            field({ EntityID: TOY_ENTITY_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Sequence: 1 }),
            field({ EntityID: TOY_ENTITY_ID, Name: 'Name', Type: 'nvarchar', AllowsNull: false, AllowUpdateAPI: true, Sequence: 2 }),
        ],
    });
    return [animals, dogs, toys].map(d => new EntityInfo(d));
}

function buildUser(): UserInfo {
    return new UserInfo(null, {
        ID: USER_ID, Name: 'Test User', Email: 'test.user@example.com',
        FirstName: 'Test', LastName: 'User', IsActive: true,
        UserRoles: [{ UserID: USER_ID, RoleID: ROLE_ID, RoleName: 'Admin' }],
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Fake provider — real entity construction, an in-memory row store, a Save log
// ────────────────────────────────────────────────────────────────────────────

/** Concrete BaseEntity (mirrors a generated entity class). */
class TestEntity extends BaseEntity {}

interface SaveRecord {
    Entity: string;
    Type: 'create' | 'update';
    ID: unknown;
    Values: Record<string, unknown>;
    /** Fields field-level security told the provider to OMIT from an INSERT (CreateSuppressed). */
    SuppressedOnCreate: string[];
}

class FakeIsaProvider {
    public readonly Entities: EntityInfo[];
    public readonly CurrentUser: UserInfo;
    /** Rows the "database" holds, keyed by entity name then primary key. */
    public rows: Record<string, Record<string, Record<string, unknown>>> = {};
    /** Every Save the ORM handed us, in order — the observable the defect corrupts. */
    public saves: SaveRecord[] = [];
    /** Every Load the ORM asked for, in order. */
    public loads: { Entity: string; ID: unknown }[] = [];

    constructor(entities: EntityInfo[], user: UserInfo) {
        this.Entities = entities;
        this.CurrentUser = user;
    }

    public EntityByName(name: string): EntityInfo | undefined {
        return this.Entities.find(e => e.Name.trim().toLowerCase() === name.trim().toLowerCase());
    }

    public EntityByID(id: string): EntityInfo | undefined {
        return this.Entities.find(e => e.ID === id);
    }

    /** The same construction sequence as ProviderBase.GetEntityObject (minus the class factory). */
    public async GetEntityObject(entityName: string, contextUser?: UserInfo): Promise<BaseEntity> {
        const info = this.EntityByName(entityName);
        if (!info) throw new Error(`Entity ${entityName} not found`);
        const entity = new TestEntity(info, this as unknown as ConstructorParameters<typeof TestEntity>[1]);
        await entity.Config(contextUser ?? this.CurrentUser);
        await entity.InitializeParentEntity();
        entity.NewRecord();
        return entity;
    }

    public async Load(entity: BaseEntity, key: CompositeKey): Promise<Record<string, unknown> | null> {
        const id = key.GetValueByFieldName('ID') as string;
        this.loads.push({ Entity: entity.EntityInfo.Name, ID: id });
        const row = this.rows[entity.EntityInfo.Name]?.[id];
        return row ? { ...row } : null;
    }

    public async Save(entity: BaseEntity, _user: UserInfo, _options: EntitySaveOptions): Promise<Record<string, unknown>> {
        this.saves.push({
            Entity: entity.EntityInfo.Name,
            Type: entity.IsSaved ? 'update' : 'create',
            ID: entity.Get('ID'),
            Values: entity.GetAll(),
            SuppressedOnCreate: entity.Fields.filter(f => f.CreateSuppressed).map(f => f.Name),
        });
        return entity.GetAll();
    }

    public SetCachedRecordName(): void { /* cache is irrelevant here */ }
    public GetCachedRecordName(): string | null { return null; }
}

/** Exposes the REAL protected CreateRecord; pub/sub wiring is out of scope for a unit test. */
class CreateProbe extends ResolverBase {
    public Create(entityName: string, input: Record<string, unknown>, provider: FakeIsaProvider, payload: UserPayload): Promise<Record<string, unknown> | null> {
        return this.CreateRecord(
            entityName,
            input,
            provider as unknown as DatabaseProviderBase,
            payload,
            undefined as unknown as PubSubEngine
        ) as Promise<Record<string, unknown> | null>;
    }
    protected override ListenForEntityMessages(): void { /* no pub/sub in a unit test */ }
}

describe('ResolverBase.CreateRecord — IS-A promotion attaches the new child to the EXISTING parent', () => {
    let provider: FakeIsaProvider;
    let payload: UserPayload;
    let previousGlobalProvider: IMetadataProvider;

    /** (Re)build the fake provider over a fixture variant and publish it as the global provider. */
    function useFixture(options: { nameLockedByFls?: boolean; overlapping?: boolean } = {}): void {
        const user = buildUser();
        provider = new FakeIsaProvider(buildEntities(options), user);
        provider.rows = {
            Animals: {
                [EXISTING_ANIMAL_ID]: { ID: EXISTING_ANIMAL_ID, Name: 'Biscuit', MicrochipNumber: '985112000000001' },
            },
            Dogs: {},
        };
        Metadata.Provider = provider as unknown as IMetadataProvider;
        payload = { email: user.Email, userRecord: user, sessionId: 'test-session' };
    }

    beforeEach(() => {
        // EntityInfo resolves ParentEntityInfo / ChildEntities through the GLOBAL provider (a
        // stateless info-class proxy), and MapFieldNamesToCodeNames falls back to it too.
        previousGlobalProvider = Metadata.Provider;
        useFixture();
    });

    afterEach(() => {
        Metadata.Provider = previousGlobalProvider;
    });

    it('promotion: an existing parent key on a child create UPDATES nothing on the parent and INSERTs only the child', async () => {
        const result = await new CreateProbe().Create('Dogs', { ID: EXISTING_ANIMAL_ID, IsHouseTrained: true }, provider, payload);

        // The parent row was looked up by the incoming key...
        expect(provider.loads).toEqual([{ Entity: 'Animals', ID: EXISTING_ANIMAL_ID }]);
        // ...and NOT re-created. Before the fix this list began with
        // { Entity: 'Animals', Type: 'create' } — a duplicate copy of Biscuit.
        expect(provider.saves.filter(s => s.Entity === 'Animals')).toEqual([]);
        // The child is created on the SHARED key.
        expect(provider.saves).toEqual([
            expect.objectContaining({ Entity: 'Dogs', Type: 'create', ID: EXISTING_ANIMAL_ID }),
        ]);
        expect(provider.saves[0].Values['IsHouseTrained']).toBe(true);
        expect(result?.['ID']).toBe(EXISTING_ANIMAL_ID);
    });

    it('promotion: parent fields sent alongside the key are applied as an UPDATE of the existing parent', async () => {
        await new CreateProbe().Create('Dogs', { ID: EXISTING_ANIMAL_ID, Name: 'Biscuit II', IsHouseTrained: true }, provider, payload);

        expect(provider.saves).toEqual([
            expect.objectContaining({ Entity: 'Animals', Type: 'update', ID: EXISTING_ANIMAL_ID }),
            expect.objectContaining({ Entity: 'Dogs', Type: 'create', ID: EXISTING_ANIMAL_ID }),
        ]);
        expect(provider.saves[0].Values['Name']).toBe('Biscuit II');
        // The loaded value the input did NOT touch survives — the parent was loaded, not blanked.
        expect(provider.saves[0].Values['MicrochipNumber']).toBe('985112000000001');
    });

    it('whole-chain create: no key in the input creates parent AND child on one fresh key, without a lookup', async () => {
        await new CreateProbe().Create('Dogs', { Name: 'Pretzel', IsHouseTrained: false }, provider, payload);

        expect(provider.loads).toEqual([]);
        expect(provider.saves.map(s => [s.Entity, s.Type])).toEqual([['Animals', 'create'], ['Dogs', 'create']]);
        const sharedKey = provider.saves[0].ID;
        expect(typeof sharedKey).toBe('string');
        expect(sharedKey).not.toBe(EXISTING_ANIMAL_ID);
        expect(provider.saves[1].ID).toBe(sharedKey);
    });

    it('whole-chain create with a caller-supplied key that matches no row still creates the full chain on that key', async () => {
        await new CreateProbe().Create('Dogs', { ID: MISSING_ANIMAL_ID, Name: 'Ghost', IsHouseTrained: false }, provider, payload);

        expect(provider.loads).toEqual([{ Entity: 'Animals', ID: MISSING_ANIMAL_ID }]);
        expect(provider.saves).toEqual([
            expect.objectContaining({ Entity: 'Animals', Type: 'create', ID: MISSING_ANIMAL_ID }),
            expect.objectContaining({ Entity: 'Dogs', Type: 'create', ID: MISSING_ANIMAL_ID }),
        ]);
        expect(provider.saves[0].Values['Name']).toBe('Ghost');
    });

    it('non-IS-A create is untouched: no lookup, one create', async () => {
        await new CreateProbe().Create('Toys', { Name: 'Squeaky Bone' }, provider, payload);

        expect(provider.loads).toEqual([]);
        expect(provider.saves.map(s => [s.Entity, s.Type])).toEqual([['Toys', 'create']]);
    });

    it('overlapping subtypes (AllowMultipleSubtypes): promotion still attaches to the existing parent and creates only the child', async () => {
        // Overlapping hierarchies exist precisely to be added to incrementally, so promotion is the
        // natural operation there. The disjoint guard does not run; the attach path is the same.
        useFixture({ overlapping: true });

        const result = await new CreateProbe().Create('Dogs', { ID: EXISTING_ANIMAL_ID, IsHouseTrained: true }, provider, payload);

        expect(provider.loads).toEqual([{ Entity: 'Animals', ID: EXISTING_ANIMAL_ID }]);
        expect(provider.saves.filter(s => s.Entity === 'Animals')).toEqual([]);
        expect(provider.saves).toEqual([
            expect.objectContaining({ Entity: 'Dogs', Type: 'create', ID: EXISTING_ANIMAL_ID }),
        ]);
        expect(result?.['ID']).toBe(EXISTING_ANIMAL_ID);
    });

    describe('field-level security: the same parent field on a child create meets two different verbs', () => {
        // With FLS on, parent fields sent on a child-create input are enforced by whichever verb the
        // PARENT's save runs — and that is decided by whether the parent row already exists:
        //   promotion  → the parent is LOADED, saves as an UPDATE → CheckFieldLevelUpdatePermissions REJECTS;
        //   whole-chain create → the parent is NEW, saves as a CREATE → ApplyFieldLevelCreateSuppression OMITS.
        // That fork is deliberate (a promotion really is an update of the parent) and these pin it.

        it('promotion: a parent field the user cannot UPDATE rejects the whole save, before any SQL', async () => {
            useFixture({ nameLockedByFls: true });

            await expect(
                new CreateProbe().Create('Dogs', { ID: EXISTING_ANIMAL_ID, Name: 'Biscuit II', IsHouseTrained: true }, provider, payload)
            ).rejects.toThrow(/permission to update field 'Name'/);

            expect(provider.loads).toEqual([{ Entity: 'Animals', ID: EXISTING_ANIMAL_ID }]);
            expect(provider.saves).toEqual([]);
        });

        it('promotion: parent fields the user CAN update still go through as an UPDATE', async () => {
            useFixture({ nameLockedByFls: true });

            await new CreateProbe().Create('Dogs', { ID: EXISTING_ANIMAL_ID, MicrochipNumber: '985112000000002', IsHouseTrained: true }, provider, payload);

            expect(provider.saves).toEqual([
                expect.objectContaining({ Entity: 'Animals', Type: 'update', ID: EXISTING_ANIMAL_ID }),
                expect.objectContaining({ Entity: 'Dogs', Type: 'create', ID: EXISTING_ANIMAL_ID }),
            ]);
            expect(provider.saves[0].Values['MicrochipNumber']).toBe('985112000000002');
        });

        it('whole-chain create: the same parent field the user cannot CREATE is silently OMITTED, and the create proceeds', async () => {
            useFixture({ nameLockedByFls: true });

            await new CreateProbe().Create('Dogs', { Name: 'Pretzel', MicrochipNumber: '985112000000003', IsHouseTrained: false }, provider, payload);

            expect(provider.loads).toEqual([]);
            expect(provider.saves.map(s => [s.Entity, s.Type])).toEqual([['Animals', 'create'], ['Dogs', 'create']]);
            expect(provider.saves[0].SuppressedOnCreate).toEqual(['Name']);
            expect(provider.saves[0].Values['MicrochipNumber']).toBe('985112000000003');
        });
    });
});
