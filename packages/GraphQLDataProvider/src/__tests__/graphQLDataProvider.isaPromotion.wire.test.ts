/**
 * IS-A PROMOTION over the wire — the client half.
 *
 * Promotion = an EXISTING parent row gains a subtype: "this Animal we have had for weeks is a Dog".
 * The parent exists (loaded, IsSaved), the child does not (new, not saved). Over GraphQL the
 * parent's own Save() is short-circuited (`IsParentEntitySave` returns without a wire call, on the
 * premise that the leaf's mutation carries the whole chain), so the leaf's CREATE mutation is the
 * ONLY thing that can tell the server which parent row this is about.
 *
 * The defect: the create-side field filter admitted a primary key only when `entity.IsSaved`, and
 * an IS-A child's PK is ReadOnly (in IS-A the shared key IS the relationship). So on a promotion
 * the key was silently dropped from `input`, the server minted a fresh GUID, and INSERTed a second
 * copy of the parent. These tests pin the exact `input` variable the provider sends, on the REAL
 * provider over the fake wire (see ./support/graphQLWire.ts), with REAL EntityInfo/BaseEntity
 * fixtures wired into a two-level IS-A chain the same way the ORM wires them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { BaseEntity, EntityInfo, EntitySaveOptions, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { GraphQLWire } from './support/graphQLWire';
import {
    BuildTestConfig,
    BuildTestUser,
    ResetGraphQLProviderSingleton,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';

/**
 * Child DISCOVERY (a loaded parent-type record looks for its existing subtype row) is a separate
 * wire query the real provider issues from LoadFromData/InnerLoad. It is not what these tests pin,
 * so it is answered locally: "no subtype row yet" — which is precisely a promotion's precondition.
 */
class IsaWireProvider extends WireTestGraphQLProvider {
    public override async FindISAChildEntity(): Promise<{ ChildEntityName: string } | null> {
        return null;
    }
    public override async FindISAChildEntities(): Promise<{ ChildEntityName: string }[]> {
        return [];
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Fixtures — a real two-level IS-A pair: Animals (root) ← Dogs (child)
// ────────────────────────────────────────────────────────────────────────────

const ANIMAL_ENTITY_ID = 'B1B2B3B4-0000-4000-8000-000000000001';
const DOG_ENTITY_ID = 'B1B2B3B4-0000-4000-8000-000000000002';
/** The Animal row that already exists in the database. */
const EXISTING_ANIMAL_ID = 'C1C2C3C4-0000-4000-8000-00000000AAAA';

interface FieldSpec {
    EntityID: string;
    Name: string;
    Type: string;
    Sequence: number;
    IsPrimaryKey?: boolean;
    AllowsNull?: boolean;
    AllowUpdateAPI?: boolean;
    IsVirtual?: boolean;
    DefaultValue?: string;
}

function field(spec: FieldSpec): Record<string, unknown> {
    return {
        ID: `EF-${spec.EntityID}-${spec.Sequence}`,
        EntityID: spec.EntityID,
        Name: spec.Name,
        Type: spec.Type,
        Length: null,
        IsPrimaryKey: spec.IsPrimaryKey ?? false,
        AllowsNull: spec.AllowsNull ?? true,
        AllowUpdateAPI: spec.AllowUpdateAPI ?? false,
        DefaultValue: spec.DefaultValue ?? null,
        AutoIncrement: false,
        IsVirtual: spec.IsVirtual ?? false,
        Sequence: spec.Sequence,
        Status: 'Active',
    };
}

/** Root of the hierarchy. `MicrochipNumber` is the column a real schema puts a UNIQUE on. */
function buildAnimalEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: ANIMAL_ENTITY_ID,
        Name: 'Animals',
        BaseTable: 'Animal',
        BaseView: 'vwAnimals',
        SchemaName: 'Shelter',
        Status: 'Active',
        ParentID: null,
        AllowMultipleSubtypes: false,
        EntityFields: [
            field({ EntityID: ANIMAL_ENTITY_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Sequence: 1 }),
            field({ EntityID: ANIMAL_ENTITY_ID, Name: 'Name', Type: 'nvarchar', AllowsNull: false, AllowUpdateAPI: true, Sequence: 2 }),
            field({ EntityID: ANIMAL_ENTITY_ID, Name: 'MicrochipNumber', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, Sequence: 3 }),
            field({ EntityID: ANIMAL_ENTITY_ID, Name: '__mj_CreatedAt', Type: 'datetimeoffset', AllowsNull: false, Sequence: 4 }),
            field({ EntityID: ANIMAL_ENTITY_ID, Name: '__mj_UpdatedAt', Type: 'datetimeoffset', AllowsNull: false, Sequence: 5 }),
        ],
    });
}

/**
 * Child of Animals. Mirrors what CodeGen emits for an IS-A child: its OWN `ID` PK (shared with the
 * parent, and therefore ReadOnly) plus its own columns, plus the parent's data fields as virtual,
 * updatable fields so a leaf mutation carries the whole chain.
 */
function buildDogEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: DOG_ENTITY_ID,
        Name: 'Dogs',
        BaseTable: 'Dog',
        BaseView: 'vwDogs',
        SchemaName: 'Shelter',
        Status: 'Active',
        ParentID: ANIMAL_ENTITY_ID,
        EntityFields: [
            field({ EntityID: DOG_ENTITY_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Sequence: 1 }),
            field({ EntityID: DOG_ENTITY_ID, Name: 'IsHouseTrained', Type: 'bit', AllowsNull: true, AllowUpdateAPI: true, Sequence: 2 }),
            field({ EntityID: DOG_ENTITY_ID, Name: 'Name', Type: 'nvarchar', AllowsNull: false, AllowUpdateAPI: true, IsVirtual: true, Sequence: 3 }),
            field({ EntityID: DOG_ENTITY_ID, Name: 'MicrochipNumber', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, IsVirtual: true, Sequence: 4 }),
            field({ EntityID: DOG_ENTITY_ID, Name: '__mj_CreatedAt', Type: 'datetimeoffset', AllowsNull: false, Sequence: 5 }),
            field({ EntityID: DOG_ENTITY_ID, Name: '__mj_UpdatedAt', Type: 'datetimeoffset', AllowsNull: false, Sequence: 6 }),
        ],
    });
}

/** Exposes the two private chain slots the ORM's GetEntityObject → InitializeParentEntity fills. */
class TestIsaEntity extends BaseEntity {
    public WireParent(parent: BaseEntity): void {
        (this as unknown as { _parentEntity: BaseEntity | null })._parentEntity = parent;
        (this as unknown as { _parentEntityFieldNames: Set<string> | null })._parentEntityFieldNames =
            this.EntityInfo.ParentEntityFieldNames;
    }
}

/** Narrow the last request's `input` variable to a record after a runtime shape check. */
function lastInputRecord(): Record<string, unknown> {
    const input = GraphQLWire.LastInput;
    expect(input).toBeTypeOf('object');
    return input as Record<string, unknown>;
}

describe('GraphQLDataProvider Save — IS-A promotion carries the shared primary key', () => {
    let provider: IsaWireProvider;
    let user: UserInfo;
    let animalInfo: EntityInfo;
    let dogInfo: EntityInfo;
    let previousGlobalProvider: IMetadataProvider;

    beforeEach(() => {
        GraphQLWire.Reset();
        ResetGraphQLProviderSingleton();
        provider = new IsaWireProvider();
        provider.InitForWire(BuildTestConfig(), 'test-session-isa');
        animalInfo = buildAnimalEntityInfo();
        dogInfo = buildDogEntityInfo();
        provider.RegisterTestEntity(animalInfo);
        provider.RegisterTestEntity(dogInfo);
        // EntityInfo resolves ParentEntityInfo / ChildEntities through the GLOBAL provider's
        // entity list (a stateless info-class proxy), so publish the fixture pair there.
        previousGlobalProvider = Metadata.Provider;
        Metadata.Provider = { Entities: [animalInfo, dogInfo] } as unknown as IMetadataProvider;
        user = BuildTestUser(provider);
    });

    afterEach(() => {
        expect(GraphQLWire.PendingResponderCount).toBe(0);
        Metadata.Provider = previousGlobalProvider;
        ResetGraphQLProviderSingleton();
    });

    /** An Animal that already exists in the database: loaded, saved, clean. */
    function existingAnimal(): TestIsaEntity {
        const animal = new TestIsaEntity(animalInfo, provider);
        animal.LoadFromData({
            ID: EXISTING_ANIMAL_ID,
            Name: 'Biscuit',
            MicrochipNumber: '985112000000001',
            __mj_CreatedAt: new Date('2026-01-01T00:00:00Z'),
            __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'),
        });
        expect(animal.IsSaved).toBe(true);
        return animal;
    }

    /**
     * A Dog staged as a PROMOTION of that Animal: a NEW child bound to the loaded parent, the
     * shared key mirrored into the child, exactly the graph EnsureISAChild / AttachToParent build.
     */
    function stagedPromotion(animal: TestIsaEntity): TestIsaEntity {
        const dog = new TestIsaEntity(dogInfo, provider);
        dog.WireParent(animal);
        dog.Set('ID', EXISTING_ANIMAL_ID); // routed to the (unchanged) parent + mirrored locally
        expect(dog.IsSaved).toBe(false);
        expect(animal.IsSaved).toBe(true);
        return dog;
    }

    it('promotion: the CREATE mutation input carries the existing parent primary key', async () => {
        const animal = existingAnimal();
        const dog = stagedPromotion(animal);
        dog.Set('IsHouseTrained', true);
        GraphQLWire.EnqueueResponse({ CreateShelterDog: { ID: EXISTING_ANIMAL_ID, IsHouseTrained: true } });

        await provider.Save(dog, user, new EntitySaveOptions());

        expect(GraphQLWire.Requests).toHaveLength(1);
        expect(GraphQLWire.LastRequest.document).toContain('CreateShelterDog(input: $input)');
        const input = lastInputRecord();
        // THE defect: without the key the server cannot know this is a promotion and mints a
        // fresh GUID — inserting a duplicate parent row.
        expect(input['ID']).toBe(EXISTING_ANIMAL_ID);
        expect(input['IsHouseTrained']).toBe(true);
    });

    it('promotion: the parent chain fields ride along on the leaf create (the short-circuit premise)', async () => {
        const animal = existingAnimal();
        const dog = stagedPromotion(animal);
        dog.Set('IsHouseTrained', true);
        GraphQLWire.EnqueueResponse({ CreateShelterDog: { ID: EXISTING_ANIMAL_ID } });

        await provider.Save(dog, user, new EntitySaveOptions());

        const input = lastInputRecord();
        expect(input['Name']).toBe('Biscuit');
        expect(input['MicrochipNumber']).toBe('985112000000001');
        // and nothing read-only that is NOT the shared key leaks into a create
        expect(input).not.toHaveProperty('_mj__CreatedAt');
        expect(input).not.toHaveProperty('_mj__UpdatedAt');
    });

    it('promotion: the parent save itself still makes NO wire call (the leaf carries the chain)', async () => {
        const animal = existingAnimal();
        stagedPromotion(animal);
        const options = new EntitySaveOptions();
        options.IsParentEntitySave = true;

        await provider.Save(animal, user, options);

        expect(GraphQLWire.Requests).toHaveLength(0);
    });

    it('whole-chain create: a brand-new IS-A child sends the key its chain minted', async () => {
        // Control for the other IS-A create shape: NEW Animal + NEW Dog together. The chain mints
        // one GUID at the root and mirrors it down; the create carries it so the server's chain
        // adopts the same key rather than minting its own.
        const animal = new TestIsaEntity(animalInfo, provider);
        const dog = new TestIsaEntity(dogInfo, provider);
        dog.WireParent(animal);
        dog.NewRecord();
        const mintedId = dog.Get('ID') as string;
        expect(mintedId).toBeTruthy();
        expect(animal.Get('ID')).toBe(mintedId);
        dog.Set('Name', 'Pretzel');
        GraphQLWire.EnqueueResponse({ CreateShelterDog: { ID: mintedId, Name: 'Pretzel' } });

        await provider.Save(dog, user, new EntitySaveOptions());

        const input = lastInputRecord();
        expect(input['ID']).toBe(mintedId);
        expect(input['Name']).toBe('Pretzel');
    });

    it('non-IS-A create is unchanged: the primary key is still NOT sent', async () => {
        // A standalone entity's PK is the server's to mint — the existing contract must hold.
        const animal = new TestIsaEntity(animalInfo, provider);
        animal.NewRecord();
        animal.Set('Name', 'Waffles');
        GraphQLWire.EnqueueResponse({ CreateShelterAnimal: { ID: 'SERVER-MINTED', Name: 'Waffles' } });

        await provider.Save(animal, user, new EntitySaveOptions());

        expect(GraphQLWire.LastRequest.document).toContain('CreateShelterAnimal(input: $input)');
        expect(lastInputRecord()).not.toHaveProperty('ID');
    });

    it('IS-A child update is unchanged: the primary key is sent, as for any update', async () => {
        const animal = existingAnimal();
        const dog = new TestIsaEntity(dogInfo, provider);
        dog.WireParent(animal);
        dog.LoadFromData({
            ID: EXISTING_ANIMAL_ID,
            IsHouseTrained: false,
            __mj_CreatedAt: new Date('2026-01-01T00:00:00Z'),
            __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'),
        });
        expect(dog.IsSaved).toBe(true);
        dog.Set('IsHouseTrained', true);
        GraphQLWire.EnqueueResponse({ UpdateShelterDog: { ID: EXISTING_ANIMAL_ID, IsHouseTrained: true } });

        await provider.Save(dog, user, new EntitySaveOptions());

        expect(GraphQLWire.LastRequest.document).toContain('UpdateShelterDog(input: $input)');
        expect(lastInputRecord()['ID']).toBe(EXISTING_ANIMAL_ID);
    });
});
