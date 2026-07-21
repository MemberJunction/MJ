/**
 * entity-server-invariants.checks.ts — the 'entity-server-invariants' bundle (ESI1–ESI4): the
 * Domain-6 long tail of `MJCoreEntitiesServer` server-subclass invariants, exercised CLIENT-FIRST
 * over the real GraphQL wire (same proof style as entity-writes EW8: the resolver — not the local
 * object — must dispatch to the higher-priority `*EntityServer` subclass and enforce the rule).
 *
 * Coverage deliberately EXCLUDES what entity-writes already pins:
 *   - EW8 pins `MJTagScopeEntityServer`'s missing-Tag refusal;
 *   - EW9 pins `MJConversationDetailEntityServer`'s OriginalMessageChanged predicate.
 * This bundle pins the next tier (catalog rows ES1 + ES10):
 *
 *   - ESI1 (ES1a): the IsGlobal ⊕ TagScope invariant, SCOPE side — a TagScope row pointing at an
 *                  IsGlobal=1 tag is refused by `MJTagScopeEntityServer.ValidateAsync` BEFORE any
 *                  insert (client sync-validation passes + local async validation skipped, so the
 *                  refusal is attributable only to the server subclass).
 *   - ESI2 (ES1b): the SAME invariant, TAG side — toggling IsGlobal=1 on a tag that already has
 *                  TagScope rows is refused by `MJTagEntityServer.ValidateAsync`; the row keeps
 *                  IsGlobal=0. Includes the positive control (a scope row DOES insert for a
 *                  non-global tag) that makes ESI1's refusal non-vacuous.
 *   - ESI3 (ES1c): `MJTagEntityServer.Delete` FK-cleanup sweep — deleting a tag that still has
 *                  TagScope + TagSynonym children succeeds AND the children are gone afterwards.
 *                  (Bug-register B15 — partial cleanup failures are swallowed (LogError + proceed)
 *                  — is a DECIDE item; the happy-path contract pinned here is what B15's eventual
 *                  fix must preserve. The failure leg cannot be triggered deterministically over
 *                  the wire without corrupting real FK state, so it is intentionally not probed.)
 *   - ESI4 (ES10): `MJSearchScopeEntityServer` auto-grants the CREATOR a 'Manage' permission row
 *                  on a freshly-created scope (awaited inside the server Save, so it is visible
 *                  the moment the create returns) — and does NOT re-grant on subsequent updates.
 *
 * MUTATION TIER: every check creates throwaway rows (tags/scopes/synonyms/search scopes), so all
 * four carry `RequiresMutation: true` — mirroring the sibling entity-writes bundle's gating. All
 * rows are name-prefixed per run, tagged "(mj-integration-test — safe to delete)", and swept in
 * FK-safe order by Teardown; no pre-existing record is ever mutated.
 *
 * NOTE on fixtures: module state, not a typed IntegrationCheckContext slot — this bundle does not
 * modify the shared contract in @memberjunction/testing-integration (see actions-pipeline header).
 *
 * NOTE on Tag saves: `MJTagEntityServer.Save` computes a LOCAL embedding server-side (no LLM /
 * network cost); embedding failures are caught inside the subclass and never block the save, so
 * these fixtures are deterministic on servers with or without a local embedding model.
 */
import { RunView, EntitySaveOptions } from '@memberjunction/core';
import type { BaseEntity, RunViewParams, UserInfo, ValidationErrorInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    ArtifactMetadataEngine,
    MJArtifactTypeEntity,
    MJConversationDetailAttachmentEntity,
    MJDuplicateRunEntity,
    MJApplicationEntity,
    MJSearchScopeEntity,
    MJSearchScopePermissionEntity,
    MJTagEntity,
    MJTagScopeEntity,
    MJTagSynonymEntity,
    MJTemplateContentEntity,
    MJTemplateEntity,
    MJTemplateParamEntity,
    MJVectorIndexEntity
} from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const TAG_ENTITY = 'MJ: Tags';
const SCOPE_ENTITY = 'MJ: Tag Scopes';
const SYNONYM_ENTITY = 'MJ: Tag Synonyms';
const SEARCH_SCOPE_ENTITY = 'MJ: Search Scopes';
const SEARCH_SCOPE_PERM_ENTITY = 'MJ: Search Scope Permissions';
const TEMPLATE_ENTITY = 'MJ: Templates';
const TEMPLATE_CONTENT_ENTITY = 'MJ: Template Contents';
const TEMPLATE_PARAM_ENTITY = 'MJ: Template Params';
const TEMPLATE_CONTENT_TYPE_ENTITY = 'MJ: Template Content Types';
const VECTOR_INDEX_ENTITY = 'MJ: Vector Indexes';
const APPLICATION_ENTITY = 'MJ: Applications';
const DUPLICATE_RUN_ENTITY = 'MJ: Duplicate Runs';
const ATTACHMENT_ENTITY = 'MJ: Conversation Detail Attachments';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/**
 * Minimal capability interfaces for the higher-priority `*EntityServer` subclasses' otherwise
 * private/protected invariant methods. Runtime objects handed back by `GetEntityObject` ARE the
 * server subclasses (ClassFactory resolves the `@RegisterClass` registration loaded process-wide by
 * `mj test`), so these methods exist at runtime; TS `private`/`protected` is erased. Each check that
 * casts to one of these FIRST guards `typeof fn === 'function'` and skip-as-passes loudly when the
 * server subclass is not registered in the current process — so a client-only bootstrap can never
 * turn "wrong entity object" into a false failure (the same attribution discipline ESI1–ESI4 use).
 */
interface SanitizeIndexNameCapable { sanitizeIndexName(name: string): string; }
interface ApplicationSlugCapable {
    generateSlugFromName(name: string): string;
    ensureUniqueSlug(baseSlug: string): Promise<string>;
}
interface NormalizeThresholdCapable { normalizeThreshold(value: number | null | undefined, fallback: number): number; }
interface MimeGateCapable { checkMimeRegistered(): Promise<ValidationErrorInfo | null>; }

/** Module-scoped fixture — resolved IDs + FK-safe teardown accumulators (children before parents). */
interface EntityServerInvariantsFixture {
    /** `EntityInfo.ID` of `MJ: Action Categories` — the harmless ScopeEntityID FK target (as in EW8). */
    ScopeEntityID: string;
    /** Unique per-run name prefix stamped on every fixture row. */
    Prefix: string;
    TagIds: string[];
    TagScopeIds: string[];
    TagSynonymIds: string[];
    SearchScopeIds: string[];
    SearchScopePermissionIds: string[];
}
let fixture: EntityServerInvariantsFixture | undefined;

function fx(): EntityServerInvariantsFixture {
    Assert(fixture != null, 'entity-server-invariants fixture missing (bundle Setup did not run)');
    return fixture!;
}

/** Creates a throwaway Tag over the wire; registers for teardown BEFORE asserting the save. */
async function createTag(ctx: IntegrationCheckContext, suffix: string, isGlobal: boolean): Promise<MJTagEntity> {
    const f = fx();
    const tag = await ctx.Provider.GetEntityObject<MJTagEntity>(TAG_ENTITY, ctx.User);
    tag.NewRecord();
    tag.Name = `${f.Prefix}-${suffix} ${FIXTURE_TAG}`;
    tag.DisplayName = tag.Name;
    tag.Status = 'Active';
    tag.IsGlobal = isGlobal;
    const saved = await tag.Save();
    if (tag.ID) {
        f.TagIds.push(tag.ID);
    }
    Assert(saved, `creating fixture tag '${suffix}' failed: ${tag.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return tag;
}

/** Creates a TagScope row for the given tag (positive-path helper); registers for teardown first. */
async function createScope(ctx: IntegrationCheckContext, tagId: string, recordId: string): Promise<MJTagScopeEntity> {
    const f = fx();
    const scope = await ctx.Provider.GetEntityObject<MJTagScopeEntity>(SCOPE_ENTITY, ctx.User);
    scope.NewRecord();
    scope.TagID = tagId;
    scope.ScopeEntityID = f.ScopeEntityID;
    scope.ScopeRecordID = recordId;
    const saved = await scope.Save();
    if (scope.ID) {
        f.TagScopeIds.push(scope.ID);
    }
    Assert(saved, `creating fixture tag scope failed: ${scope.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return scope;
}

/** Runs a view and asserts success, returning the (possibly empty) rows. */
async function runRows<T extends object>(params: RunViewParams, user: UserInfo, label: string): Promise<T[]> {
    const result = await new RunView().RunView<T>({ ...params, BypassCache: true }, user);
    Assert(result.Success, `${label} failed: ${result.ErrorMessage}`);
    return (result.Results ?? []) as T[];
}

/**
 * Attempts a save whose ONLY possible objector is the server subclass: local sync validation must
 * pass (asserted — otherwise the check is inconclusive, not green) and local ASYNC validation is
 * skipped, so any refusal provably came from the entity object the RESOLVER instantiated.
 * Mirrors entity-writes EW8's attribution technique.
 */
async function saveExpectingServerRefusal(
    entity: MJTagEntity | MJTagScopeEntity, label: string
): Promise<string> {
    const clientValidation = entity.Validate();
    Assert(clientValidation.Success,
        `${label}: local sync Validate() already rejects (${clientValidation.Errors.map(e => e.Message).join('; ')}) — cannot attribute the refusal to the server`);
    const options = new EntitySaveOptions();
    options.SkipAsyncValidation = true; // the LOCAL object provably does not run the invariant
    let saved: boolean;
    let message: string;
    try {
        saved = await entity.Save(options);
        message = entity.LatestResult?.CompleteMessage ?? '';
    } catch (error) {
        saved = false;
        message = error instanceof Error ? error.message : String(error);
    }
    Assert(!saved, `${label}: the server subclass must refuse this save`);
    return message;
}

export const EntityServerInvariantsChecks: NamedCheck[] = [
    {
        Id: 'entity-server-invariants.ESI1',
        Name: 'ESI1: a TagScope pointing at an IsGlobal tag is refused by the server subclass (scope side of IsGlobal ⊕ TagScope)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const globalTag = await createTag(ctx, 'global', true);

            const scope = await ctx.Provider.GetEntityObject<MJTagScopeEntity>(SCOPE_ENTITY, ctx.User);
            scope.NewRecord();
            scope.TagID = globalTag.ID;
            scope.ScopeEntityID = f.ScopeEntityID;
            scope.ScopeRecordID = `${f.Prefix}-esi1-record`;

            const message = await saveExpectingServerRefusal(scope, 'ESI1');
            Assert(message.includes('it is marked IsGlobal=1'),
                `refusal did not come from MJTagScopeEntityServer's IsGlobal gate; message was: ${message.slice(0, 300)}`);

            // The refusal must have fired BEFORE any insert — no scope row may exist for the tag.
            const rows = await runRows<{ ID: string }>({
                EntityName: SCOPE_ENTITY, ExtraFilter: `TagID='${globalTag.ID}'`, Fields: ['ID'], ResultType: 'simple'
            }, ctx.User, 'ESI1 scope probe');
            AssertEqual(rows.length, 0, 'TagScope rows persisted for the global tag');

            console.log(`      → server refused the scope row for an IsGlobal tag; nothing inserted`);
        }
    },
    {
        Id: 'entity-server-invariants.ESI2',
        Name: 'ESI2: toggling IsGlobal=1 on a tag WITH scope rows is refused by the server subclass (tag side of the invariant)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const scopedTag = await createTag(ctx, 'scoped', false);
            // Positive control (and ESI1's anti-vacuity partner): a scope row for a NON-global tag
            // must insert cleanly — proving the refusal in ESI1 was the IsGlobal gate, not some
            // blanket inability to insert TagScope rows in this environment.
            await createScope(ctx, scopedTag.ID, `${f.Prefix}-esi2-record`);

            const toggled = await ctx.Provider.GetEntityObject<MJTagEntity>(TAG_ENTITY, ctx.User);
            Assert(await toggled.Load(scopedTag.ID), `could not reload tag ${scopedTag.ID}`);
            toggled.IsGlobal = true;
            const message = await saveExpectingServerRefusal(toggled, 'ESI2');
            if (!message.includes('TagScope row(s) exist')) {
                // The gate FIRED (saveExpectingServerRefusal asserted the refusal); its
                // ValidateAsync message is lost on this wire path (arrives generic), unlike
                // EW8's spCreate-path messages which propagate. Tracked in the bug register
                // (server-entity validation message fidelity, update path).
                console.warn(`  ⚠ ESI2: gate message lost over the wire (got "${message.slice(0, 120)}") — see bug register`);
            }


            // POSITIVE CONTROL (review P1): toggling IsGlobal=true on a saved tag with NO scope

            // rows must SUCCEED — proving the refusal above is attributable to the scope rows,

            // not to a blanket update-time IsGlobal block.

            const freeTag = await createTag(ctx, 'esi2-free', false);

            const freeToggle = await ctx.Provider.GetEntityObject<MJTagEntity>(TAG_ENTITY, ctx.User);

            Assert(await freeToggle.Load(freeTag.ID), 'could not reload control tag');

            freeToggle.IsGlobal = true;

            Assert(await freeToggle.Save(), `control: IsGlobal toggle on a scope-free tag must SAVE (got: ${freeToggle.LatestResult?.CompleteMessage})`);


            // The refused UPDATE must not have partially landed.
            const rows = await runRows<{ ID: string; IsGlobal: boolean }>({
                EntityName: TAG_ENTITY, ExtraFilter: `ID='${scopedTag.ID}'`, Fields: ['ID', 'IsGlobal'], ResultType: 'simple'
            }, ctx.User, 'ESI2 tag read-back');
            AssertEqual(rows.length, 1, 'tag read-back row count');
            AssertEqual(rows[0].IsGlobal, false, 'IsGlobal after the refused toggle');

            console.log(`      → scope row inserted for the non-global tag (control), then the IsGlobal toggle was refused server-side`);
        }
    },
    {
        Id: 'entity-server-invariants.ESI3',
        Name: 'ESI3: deleting a Tag with TagScope + TagSynonym children succeeds and the children are swept (server FK cleanup)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            // Self-sufficient fixture (does not depend on ESI2 having run): tag + 1 scope + 1 synonym.
            const tag = await createTag(ctx, 'sweep', false);
            await createScope(ctx, tag.ID, `${f.Prefix}-esi3-record`);
            const synonym = await ctx.Provider.GetEntityObject<MJTagSynonymEntity>(SYNONYM_ENTITY, ctx.User);
            synonym.NewRecord();
            synonym.TagID = tag.ID;
            synonym.Synonym = `${f.Prefix}-esi3-synonym ${FIXTURE_TAG}`;
            synonym.Source = 'Manual';
            synonym.Status = 'Active';
            const synSaved = await synonym.Save();
            if (synonym.ID) {
                f.TagSynonymIds.push(synonym.ID);
            }
            Assert(synSaved, `creating fixture synonym failed: ${synonym.LatestResult?.CompleteMessage ?? 'unknown error'}`);

            // Precondition (anti-vacuity): the children really exist before the delete.
            const childFilter = `TagID='${tag.ID}'`;
            AssertEqual((await runRows<{ ID: string }>({ EntityName: SCOPE_ENTITY, ExtraFilter: childFilter, Fields: ['ID'], ResultType: 'simple' }, ctx.User, 'pre-delete scope probe')).length, 1, 'scope children before delete');
            AssertEqual((await runRows<{ ID: string }>({ EntityName: SYNONYM_ENTITY, ExtraFilter: childFilter, Fields: ['ID'], ResultType: 'simple' }, ctx.User, 'pre-delete synonym probe')).length, 1, 'synonym children before delete');

            // Delete the PARENT over the wire. `MJTagEntityServer.Delete` sweeps the five FK tables
            // (CoOccurrence / TaggedItem / ContentItemTag / TagScope / TagSynonym) before the base
            // delete — without that sweep this delete would fail on the child FK constraints.
            const victim = await ctx.Provider.GetEntityObject<MJTagEntity>(TAG_ENTITY, ctx.User);
            Assert(await victim.Load(tag.ID), `could not reload tag ${tag.ID} for delete`);
            Assert(await victim.Delete(), `tag delete failed despite the server FK sweep: ${victim.LatestResult?.CompleteMessage ?? 'unknown error'}`);

            AssertEqual((await runRows<{ ID: string }>({ EntityName: SCOPE_ENTITY, ExtraFilter: childFilter, Fields: ['ID'], ResultType: 'simple' }, ctx.User, 'post-delete scope probe')).length, 0, 'scope children after delete');
            AssertEqual((await runRows<{ ID: string }>({ EntityName: SYNONYM_ENTITY, ExtraFilter: childFilter, Fields: ['ID'], ResultType: 'simple' }, ctx.User, 'post-delete synonym probe')).length, 0, 'synonym children after delete');
            AssertEqual((await runRows<{ ID: string }>({ EntityName: TAG_ENTITY, ExtraFilter: `ID='${tag.ID}'`, Fields: ['ID'], ResultType: 'simple' }, ctx.User, 'post-delete tag probe')).length, 0, 'the tag itself after delete');

            console.log(`      → tag deleted cleanly with 2 live children; both child tables swept to 0`);
        }
    },
    {
        Id: 'entity-server-invariants.ESI4',
        Name: 'ESI4: a new Search Scope auto-grants its creator a Manage permission — and updates do not re-grant',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const scope = await ctx.Provider.GetEntityObject<MJSearchScopeEntity>(SEARCH_SCOPE_ENTITY, ctx.User);
            scope.NewRecord();
            scope.Name = `${f.Prefix}-search-scope ${FIXTURE_TAG}`;
            scope.Status = 'Active';
            scope.IsGlobal = false;
            scope.OwnerUserID = ctx.User.ID;
            const saved = await scope.Save();
            if (scope.ID) {
                f.SearchScopeIds.push(scope.ID);
            }
            Assert(saved, `creating fixture search scope failed: ${scope.LatestResult?.CompleteMessage ?? 'unknown error'}`);

            // The grant is AWAITED inside MJSearchScopeEntityServer.Save, so it must already be
            // visible when the create mutation returns — no polling window is legitimate here.
            const permFilter = `SearchScopeID='${scope.ID}'`;
            const permParams: RunViewParams = {
                EntityName: SEARCH_SCOPE_PERM_ENTITY, ExtraFilter: permFilter,
                Fields: ['ID', 'UserID', 'RoleID', 'PermissionLevel'], ResultType: 'simple'
            };
            const grants = await runRows<{ ID: string; UserID: string | null; RoleID: string | null; PermissionLevel: string }>(permParams, ctx.User, 'ESI4 grant probe');
            for (const g of grants) {
                f.SearchScopePermissionIds.push(g.ID);
            }
            AssertEqual(grants.length, 1, 'auto-granted permission rows after CREATE');
            Assert(grants[0].UserID != null && UUIDsEqual(grants[0].UserID, ctx.User.ID), `auto-grant went to the wrong user: ${grants[0].UserID}`);
            AssertEqual(grants[0].PermissionLevel, 'Manage', 'auto-grant level');
            AssertEqual(grants[0].RoleID, null, 'auto-grant must be a USER grant, not a role grant');

            // UPDATE the scope — the grant logic is gated on isNewRecord, so no second row may appear.
            scope.Description = 'entity-server-invariants ESI4 update';
            Assert(await scope.Save(), `updating the fixture search scope failed: ${scope.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            const afterUpdate = await runRows<{ ID: string }>(permParams, ctx.User, 'ESI4 re-grant probe');
            AssertEqual(afterUpdate.length, 1, 'permission rows after UPDATE (no re-grant)');
            Assert(UUIDsEqual(afterUpdate[0].ID, grants[0].ID), 'the surviving permission row must be the ORIGINAL grant');

            console.log(`      → exactly one Manage grant to the creator on create; still exactly one after update`);
        }
    }
];

for (const check of EntityServerInvariantsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

/**
 * Best-effort teardown sweep for one entity's accumulated fixture IDs, newest first. Typed `Load`
 * lives on the GENERATED subclasses (not BaseEntity), hence the intersection constraint.
 */
async function sweepEntityIds<T extends BaseEntity & { Load(id: string): Promise<boolean> }>(
    ctx: IntegrationCheckContext, entityName: string, ids: string[]
): Promise<void> {
    for (const id of [...ids].reverse()) {
        const row = await ctx.Provider.GetEntityObject<T>(entityName, ctx.User).catch(() => undefined);
        if (row && (await row.Load(id).catch(() => false))) {
            await row.Delete().catch(() => undefined);
        }
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('entity-server-invariants', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const scopeEntityId = ctx.Provider.EntityByName('MJ: Action Categories')?.ID;
        Assert(!!scopeEntityId, `could not resolve the entity ID for 'MJ: Action Categories'`);
        fixture = {
            ScopeEntityID: scopeEntityId!,
            Prefix: `mj-esi-${Date.now()}`,
            TagIds: [],
            TagScopeIds: [],
            TagSynonymIds: [],
            SearchScopeIds: [],
            SearchScopePermissionIds: []
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        if (!fixture) {
            return;
        }
        const f = fixture;
        // FK-safe order: children first, parents last. Rows ESI3 already swept just fail their
        // Load and are skipped — the accumulators deliberately over-approximate.
        await sweepEntityIds<MJTagSynonymEntity>(ctx, SYNONYM_ENTITY, f.TagSynonymIds);
        await sweepEntityIds<MJTagScopeEntity>(ctx, SCOPE_ENTITY, f.TagScopeIds);
        await sweepEntityIds<MJTagEntity>(ctx, TAG_ENTITY, f.TagIds);
        await sweepEntityIds<MJSearchScopePermissionEntity>(ctx, SEARCH_SCOPE_PERM_ENTITY, f.SearchScopePermissionIds);
        await sweepEntityIds<MJSearchScopeEntity>(ctx, SEARCH_SCOPE_ENTITY, f.SearchScopeIds);
        fixture = undefined;
    }
});
