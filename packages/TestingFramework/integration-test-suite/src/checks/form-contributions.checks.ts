/**
 * form-contributions.checks.ts — the 'form-contributions' bundle (FC1–FC8).
 *
 * Deterministic (no LLM) coverage for metadata-registered form contributions: a
 * `MJ: Entity Form Contributions` row pointing at a `Type='Widget'` Component whose spec
 * declares `componentRole: 'form-panel'`. Before this bundle the deterministic tier had no
 * coverage of forms at all — not `BaseFormPanel`, not `EntityFormOverride`, not
 * `InteractiveForm` — so nothing here would have caught an unmounted panel, a composition
 * regression, or a precedence inversion.
 *
 * The feature is almost entirely cross-package seams (migration → engine load → merged
 * collector → slot host → action family), which is what unit tests mock away. These checks
 * run the real action family through `ActionEngineServer` against the live database and read
 * the results back through `InteractiveFormsEngine`.
 *
 *   - FC1: the migration landed whole — every column, both filtered indexes, the CHECK constraints.
 *   - FC2: Create persists a Widget component and a Pending, User-scope row.
 *   - FC3: a keyless related claim still persists a derived `related:<entity>:<join>` key.
 *   - FC4: a duplicate key is refused by the action rather than decided by row order.
 *   - FC5: Activate promotes the draft and demotes the sibling holding the same key.
 *   - FC6: the identity-entity clamp drops Global rows on `MJ: Users` at the read path.
 *   - FC7: the same clamp leaves a User-scope row on that entity alone.
 *   - FC8: the kill switch actually rolls back — the engine loads no contributions.
 *
 * SQL Server only for FC1 (raw `ctx.Pool`); it skips-as-pass without a pool. Every row this
 * bundle creates is torn down FK-safe in the lifecycle.
 */
import { RunView, BaseEntity, CompositeKey } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import {
    InteractiveFormsEngine,
    type MJComponentEntity,
    type MJEntityFormContributionEntity,
} from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { RunActionParams, type ActionParam } from '@memberjunction/actions-base';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const TAG = '(mj-integration-test — safe to delete)';
const CONTRIBUTION_ENTITY = 'MJ: Entity Form Contributions';
const COMPONENT_ENTITY = 'MJ: Components';

/** The entity these contributions are hung on. Referenced, never mutated. */
const TARGET_ENTITY = 'MJ: Applications';
/** An identity entity — design §16 refuses Global and Role contributions here. */
const IDENTITY_ENTITY = 'MJ: Users';

/** Unique per run so a previous failed run can never collide with this one. */
const RUN_KEY = `it-fc-${Date.now().toString(36)}`;

interface FormContributionsFixture {
    TargetEntityID: string;
    IdentityEntityID: string;
    /** Contribution rows to delete, newest first. */
    CreatedContributionIds: string[];
    /** Component rows to delete after the rows that point at them. */
    CreatedComponentIds: string[];
}
let fixture: FormContributionsFixture | undefined;

function fx(): FormContributionsFixture {
    Assert(fixture != null, 'form-contributions fixture missing (bundle Setup did not run)');
    return fixture!;
}

/** A minimal, lint-clean form-panel spec. `key` becomes the contribution key. */
function panelSpec(name: string, contribution: Record<string, unknown>): Record<string, unknown> {
    return {
        name,
        title: name,
        location: 'embedded',
        componentRole: 'form-panel',
        code: `function ${name}(props) { return null; }`,
        formContribution: { slot: 'after-fields', presentation: 'panel', title: name, ...contribution },
    };
}

/** Run one of the contribution actions by name through the real engine. */
async function runAction(
    ctx: IntegrationCheckContext,
    actionName: string,
    params: Array<{ Name: string; Value: unknown }>,
): Promise<{ Success: boolean; ResultCode: string | undefined; Payload: Record<string, unknown> }> {
    const engine = ActionEngineServer.Instance;
    const action = engine.Actions.find(a => a.Name === actionName && a.Status === 'Active');
    Assert(!!action, `action '${actionName}' not found (Active) — push metadata/actions first`);
    const runParams = new RunActionParams();
    runParams.Action = action!;
    runParams.ContextUser = ctx.User;
    runParams.Params = params.map(p => ({ Name: p.Name, Value: p.Value, Type: 'Input' })) as ActionParam[];
    runParams.Filters = [];
    const result = await engine.RunAction(runParams);
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(result.Message ?? '{}') as Record<string, unknown>; } catch { /* non-JSON message */ }
    // Track anything persisted immediately, so a later assertion failure cannot orphan rows.
    if (typeof payload.ContributionID === 'string') fx().CreatedContributionIds.unshift(payload.ContributionID);
    if (typeof payload.ComponentID === 'string') fx().CreatedComponentIds.unshift(payload.ComponentID);
    return {
        Success: !!result.Success,
        ResultCode: (result as { Result?: { ResultCode?: string } }).Result?.ResultCode,
        Payload: payload,
    };
}

/** Load one contribution row fresh from the database. */
async function loadContribution(
    provider: IMetadataProvider, user: UserInfo, id: string,
): Promise<MJEntityFormContributionEntity> {
    const row = await provider.GetEntityObject<MJEntityFormContributionEntity>(CONTRIBUTION_ENTITY, user);
    Assert(await row.Load(id), `contribution ${id} did not load`);
    return row;
}

/**
 * Write a contribution row directly, bypassing the action family. The identity clamp lives on
 * the read path precisely because writers like this one — and `mj sync` — never touch actions.
 */
async function insertRowDirect(
    ctx: IntegrationCheckContext,
    fields: {
        EntityID: string;
        ContributionKey: string;
        Scope: MJEntityFormContributionEntity['Scope'];
        UserID: string | null;
        RoleID: string | null;
    },
): Promise<string> {
    const provider = ctx.Provider;
    const component = await provider.GetEntityObject<MJComponentEntity>(COMPONENT_ENTITY, ctx.User);
    component.NewRecord();
    component.Name = `${RUN_KEY}-direct-${fx().CreatedComponentIds.length}`;
    component.Type = 'Widget';
    component.Status = 'Draft';
    component.Version = '1.0.0';
    component.VersionSequence = 1;
    component.Specification = JSON.stringify(panelSpec('DirectPanel', {}));
    component.Description = TAG;
    Assert(await component.Save(), `direct component insert failed: ${component.LatestResult?.CompleteMessage}`);
    fx().CreatedComponentIds.unshift(component.ID);

    const row = await provider.GetEntityObject<MJEntityFormContributionEntity>(CONTRIBUTION_ENTITY, ctx.User);
    row.NewRecord();
    row.EntityID = fields.EntityID;
    row.ComponentID = component.ID;
    row.Name = `${RUN_KEY} direct row`;
    row.Description = TAG;
    row.Slot = 'after-fields';
    row.SortKey = 0;
    row.ContributionKey = fields.ContributionKey;
    row.Presentation = 'panel';
    row.Title = 'Direct';
    row.Scope = fields.Scope;
    row.UserID = fields.UserID;
    row.RoleID = fields.RoleID;
    row.Status = 'Active';
    row.Precedence = 0;
    Assert(await row.Save(), `direct contribution insert failed: ${row.LatestResult?.CompleteMessage}`);
    fx().CreatedContributionIds.unshift(row.ID);
    return row.ID;
}

export const FormContributionsChecks: NamedCheck[] = [
    {
        Id: 'form-contributions.FC1',
        Name: 'FC1: the EntityFormContribution migration landed whole — columns, filtered indexes, CHECK constraints',
        Fn: async (ctx: IntegrationCheckContext) => {
            if (!ctx.Pool) return; // skip-as-pass off SQL Server
            const schema = ctx.Schema ?? '__mj';
            const cols = await ctx.Pool.request().query<{ COLUMN_NAME: string }>(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA='${schema}' AND TABLE_NAME='EntityFormContribution'`);
            const present = new Set(cols.recordset.map(r => r.COLUMN_NAME));
            for (const required of [
                'ID', 'EntityID', 'ComponentID', 'Name', 'Description', 'Slot', 'SortKey', 'ContributionKey',
                'RelatedEntityID', 'RelatedJoinField', 'ReplacesSectionKey', 'Inclusion', 'ChromeGroup',
                'Presentation', 'Title', 'Icon', 'Scope', 'UserID', 'RoleID', 'Precedence', 'Status',
                'Configuration', 'Notes',
            ]) {
                Assert(present.has(required), `EntityFormContribution is missing column '${required}'`);
            }

            // Both uniqueness indexes are filtered — a non-filtered index would refuse the
            // historical Inactive rows the version lineage depends on.
            const idx = await ctx.Pool.request().query<{ name: string; has_filter: boolean; is_unique: boolean }>(
                `SELECT i.name, i.has_filter, i.is_unique FROM sys.indexes i
                 WHERE i.object_id = OBJECT_ID('[${schema}].[EntityFormContribution]') AND i.name IS NOT NULL`);
            for (const expected of ['UQ_EntityFormContribution_Key', 'UQ_EntityFormContribution_RelatedClaim']) {
                const found = idx.recordset.find(r => r.name === expected);
                Assert(!!found, `expected index '${expected}' is missing`);
                Assert(found!.is_unique, `index '${expected}' must be unique`);
                Assert(found!.has_filter, `index '${expected}' must be filtered, or Inactive history collides`);
            }

            const cks = await ctx.Pool.request().query<{ name: string }>(
                `SELECT name FROM sys.check_constraints
                 WHERE parent_object_id = OBJECT_ID('[${schema}].[EntityFormContribution]')`);
            const ckNames = new Set(cks.recordset.map(r => r.name));
            for (const expected of [
                'CK_EntityFormContribution_Slot',
                'CK_EntityFormContribution_Presentation',
                'CK_EntityFormContribution_Scope',
                'CK_EntityFormContribution_ScopeShape',
                'CK_EntityFormContribution_Status',
                'CK_EntityFormContribution_BareNoChrome',
                'CK_EntityFormContribution_JoinNeedsRelated',
                'CK_EntityFormContribution_OneClaim',
            ]) {
                Assert(ckNames.has(expected), `expected CHECK constraint '${expected}' is missing`);
            }
        }
    },
    {
        Id: 'form-contributions.FC2',
        Name: 'FC2: Create Form Contribution persists a Widget component and a Pending, User-scope row',
        Fn: async (ctx: IntegrationCheckContext) => {
            const key = `${RUN_KEY}:basic`;
            const result = await runAction(ctx, 'Create Form Contribution', [
                { Name: 'EntityName', Value: TARGET_ENTITY },
                { Name: 'Name', Value: `${RUN_KEY} basic ${TAG}` },
                { Name: 'Spec', Value: JSON.stringify(panelSpec('ItFcBasicPanel', { contributionKey: key })) },
            ]);
            Assert(result.Success, `Create failed: ${result.ResultCode} ${JSON.stringify(result.Payload)}`);

            const row = await loadContribution(ctx.Provider, ctx.User, result.Payload.ContributionID as string);
            AssertEqual(row.Status, 'Pending', 'a created contribution must start Pending, never live');
            AssertEqual(row.Scope, 'User', 'the action clamps every write to User scope');
            AssertEqual(row.UserID?.toLowerCase(), ctx.User.ID.toLowerCase(), 'User-scope row must belong to the caller');
            AssertEqual(row.ContributionKey, key, 'the contribution key must be persisted verbatim');
            AssertEqual(row.Slot, 'after-fields', 'the slot must come from the spec');

            const component = await new RunView().RunView<{ ID: string; Type: string; Status: string }>({
                EntityName: COMPONENT_ENTITY,
                ExtraFilter: `ID='${result.Payload.ComponentID as string}'`,
                Fields: ['ID', 'Type', 'Status'], ResultType: 'simple', BypassCache: true,
            }, ctx.User);
            Assert(component.Success && component.Results.length === 1, 'the created component did not load');
            AssertEqual(component.Results[0].Type, 'Widget', 'a form panel is a Widget, not a Form');
            AssertEqual(component.Results[0].Status, 'Draft', 'a Pending contribution maps to a Draft component');
        }
    },
    {
        Id: 'form-contributions.FC3',
        Name: 'FC3: a keyless related claim still persists a derived related:<entity>:<join> key',
        Fn: async (ctx: IntegrationCheckContext) => {
            // A NULL key is invisible to the unique index, so two Active rows could otherwise
            // claim the same grid and the winner would be decided by row order.
            const result = await runAction(ctx, 'Create Form Contribution', [
                { Name: 'EntityName', Value: TARGET_ENTITY },
                { Name: 'Name', Value: `${RUN_KEY} related ${TAG}` },
                { Name: 'Spec', Value: JSON.stringify(panelSpec('ItFcRelatedPanel', {
                    relatedEntity: IDENTITY_ENTITY, relatedJoinField: '[LinkedEntityID]',
                })) },
            ]);
            Assert(result.Success, `Create failed: ${result.ResultCode} ${JSON.stringify(result.Payload)}`);
            const row = await loadContribution(ctx.Provider, ctx.User, result.Payload.ContributionID as string);
            // Brackets are stripped, matching the key the renderer derives for the same claim.
            AssertEqual(row.ContributionKey, `related:${IDENTITY_ENTITY}:LinkedEntityID`,
                'the derived key must match what the renderer computes, byte for byte');
            Assert(!!row.RelatedEntityID, 'the related entity must be resolved to an ID');
        }
    },
    {
        Id: 'form-contributions.FC4',
        Name: 'FC4: a second Create for the same key returns ALREADY_EXISTS',
        Fn: async (ctx: IntegrationCheckContext) => {
            const key = `${RUN_KEY}:dup`;
            const spec = JSON.stringify(panelSpec('ItFcDupPanel', { contributionKey: key }));
            const first = await runAction(ctx, 'Create Form Contribution', [
                { Name: 'EntityName', Value: TARGET_ENTITY },
                { Name: 'Name', Value: `${RUN_KEY} dup ${TAG}` },
                { Name: 'Spec', Value: spec },
            ]);
            Assert(first.Success, `first Create failed: ${first.ResultCode}`);
            const second = await runAction(ctx, 'Create Form Contribution', [
                { Name: 'EntityName', Value: TARGET_ENTITY },
                { Name: 'Name', Value: `${RUN_KEY} dup again ${TAG}` },
                { Name: 'Spec', Value: spec },
            ]);
            Assert(!second.Success, 'a duplicate key must be refused, not silently doubled');
            AssertEqual(second.ResultCode, 'ALREADY_EXISTS', 'the duplicate must be named, not a generic failure');
        }
    },
    {
        Id: 'form-contributions.FC5',
        Name: 'FC5: Activate promotes the draft and demotes the Active sibling sharing its key',
        Fn: async (ctx: IntegrationCheckContext) => {
            const key = `${RUN_KEY}:versioned`;
            const create = await runAction(ctx, 'Create Form Contribution', [
                { Name: 'EntityName', Value: TARGET_ENTITY },
                { Name: 'Name', Value: `${RUN_KEY} v1 ${TAG}` },
                { Name: 'Spec', Value: JSON.stringify(panelSpec('ItFcVersionedPanel', { contributionKey: key })) },
            ]);
            Assert(create.Success, `Create failed: ${create.ResultCode}`);
            const firstID = create.Payload.ContributionID as string;

            const activateFirst = await runAction(ctx, 'Activate Form Contribution Version', [
                { Name: 'ContributionID', Value: firstID },
            ]);
            Assert(activateFirst.Success, `first Activate failed: ${activateFirst.ResultCode}`);
            AssertEqual((await loadContribution(ctx.Provider, ctx.User, firstID)).Status, 'Active',
                'activation must make the row live');

            // A new version of the same key, then activate it — the first must step down.
            const modify = await runAction(ctx, 'Modify Form Contribution', [
                { Name: 'ContributionID', Value: firstID },
                { Name: 'Spec', Value: JSON.stringify(panelSpec('ItFcVersionedPanel', { contributionKey: key })) },
                { Name: 'VersionBumpKind', Value: 'minor' },
            ]);
            Assert(modify.Success, `Modify failed: ${modify.ResultCode}`);
            const secondID = modify.Payload.ContributionID as string;
            Assert(secondID !== firstID, 'a minor bump must produce a new row, not overwrite the live one');
            AssertEqual((await loadContribution(ctx.Provider, ctx.User, firstID)).Status, 'Active',
                'the live row must stay live until the new version is activated');

            const activateSecond = await runAction(ctx, 'Activate Form Contribution Version', [
                { Name: 'ContributionID', Value: secondID },
            ]);
            Assert(activateSecond.Success, `second Activate failed: ${activateSecond.ResultCode}`);
            AssertEqual((await loadContribution(ctx.Provider, ctx.User, secondID)).Status, 'Active',
                'the new version must be live');
            AssertEqual((await loadContribution(ctx.Provider, ctx.User, firstID)).Status, 'Inactive',
                'two Active rows may never share one key — the prior version must be demoted');
            AssertEqual(activateSecond.Payload.PreviousActiveContributionID, firstID,
                'the demoted sibling must be reported back to the caller');
        }
    },
    {
        Id: 'form-contributions.FC6',
        Name: 'FC6: the identity-entity clamp drops a Global contribution on MJ: Users',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            // Written directly, because that is the shape the clamp exists for: `mj sync` and
            // direct SQL never pass through the action family, which already forces User scope.
            await insertRowDirect(ctx, {
                EntityID: f.IdentityEntityID,
                ContributionKey: `${RUN_KEY}:global-identity`,
                Scope: 'Global', UserID: null, RoleID: null,
            });
            await InteractiveFormsEngine.Instance.Config(true, ctx.User, ctx.Provider);
            const applicable = InteractiveFormsEngine.Instance.GetApplicableContributions(
                f.IdentityEntityID, ctx.User.ID, []);
            Assert(!applicable.some(c => c.ContributionKey === `${RUN_KEY}:global-identity`),
                'a Global contribution on an identity entity must never reach a form');
        }
    },
    {
        Id: 'form-contributions.FC7',
        Name: 'FC7: the clamp leaves a User-scope contribution on the same entity alone',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            await insertRowDirect(ctx, {
                EntityID: f.IdentityEntityID,
                ContributionKey: `${RUN_KEY}:user-identity`,
                Scope: 'User', UserID: ctx.User.ID, RoleID: null,
            });
            await InteractiveFormsEngine.Instance.Config(true, ctx.User, ctx.Provider);
            const applicable = InteractiveFormsEngine.Instance.GetApplicableContributions(
                f.IdentityEntityID, ctx.User.ID, []);
            Assert(applicable.some(c => c.ContributionKey === `${RUN_KEY}:user-identity`),
                'the clamp is about other people — a user may still change their own form');
        }
    },
    {
        Id: 'form-contributions.FC8',
        Name: 'FC8: the kill switch rolls back — the engine loads no contributions at all',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = InteractiveFormsEngine.Instance;
            await engine.Config(true, ctx.User, ctx.Provider);
            Assert(engine.Contributions.length > 0,
                'precondition: this bundle has created rows, so the engine should hold some');
            const previous = InteractiveFormsEngine.MetadataContributionsEnabled;
            try {
                InteractiveFormsEngine.MetadataContributionsEnabled = false;
                await engine.Config(true, ctx.User, ctx.Provider);
                AssertEqual(engine.Contributions.length, 0,
                    'with the kill switch off the engine must load no contribution rows');
                AssertEqual(engine.GetApplicableContributions(fx().TargetEntityID, ctx.User.ID, []).length, 0,
                    'and nothing may be applicable to any form');
            } finally {
                InteractiveFormsEngine.MetadataContributionsEnabled = previous;
                await engine.Config(true, ctx.User, ctx.Provider);
            }
        }
    },
];

for (const check of FormContributionsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('form-contributions', {
    Setup: async (ctx: IntegrationCheckContext) => {
        await ActionEngineServer.Instance.Config(false, ctx.User);
        const target = ctx.Provider.EntityByName(TARGET_ENTITY);
        const identity = ctx.Provider.EntityByName(IDENTITY_ENTITY);
        Assert(!!target, `'${TARGET_ENTITY}' is required as the contribution target and was not found`);
        Assert(!!identity, `'${IDENTITY_ENTITY}' is required to exercise the identity clamp and was not found`);
        fixture = {
            TargetEntityID: target!.ID,
            IdentityEntityID: identity!.ID,
            CreatedContributionIds: [],
            CreatedComponentIds: [],
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        if (!fixture) return;
        const del = async (entityName: string, id: string): Promise<void> => {
            try {
                const e = await ctx.Provider.GetEntityObject<BaseEntity>(entityName, ctx.User);
                if (await e.InnerLoad(CompositeKey.FromID(id))) await e.Delete();
            } catch { /* best-effort cleanup */ }
        };
        // Rows first — they hold the FK to the components.
        for (const id of fixture.CreatedContributionIds) await del(CONTRIBUTION_ENTITY, id);
        for (const id of fixture.CreatedComponentIds) await del(COMPONENT_ENTITY, id);
        fixture = undefined;
        // Leave the engine holding the real, post-cleanup state for whatever runs next.
        try { await InteractiveFormsEngine.Instance.Config(true, ctx.User, ctx.Provider); } catch { /* non-fatal */ }
    }
});
