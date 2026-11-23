/**
 * Agent Instances & Multi-Level Prototype Inheritance (IT186, server transport, mutating).
 *
 * Verifies end-to-end against live SQL Server:
 *   - AII1: 3-level `L0 -> L1 -> L2` inheritance chain, `vwAIAgents` CodeGen hierarchy columns
 *           (`RootBaseAgentID`, `BaseAgentIDDepth`, `BaseAgentIDPath`), and `GetBaseAgentIDAncestors()`.
 *   - AII2: Live prototype inheritance of actions, skills, and stacked `AdditionalInstructions`,
 *           plus child `Disabled` action veto.
 *   - AII3: 2x2 RBAC privacy for derived agents (`BaseAgentID != null`, 0 ACL rows -> private to
 *           `OwnerUserID`), Ancestor `CanRun` invariant (revoking L1 role revokes L2 `CanRun`),
 *           and live SQL RLS enforcement (`UserAccessibleAIAgents`) hiding Alice's private instance from Bob.
 *   - AII4: Multiple personal instances (`Pepper` & `Cato`) under one base with automatic primary
 *           uniqueness flip, ancestor policy ceiling intersection (`GetEffectivePolicyForAgentChain`),
 *           and `AIAgentNote` org-note inheritance with sibling per-user memory isolation.
 *   - AII5: `MJAIAgentEntityServer` sandbox guards blocking non-Owner root agent creation,
 *           cross-user modification of derived instances, and inheritance chains exceeding MaxDepth (5).
 *   - AII6: Real `GetMyCalendarAndAvailabilityAction`, `ManageMyCalendarEventAction`, and
 *           `ManageMyEmailInboxAction` executed as a derived Chief of Staff instance (`Pepper`)
 *           against `LocalJsonCommunicationProvider` (`MJ_MOCK_COMM_DIR`), verifying calendar &
 *           free/busy reads under `ProposeWithApproval`, real `MJ: AI Agent Requests` approval row
 *           creation attributed to `Pepper.ID`, and `DraftOnly` draft persistence to disk.
 *   - AII7: Saving a 2nd derived Chief of Staff instance (`Jarvis`) with `IsPrimaryInstance = true`
 *           flips the 1st instance (`Pepper`) to `IsPrimaryInstance = false` in SQL and in
 *           `AIEngineBase` cache.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CompositeKey, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentActionEntity,
    MJAIAgentEntity,
    MJAIAgentNoteEntity,
    MJAIAgentPermissionEntity,
    MJAIAgentRequestEntity,
    MJAIAgentSkillEntity,
    MJAIAgentUserPolicyEntity,
    MJRoleEntity,
    MJUserEntity,
    MJUserRoleEntity,
} from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam, ActionResult, RunActionParams } from '@memberjunction/actions-base';
import { AgentUserPolicyEngine, ApplyDefaultAgentUserPolicyValues } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentContextInjector } from '@memberjunction/ai-agents';
import {
    CommunicationEngine,
    LocalJsonCommunicationProvider,
    MJ_MOCK_COMM_DIR_ENV,
} from '@memberjunction/communication-engine';
import { EscapeSQLString, UUIDsEqual, UUIDSet } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { MUTATION_TIER_OFF_REASON, MutationTierOn } from './fixture-gates';

const BUNDLE = 'agent-instances-and-inheritance';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

interface HierarchyViewRow {
    ID: string;
    Name: string;
    BaseAgentID: string | null;
    RootBaseAgentID: string | null;
    BaseAgentIDDepth: number | null;
    BaseAgentIDPath: string | null;
}

interface AgentInstancesFixture {
    Prefix: string;
    AgentTypeID: string;
    UI_RoleID: string;
    SalesRoleID: string;
    AliceUser: UserInfo;
    BobUser: UserInfo;
    CreatedAgentIDs: string[];
    CreatedActionLinkIDs: string[];
    CreatedSkillLinkIDs: string[];
    CreatedPermIDs: string[];
    CreatedPolicyIDs: string[];
    CreatedNoteIDs: string[];
    CreatedRequestIDs: string[];
    CreatedLogIDs: string[];
    CreatedUserRoleIDs: string[];
    CreatedUserIDs: string[];
    CreatedRoleIDs: string[];
    L0_ID?: string;
    L1_ID?: string;
    L2_ID?: string;
    CoSRoot_ID?: string;
    CoSPepper_ID?: string;
}

let fixture: AgentInstancesFixture | undefined;
let skipReason: string | undefined;

function fx(): AgentInstancesFixture {
    if (skipReason) {
        SkipCheck(skipReason);
    }
    Assert(fixture != null, `${BUNDLE} fixture missing (bundle Setup did not run)`);
    return fixture!;
}

async function createAgentRow(
    ctx: IntegrationCheckContext,
    actor: UserInfo,
    fields: {
        Name: string;
        BaseAgentID?: string | null;
        OwnerUserID?: string | null;
        InstantiationMode?: MJAIAgentEntity['InstantiationMode'];
        AcceptsSkills?: MJAIAgentEntity['AcceptsSkills'];
        AdditionalInstructions?: string | null;
        IsPrimaryInstance?: boolean;
        IconClass?: string | null;
    }
): Promise<MJAIAgentEntity> {
    const f = fx();
    const agent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', actor);
    agent.NewRecord();
    agent.Name = fields.Name;
    agent.Description = `IT186 test agent ${FIXTURE_TAG}`;
    agent.TypeID = f.AgentTypeID;
    agent.Status = 'Active';
    agent.BaseAgentID = fields.BaseAgentID ?? null;
    if (fields.OwnerUserID) {
        agent.OwnerUserID = fields.OwnerUserID;
    }
    agent.InstantiationMode = fields.InstantiationMode ?? 'None';
    if (fields.AcceptsSkills !== undefined) {
        agent.AcceptsSkills = fields.AcceptsSkills;
    }
    agent.AdditionalInstructions = fields.AdditionalInstructions ?? null;
    if (fields.IsPrimaryInstance !== undefined) {
        agent.IsPrimaryInstance = fields.IsPrimaryInstance;
    }
    agent.IconClass = fields.IconClass ?? 'fa-solid fa-robot';
    const saved = await agent.Save();
    if (agent.ID) {
        f.CreatedAgentIDs.push(agent.ID);
    }
    Assert(
        saved,
        `creating agent '${fields.Name}' failed: ${agent.LatestResult?.CompleteMessage ?? 'unknown error'}`
    );
    return agent;
}

async function checkAii1ThreeLevelHierarchyAndViewColumns(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const l0 = await createAgentRow(ctx, ctx.User, {
        Name: `${f.Prefix}-L0-Template`,
        InstantiationMode: 'Optional',
        AcceptsSkills: 'Limited',
        AdditionalInstructions: 'L0 root org rule: cite sources.',
    });
    const l1 = await createAgentRow(ctx, ctx.User, {
        Name: `${f.Prefix}-L1-SalesDept`,
        BaseAgentID: l0.ID,
        InstantiationMode: 'Optional',
        AdditionalInstructions: 'L1 sales rule: focus on pipeline velocity.',
    });
    const l2 = await createAgentRow(ctx, ctx.User, {
        Name: `${f.Prefix}-L2-AlicePersonal`,
        BaseAgentID: l1.ID,
        OwnerUserID: f.AliceUser.ID,
        InstantiationMode: 'None',
        AdditionalInstructions: 'L2 personal rule: keep answers to 3 bullets.',
        IconClass: 'fa-solid fa-pepper-hot',
    });
    AssertEqual(l2.AcceptsSkills, 'Limited', 'AII1: L2 should inherit AcceptsSkills=Limited from L0 -> L1 on create');
    AssertEqual(l2.IsPrimaryInstance, true, 'AII1: first derived instance for (Alice, L0) should auto-default IsPrimaryInstance=true');

    f.L0_ID = l0.ID;
    f.L1_ID = l1.ID;
    f.L2_ID = l2.ID;

    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const viewRes = await rv.RunView<HierarchyViewRow>(
        {
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `ID='${EscapeSQLString(l2.ID)}'`,
            Fields: ['ID', 'Name', 'BaseAgentID', 'RootBaseAgentID', 'BaseAgentIDDepth', 'BaseAgentIDPath'],
            ResultType: 'simple',
        },
        ctx.User
    );
    Assert(viewRes.Success && viewRes.Results.length === 1, 'AII1: vwAIAgents query for L2 failed');
    const row = viewRes.Results[0];
    Assert(
        UUIDsEqual(row.RootBaseAgentID, l0.ID),
        `AII1: expected RootBaseAgentID=${l0.ID}, got ${row.RootBaseAgentID}`
    );
    AssertEqual(row.BaseAgentIDDepth, 2, 'AII1: expected BaseAgentIDDepth=2 for L2');
    const pathLower = (row.BaseAgentIDPath ?? '').toLowerCase();
    Assert(
        pathLower.includes(l0.ID.toLowerCase()) &&
            pathLower.includes(l1.ID.toLowerCase()) &&
            pathLower.includes(l2.ID.toLowerCase()),
        `AII1: BaseAgentIDPath should contain L0, L1, and L2 IDs; got ${row.BaseAgentIDPath}`
    );

    const ancestors = await l2.GetBaseAgentIDAncestors();
    Assert(
        ancestors.length === 2 &&
            ancestors.some((a) => UUIDsEqual(a.ID, l0.ID)) &&
            ancestors.some((a) => UUIDsEqual(a.ID, l1.ID)),
        `AII1: GetBaseAgentIDAncestors() expected [L0, L1], got ${ancestors.map((a) => a.ID).join(',')}`
    );
    console.log('      → 3-level L0->L1->L2 hierarchy columns & GetBaseAgentIDAncestors verified on SQL Server');
}

async function checkAii2LiveInheritanceVetoAndStackedInstructions(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    Assert(Boolean(f.L0_ID && f.L1_ID && f.L2_ID), 'AII2 requires AII1 fixtures');

    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const actionsRes = await rv.RunView<{ ID: string; Name: string }>(
        {
            EntityName: 'MJ: Actions',
            ExtraFilter: `Status='Active'`,
            Fields: ['ID', 'Name'],
            MaxRows: 2,
            ResultType: 'simple',
        },
        ctx.User
    );
    Assert(actionsRes.Success && actionsRes.Results.length >= 2, 'AII2: need at least 2 active actions in DB');
    const [act1, act2] = actionsRes.Results;

    // Bind two active actions onto L0
    for (const act of [act1, act2]) {
        const link = await ctx.Provider.GetEntityObject<MJAIAgentActionEntity>('MJ: AI Agent Actions', ctx.User);
        link.NewRecord();
        link.AgentID = f.L0_ID!;
        link.ActionID = act.ID;
        link.Status = 'Active';
        Assert(await link.Save(), `AII2: failed to bind action ${act.Name} on L0`);
        f.CreatedActionLinkIDs.push(link.ID);
    }

    // Bind an active skill onto L0 (if any skill exists in DB)
    const skillsRes = await rv.RunView<{ ID: string; Name: string }>(
        {
            EntityName: 'MJ: AI Skills',
            ExtraFilter: `Status='Active'`,
            Fields: ['ID', 'Name'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        ctx.User
    );
    const testSkill = skillsRes.Success && skillsRes.Results.length > 0 ? skillsRes.Results[0] : null;
    if (testSkill) {
        const skillLink = await ctx.Provider.GetEntityObject<MJAIAgentSkillEntity>('MJ: AI Agent Skills', ctx.User);
        skillLink.NewRecord();
        skillLink.AgentID = f.L0_ID!;
        skillLink.SkillID = testSkill.ID;
        skillLink.Status = 'Active';
        Assert(await skillLink.Save(), `AII2: failed to bind skill ${testSkill.Name} on L0`);
        f.CreatedSkillLinkIDs.push(skillLink.ID);
    }

    // Veto act2 on L2 with Status='Revoked'
    const vetoLink = await ctx.Provider.GetEntityObject<MJAIAgentActionEntity>('MJ: AI Agent Actions', ctx.User);
    vetoLink.NewRecord();
    vetoLink.AgentID = f.L2_ID!;
    vetoLink.ActionID = act2.ID;
    vetoLink.Status = 'Revoked';
    Assert(await vetoLink.Save(), `AII2: failed to create Revoked action veto on L2`);
    f.CreatedActionLinkIDs.push(vetoLink.ID);

    await AIEngine.Instance.Config(true, ctx.User);

    const effectiveActions = AIEngine.Instance.GetEffectiveAgentActions(f.L2_ID!);
    Assert(
        effectiveActions.some((aa) => UUIDsEqual(aa.ActionID, act1.ID)),
        'AII2: L2 should inherit act1 live from L0'
    );
    Assert(
        !effectiveActions.some((aa) => UUIDsEqual(aa.ActionID, act2.ID)),
        'AII2: L2 Revoked override should veto inherited act2'
    );

    if (testSkill) {
        const l2Cached = AIEngine.Instance.GetAgentByID(f.L2_ID!);
        Assert(l2Cached != null, 'AII2: L2 should be loaded in AIEngine cache');
        const inheritedSkills = AIEngine.Instance.GetSkillsForAgent(l2Cached!);
        Assert(
            inheritedSkills.some((s) => UUIDsEqual(s.ID, testSkill.ID)),
            `AII2: L2 should inherit skill '${testSkill.Name}' live from L0`
        );
    }

    const stacked = AIEngine.Instance.GetStackedAdditionalInstructions(f.L2_ID!);
    AssertEqual(stacked.length, 3, 'AII2: expected 3 stacked AdditionalInstructions layers (L0->L1->L2)');
    Assert(stacked[0].Instructions.includes('L0 root'), 'AII2: layer 0 must be L0');
    Assert(stacked[1].Instructions.includes('L1 sales'), 'AII2: layer 1 must be L1');
    Assert(stacked[2].Instructions.includes('L2 personal'), 'AII2: layer 2 must be L2');
    console.log('      → actions, skills, child veto, and stacked L0->L1->L2 instructions verified');
}

async function checkAii3TwoByTwoRbacAncestorInvariantAndRls(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    Assert(Boolean(f.L0_ID && f.L1_ID && f.L2_ID), 'AII3 requires AII1 fixtures');

    // Restrict L1 to SalesRole only
    const perm = await ctx.Provider.GetEntityObject<MJAIAgentPermissionEntity>('MJ: AI Agent Permissions', ctx.User);
    perm.NewRecord();
    perm.AgentID = f.L1_ID!;
    perm.RoleID = f.SalesRoleID;
    perm.CanView = true;
    perm.CanRun = true;
    perm.CanEdit = false;
    perm.CanDelete = false;
    Assert(await perm.Save(), `AII3: failed to create SalesRole permission on L1`);
    f.CreatedPermIDs.push(perm.ID);

    await AIEngine.Instance.Config(true, ctx.User);

    // Alice HAS SalesRole -> can view & run L2; Bob only has UI role -> cannot view/run L2
    Assert(await AIEngine.Instance.CanUserViewAgent(f.L2_ID!, f.AliceUser), 'AII3: Alice must CanView her own L2');
    Assert(await AIEngine.Instance.CanUserRunAgent(f.L2_ID!, f.AliceUser), 'AII3: Alice must CanRun her own L2 with SalesRole');
    Assert(!(await AIEngine.Instance.CanUserViewAgent(f.L2_ID!, f.BobUser)), 'AII3: Bob must NOT CanView Alice private L2');
    Assert(!(await AIEngine.Instance.CanUserRunAgent(f.L2_ID!, f.BobUser)), 'AII3: Bob must NOT CanRun Alice private L2');

    // Ancestor CanRun invariant: strip SalesRole from Alice's UserInfo -> CanRun on L2 MUST immediately revoke!
    const aliceWithoutSales = new UserInfo(undefined, {
        ID: f.AliceUser.ID,
        Name: f.AliceUser.Name,
        Email: f.AliceUser.Email,
        Type: 'User',
        UserRoles: [{ Role: 'UI', RoleID: f.UI_RoleID }],
    });
    Assert(
        !(await AIEngine.Instance.CanUserRunAgent(f.L2_ID!, aliceWithoutSales)),
        'AII3: revoking SalesRole on ancestor L1 MUST immediately revoke CanRun on child L2'
    );

    // Live SQL RLS check: Bob querying MJ: AI Agents via RunView MUST NOT see Alice's private L2
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const bobRead = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `ID='${EscapeSQLString(f.L2_ID!)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        },
        f.BobUser
    );
    Assert(bobRead.Success, `AII3: Bob RunView on MJ: AI Agents failed: ${bobRead.ErrorMessage}`);
    AssertEqual(bobRead.Results.length, 0, 'AII3: SQL RLS UserAccessibleAIAgents must hide Alice private L2 from Bob');

    const aliceRead = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `ID='${EscapeSQLString(f.L2_ID!)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        },
        f.AliceUser
    );
    Assert(aliceRead.Success, `AII3: Alice RunView on MJ: AI Agents failed: ${aliceRead.ErrorMessage}`);
    AssertEqual(aliceRead.Results.length, 1, 'AII3: SQL RLS UserAccessibleAIAgents must return Alice own L2 to Alice');
    console.log('      → 2x2 RBAC privacy, Ancestor CanRun invariant, and live SQL RLS verified');
}

async function checkAii4MultipleInstancesPolicyCeilingAndNoteIsolation(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();

    // Create a dedicated root template for multi-instance testing so Pepper is genuinely Alice's
    // first derived instance under this root (L2 in AII1 already claimed primary under L0).
    const multiRoot = await createAgentRow(ctx, ctx.User, {
        Name: `${f.Prefix}-MultiRoot`,
        InstantiationMode: 'Optional',
    });

    // Create two sibling instances for Alice under multiRoot: Pepper (first -> auto primary) and Cato
    const pepper = await createAgentRow(ctx, f.AliceUser, {
        Name: `${f.Prefix}-Pepper`,
        BaseAgentID: multiRoot.ID,
        OwnerUserID: f.AliceUser.ID,
        IconClass: 'fa-solid fa-pepper-hot',
    });
    Assert(pepper.IsPrimaryInstance === true, 'AII4: first derived instance for (Alice, multiRoot) should auto-default IsPrimaryInstance=true');

    const cato = await createAgentRow(ctx, f.AliceUser, {
        Name: `${f.Prefix}-Cato`,
        BaseAgentID: multiRoot.ID,
        OwnerUserID: f.AliceUser.ID,
        IsPrimaryInstance: false,
        IconClass: 'fa-solid fa-chess-knight',
    });
    Assert(cato.IsPrimaryInstance === false, 'AII4: second instance created with IsPrimaryInstance=false should stay secondary');

    // Promote Cato to primary and verify Pepper is atomically demoted in DB
    cato.IsPrimaryInstance = true;
    Assert(await cato.Save(), `AII4: failed to promote Cato to primary`);

    const reloadedPepper = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
    Assert(await reloadedPepper.InnerLoad(CompositeKey.FromID(pepper.ID)), 'AII4: failed to reload Pepper');
    AssertEqual(reloadedPepper.IsPrimaryInstance, false, 'AII4: promoting Cato must atomically demote sibling Pepper');

    // Policy ceiling inheritance: multiRoot restricts to Coordinator + DraftOnly; Pepper tries Autonomous + SendAsUser
    const basePolicy = await ctx.Provider.GetEntityObject<MJAIAgentUserPolicyEntity>('MJ: AI Agent User Policies', ctx.User);
    basePolicy.NewRecord();
    basePolicy.AgentID = multiRoot.ID;
    basePolicy.UserID = f.AliceUser.ID;
    ApplyDefaultAgentUserPolicyValues(basePolicy);
    basePolicy.CoordinationMode = 'Coordinator';
    basePolicy.EmailChannelMode = 'DraftOnly';
    Assert(await basePolicy.Save(), `AII4: failed to save multiRoot ceiling policy`);
    f.CreatedPolicyIDs.push(basePolicy.ID);

    const leafPolicy = await ctx.Provider.GetEntityObject<MJAIAgentUserPolicyEntity>('MJ: AI Agent User Policies', ctx.User);
    leafPolicy.NewRecord();
    leafPolicy.AgentID = pepper.ID;
    leafPolicy.UserID = f.AliceUser.ID;
    ApplyDefaultAgentUserPolicyValues(leafPolicy);
    leafPolicy.CoordinationMode = 'Autonomous';
    leafPolicy.EmailChannelMode = 'SendAsUser';
    Assert(await leafPolicy.Save(), `AII4: failed to save Pepper policy`);
    f.CreatedPolicyIDs.push(leafPolicy.ID);

    await AIEngine.Instance.Config(true, ctx.User);
    AgentUserPolicyEngine.Instance.ClearCache();

    const chainIds = AIEngine.Instance.GetAgentInheritanceChain(pepper.ID).map((a) => a.ID);
    const effectivePolicy = await AgentUserPolicyEngine.Instance.GetEffectivePolicyForAgentChain(
        chainIds,
        f.AliceUser.ID,
        ctx.User,
        { provider: ctx.Provider, forceRefresh: true }
    );
    Assert(effectivePolicy != null, 'AII4: effective chain policy should be resolved');
    AssertEqual(effectivePolicy!.CoordinationMode, 'Coordinator', 'AII4: ancestor Coordinator must clamp child Autonomous');
    AssertEqual(effectivePolicy!.EmailChannelMode, 'DraftOnly', 'AII4: ancestor DraftOnly must clamp child SendAsUser');

    // Note isolation: org note on multiRoot flows to Pepper & Cato; Pepper private note stays hidden from Cato
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const noteTypesRes = await rv.RunView<{ ID: string }>(
        { EntityName: 'MJ: AI Agent Note Types', Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
        ctx.User
    );
    if (noteTypesRes.Success && noteTypesRes.Results.length > 0) {
        await AIEngine.Instance.RefreshNoteEmbeddings(ctx.User);
        const noteTypeId = noteTypesRes.Results[0].ID;
        const makeNote = async (agentId: string, userId: string | null, text: string): Promise<MJAIAgentNoteEntity> => {
            const n = await ctx.Provider.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', ctx.User);
            n.NewRecord();
            n.AgentID = agentId;
            n.UserID = userId;
            n.AgentNoteTypeID = noteTypeId;
            n.Note = text;
            n.Status = 'Active';
            const saved = await n.Save();
            Assert(saved, `AII4: failed to save note '${text}': ${n.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            f.CreatedNoteIDs.push(n.ID);
            return n;
        };

        const orgNote = await makeNote(multiRoot.ID, null, `${f.Prefix} org-wide policy note`);
        const pepperNote = await makeNote(pepper.ID, f.AliceUser.ID, `${f.Prefix} pepper private memory`);
        const catoNote = await makeNote(cato.ID, f.AliceUser.ID, `${f.Prefix} cato private memory`);

        class InjectorProbe extends AgentContextInjector {
            public Filter(notes: MJAIAgentNoteEntity[], agentId: string, userId: string): MJAIAgentNoteEntity[] {
                return this.filterNotesByScoping(notes, {
                    agentId,
                    userId,
                    strategy: 'Relevant',
                    maxNotes: 10,
                    contextUser: ctx.User,
                });
            }
        }
        const probe = new InjectorProbe();
        const pepperVisible = new UUIDSet(
            probe.Filter([orgNote, pepperNote, catoNote], pepper.ID, f.AliceUser.ID).map((n) => n.ID)
        );
        Assert(pepperVisible.Has(orgNote.ID), 'AII4: Pepper must inherit org note from multiRoot');
        Assert(pepperVisible.Has(pepperNote.ID), 'AII4: Pepper must see its own note');
        Assert(!pepperVisible.Has(catoNote.ID), 'AII4: Cato private note MUST NOT leak into Pepper');
    }
    console.log('      → multi-instance primary flip, policy ceiling clamping, and note isolation verified');
}

async function checkAii5ServerSandboxGuards(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    Assert(Boolean(f.L2_ID), 'AII5 requires AII1 fixtures');

    // 1. Non-Owner UI user cannot create a root agent (BaseAgentID == null)
    const illegalRoot = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', f.AliceUser);
    illegalRoot.NewRecord();
    illegalRoot.Name = `${f.Prefix}-IllegalRoot`;
    illegalRoot.TypeID = f.AgentTypeID;
    illegalRoot.BaseAgentID = null;
    illegalRoot.Status = 'Active';
    const rootSaved = await illegalRoot.Save();
    if (rootSaved && illegalRoot.ID) {
        f.CreatedAgentIDs.push(illegalRoot.ID);
    }
    Assert(!rootSaved, 'AII5: non-Owner UI user MUST be blocked from creating root agent (BaseAgentID=null)');

    // 2. Bob cannot modify Alice's derived instance L2
    const bobAttempt = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', f.BobUser);
    const loadedForBob = await bobAttempt.InnerLoad(CompositeKey.FromID(f.L2_ID!));
    if (loadedForBob) {
        bobAttempt.Name = `${f.Prefix}-Hijacked`;
        const hijacked = await bobAttempt.Save();
        Assert(!hijacked, 'AII5: Bob MUST be blocked from editing Alice derived agent');
    }

    // 3. Depth > 5 MUST be rejected (L0(0)->L1(1)->L2(2)->L3(3)->L4(4)->L5(5)->L6(6) rejected)
    let parentId = f.L2_ID!;
    // Make L2 instantiable first so depth 3..5 can be created cleanly by ctx.User
    const l2Entity = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
    Assert(await l2Entity.InnerLoad(CompositeKey.FromID(f.L2_ID!)), 'AII5: failed to load L2');
    l2Entity.InstantiationMode = 'Optional';
    Assert(await l2Entity.Save(), 'AII5: failed to mark L2 Optional');

    for (let depth = 3; depth <= 5; depth++) {
        const child = await createAgentRow(ctx, ctx.User, {
            Name: `${f.Prefix}-L${depth}`,
            BaseAgentID: parentId,
            InstantiationMode: 'Optional',
        });
        parentId = child.ID;
    }

    const tooDeep = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
    tooDeep.NewRecord();
    tooDeep.Name = `${f.Prefix}-L6-TooDeep`;
    tooDeep.TypeID = f.AgentTypeID;
    tooDeep.BaseAgentID = parentId;
    tooDeep.Status = 'Active';
    const deepSaved = await tooDeep.Save();
    if (deepSaved && tooDeep.ID) {
        f.CreatedAgentIDs.push(tooDeep.ID);
    }
    Assert(!deepSaved, 'AII5: depth 6 inheritance chain (> MaxDepth=5) MUST be rejected by MJAIAgentEntityServer');
    console.log('      → non-Owner root block, cross-user isolation, and MaxDepth=5 enforcement verified');
}

function makeActionInput(name: string, value: unknown): ActionParam {
    return { Name: name, Type: 'Input', Value: value } as ActionParam;
}

async function runNamedAction(
    ctx: IntegrationCheckContext,
    actionName: string,
    actor: UserInfo,
    params: ActionParam[]
): Promise<{ result: ActionResult; runParams: RunActionParams }> {
    const action = ActionEngineServer.Instance.Actions.find(
        (a) => a.Name === actionName && a.Status === 'Active'
    );
    Assert(action != null, `IT186: expected Active action '${actionName}' in ActionEngineServer`);

    const run = new RunActionParams();
    run.Action = action!;
    run.ContextUser = actor;
    run.Provider = ctx.Provider;
    run.Params = params;
    run.Filters = [];

    const result = await ActionEngineServer.Instance.RunAction(run);
    if (result.LogEntry?.ID) {
        fx().CreatedLogIDs.push(result.LogEntry.ID);
    }
    return { result, runParams: run };
}

async function checkAii6MockCommCalendarEmailAndApprovalAttribution(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();

    // Use ctx.User if it has a valid email so ActionEngineServer/Request writes have full DB permissions,
    // while using a dedicated CoS root template and Pepper instance that never collide with existing rows.
    const actor = ctx.User.Email?.trim() ? ctx.User : f.AliceUser;
    Assert(Boolean(actor.Email?.trim()), 'AII6: acting test user must have an email address');

    const cosRoot = await createAgentRow(ctx, ctx.User, {
        Name: `${f.Prefix}-CoS-Template`,
        InstantiationMode: 'Optional',
    });
    const pepper = await createAgentRow(ctx, ctx.User, {
        Name: `${f.Prefix}-CoS-Pepper`,
        BaseAgentID: cosRoot.ID,
        OwnerUserID: actor.ID,
        IsPrimaryInstance: true,
        IconClass: 'fa-solid fa-pepper-hot',
    });
    AssertEqual(pepper.IsPrimaryInstance, true, 'AII6: Pepper must start as IsPrimaryInstance=true');
    f.CoSRoot_ID = cosRoot.ID;
    f.CoSPepper_ID = pepper.ID;

    // Configure Pepper's user policy: CalendarChannelMode=ProposeWithApproval, EmailChannelMode=DraftOnly
    const policy = await ctx.Provider.GetEntityObject<MJAIAgentUserPolicyEntity>('MJ: AI Agent User Policies', ctx.User);
    policy.NewRecord();
    policy.AgentID = pepper.ID;
    policy.UserID = actor.ID;
    ApplyDefaultAgentUserPolicyValues(policy);
    policy.CalendarChannelMode = 'ProposeWithApproval';
    policy.EmailChannelMode = 'DraftOnly';
    policy.RequireApprovalForExternalComms = true;
    Assert(
        await policy.Save(),
        `AII6: failed to save Pepper user policy: ${policy.LatestResult?.CompleteMessage ?? 'unknown'}`
    );
    f.CreatedPolicyIDs.push(policy.ID);

    const prevMockDir = process.env[MJ_MOCK_COMM_DIR_ENV];
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-it186-mock-comm-'));
    process.env[MJ_MOCK_COMM_DIR_ENV] = tempDir;

    try {
        // Deterministically seed mailbox + calendar JSON for actor.Email
        const mockProvider = new LocalJsonCommunicationProvider(tempDir);
        const seededState = mockProvider.LoadOrSeedMailbox(actor.Email!);
        Assert(seededState.Messages.length >= 4, 'AII6: mock mailbox should auto-seed >= 4 messages');
        Assert(seededState.Events.length >= 4, 'AII6: mock calendar should auto-seed >= 4 events');

        await ActionEngineServer.Instance.Config(false, ctx.User);
        await AIEngine.Instance.Config(true, ctx.User);
        await CommunicationEngine.Instance.Config(false, ctx.User);
        AgentUserPolicyEngine.Instance.ClearCache();

        const windowStart = new Date(Date.now() - 24 * 3_600_000).toISOString();
        const windowEnd = new Date(Date.now() + 72 * 3_600_000).toISOString();

        // 1. Read calendar events via GetMyCalendarAndAvailabilityAction as Pepper
        const eventsExec = await runNamedAction(ctx, 'Get My Calendar Events and Availability', actor, [
            makeActionInput('AgentID', pepper.ID),
            makeActionInput('Operation', 'GetEvents'),
            makeActionInput('StartDateTime', windowStart),
            makeActionInput('EndDateTime', windowEnd),
        ]);
        Assert(
            eventsExec.result.Success,
            `AII6: GetEvents failed: ${eventsExec.result.Message}`
        );
        const eventsOut = eventsExec.runParams.Params.find((p) => p.Name === 'Events')?.Value as
            | Array<{ Subject: string }>
            | undefined;
        Assert(
            Array.isArray(eventsOut) && eventsOut.length >= 4,
            `AII6: expected >= 4 seeded calendar events from Local JSON Mock, got ${eventsOut?.length ?? 0}`
        );

        // 2. Read Free/Busy slots via GetMyCalendarAndAvailabilityAction as Pepper
        const fbExec = await runNamedAction(ctx, 'Get My Calendar Events and Availability', actor, [
            makeActionInput('AgentID', pepper.ID),
            makeActionInput('Operation', 'GetFreeBusy'),
            makeActionInput('StartDateTime', windowStart),
            makeActionInput('EndDateTime', windowEnd),
        ]);
        Assert(fbExec.result.Success, `AII6: GetFreeBusy failed: ${fbExec.result.Message}`);
        const schedulesOut = fbExec.runParams.Params.find((p) => p.Name === 'Schedules')?.Value as
            | Array<{ ScheduleID: string; Slots: Array<{ Status: string }> }>
            | undefined;
        Assert(
            Array.isArray(schedulesOut) && schedulesOut.length === 1 && schedulesOut[0].Slots.length >= 4,
            `AII6: expected FreeBusy schedule with >= 4 busy slots for ${actor.Email}`
        );

        // 3. Create calendar event under ProposeWithApproval -> creates real MJ: AI Agent Requests row attributed to Pepper.ID
        const calCreateExec = await runNamedAction(ctx, 'Manage My Calendar Event', actor, [
            makeActionInput('AgentID', pepper.ID),
            makeActionInput('Operation', 'Create'),
            makeActionInput('Subject', `${f.Prefix} Board Follow-Up`),
            makeActionInput('StartTime', '2026-12-03T16:00:00.000Z'),
            makeActionInput('EndTime', '2026-12-03T16:30:00.000Z'),
            makeActionInput('AttendeeEmails', 'sarah.chen@bluecypress.io'),
        ]);
        const calCode = calCreateExec.result.Result?.ResultCode ?? calCreateExec.result.ResultCode;
        AssertEqual(
            calCode,
            'APPROVAL_REQUIRED',
            `AII6: Create calendar event under ProposeWithApproval must return APPROVAL_REQUIRED (got ${calCode}: ${calCreateExec.result.Message})`
        );
        const approvalId = calCreateExec.runParams.Params.find((p) => p.Name === 'ApprovalRequestID')
            ?.Value as string | null | undefined;
        Assert(Boolean(approvalId), 'AII6: ApprovalRequestID output param must be populated');
        f.CreatedRequestIDs.push(approvalId!);

        const reqRow = await ctx.Provider.GetEntityObject<MJAIAgentRequestEntity>('MJ: AI Agent Requests', ctx.User);
        Assert(
            await reqRow.InnerLoad(CompositeKey.FromID(approvalId!)),
            `AII6: failed to load persisted approval request ${approvalId}`
        );
        Assert(
            UUIDsEqual(reqRow.AgentID, pepper.ID),
            `AII6: approval request AgentID must be attributed to Pepper (${pepper.ID}), got ${reqRow.AgentID}`
        );
        Assert(
            UUIDsEqual(reqRow.RequestForUserID, actor.ID),
            `AII6: approval request RequestForUserID must match acting user ${actor.ID}`
        );
        AssertEqual(reqRow.Status, 'Requested', 'AII6: approval request must be in Requested status');

        // 4. ManageMyEmailInboxAction: ListMessages succeeds, CreateDraft writes JSON draft under DraftOnly, Send is POLICY_DENIED
        const listExec = await runNamedAction(ctx, 'Manage My Email Inbox and Drafts', actor, [
            makeActionInput('AgentID', pepper.ID),
            makeActionInput('Operation', 'ListMessages'),
        ]);
        Assert(listExec.result.Success, `AII6: ListMessages failed: ${listExec.result.Message}`);
        const messagesOut = listExec.runParams.Params.find((p) => p.Name === 'Messages')?.Value as
            | Array<{ Subject?: string }>
            | undefined;
        Assert(
            Array.isArray(messagesOut) && messagesOut.length >= 4,
            `AII6: expected >= 4 seeded inbox threads, got ${messagesOut?.length ?? 0}`
        );

        const draftSubject = `${f.Prefix} Draft Follow-Up`;
        const draftExec = await runNamedAction(ctx, 'Manage My Email Inbox and Drafts', actor, [
            makeActionInput('AgentID', pepper.ID),
            makeActionInput('Operation', 'CreateDraft'),
            makeActionInput('To', 'sarah.chen@bluecypress.io'),
            makeActionInput('Subject', draftSubject),
            makeActionInput('Body', 'Draft created by Pepper under DraftOnly mode.'),
        ]);
        Assert(draftExec.result.Success, `AII6: CreateDraft failed: ${draftExec.result.Message}`);
        const draftId = draftExec.runParams.Params.find((p) => p.Name === 'DraftID')?.Value as
            | string
            | undefined;
        Assert(Boolean(draftId), 'AII6: CreateDraft must return DraftID');

        const reloadedMailbox = mockProvider.LoadOrSeedMailbox(actor.Email!);
        Assert(
            reloadedMailbox.Messages.some(
                (m) => m.ID === draftId && m.Folder === 'Drafts' && m.Subject === draftSubject
            ),
            `AII6: persisted draft '${draftId}' must appear in JSON mailbox file`
        );

        const sendExec = await runNamedAction(ctx, 'Manage My Email Inbox and Drafts', actor, [
            makeActionInput('AgentID', pepper.ID),
            makeActionInput('Operation', 'Send'),
            makeActionInput('To', 'board@bluecypress.io'),
            makeActionInput('Subject', `${f.Prefix} Should Block`),
            makeActionInput('Body', 'Blocked under DraftOnly'),
        ]);
        const sendCode = sendExec.result.Result?.ResultCode ?? sendExec.result.ResultCode;
        AssertEqual(
            sendCode,
            'POLICY_DENIED',
            `AII6: Send under DraftOnly must return POLICY_DENIED (got ${sendCode})`
        );

        console.log(
            '      → derived Pepper calendar/free-busy read, Pepper-attributed SQL approval row, and DraftOnly JSON draft verified'
        );
    } finally {
        if (prevMockDir === undefined) {
            delete process.env[MJ_MOCK_COMM_DIR_ENV];
        } else {
            process.env[MJ_MOCK_COMM_DIR_ENV] = prevMockDir;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

async function checkAii7SecondPrimaryCoSInstanceFlipsFirstInSqlAndCache(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    Assert(Boolean(f.CoSRoot_ID && f.CoSPepper_ID), 'AII7 requires AII6 CoS fixtures');
    const actor = ctx.User.Email?.trim() ? ctx.User : f.AliceUser;

    // Ensure AIEngine cache is warm with Pepper as IsPrimaryInstance=true before creating Jarvis
    await AIEngine.Instance.Config(true, ctx.User);
    const cachedPepperBefore = AIEngine.Instance.GetAgentByID(f.CoSPepper_ID!);
    Assert(cachedPepperBefore != null, 'AII7: Pepper should be in AIEngine cache');
    AssertEqual(cachedPepperBefore!.IsPrimaryInstance, true, 'AII7: Pepper must be primary before creating Jarvis');

    // Create a 2nd derived CoS instance (Jarvis) directly with IsPrimaryInstance = true
    const jarvis = await createAgentRow(ctx, ctx.User, {
        Name: `${f.Prefix}-CoS-Jarvis`,
        BaseAgentID: f.CoSRoot_ID!,
        OwnerUserID: actor.ID,
        IsPrimaryInstance: true,
        IconClass: 'fa-solid fa-wand-magic-sparkles',
    });
    AssertEqual(jarvis.IsPrimaryInstance, true, 'AII7: newly created Jarvis must have IsPrimaryInstance=true');

    // 1. Verify in-memory AIEngineBase cache immediately demoted Pepper's IsPrimaryInstance to false
    const cachedPepperAfterSave = AIEngine.Instance.GetAgentByID(f.CoSPepper_ID!);
    AssertEqual(
        cachedPepperAfterSave?.IsPrimaryInstance,
        false,
        'AII7: AIEngineBase in-memory cache must demote Pepper.IsPrimaryInstance to false immediately on Jarvis save'
    );

    // 2. Verify live SQL Server row for Pepper was flipped to IsPrimaryInstance = 0 and Jarvis = 1
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const sqlRes = await rv.RunView<{ ID: string; Name: string; IsPrimaryInstance: boolean }>(
        {
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `ID IN ('${EscapeSQLString(f.CoSPepper_ID!)}','${EscapeSQLString(jarvis.ID)}')`,
            Fields: ['ID', 'Name', 'IsPrimaryInstance'],
            ResultType: 'simple',
        },
        ctx.User
    );
    Assert(sqlRes.Success && sqlRes.Results.length === 2, 'AII7: SQL verification query for Pepper & Jarvis failed');

    const sqlPepper = sqlRes.Results.find((r) => UUIDsEqual(r.ID, f.CoSPepper_ID!));
    const sqlJarvis = sqlRes.Results.find((r) => UUIDsEqual(r.ID, jarvis.ID));
    AssertEqual(sqlPepper?.IsPrimaryInstance, false, 'AII7: SQL must flip 1st CoS instance (Pepper) IsPrimaryInstance to false');
    AssertEqual(sqlJarvis?.IsPrimaryInstance, true, 'AII7: SQL must keep 2nd CoS instance (Jarvis) IsPrimaryInstance as true');
    console.log('      → 2nd derived CoS instance (Jarvis) flipped 1st instance (Pepper) IsPrimaryInstance=false in SQL & AIEngine cache');
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        if (!MutationTierOn(ctx)) {
            skipReason = MUTATION_TIER_OFF_REASON;
            return;
        }
        const prefix = `mj-aii-${Date.now()}`;
        const rv = RunView.FromMetadataProvider(ctx.Provider);

        const [typeRes, uiRoleRes] = await Promise.all([
            rv.RunView<{ ID: string; Name: string }>(
                { EntityName: 'MJ: AI Agent Types', Fields: ['ID', 'Name'], MaxRows: 10, ResultType: 'simple' },
                ctx.User
            ),
            rv.RunView<{ ID: string; Name: string }>(
                { EntityName: 'MJ: Roles', ExtraFilter: `Name='UI'`, Fields: ['ID', 'Name'], MaxRows: 1, ResultType: 'simple' },
                ctx.User
            ),
        ]);
        Assert(typeRes.Success && typeRes.Results.length > 0, 'IT186 Setup: no AI Agent Types found');
        Assert(uiRoleRes.Success && uiRoleRes.Results.length === 1, 'IT186 Setup: UI role not found');

        const loopType = typeRes.Results.find((t) => t.Name.toLowerCase() === 'loop') ?? typeRes.Results[0];
        const uiRoleId = uiRoleRes.Results[0].ID;

        const createdRoleIDs: string[] = [];
        const createdUserIDs: string[] = [];
        const createdUserRoleIDs: string[] = [];

        // Create throwaway Sales role
        const salesRole = await ctx.Provider.GetEntityObject<MJRoleEntity>('MJ: Roles', ctx.User);
        salesRole.NewRecord();
        salesRole.Name = `${prefix}-SalesRole`;
        salesRole.Description = `IT186 test role ${FIXTURE_TAG}`;
        Assert(await salesRole.Save(), `IT186 Setup: failed to create SalesRole`);
        createdRoleIDs.push(salesRole.ID);

        const makeTestUser = async (tag: string, grantSales: boolean): Promise<UserInfo> => {
            const u = await ctx.Provider.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User);
            u.NewRecord();
            u.Name = `${prefix}-${tag}`;
            u.FirstName = tag;
            u.LastName = 'IT186';
            u.Email = `${prefix}-${tag.toLowerCase()}@example.test`;
            u.Type = 'User';
            u.IsActive = true;
            Assert(await u.Save(), `IT186 Setup: failed to create user ${tag}`);
            createdUserIDs.push(u.ID);

            const roles: Array<{ Role: string; RoleID: string }> = [{ Role: 'UI', RoleID: uiRoleId }];
            const uiUr = await ctx.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', ctx.User);
            uiUr.NewRecord();
            uiUr.UserID = u.ID;
            uiUr.RoleID = uiRoleId;
            Assert(await uiUr.Save(), `IT186 Setup: failed to assign UI role to ${tag}`);
            createdUserRoleIDs.push(uiUr.ID);

            if (grantSales) {
                const salesUr = await ctx.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', ctx.User);
                salesUr.NewRecord();
                salesUr.UserID = u.ID;
                salesUr.RoleID = salesRole.ID;
                Assert(await salesUr.Save(), `IT186 Setup: failed to assign SalesRole to ${tag}`);
                createdUserRoleIDs.push(salesUr.ID);
                roles.push({ Role: salesRole.Name, RoleID: salesRole.ID });
            }

            return new UserInfo(undefined, {
                ID: u.ID,
                Name: u.Name,
                Email: u.Email,
                Type: 'User',
                UserRoles: roles,
            });
        };

        const aliceUser = await makeTestUser('Alice', true);
        const bobUser = await makeTestUser('Bob', false);

        fixture = {
            Prefix: prefix,
            AgentTypeID: loopType.ID,
            UI_RoleID: uiRoleId,
            SalesRoleID: salesRole.ID,
            AliceUser: aliceUser,
            BobUser: bobUser,
            CreatedAgentIDs: [],
            CreatedActionLinkIDs: [],
            CreatedSkillLinkIDs: [],
            CreatedPermIDs: [],
            CreatedPolicyIDs: [],
            CreatedNoteIDs: [],
            CreatedRequestIDs: [],
            CreatedLogIDs: [],
            CreatedUserRoleIDs: createdUserRoleIDs,
            CreatedUserIDs: createdUserIDs,
            CreatedRoleIDs: createdRoleIDs,
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = fixture;
        fixture = undefined;
        skipReason = undefined;
        if (!f) {
            return;
        }
        const del = async (entityName: string, ids: readonly string[]) => {
            for (const id of [...ids].reverse()) {
                const row = await ctx.Provider.GetEntityObject(entityName, ctx.User).catch(() => undefined);
                if (row && (await row.InnerLoad(CompositeKey.FromID(id)).catch(() => false))) {
                    await row.Delete().catch(() => undefined);
                }
            }
        };

        await del('MJ: Action Execution Logs', f.CreatedLogIDs);
        await del('MJ: AI Agent Requests', f.CreatedRequestIDs);
        await del('MJ: AI Agent Notes', f.CreatedNoteIDs);
        await del('MJ: AI Agent User Policies', f.CreatedPolicyIDs);
        await del('MJ: AI Agent Permissions', f.CreatedPermIDs);
        await del('MJ: AI Agent Skills', f.CreatedSkillLinkIDs);
        await del('MJ: AI Agent Actions', f.CreatedActionLinkIDs);
        await del('MJ: AI Agents', f.CreatedAgentIDs);
        await del('MJ: User Roles', f.CreatedUserRoleIDs);

        // Clean up throwaway test users: delete if no immutable RecordChange FK references remain,
        // otherwise deactivate cleanly so FK_RecordChange_UserID does not emit a teardown error.
        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const rcEntity = ctx.Provider.EntityByName('MJ: Record Changes');
        for (const uid of [...f.CreatedUserIDs].reverse()) {
            const rcRes = await rv
                .RunView<{ ID: string }>(
                    {
                        EntityName: 'MJ: Record Changes',
                        ExtraFilter: `UserID='${EscapeSQLString(uid)}'`,
                        Fields: ['ID'],
                        ResultType: 'simple',
                    },
                    ctx.User
                )
                .catch(() => null);
            const rcIds = rcRes?.Success ? rcRes.Results.map((r) => r.ID) : [];
            if (rcIds.length > 0 && rcEntity?.AllowDeleteAPI) {
                await del('MJ: Record Changes', rcIds);
            }
            const userRow = await ctx.Provider.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User).catch(() => undefined);
            if (userRow && (await userRow.InnerLoad(CompositeKey.FromID(uid)).catch(() => false))) {
                if (rcIds.length === 0 || rcEntity?.AllowDeleteAPI) {
                    const deleted = await userRow.Delete().catch(() => false);
                    if (!deleted) {
                        userRow.IsActive = false;
                        await userRow.Save().catch(() => undefined);
                    }
                } else {
                    userRow.IsActive = false;
                    await userRow.Save().catch(() => undefined);
                }
            }
        }

        await del('MJ: Roles', f.CreatedRoleIDs);
        await AIEngine.Instance.Config(true, ctx.User).catch(() => undefined);
        AgentUserPolicyEngine.Instance.ClearCache();
    },
});

export const AgentInstancesAndInheritanceChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.AII1`,
        Name: 'AII1: 3-level L0->L1->L2 hierarchy columns on vwAIAgents & GetBaseAgentIDAncestors()',
        Fn: checkAii1ThreeLevelHierarchyAndViewColumns,
        RequiresMutation: true,
    },
    {
        Id: `${BUNDLE}.AII2`,
        Name: 'AII2: live inheritance of actions, skills, child veto, and stacked AdditionalInstructions',
        Fn: checkAii2LiveInheritanceVetoAndStackedInstructions,
        RequiresMutation: true,
    },
    {
        Id: `${BUNDLE}.AII3`,
        Name: 'AII3: 2x2 RBAC privacy, Ancestor CanRun invariant, and live SQL RLS UserAccessibleAIAgents',
        Fn: checkAii3TwoByTwoRbacAncestorInvariantAndRls,
        RequiresMutation: true,
    },
    {
        Id: `${BUNDLE}.AII4`,
        Name: 'AII4: multiple instances primary flip, ancestor policy ceiling clamping, and note isolation',
        Fn: checkAii4MultipleInstancesPolicyCeilingAndNoteIsolation,
        RequiresMutation: true,
    },
    {
        Id: `${BUNDLE}.AII5`,
        Name: 'AII5: MJAIAgentEntityServer sandbox blocks non-Owner root create, cross-user edit, and depth > 5',
        Fn: checkAii5ServerSandboxGuards,
        RequiresMutation: true,
    },
    {
        Id: `${BUNDLE}.AII6`,
        Name: 'AII6: derived CoS Pepper reads Calendar/FreeBusy via Local JSON Mock, creates Pepper-attributed SQL approval row, and persists DraftOnly email draft',
        Fn: checkAii6MockCommCalendarEmailAndApprovalAttribution,
        RequiresMutation: true,
    },
    {
        Id: `${BUNDLE}.AII7`,
        Name: 'AII7: saving 2nd derived CoS instance with IsPrimaryInstance=true flips 1st instance to false in SQL and AIEngine cache',
        Fn: checkAii7SecondPrimaryCoSInstanceFlipsFirstInSqlAndCache,
        RequiresMutation: true,
    },
];

for (const check of AgentInstancesAndInheritanceChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
