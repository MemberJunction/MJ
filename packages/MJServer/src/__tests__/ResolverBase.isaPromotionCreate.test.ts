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
    };
}

function permission(entityID: string): Record<string, unknown> {
    return { ID: `perm-${entityID}`, EntityID: entityID, RoleID: ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true };
}

function entityData(overrides: {
    ID: string; Name: string; BaseTable: string; ParentID: string | null; EntityFields: Record<string, unknown>[];
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
        AllowMultipleSubtypes: false,
        ParentID: overrides.ParentID,
        Status: 'Active',
        EntityFields: overrides.EntityFields,
        EntityPermissions: [permission(overrides.ID)],
        EntityRelationships: [],
        EntitySettings: [],
    };
}

function buildEntities(): EntityInfo[] {
    const animals = entityData({
        ID: ANIMAL_ENTITY_ID, Name: 'Animals', BaseTable: 'Animal', ParentID: null,
        EntityFields: [
            field({ EntityID: ANIMAL_ENTITY_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Sequence: 1 }),
            field({ EntityID: ANIMAL_ENTITY_ID, Name: 'Name', Type: 'nvarchar', AllowsNull: false, AllowUpdateAPI: true, Sequence: 2 }),
            field({ EntityID: ANIMAL_ENTITY_ID, Name: 'MicrochipNumber', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, Sequence: 3 }),
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

    beforeEach(() => {
        const user = buildUser();
        provider = new FakeIsaProvider(buildEntities(), user);
        provider.rows = {
            Animals: {
                [EXISTING_ANIMAL_ID]: { ID: EXISTING_ANIMAL_ID, Name: 'Biscuit', MicrochipNumber: '985112000000001' },
            },
            Dogs: {},
        };
        // EntityInfo resolves ParentEntityInfo / ChildEntities through the GLOBAL provider (a
        // stateless info-class proxy), and MapFieldNamesToCodeNames falls back to it too.
        previousGlobalProvider = Metadata.Provider;
        Metadata.Provider = provider as unknown as IMetadataProvider;
        payload = { email: user.Email, userRecord: user, sessionId: 'test-session' };
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
});
