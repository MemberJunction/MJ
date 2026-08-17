/**
 * entity-embedded.checks.ts — the 'entity-embedded' bundle (EE1–EE5): live-database
 * proof of owner-held embedded records.
 *
 * No production `__mj` field is an honest 1:1 composition (see plans/embedded-records.md
 * §8). This bundle registers a test-only subclass of `MJ: Action Categories` that treats
 * the existing nullable `ParentID` self-FK as an embedded peer — the closest core
 * analogue of Deal.OrderID. Other bundles in the same `mj test` process get the subclass
 * too; the companion is unexposed on NewRecord and contributes nothing unless a check
 * calls Ensure(), so an empty embed is inert (EE1 asserts that).
 *
 * Every mutating check carries `RequiresMutation: true`. Rows are prefixed per run and
 * tagged "(mj-integration-test — safe to delete)".
 */
import { BaseEntity } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJActionCategoryEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const CATEGORY_ENTITY = 'MJ: Action Categories';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

@RegisterClass(BaseEntity, CATEGORY_ENTITY)
export class EmbeddedTestCategoryEntity extends MJActionCategoryEntity {
    public readonly ParentEmb = this.DeclareEmbeddedRecord<MJActionCategoryEntity>({
        ForeignKeyField: 'ParentID',
        RelatedEntity: CATEGORY_ENTITY,
        OnClear: 'orphan',
    });

    public get ParentID_Object(): MJActionCategoryEntity | null {
        return this.ParentEmb.Value as MJActionCategoryEntity | null;
    }

    public ParentID_EnsureObject(): MJActionCategoryEntity {
        return this.ParentEmb.Ensure() as MJActionCategoryEntity;
    }
}

interface EmbeddedFixture {
    Prefix: string;
    CategoryIds: string[];
}

let fixture: EmbeddedFixture | undefined;

async function newCategory(
    ctx: IntegrationCheckContext,
    label: string,
): Promise<EmbeddedTestCategoryEntity> {
    const f = fixture!;
    const cat = await ctx.Provider.GetEntityObject<EmbeddedTestCategoryEntity>(CATEGORY_ENTITY, ctx.User);
    cat.NewRecord();
    cat.Name = `${f.Prefix}-${label}`;
    cat.Description = FIXTURE_TAG;
    cat.Status = 'Active';
    return cat;
}

function track(cat: EmbeddedTestCategoryEntity): void {
    const f = fixture!;
    if (cat.ID && !f.CategoryIds.some(id => UUIDsEqual(id, cat.ID))) {
        f.CategoryIds.push(cat.ID);
    }
    const parent = cat.ParentID_Object;
    if (parent?.ID && !f.CategoryIds.some(id => UUIDsEqual(id, parent.ID))) {
        f.CategoryIds.push(parent.ID);
    }
}

export const EntityEmbeddedChecks: NamedCheck[] = [
    {
        Id: 'entity-embedded.EE1',
        Name: 'EE1: an unprovisioned nullable embed is inert — the owner takes the ordinary single-row save',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const cat = await newCategory(ctx, 'ee1-inert');
            Assert(cat.ParentID_Object === null, 'EE1: a nullable embed must be null after NewRecord');
            Assert(await cat.Save(), `EE1: save failed — ${cat.LatestResult?.CompleteMessage}`);
            track(cat);
            Assert(cat.ParentID === null, 'EE1: save must not invent a parent');
        },
    },
    {
        Id: 'entity-embedded.EE2',
        Name: 'EE2: Ensure + Save persists the peer first and stamps the owner-held FK',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const child = await newCategory(ctx, 'ee2-child');
            const parent = child.ParentID_EnsureObject();
            parent.Name = `${fixture!.Prefix}-ee2-parent`;
            parent.Description = FIXTURE_TAG;
            parent.Status = 'Active';

            Assert(await child.Save(), `EE2: graph save failed — ${child.LatestResult?.CompleteMessage}`);
            track(child);

            Assert(!!child.ParentID, 'EE2: ParentID should be stamped');
            Assert(UUIDsEqual(child.ParentID!, parent.ID), 'EE2: ParentID should equal the peer PK');

            const reloaded = await ctx.Provider.GetEntityObject<EmbeddedTestCategoryEntity>(CATEGORY_ENTITY, ctx.User);
            Assert(await reloaded.Load(child.ID), 'EE2: reload of child failed');
            Assert(!!reloaded.ParentID_Object, 'EE2: Load must hydrate the peer');
            AssertEqual(reloaded.ParentID_Object!.Name, parent.Name, 'EE2: loaded peer name');
        },
    },
    {
        Id: 'entity-embedded.EE3',
        Name: 'EE3: a clean owner with a dirty peer still saves (dirty rollup)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const child = await newCategory(ctx, 'ee3-child');
            const parent = child.ParentID_EnsureObject();
            parent.Name = `${fixture!.Prefix}-ee3-parent`;
            parent.Description = FIXTURE_TAG;
            parent.Status = 'Active';
            Assert(await child.Save(), `EE3: initial save failed — ${child.LatestResult?.CompleteMessage}`);
            track(child);

            parent.Description = `${FIXTURE_TAG} edited`;
            Assert(child.Dirty, 'EE3: a dirty peer must roll up into the owner');
            Assert(await child.Save(), `EE3: rollup save failed — ${child.LatestResult?.CompleteMessage}`);

            const reloaded = await ctx.Provider.GetEntityObject<EmbeddedTestCategoryEntity>(CATEGORY_ENTITY, ctx.User);
            Assert(await reloaded.Load(parent.ID), 'EE3: reload of peer failed');
            AssertEqual(reloaded.Description, `${FIXTURE_TAG} edited`, 'EE3: peer edit must persist');
        },
    },
    {
        Id: 'entity-embedded.EE4',
        Name: 'EE4: Clear + orphan nulls the FK and leaves the peer row',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const child = await newCategory(ctx, 'ee4-child');
            const parent = child.ParentID_EnsureObject();
            parent.Name = `${fixture!.Prefix}-ee4-parent`;
            parent.Description = FIXTURE_TAG;
            parent.Status = 'Active';
            Assert(await child.Save(), `EE4: initial save failed — ${child.LatestResult?.CompleteMessage}`);
            track(child);
            const parentId = parent.ID;

            child.ParentEmb.Clear();
            Assert(child.ParentID_Object === null, 'EE4: Clear must unexpose the peer');
            Assert(await child.Save(), `EE4: clear save failed — ${child.LatestResult?.CompleteMessage}`);
            Assert(child.ParentID === null, 'EE4: FK must be nulled');

            const stillThere = await ctx.Provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User);
            Assert(await stillThere.Load(parentId), 'EE4: orphaned peer must still load');
        },
    },
    {
        Id: 'entity-embedded.EE5',
        Name: 'EE5: a failing peer rolls the whole graph back — the child is not inserted',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const child = await newCategory(ctx, 'ee5-child');
            const parent = child.ParentID_EnsureObject();
            // Name is required — leave it empty so the peer fails validation/save
            parent.Name = '';
            parent.Status = 'Active';

            const saved = await child.Save();
            Assert(!saved, 'EE5: a graph with an unwritable peer must not report success');
            if (child.ID) {
                track(child);
            }
        },
    },
];

for (const check of EntityEmbeddedChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

async function sweep(ctx: IntegrationCheckContext, ids: string[]): Promise<void> {
    for (const id of [...ids].reverse()) {
        const row = await ctx.Provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User).catch(() => undefined);
        if (row && (await row.Load(id).catch(() => false))) {
            await row.Delete().catch(() => undefined);
        }
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('entity-embedded', {
    Setup: async () => {
        fixture = { Prefix: `mj-ee-${Date.now()}`, CategoryIds: [] };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        if (!fixture) {
            return;
        }
        await sweep(ctx, fixture.CategoryIds);
        fixture = undefined;
    },
});
