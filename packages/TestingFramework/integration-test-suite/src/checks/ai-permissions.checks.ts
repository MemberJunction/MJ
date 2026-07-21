/**
 * ai-permissions.checks.ts — the 'ai-permissions' bundle (APM1–APM6): the AI-SPECIFIC helper
 * semantics of the dual-path agent/skill permission model, per test-catalog Domain 4
 * (AI2/AI3/SEC9/SEC11), guides/UNIFIED_PERMISSIONS_GUIDE.md.
 *
 * TRANSPORT: **CLIENT-CAPABLE** (recommend client-first, same as permission-engine). The
 * helpers, `AIEngineBase` caches, and the unified providers are all provider-agnostic.
 *
 * DELIBERATE NON-OVERLAP with permission-engine.checks.ts (PE1–PE13):
 *   - PE6/PE7 pin the zero-grant OPEN(helper)-vs-CLOSED(provider) DIVERGENCE per resource type;
 *   - PE8 pins the skill pure core's grant-closes-default + user-grant hierarchy collapse;
 *   - PE5 pins the unified agent provider's null-resource refusal + stranger denial for ctx.User.
 * This bundle covers what those do NOT: the stranger-id fail-CLOSED behavior of the OPEN path
 * (APM1), the ROLE-grant leg through UserRoles (APM2), the owner short-circuit outranking
 * restrictive rows (APM3), user+role OR-merge/union semantics (APM4), hierarchy monotonicity of
 * the accessible-set surfaces (APM5), and the seeded no-grant principal's EMPTINESS on the
 * closed path's inventory surfaces `GetUserResources`/`GetResourcePermissions` (APM6).
 *
 * ZERO MUTATION: APM2–APM4 drive `AISkillPermissionHelper.ComputeEffectivePermissions` — the
 * exported synchronous pure core — with UNSAVED `MJ: AI Skill Permissions` rows and SYNTHETIC
 * `UserInfo` principals (the PE8 technique), so grant/role/owner shapes are constructed without
 * writing a row or touching any real record's behavior. The agent helper deliberately has NO
 * exported pure core, so its row-matching semantics are pinned via the skill sibling (the two
 * implementations are line-for-line parallel); the agent-side live-grant e2e remains the
 * mutation-tier catalog item AI3 (see omissions in the bundle report).
 *
 * ANTI-VACUITY: every check is a DENY, a DIFFERENCE, or a SHAPE assertion — never "can the
 * high-privilege harness user do X". Data-dependent checks skip-as-pass LOUDLY.
 */
import { RunView, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { PermissionEngine } from '@memberjunction/core-entities';
import type { MJAISkillEntity, MJAISkillPermissionEntity } from '@memberjunction/core-entities';
import { AIEngineBase, AIAgentPermissionHelper, AISkillPermissionHelper } from '@memberjunction/ai-engine-base';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** A GUID that is never a real agent/skill/user id — the stranger probe. */
const STRANGER_ID = '00000000-0000-4000-8000-0000000000EE';

/** Synthetic role ids for the pure role-grant shapes (never persisted, only matched in memory). */
const ROLE_A = '00000000-0000-4000-8000-00000000AA01';
const ROLE_B = '00000000-0000-4000-8000-00000000AA02';

/** Synthetic principal id for the pure shapes. */
const SYNTH_USER_ID = '00000000-0000-4000-8000-00000000AB01';

/** The seeded role-less integration principal (same as permission-engine / rls-isolation). */
const SEEDED_NOGRANT_EMAIL = 'it-nogrant@integration.test';

/** The command that seeds the integration principals — printed in every skip-as-pass warning. */
const SEED_FIXTURES_COMMAND = 'npx mj sync push --dir=metadata-optional/integration-test';

/** Loud, uniform skip-as-pass note. */
function skipNote(checkId: string, reason: string): void {
    console.warn(`  ⚠ ai-permissions.${checkId} SKIPPED — ${reason}`);
}

/** Ensure the AI metadata cache (agents/skills + permission rows) is loaded. */
async function configuredAIEngine(ctx: IntegrationCheckContext): Promise<AIEngineBase> {
    const engine = AIEngineBase.Instance;
    await engine.Config(false, ctx.User, ctx.Provider);
    return engine;
}

/** Build a synthetic (never-persisted) principal with the given role memberships. */
function makeSyntheticUser(ctx: IntegrationCheckContext, id: string, roleIds: string[]): UserInfo {
    return new UserInfo(ctx.Provider, {
        ID: id,
        Name: `ai-permissions synthetic ${id.slice(-4)}`,
        Email: `it-synth-${id.slice(-4)}@integration.test`,
        Type: 'User',
        IsActive: true,
        UserRoles: roleIds.map(rid => new UserRoleInfo({ UserID: id, RoleID: rid }))
    });
}

/**
 * Build an UNSAVED `MJ: AI Skill Permissions` row for the pure core. Never saved — zero
 * mutation (the PE8 technique).
 */
async function makeUnsavedGrant(
    ctx: IntegrationCheckContext,
    skillId: string,
    grant: { userId?: string | null; roleId?: string | null; canView?: boolean; canRun?: boolean; canEdit?: boolean; canDelete?: boolean }
): Promise<MJAISkillPermissionEntity> {
    const p = await ctx.Provider.GetEntityObject<MJAISkillPermissionEntity>('MJ: AI Skill Permissions', ctx.User);
    p.NewRecord();
    p.SkillID = skillId;
    p.UserID = grant.userId ?? null;
    p.RoleID = grant.roleId ?? null;
    p.CanView = grant.canView === true;
    p.CanRun = grant.canRun === true;
    p.CanEdit = grant.canEdit === true;
    p.CanDelete = grant.canDelete === true;
    return p;
}

/** Any real skill NOT owned by the synthetic principal (any skill qualifies — the id is synthetic). */
function anyNonSyntheticOwnedSkill(engine: AIEngineBase): MJAISkillEntity | undefined {
    return engine.Skills.find(s => !UUIDsEqual(s.CreatedByUserID, SYNTH_USER_ID));
}

/**
 * Per-process memo for the seeded no-grant principal. `undefined` = not yet looked up;
 * `{ User: undefined }` = looked up and absent.
 */
let noGrantUserMemo: { User: UserInfo | undefined } | undefined = undefined;

/** Load the seeded role-less user client-side (same reconstruction as permission-engine PE9). */
async function loadSeededNoGrantUser(ctx: IntegrationCheckContext): Promise<UserInfo | undefined> {
    if (noGrantUserMemo !== undefined) {
        return noGrantUserMemo.User;
    }
    const rv = new RunView();
    const userResult = await rv.RunView<{ ID: string; Name: string; Email: string; Type: string; IsActive: boolean }>({
        EntityName: 'MJ: Users',
        ExtraFilter: `Email='${SEEDED_NOGRANT_EMAIL}'`,
        Fields: ['ID', 'Name', 'Email', 'Type', 'IsActive'],
        ResultType: 'simple'
    }, ctx.User);
    if (!userResult.Success || userResult.Results.length === 0) {
        noGrantUserMemo = { User: undefined };
        return undefined;
    }
    const row = userResult.Results[0];
    const roleResult = await rv.RunView<{ UserID: string; RoleID: string }>({
        EntityName: 'MJ: User Roles',
        ExtraFilter: `UserID='${row.ID}'`,
        Fields: ['UserID', 'RoleID'],
        ResultType: 'simple'
    }, ctx.User);
    if (roleResult.Success && roleResult.Results.length > 0) {
        console.warn(`  ⚠ '${SEEDED_NOGRANT_EMAIL}' has ${roleResult.Results.length} role(s) — fixture invalid, dependent checks will skip`);
        noGrantUserMemo = { User: undefined };
        return undefined;
    }
    const user = new UserInfo(ctx.Provider, { ...row, UserRoles: [] });
    noGrantUserMemo = { User: user };
    return user;
}

export const AiPermissionsChecks: NamedCheck[] = [
    {
        Id: 'ai-permissions.APM1',
        Name: 'APM1: DENY — a NONEXISTENT agent/skill id fails CLOSED on the open-by-default helper path',
        Fn: async (ctx): Promise<void> => {
            // The open default ("no grant rows → View+Run for everyone") must apply only to
            // resources that EXIST. A helper that fell back to the open default for an unknown id
            // would authorize Run against anything a caller invents. Both helpers document
            // fail-closed-on-error; this pins it.
            await configuredAIEngine(ctx); // ensure the lookup failure is "not found", not "not loaded"

            const agentEff = await AIAgentPermissionHelper.GetEffectivePermissions(STRANGER_ID, ctx.User);
            AssertEqual(agentEff.canView, false, 'unknown agent id yielded View — the open default leaked to a nonexistent resource (SECURITY)');
            AssertEqual(agentEff.canRun, false, 'unknown agent id yielded Run (SECURITY)');
            AssertEqual(agentEff.canEdit, false, 'unknown agent id yielded Edit (SECURITY)');
            AssertEqual(agentEff.canDelete, false, 'unknown agent id yielded Delete (SECURITY)');
            AssertEqual(agentEff.isOwner, false, 'unknown agent id reported ownership');
            AssertEqual(await AIAgentPermissionHelper.HasPermission(STRANGER_ID, ctx.User, 'run'), false, 'HasPermission(run) allowed an unknown agent');

            const skillEff = await AISkillPermissionHelper.GetEffectivePermissions(STRANGER_ID, ctx.User);
            AssertEqual(skillEff.canView, false, 'unknown skill id yielded View (SECURITY)');
            AssertEqual(skillEff.canRun, false, 'unknown skill id yielded Run (SECURITY)');
            AssertEqual(skillEff.canEdit, false, 'unknown skill id yielded Edit (SECURITY)');
            AssertEqual(skillEff.canDelete, false, 'unknown skill id yielded Delete (SECURITY)');
            AssertEqual(await AISkillPermissionHelper.HasPermission(STRANGER_ID, ctx.User, 'view'), false, 'HasPermission(view) allowed an unknown skill');
            console.log('      → both helpers fail CLOSED (all false) for a nonexistent resource id');
        }
    },
    {
        Id: 'ai-permissions.APM2',
        Name: 'APM2: role grants flow through UserRoles — matching role granted, non-matching role gets NOTHING, role-Delete collapses downward',
        Fn: async (ctx): Promise<void> => {
            // PE8 proved the USER-grant legs of the pure core; this is the ROLE leg (SEC11's
            // "role-grant via UserRoles"): the helper matches grant rows by RoleID against the
            // principal's UserRoles — pure, in-memory, zero mutation.
            const engine = await configuredAIEngine(ctx);
            const skill = anyNonSyntheticOwnedSkill(engine);
            if (!skill) {
                skipNote('APM2', 'no AI Skills in metadata — the role-grant leg is unexercised');
                return;
            }
            const userWithRoleA = makeSyntheticUser(ctx, SYNTH_USER_ID, [ROLE_A]);
            const userWithRoleB = makeSyntheticUser(ctx, SYNTH_USER_ID, [ROLE_B]);

            // 1. A Run grant to ROLE_A reaches a member of ROLE_A (with the Run⇒View collapse)…
            const roleRunGrant = await makeUnsavedGrant(ctx, skill.ID, { roleId: ROLE_A, canRun: true });
            const granted = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [roleRunGrant], userWithRoleA);
            AssertEqual(granted.canRun, true, 'role-based Run grant did not reach a member of the role');
            AssertEqual(granted.canView, true, 'role-based Run grant did not imply View');
            AssertEqual(granted.canEdit, false, 'role-based Run grant ESCALATED to Edit (SECURITY)');
            AssertEqual(granted.canDelete, false, 'role-based Run grant ESCALATED to Delete (SECURITY)');

            // 2. …and gives NOTHING to a member of a different role (the grant row also closes
            //    the open default for them).
            const denied = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [roleRunGrant], userWithRoleB);
            AssertEqual(denied.canView, false, 'a ROLE_A grant yielded View to a ROLE_B-only user (SECURITY)');
            AssertEqual(denied.canRun, false, 'a ROLE_A grant yielded Run to a ROLE_B-only user (SECURITY)');

            // 3. A Delete grant to the role collapses the full hierarchy downward for members.
            const roleDeleteGrant = await makeUnsavedGrant(ctx, skill.ID, { roleId: ROLE_A, canDelete: true });
            const collapsed = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [roleDeleteGrant], userWithRoleA);
            AssertEqual(collapsed.canDelete, true, 'role-based Delete grant did not yield Delete');
            AssertEqual(collapsed.canEdit, true, 'role Delete did not imply Edit (hierarchy collapse broken)');
            AssertEqual(collapsed.canRun, true, 'role Delete did not imply Run');
            AssertEqual(collapsed.canView, true, 'role Delete did not imply View');
            console.log(`      → role grants on '${skill.Name}': matching role granted (downward only), non-matching role fully denied`);
        }
    },
    {
        Id: 'ai-permissions.APM3',
        Name: 'APM3: the OWNER short-circuit outranks restrictive grant rows — grants cannot demote an owner',
        Fn: async (ctx): Promise<void> => {
            // Precedence pin: ownership is evaluated BEFORE the grant rows, so even a grant list
            // that names only OTHER people (which closes the open default for everyone else)
            // leaves the owner with everything. Evaluated as a synthetic principal whose ID is
            // the skill's real CreatedByUserID — no real user's session, no mutation.
            const engine = await configuredAIEngine(ctx);
            const owned = engine.Skills.find(s => s.CreatedByUserID != null && s.CreatedByUserID.trim().length > 0);
            if (!owned) {
                skipNote('APM3', 'no AI Skill with a non-null CreatedByUserID — the owner short-circuit is unexercised');
                return;
            }
            const ownerIdentity = makeSyntheticUser(ctx, owned.CreatedByUserID as string, []);
            const foreignOnly = await makeUnsavedGrant(ctx, owned.ID, { userId: STRANGER_ID, canView: true });

            const asOwner = AISkillPermissionHelper.ComputeEffectivePermissions(owned, [foreignOnly], ownerIdentity);
            AssertEqual(asOwner.isOwner, true, 'the creator identity was not recognized as owner');
            AssertEqual(asOwner.canView, true, 'a foreign grant row demoted the owner from View');
            AssertEqual(asOwner.canRun, true, 'a foreign grant row demoted the owner from Run');
            AssertEqual(asOwner.canEdit, true, 'a foreign grant row demoted the owner from Edit');
            AssertEqual(asOwner.canDelete, true, 'a foreign grant row demoted the owner from Delete');

            // The DIFFERENCE that makes this non-vacuous: the same grant list denies a non-owner.
            const stranger = makeSyntheticUser(ctx, SYNTH_USER_ID, []);
            const asStranger = AISkillPermissionHelper.ComputeEffectivePermissions(owned, [foreignOnly], stranger);
            AssertEqual(asStranger.canView, false, 'precondition broke: the foreign grant list should deny a non-owner');
            console.log(`      → owner of '${owned.Name}' keeps full access under a grant list that denies everyone else`);
        }
    },
    {
        Id: 'ai-permissions.APM4',
        Name: 'APM4: user + role grants OR-MERGE (union) — neither row alone yields the combined surface',
        Fn: async (ctx): Promise<void> => {
            // Grant precedence contract: there is NO "most specific wins" — a user-directed row
            // and a role-directed row aggregate by OR. Pinning union semantics stops a future
            // "user row overrides role rows" refactor from silently shrinking (or widening)
            // effective access.
            const engine = await configuredAIEngine(ctx);
            const skill = anyNonSyntheticOwnedSkill(engine);
            if (!skill) {
                skipNote('APM4', 'no AI Skills in metadata — the union-merge leg is unexercised');
                return;
            }
            const principal = makeSyntheticUser(ctx, SYNTH_USER_ID, [ROLE_A]);
            const userViewGrant = await makeUnsavedGrant(ctx, skill.ID, { userId: SYNTH_USER_ID, canView: true });
            const roleRunGrant = await makeUnsavedGrant(ctx, skill.ID, { roleId: ROLE_A, canRun: true });

            // Each row alone: strictly its own (collapsed) surface.
            const viewOnly = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [userViewGrant], principal);
            AssertEqual(viewOnly.canView, true, 'user View grant did not yield View');
            AssertEqual(viewOnly.canRun, false, 'user View grant escalated to Run');
            const runOnly = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [roleRunGrant], principal);
            AssertEqual(runOnly.canRun, true, 'role Run grant did not yield Run');
            AssertEqual(runOnly.canEdit, false, 'role Run grant escalated to Edit');

            // Together: the union — and nothing more.
            const merged = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [userViewGrant, roleRunGrant], principal);
            AssertEqual(merged.canView, true, 'union lost the user View grant');
            AssertEqual(merged.canRun, true, 'union lost the role Run grant');
            AssertEqual(merged.canEdit, false, 'union INVENTED Edit from View+Run rows (SECURITY)');
            AssertEqual(merged.canDelete, false, 'union INVENTED Delete (SECURITY)');
            console.log(`      → user View + role Run on '${skill.Name}' merge to exactly {View, Run} — OR union, no precedence, no escalation`);
        }
    },
    {
        Id: 'ai-permissions.APM5',
        Name: 'APM5: accessible-set monotonicity — delete ⊆ edit ⊆ run ⊆ view for agents AND skills',
        Fn: async (ctx): Promise<void> => {
            // SHAPE assertion over the real deployment: the Delete⇒Edit⇒Run⇒View hierarchy means
            // the accessible sets must NEST for any identity. A hierarchy inversion (or a filter
            // that consults the wrong permission bit) breaks the nesting regardless of who asks —
            // which is what makes this non-vacuous under a high-privilege harness user.
            const engine = await configuredAIEngine(ctx);
            const levels = ['delete', 'edit', 'run', 'view'] as const;

            const assertNested = (label: string, sets: Map<(typeof levels)[number], Set<string>>): void => {
                for (let i = 0; i < levels.length - 1; i++) {
                    const narrower = sets.get(levels[i]);
                    const wider = sets.get(levels[i + 1]);
                    const leaked = [...(narrower ?? new Set<string>())].filter(id => !(wider ?? new Set<string>()).has(id));
                    Assert(
                        leaked.length === 0,
                        `${label}: ${leaked.length} resource(s) accessible at '${levels[i]}' but NOT at '${levels[i + 1]}' — hierarchy inversion (e.g. ${leaked[0]})`
                    );
                }
            };

            if (engine.Agents.length === 0) {
                skipNote('APM5', 'no AI Agents in metadata — the agent accessible-set leg is unexercised');
            } else {
                const agentSets = new Map<(typeof levels)[number], Set<string>>();
                for (const level of levels) {
                    const agents = await AIAgentPermissionHelper.GetAccessibleAgents(ctx.User, level);
                    agentSets.set(level, new Set(agents.map(a => a.ID.toLowerCase())));
                }
                assertNested('agents', agentSets);
                console.log(`      → agents nested: delete=${agentSets.get('delete')!.size} ⊆ edit=${agentSets.get('edit')!.size} ⊆ run=${agentSets.get('run')!.size} ⊆ view=${agentSets.get('view')!.size} (of ${engine.Agents.length})`);
            }

            if (engine.Skills.length === 0) {
                skipNote('APM5', 'no AI Skills in metadata — the skill accessible-set leg is unexercised');
            } else {
                const skillSets = new Map<(typeof levels)[number], Set<string>>();
                for (const level of levels) {
                    const skills = await AISkillPermissionHelper.GetAccessibleSkills(ctx.User, level);
                    skillSets.set(level, new Set(skills.map(s => s.ID.toLowerCase())));
                }
                assertNested('skills', skillSets);
                console.log(`      → skills nested: delete=${skillSets.get('delete')!.size} ⊆ edit=${skillSets.get('edit')!.size} ⊆ run=${skillSets.get('run')!.size} ⊆ view=${skillSets.get('view')!.size} (of ${engine.Skills.length})`);
            }
        }
    },
    {
        Id: 'ai-permissions.APM6',
        Name: 'APM6: DENY — the seeded no-grant user is EMPTY on the closed path inventory surfaces (GetUserResources / GetResourcePermissions)',
        Fn: async (ctx): Promise<void> => {
            // PE5/PE6/PE7 pin CheckPermission/GetEffectivePermissions; this pins the two
            // INVENTORY surfaces the Sharing Center actually renders: a principal with zero
            // grants must see an empty "shared with me" inventory (GetUserResources → []), and a
            // zero-grant resource must audit as having NO grantees (GetResourcePermissions → []).
            const noGrant = await loadSeededNoGrantUser(ctx);
            if (!noGrant) {
                skipNote('APM6', `seeded user '${SEEDED_NOGRANT_EMAIL}' not found — seed with: ${SEED_FIXTURES_COMMAND}`);
                return;
            }
            const unified = PermissionEngine.Instance;
            await unified.Config(false, ctx.User, ctx.Provider);

            const domains: Array<{ Domain: string; ResourceType: string }> = [
                { Domain: 'AI Agent Permissions', ResourceType: 'AI Agents' },
                { Domain: 'AI Skill Permissions', ResourceType: 'AI Skills' }
            ];
            let exercised = 0;
            for (const { Domain, ResourceType } of domains) {
                const provider = unified.GetProvider(Domain);
                if (!provider) {
                    skipNote('APM6', `the '${Domain}' domain is not active in this deployment`);
                    continue;
                }
                const inventory = await provider.GetUserResources(noGrant, ResourceType);
                AssertEqual(inventory.length, 0,
                    `${Domain}: GetUserResources reported ${inventory.length} grant(s) for the zero-grant principal — closed-path inventory leaked (SECURITY)`);
                const unscoped = await provider.GetUserResources(noGrant);
                AssertEqual(unscoped.length, 0, `${Domain}: unscoped GetUserResources leaked ${unscoped.length} row(s) for the zero-grant principal`);
                exercised++;
            }

            // The resource-side inventory: a zero-grant agent audits as ungranted.
            const engine = await configuredAIEngine(ctx);
            const agentProvider = unified.GetProvider('AI Agent Permissions');
            if (agentProvider) {
                const grantedAgentIds = new Set(engine.AgentPermissions.map(p => p.AgentID.toLowerCase()));
                const zeroGrantAgent = engine.Agents.find(a => !grantedAgentIds.has(a.ID.toLowerCase()));
                if (!zeroGrantAgent) {
                    skipNote('APM6', `every one of the ${engine.Agents.length} agent(s) has grant rows — the resource-side empty-inventory leg is unexercised`);
                } else {
                    const audit = await agentProvider.GetResourcePermissions('AI Agents', zeroGrantAgent.ID);
                    AssertEqual(audit.length, 0, `GetResourcePermissions invented ${audit.length} grantee(s) for zero-grant agent '${zeroGrantAgent.Name}'`);
                }
            }
            Assert(exercised > 0, 'neither AI permission domain was active — nothing was exercised (configure the domains or investigate the catalog)');
            console.log(`      → '${SEEDED_NOGRANT_EMAIL}' sees an empty closed-path inventory across ${exercised} AI domain(s)`);
        }
    }
];

for (const check of AiPermissionsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
