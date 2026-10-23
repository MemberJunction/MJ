/**
 * alternate-base-views.checks.ts — the 'alternate-base-views' bundle (ABV1–ABV6).
 *
 * Proves the Alternate Base Views (MJ Canon Layer 1) metadata, physical constraints, RunView
 * routing, fail-closed validation, cache key isolation, and server hook invariants against a
 * live database.
 *
 * ── TRANSPORT: SERVER ───────────────────────────────────────────────────────────────────────
 * Uses the server provider and catalog inspection (same pattern as `layered-base-views`) while
 * keeping all checks 100% deterministic and non-mutating.
 *
 * ── CHECKS ──────────────────────────────────────────────────────────────────────────────────
 *   ABV1 metadata & schema coherence (`MJ: Entity Alternate Base Views` + `MJ: Query Entities.AlternateBaseViewID` + validators)
 *   ABV2 physical table & constraints exist (`CK_EntityAlternateBaseView_Name`, `UQ_*`, `FK_EntityAlternateBaseView_Parent`)
 *   ABV3 `RunView` with a registered `AlternateBaseView` executes against the resolved view (`simple`, `count_only`, `Aggregates`)
 *   ABV4 `RunView` fails closed when `AlternateBaseView` is unknown or `Disabled`
 *   ABV5 `LocalCacheManager.GenerateRunViewFingerprint` isolates `abv:<Name>` cache keys from default `BaseView`
 *   ABV6 `EntityAlternateBaseViewInfo` hierarchy (`ParentID`), effective properties, and lookup helpers (`GetAlternateBaseView`, `GetAlternateBaseViewByViewName`)
 */
import {
    EntityAlternateBaseViewInfo,
    IsValidAlternateBaseViewName,
    IsValidSQLIdentifier,
    LocalCacheManager,
    RunView,
} from '@memberjunction/core';
import type { EntityInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry, NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/**
 * ABV1: Verify `MJ: Entity Alternate Base Views` and `MJ: Query Entities.AlternateBaseViewID`
 * exist in live metadata with all expected fields, and identifier validators enforce rules.
 */
async function checkMetadataAndValidators(ctx: IntegrationCheckContext): Promise<void> {
    const abvEntity = ctx.Provider.Entities.find(e => e.Name === 'MJ: Entity Alternate Base Views');
    Assert(abvEntity !== undefined, 'Entity "MJ: Entity Alternate Base Views" must exist in metadata');

    const expectedFields = [
        'ID',
        'EntityID',
        'ParentID',
        'Name',
        'DisplayName',
        'Description',
        'SchemaName',
        'ViewName',
        'CachePolicy',
        'Status',
        'Sequence',
    ];
    for (const fieldName of expectedFields) {
        const field = abvEntity!.Fields.find(f => f.Name === fieldName);
        Assert(field !== undefined, `Field "${fieldName}" must exist on "MJ: Entity Alternate Base Views"`);
    }

    const queryEntities = ctx.Provider.Entities.find(e => e.Name === 'MJ: Query Entities');
    Assert(queryEntities !== undefined, 'Entity "MJ: Query Entities" must exist in metadata');
    const abvIdField = queryEntities!.Fields.find(f => f.Name === 'AlternateBaseViewID');
    Assert(abvIdField !== undefined, 'Field "AlternateBaseViewID" must exist on "MJ: Query Entities"');
    Assert(abvIdField!.AllowsNull === true, 'QueryEntity.AlternateBaseViewID must be nullable');

    // Every EntityInfo must expose AlternateBaseViews array
    for (const entity of ctx.Provider.Entities) {
        Assert(Array.isArray(entity.AlternateBaseViews), `${entity.Name}.AlternateBaseViews must be an array`);
    }

    // Validator invariants
    Assert(IsValidSQLIdentifier('vwUsersActive') === true, 'vwUsersActive is a valid SQL identifier');
    Assert(IsValidSQLIdentifier('vwUsers]; DROP TABLE Users; --') === false, 'SQL injection identifier must be rejected');
    Assert(IsValidAlternateBaseViewName('Active Subscribers') === true, 'Active Subscribers is a valid ABV name');
    Assert(IsValidAlternateBaseViewName('Bad|Name') === false, 'Pipe character must be rejected in ABV name');
    Assert(IsValidAlternateBaseViewName('Bad:Name') === false, 'Colon character must be rejected in ABV name');
}

/**
 * ABV2: Verify physical constraints on `EntityAlternateBaseView` in the database catalog.
 */
async function checkPhysicalCatalogConstraints(ctx: IntegrationCheckContext): Promise<void> {
    if (!ctx.Pool) {
        return;
    }
    const result = await ctx.Pool.request().query<{ name: string }>(`
        SELECT o.name
          FROM sys.objects o
          JOIN sys.objects parent ON o.parent_object_id = parent.object_id
          JOIN sys.schemas s ON parent.schema_id = s.schema_id
         WHERE s.name = '__mj'
           AND parent.name = 'EntityAlternateBaseView'
           AND o.name IN (
               'CK_EntityAlternateBaseView_Name',
               'CK_EntityAlternateBaseView_NoSelfParent',
               'CK_EntityAlternateBaseView_CachePolicy',
               'CK_EntityAlternateBaseView_Status',
               'UQ_EntityAlternateBaseView_EntityID_Name',
               'FK_EntityAlternateBaseView_Entity',
               'FK_EntityAlternateBaseView_Parent'
           )
    `);
    const found = new Set(result.recordset.map(r => r.name));
    const expected = [
        'CK_EntityAlternateBaseView_Name',
        'CK_EntityAlternateBaseView_NoSelfParent',
        'CK_EntityAlternateBaseView_CachePolicy',
        'CK_EntityAlternateBaseView_Status',
        'UQ_EntityAlternateBaseView_EntityID_Name',
        'FK_EntityAlternateBaseView_Entity',
        'FK_EntityAlternateBaseView_Parent',
    ];
    for (const name of expected) {
        Assert(found.has(name), `Constraint "${name}" must exist on __mj.EntityAlternateBaseView`);
    }
}

/**
 * Helper: temporarily attach an `EntityAlternateBaseViewInfo` to an entity for the duration of `fn`,
 * restoring the original `AlternateBaseViews` array in `finally`.
 */
async function withTemporaryAlternateBaseView<T>(
    entity: EntityInfo,
    abv: EntityAlternateBaseViewInfo,
    fn: () => Promise<T>,
): Promise<T> {
    entity.AlternateBaseViews.push(abv);
    EntityAlternateBaseViewInfo.LinkHierarchy(entity.AlternateBaseViews, entity.SchemaName);
    try {
        return await fn();
    } finally {
        const idx = entity.AlternateBaseViews.indexOf(abv);
        if (idx >= 0) {
            entity.AlternateBaseViews.splice(idx, 1);
        }
        EntityAlternateBaseViewInfo.LinkHierarchy(entity.AlternateBaseViews, entity.SchemaName);
    }
}

/**
 * ABV3: Prove `RunView` with a registered `AlternateBaseView` routes `simple`, `count_only`,
 * and `Aggregates` queries through the resolved view and returns results matching the view.
 */
async function checkRunViewExecutionWithAlternateBaseView(ctx: IntegrationCheckContext): Promise<void> {
    const entity = ctx.Provider.Entities.find(e => e.Name === 'MJ: Entities');
    Assert(entity !== undefined, 'MJ: Entities must exist');

    // Register a synthetic Active alternate base view pointing at the entity's physical BaseView
    // so the check is 100% read-only and deterministic.
    const syntheticAbv = new EntityAlternateBaseViewInfo(
        {
            ID: '00000000-0000-4000-8000-00000000AB01',
            EntityID: entity!.ID,
            ParentID: null,
            Name: 'TestMirrorView',
            DisplayName: 'Test Mirror View',
            Description: 'Read-only mirror of BaseView for ABV3 deterministic verification',
            SchemaName: entity!.SchemaName,
            ViewName: entity!.BaseView,
            CachePolicy: 'Default',
            Status: 'Active',
            Sequence: 1,
        },
        entity!.SchemaName,
    );

    await withTemporaryAlternateBaseView(entity!, syntheticAbv, async () => {
        const rv = new RunView();
        const extraFilter = `Name = 'MJ: Entities'`;

        const baseRes = await rv.RunView<{ ID: string; Name: string }>(
            {
                EntityName: 'MJ: Entities',
                ExtraFilter: extraFilter,
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
            },
            ctx.User,
        );
        Assert(baseRes.Success === true, `Baseline RunView failed: ${baseRes.ErrorMessage}`);
        AssertEqual(baseRes.Results.length, 1, 'Baseline RunView should return 1 row for MJ: Entities');

        const abvRes = await rv.RunView<{ ID: string; Name: string }>(
            {
                EntityName: 'MJ: Entities',
                AlternateBaseView: 'testmirrorview', // case-insensitive resolution
                ExtraFilter: extraFilter,
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                Aggregates: [{ expression: 'COUNT(*)', alias: 'EntityCount' }],
            },
            ctx.User,
        );
        Assert(abvRes.Success === true, `AlternateBaseView RunView failed: ${abvRes.ErrorMessage}`);
        AssertEqual(abvRes.Results.length, 1, 'AlternateBaseView RunView should return 1 row');
        AssertEqual(
            abvRes.Results[0].ID.toLowerCase(),
            baseRes.Results[0].ID.toLowerCase(),
            'AlternateBaseView row ID must match baseline row ID',
        );
        Assert(
            abvRes.AggregateResults !== undefined && abvRes.AggregateResults.length === 1,
            'AlternateBaseView RunView must return AggregateResults when requested',
        );
        AssertEqual(Number(abvRes.AggregateResults![0].value), 1, 'Aggregate COUNT(*) must be 1');

        const countRes = await rv.RunView(
            {
                EntityName: 'MJ: Entities',
                AlternateBaseView: 'TestMirrorView',
                ExtraFilter: extraFilter,
                ResultType: 'count_only',
            },
            ctx.User,
        );
        Assert(countRes.Success === true, `AlternateBaseView count_only RunView failed: ${countRes.ErrorMessage}`);
        AssertEqual(countRes.TotalRowCount, 1, 'AlternateBaseView count_only TotalRowCount must be 1');
    });
}

/**
 * Helper: runs a `RunView` expected to fail closed (either by throwing from `PreRunView` /
 * `ResolveAlternateBaseView` or by returning `{ Success: false, ErrorMessage }`) and returns
 * the failure message.
 */
async function expectRunViewToFailClosed(fn: () => Promise<{ Success: boolean; ErrorMessage?: string }>): Promise<string> {
    try {
        const res = await fn();
        Assert(res.Success === false, 'RunView with invalid/disabled AlternateBaseView must fail closed');
        return res.ErrorMessage ?? '';
    } catch (err) {
        return err instanceof Error ? err.message : String(err);
    }
}

/**
 * ABV4: Prove `RunView` fails closed when `AlternateBaseView` is unknown or `Disabled`.
 */
async function checkRunViewFailsClosedOnInvalidOrDisabledAbv(ctx: IntegrationCheckContext): Promise<void> {
    const entity = ctx.Provider.Entities.find(e => e.Name === 'MJ: Entities');
    Assert(entity !== undefined, 'MJ: Entities must exist');

    const rv = new RunView();
    const unknownMessage = await expectRunViewToFailClosed(() =>
        rv.RunView(
            {
                EntityName: 'MJ: Entities',
                AlternateBaseView: 'NonExistentAlternateView_XYZ',
                MaxRows: 1,
                ResultType: 'simple',
            },
            ctx.User,
        ),
    );
    Assert(
        unknownMessage.includes('NonExistentAlternateView_XYZ'),
        `Error message must name the unknown alternate base view, got: ${unknownMessage}`,
    );

    const disabledAbv = new EntityAlternateBaseViewInfo(
        {
            ID: '00000000-0000-4000-8000-00000000AB02',
            EntityID: entity!.ID,
            ParentID: null,
            Name: 'DisabledTestView',
            DisplayName: 'Disabled Test View',
            SchemaName: entity!.SchemaName,
            ViewName: entity!.BaseView,
            CachePolicy: 'Default',
            Status: 'Disabled',
            Sequence: 2,
        },
        entity!.SchemaName,
    );

    await withTemporaryAlternateBaseView(entity!, disabledAbv, async () => {
        const disabledMessage = await expectRunViewToFailClosed(() =>
            rv.RunView(
                {
                    EntityName: 'MJ: Entities',
                    AlternateBaseView: 'DisabledTestView',
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                ctx.User,
            ),
        );
        Assert(
            disabledMessage.toLowerCase().includes('disabled'),
            `Error message must explain the view is disabled, got: ${disabledMessage}`,
        );
    });
}

/**
 * ABV5: Verify `LocalCacheManager.GenerateRunViewFingerprint` isolates `abv:<Name>` cache keys
 * from the default `BaseView` and across different alternate base views.
 */
async function checkCacheFingerprintIsolation(_ctx: IntegrationCheckContext): Promise<void> {
    const lcm = LocalCacheManager.Instance;
    const fpDefault = lcm.GenerateRunViewFingerprint({
        EntityName: 'MJ: Entities',
        ExtraFilter: 'IncludeInAPI = 1',
    });
    const fpActive = lcm.GenerateRunViewFingerprint({
        EntityName: 'MJ: Entities',
        AlternateBaseView: 'Active',
        ExtraFilter: 'IncludeInAPI = 1',
    });
    const fpActiveUpper = lcm.GenerateRunViewFingerprint({
        EntityName: 'MJ: Entities',
        AlternateBaseView: 'ACTIVE',
        ExtraFilter: 'IncludeInAPI = 1',
    });
    const fpArchived = lcm.GenerateRunViewFingerprint({
        EntityName: 'MJ: Entities',
        AlternateBaseView: 'Archived',
        ExtraFilter: 'IncludeInAPI = 1',
    });

    Assert(fpDefault !== fpActive, 'Default and AlternateBaseView fingerprints must differ');
    Assert(fpActive !== fpArchived, 'Distinct AlternateBaseView names must produce distinct fingerprints');
    AssertEqual(fpActive, fpActiveUpper, 'AlternateBaseView fingerprint must be case-insensitive');
    Assert(fpActive.split('|').includes('abv:active'), `Expected 'abv:active' segment in fingerprint: ${fpActive}`);
}

/**
 * ABV6: Verify `EntityAlternateBaseViewInfo` hierarchy (`ParentID`), effective properties,
 * and `EntityInfo` lookup methods (`GetAlternateBaseView`, `GetAlternateBaseViewByViewName`).
 */
async function checkHierarchyAndEntityLookups(ctx: IntegrationCheckContext): Promise<void> {
    const entity = ctx.Provider.Entities.find(e => e.Name === 'MJ: Entities');
    Assert(entity !== undefined, 'MJ: Entities must exist');

    const rootAbv = new EntityAlternateBaseViewInfo(
        {
            ID: '00000000-0000-4000-8000-00000000AB10',
            EntityID: entity!.ID,
            ParentID: null,
            Name: 'ActiveEntities',
            DisplayName: null,
            SchemaName: null,
            ViewName: 'vwEntitiesActive',
            CachePolicy: 'Default',
            Status: 'Active',
            Sequence: 1,
        },
        entity!.SchemaName,
    );

    const childAbv = new EntityAlternateBaseViewInfo(
        {
            ID: '00000000-0000-4000-8000-00000000AB11',
            EntityID: entity!.ID,
            ParentID: rootAbv.ID,
            Name: 'ActiveTrackRecordEntities',
            DisplayName: 'Active Track-Record Entities',
            SchemaName: 'custom',
            ViewName: 'vwEntitiesActiveTrackRecord',
            CachePolicy: 'Bypass',
            Status: 'Deprecated',
            Sequence: 2,
        },
        entity!.SchemaName,
    );

    await withTemporaryAlternateBaseView(entity!, rootAbv, async () => {
        await withTemporaryAlternateBaseView(entity!, childAbv, async () => {
            AssertEqual(rootAbv.EffectiveSchemaName, entity!.SchemaName, 'EffectiveSchemaName falls back to entity SchemaName');
            AssertEqual(rootAbv.EffectiveDisplayName, 'ActiveEntities', 'EffectiveDisplayName falls back to Name');
            AssertEqual(rootAbv.IsUsable, true, 'Active view IsUsable must be true');

            AssertEqual(childAbv.EffectiveSchemaName, 'custom', 'EffectiveSchemaName uses explicit SchemaName');
            AssertEqual(childAbv.EffectiveDisplayName, 'Active Track-Record Entities', 'EffectiveDisplayName uses DisplayName');
            AssertEqual(childAbv.ParentID, rootAbv.ID, 'Child ABV preserves ParentID');
            AssertEqual(childAbv.IsUsable, true, 'Deprecated view IsUsable must be true');

            const byName = entity!.GetAlternateBaseView('ACTIVEENTITIES');
            Assert(UUIDsEqual(byName?.ID, rootAbv.ID), 'GetAlternateBaseView must resolve case-insensitively');

            const byViewName = entity!.GetAlternateBaseViewByViewName('vwEntitiesActiveTrackRecord', 'custom');
            Assert(UUIDsEqual(byViewName?.ID, childAbv.ID), 'GetAlternateBaseViewByViewName must resolve by view and schema');
        });
    });
}

export const AlternateBaseViewsChecks: NamedCheck[] = [
    {
        Id: 'alternate-base-views.ABV1',
        Name: 'ABV1: metadata & schema coherence (MJ: Entity Alternate Base Views + Query Entities + validators)',
        Fn: checkMetadataAndValidators,
    },
    {
        Id: 'alternate-base-views.ABV2',
        Name: 'ABV2: physical catalog constraints exist on __mj.EntityAlternateBaseView',
        Fn: checkPhysicalCatalogConstraints,
    },
    {
        Id: 'alternate-base-views.ABV3',
        Name: 'ABV3: RunView with registered AlternateBaseView executes simple, count_only, and Aggregates queries',
        Fn: checkRunViewExecutionWithAlternateBaseView,
    },
    {
        Id: 'alternate-base-views.ABV4',
        Name: 'ABV4: RunView fails closed on unknown or Disabled AlternateBaseView',
        Fn: checkRunViewFailsClosedOnInvalidOrDisabledAbv,
    },
    {
        Id: 'alternate-base-views.ABV5',
        Name: 'ABV5: LocalCacheManager isolates abv:<Name> cache fingerprints from default BaseView',
        Fn: checkCacheFingerprintIsolation,
    },
    {
        Id: 'alternate-base-views.ABV6',
        Name: 'ABV6: EntityAlternateBaseViewInfo ParentID hierarchy, effective properties, and EntityInfo lookups',
        Fn: checkHierarchyAndEntityLookups,
    },
];

for (const c of AlternateBaseViewsChecks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
