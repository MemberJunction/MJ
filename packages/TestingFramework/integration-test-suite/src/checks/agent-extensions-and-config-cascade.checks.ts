/**
 * agent-extensions-and-config-cascade.checks.ts — the 'agent-extensions-and-config-cascade'
 * bundle (AEC1–AEC5, IT195):
 *
 * Real-database deterministic end-to-end checks for the Phase 2 BaseAgent Refactor:
 *   - AEC1: `MJ: AI Agent Step Types` DB persistence (14 built-ins + custom step type row),
 *           `StepTypeID` FK round-trip on `MJ: AI Agent Steps` and `MJ: AI Agent Run Steps`,
 *           and custom DB-backed `BaseAgentStepHandler` resolution & execution via
 *           `AgentStepTypeRegistry`.
 *   - AEC2: SQL-level 3-table `IAgentConfiguration` cascade (`AIAgent.Configuration` ->
 *           `BaseAgentID` chain -> `AIAgentCategory.DefaultConfiguration` parent/child ->
 *           `AIAgentType.DefaultAgentConfiguration`) via `AIEngine.ResolveEffectiveAgentProperties`,
 *           including narrow-only security invariant enforcement.
 *   - AEC3: Bidirectional dirty-field `Save()` sync in `MJAIAgentEntityServer` and
 *           `MJAIAgentTypeEntityServer` (legacy column update -> `Configuration` /
 *           `DefaultAgentConfiguration` JSON bag, and JSON bag update -> legacy columns).
 *   - AEC4: Admin-only `Configuration.helperPlugins` enforcement & code-only seam rejection
 *           (`limits`, `actionPolicy`) against live `MJAIAgentEntityServer.Save()`.
 *   - AEC5: `#6852` `UI`-role ownership/RLS enforcement & non-admin sandbox rejection
 *           (`BaseAgentID` required, `CanRun` check, custom `DriverClass`, `Isolation`
 *           loosening, `MaxCostPerRun` ceiling, `TypeConfiguration.helperPlugins`, and
 *           cross-user RLS isolation / write refusal) — executes in-process against live
 *           SQL Server and PostgreSQL using explicit `UserInfo` fixtures.
 *
 * Self-cleaning fixtures: every check creates throwaway rows tagged
 * `(mj-integration-test — safe to delete)` and cleans them up LIFO in `finally`, keeping the
 * bundle in the blocking deterministic tier.
 */
import { randomUUID } from 'node:crypto';
import { CompositeKey, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentCategoryEntity,
    MJAIAgentEntity,
    MJAIAgentPermissionEntity,
    MJAIAgentRunEntity,
    MJAIAgentRunStepEntity,
    MJAIAgentStepEntity,
    MJAIAgentStepTypeEntity,
    MJAIAgentTypeEntity,
    MJRoleEntity,
    MJUserEntity,
    MJUserRoleEntity,
} from '@memberjunction/core-entities';
import {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ParseAgentConfiguration,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import {
    AgentRunContext,
    AgentStepTypeRegistry,
    BaseAgentStepHandler,
} from '@memberjunction/ai-agents';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';

const BUNDLE = 'agent-extensions-and-config-cascade';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
const CUSTOM_HANDLER_DRIVER_CLASS = 'IT195CustomGateStepHandler';

const BUILT_IN_STEP_TYPE_NAMES: ReadonlyArray<string> = [
    'Actions',
    'Sub-Agent',
    'Retry',
    'Success',
    'Failed',
    'Chat',
    'ForEach',
    'While',
    'Skill',
    'Plan',
    'Tasks',
    'Handoff',
    'ClientTools',
    'Decision',
];

type CleanupFn = () => Promise<unknown>;

/**
 * Custom pluggable `BaseAgentStepHandler` registered via `@RegisterClass` to verify
 * DB-backed `MJ: AI Agent Step Types` resolution and live handler execution in AEC1.
 */
@RegisterClass(BaseAgentStepHandler, CUSTOM_HANDLER_DRIVER_CLASS)
export class IT195CustomGateStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'IT195CustomGate';
    public override readonly AllowedInUnapprovedPlanMode = true;
    public override readonly CountsAgainstTreeBudget = false;

    public async Execute<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return {
            step: 'Success',
            terminate: true,
            newPayload: previousDecision.newPayload,
            message: `IT195CustomGate handled at step ${stepCount}`,
        };
    }
}

async function runCleanups(cleanups: CleanupFn[]): Promise<void> {
    for (const fn of [...cleanups].reverse()) {
        await fn().catch((err: unknown) => {
            console.warn(`[${BUNDLE}] cleanup step failed:`, err instanceof Error ? err.message : String(err));
        });
    }
}

function assertEntityExists(ctx: IntegrationCheckContext, entityName: string): void {
    const entity = ctx.Provider.EntityByName(entityName);
    Assert(entity != null, `Entity ${entityName} not found in metadata`);
}

function assertEntityHasField(ctx: IntegrationCheckContext, entityName: string, fieldName: string): void {
    const entity = ctx.Provider.EntityByName(entityName);
    Assert(entity != null, `Entity ${entityName} not found in metadata`);
    const hasField = entity!.Fields.some((f) => f.Name.toLowerCase() === fieldName.toLowerCase());
    Assert(hasField, `Field ${fieldName} does not exist on ${entityName}`);
}

async function deleteEntityById(
    ctx: IntegrationCheckContext,
    entityName: string,
    id: string
): Promise<void> {
    try {
        const row = await ctx.Provider.GetEntityObject(entityName, ctx.User);
        if (row && (await row.InnerLoad(CompositeKey.FromID(id)))) {
            const deleted = await row.Delete();
            if (!deleted) {
                console.warn(
                    `[${BUNDLE}] cleanup delete returned false for ${entityName} (${id}): ${row.LatestResult?.CompleteMessage ?? 'unknown'}`
                );
            }
        }
    } catch (err: unknown) {
        console.warn(
            `[${BUNDLE}] cleanup failed for ${entityName} (${id}):`,
            err instanceof Error ? err.message : String(err)
        );
    }
}

async function cleanupFixtureUser(
    ctx: IntegrationCheckContext,
    userId: string
): Promise<void> {
    try {
        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const rcEntity = ctx.Provider.EntityByName('MJ: Record Changes');
        const rcRes = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Record Changes',
                ExtraFilter: `UserID='${EscapeSQLString(userId)}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            ctx.User
        );
        const rcIds = rcRes?.Success ? rcRes.Results.map((r) => r.ID) : [];
        if (rcIds.length > 0 && rcEntity?.AllowDeleteAPI) {
            for (const rcId of rcIds) {
                await deleteEntityById(ctx, 'MJ: Record Changes', rcId);
            }
        }
        const userRow = await ctx.Provider.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User);
        if (userRow && (await userRow.InnerLoad(CompositeKey.FromID(userId)))) {
            const deleted =
                rcIds.length === 0 || rcEntity?.AllowDeleteAPI ? await userRow.Delete() : false;
            if (!deleted) {
                userRow.IsActive = false;
                const deactivated = await userRow.Save();
                if (!deactivated) {
                    console.warn(
                        `[${BUNDLE}] cleanup failed to delete or deactivate fixture user ${userId}: ${userRow.LatestResult?.CompleteMessage ?? 'unknown'}`
                    );
                }
            }
        }
    } catch (err: unknown) {
        console.warn(
            `[${BUNDLE}] cleanupFixtureUser failed for ${userId}:`,
            err instanceof Error ? err.message : String(err)
        );
    }
}

async function getLoopAgentTypeId(ctx: IntegrationCheckContext): Promise<string> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const res = await rv.RunView<{ ID: string; Name: string }>(
        {
            EntityName: 'MJ: AI Agent Types',
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
        },
        ctx.User
    );
    Assert(res.Success && res.Results.length > 0, `Failed to load MJ: AI Agent Types: ${res.ErrorMessage ?? 'empty'}`);
    const loop = res.Results.find((t) => t.Name === 'Loop') ?? res.Results[0];
    return loop.ID;
}

async function getUiRoleId(ctx: IntegrationCheckContext): Promise<string> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const res = await rv.RunView<{ ID: string; Name: string }>(
        {
            EntityName: 'MJ: Roles',
            ExtraFilter: `Name='UI'`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
        },
        ctx.User
    );
    Assert(res.Success && res.Results.length > 0, `Could not find stock 'UI' role: ${res.ErrorMessage ?? 'empty'}`);
    return res.Results[0].ID;
}

async function createUiFixtureUser(
    ctx: IntegrationCheckContext,
    cleanups: CleanupFn[],
    label: string,
    tag: string,
    extraRoles: ReadonlyArray<{ RoleID: string; RoleName: string }> = []
): Promise<UserInfo> {
    const uiRoleId = await getUiRoleId(ctx);
    const userRow = await ctx.Provider.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User);
    userRow.NewRecord();
    userRow.Name = `IT195 ${label} ${tag}`;
    userRow.FirstName = label;
    userRow.LastName = `IT195-${tag}`;
    userRow.Email = `it195-${label.toLowerCase()}-${tag}@integration.test`;
    userRow.Type = 'User';
    userRow.IsActive = true;
    Assert(await userRow.Save(), `Failed to create fixture user ${label}: ${userRow.LatestResult?.CompleteMessage}`);
    const userId = userRow.ID;
    cleanups.push(() => cleanupFixtureUser(ctx, userId));

    const allRoles = [{ RoleID: uiRoleId, RoleName: 'UI' }, ...extraRoles];
    const userRolesForInfo: Array<{ RoleID: string; Role: string }> = [];
    for (const r of allRoles) {
        const ur = await ctx.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', ctx.User);
        ur.NewRecord();
        ur.UserID = userId;
        ur.RoleID = r.RoleID;
        Assert(await ur.Save(), `Failed to assign role ${r.RoleName} to ${label}: ${ur.LatestResult?.CompleteMessage}`);
        const urId = ur.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: User Roles', urId));
        userRolesForInfo.push({ RoleID: r.RoleID, Role: r.RoleName });
    }

    return new UserInfo(undefined, {
        ID: userId,
        Name: userRow.Name,
        Email: userRow.Email,
        Type: 'User',
        UserRoles: userRolesForInfo,
    });
}

/**
 * AEC1: `MJ: AI Agent Step Types` DB persistence + `StepTypeID` FK on `AIAgentStep` and
 * `AIAgentRunStep` + custom DB-backed `BaseAgentStepHandler` resolution & execution.
 */
async function checkAec1StepTypesPersistenceAndHandlerExecution(ctx: IntegrationCheckContext): Promise<void> {
    assertEntityExists(ctx, 'MJ: AI Agent Step Types');
    const cleanups: CleanupFn[] = [];
    const tag = randomUUID().slice(0, 8);
    try {
        // 1. Verify all 14 built-in MJ: AI Agent Step Types rows exist in the DB
        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const builtInsRes = await rv.RunView<{ ID: string; Name: string; Status: string; DriverClass: string }>(
            {
                EntityName: 'MJ: AI Agent Step Types',
                Fields: ['ID', 'Name', 'Status', 'DriverClass'],
                ResultType: 'simple',
            },
            ctx.User
        );
        Assert(
            builtInsRes.Success,
            builtInsRes.ErrorMessage || `Entity MJ: AI Agent Step Types not found in metadata`
        );
        const existingNames = new Set(builtInsRes.Results.map((r) => r.Name));
        const missing = BUILT_IN_STEP_TYPE_NAMES.filter((name) => !existingNames.has(name));
        AssertEqual(
            missing.length,
            0,
            `Expected all 14 built-in MJ: AI Agent Step Types in DB; missing: ${missing.join(', ')}`
        );

        // 2. Insert a custom DB-backed MJ: AI Agent Step Types row
        const customStepName = `IT195CustomGate_${tag}`;
        const stepType = await ctx.Provider.GetEntityObject<MJAIAgentStepTypeEntity>('MJ: AI Agent Step Types', ctx.User);
        stepType.NewRecord();
        stepType.Name = customStepName;
        stepType.Description = `IT195 custom pluggable step type ${FIXTURE_TAG}`;
        stepType.DriverClass = CUSTOM_HANDLER_DRIVER_CLASS;
        stepType.AppliesTo = 'Both';
        stepType.AllowedInUnapprovedPlanMode = true;
        stepType.CountsAgainstTreeBudget = false;
        stepType.DefaultEnabledInPrompt = true;
        stepType.PromptDocsTemplate = `Emit ${customStepName} to verify DB-backed custom step dispatch.`;
        stepType.Status = 'Active';
        Assert(await stepType.Save(), `Failed to save custom AIAgentStepType: ${stepType.LatestResult?.CompleteMessage}`);
        const stepTypeId = stepType.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agent Step Types', stepTypeId));

        // 3. Reload AIEngine and verify AgentStepTypeRegistry resolves & executes the DB-backed handler
        await AIEngine.Instance.Config(true, ctx.User);
        const policy = AgentStepTypeRegistry.Instance.ResolveEffectivePolicy(customStepName);
        Assert(policy != null, `AgentStepTypeRegistry failed to resolve DB-backed step type '${customStepName}'`);
        Assert(UUIDsEqual(policy!.StepTypeID, stepTypeId), `Expected StepTypeID=${stepTypeId}, got ${policy!.StepTypeID}`);
        AssertEqual(policy!.IsBuiltIn, false, 'Custom DB step type should have IsBuiltIn=false');
        AssertEqual(policy!.AllowedInUnapprovedPlanMode, true, 'AllowedInUnapprovedPlanMode mismatch');
        AssertEqual(policy!.CountsAgainstTreeBudget, false, 'CountsAgainstTreeBudget mismatch');
        Assert(
            policy!.PromptInstructions?.includes(customStepName) === true,
            `Expected PromptInstructions to include '${customStepName}', got '${policy!.PromptInstructions}'`
        );
        Assert(
            policy!.Handler instanceof IT195CustomGateStepHandler,
            `Expected IT195CustomGateStepHandler instance from ClassFactory, got ${policy!.Handler?.constructor?.name}`
        );

        const execResult = await policy!.Handler.Execute(
            {} as AgentRunContext,
            {} as ExecuteAgentParams,
            {} as AgentConfiguration,
            { step: customStepName, terminate: false, newPayload: { marker: tag } },
            3
        );
        AssertEqual(execResult.step, 'Success', 'Custom handler Execute should return Success');
        AssertEqual(execResult.terminate, true, 'Custom handler Execute should terminate');
        AssertEqual(execResult.message, 'IT195CustomGate handled at step 3', 'Custom handler Execute message mismatch');

        // 4. Verify StepTypeID FK persistence on BOTH MJ: AI Agent Steps and MJ: AI Agent Run Steps
        const loopTypeId = await getLoopAgentTypeId(ctx);
        const agent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
        agent.NewRecord();
        agent.Name = `IT195-StepTypeFK-${tag}`;
        agent.Description = `IT195 StepTypeID FK test agent ${FIXTURE_TAG}`;
        agent.TypeID = loopTypeId;
        agent.Status = 'Active';
        Assert(await agent.Save(), `Failed to save IT195 agent: ${agent.LatestResult?.CompleteMessage}`);
        const agentId = agent.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', agentId));

        const agentStep = await ctx.Provider.GetEntityObject<MJAIAgentStepEntity>('MJ: AI Agent Steps', ctx.User);
        agentStep.NewRecord();
        agentStep.AgentID = agentId;
        agentStep.Name = `IT195-CustomFlowStep-${tag}`;
        agentStep.StepType = 'Custom';
        agentStep.StepTypeID = stepTypeId;
        agentStep.StartingStep = true;
        agentStep.Status = 'Active';
        Assert(await agentStep.Save(), `Failed to save AIAgentStep with StepTypeID: ${agentStep.LatestResult?.CompleteMessage}`);
        const agentStepId = agentStep.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agent Steps', agentStepId));

        const reloadedAgentStep = await ctx.Provider.GetEntityObject<MJAIAgentStepEntity>('MJ: AI Agent Steps', ctx.User);
        Assert(await reloadedAgentStep.Load(agentStepId), 'Failed to reload saved AIAgentStep');
        Assert(
            UUIDsEqual(reloadedAgentStep.StepTypeID, stepTypeId),
            `AIAgentStep.StepTypeID did not round-trip: expected ${stepTypeId}, got ${reloadedAgentStep.StepTypeID}`
        );

        const agentRun = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
        agentRun.NewRecord();
        agentRun.AgentID = agentId;
        agentRun.Status = 'Completed';
        agentRun.StartedAt = new Date();
        agentRun.CompletedAt = new Date();
        Assert(await agentRun.Save(), `Failed to save AIAgentRun: ${agentRun.LatestResult?.CompleteMessage}`);
        const agentRunId = agentRun.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agent Runs', agentRunId));

        const runStep = await ctx.Provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', ctx.User);
        runStep.NewRecord();
        runStep.AgentRunID = agentRunId;
        runStep.StepNumber = 1;
        runStep.StepType = 'Custom';
        runStep.StepTypeID = stepTypeId;
        runStep.StepName = customStepName;
        runStep.Status = 'Completed';
        runStep.StartedAt = new Date();
        runStep.CompletedAt = new Date();
        Assert(await runStep.Save(), `Failed to save AIAgentRunStep with StepTypeID: ${runStep.LatestResult?.CompleteMessage}`);
        const runStepId = runStep.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agent Run Steps', runStepId));

        const reloadedRunStep = await ctx.Provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', ctx.User);
        Assert(await reloadedRunStep.Load(runStepId), 'Failed to reload saved AIAgentRunStep');
        Assert(
            UUIDsEqual(reloadedRunStep.StepTypeID, stepTypeId),
            `AIAgentRunStep.StepTypeID did not round-trip: expected ${stepTypeId}, got ${reloadedRunStep.StepTypeID}`
        );
    } finally {
        await runCleanups(cleanups);
        await AIEngine.Instance.Config(true, ctx.User).catch(() => undefined);
    }
}

/**
 * AEC2: SQL-level 3-table `IAgentConfiguration` cascade (`AIAgent.Configuration` ->
 * `BaseAgentID` chain -> `AIAgentCategory.DefaultConfiguration` ->
 * `AIAgentType.DefaultAgentConfiguration`) with narrow-only security invariant enforcement.
 */
async function checkAec2ThreeTableConfigCascadeAndNarrowOnly(ctx: IntegrationCheckContext): Promise<void> {
    assertEntityHasField(ctx, 'MJ: AI Agent Types', 'DefaultAgentConfiguration');
    assertEntityHasField(ctx, 'MJ: AI Agent Categories', 'DefaultConfiguration');
    assertEntityHasField(ctx, 'MJ: AI Agents', 'Configuration');
    const cleanups: CleanupFn[] = [];
    const tag = randomUUID().slice(0, 8);
    try {
        // 1. AgentType tier
        const customType = await ctx.Provider.GetEntityObject<MJAIAgentTypeEntity>('MJ: AI Agent Types', ctx.User);
        customType.NewRecord();
        customType.Name = `IT195-Type-${tag}`;
        customType.Description = `IT195 cascade test agent type ${FIXTURE_TAG}`;
        customType.DriverClass = 'LoopAgentType';
        customType.DefaultAgentConfiguration = JSON.stringify({
            contextWindow: {
                maxTokens: 64000,
                compactionTriggerPercent: 70,
            },
        });
        Assert(await customType.Save(), `Failed to save cascade AgentType: ${customType.LatestResult?.CompleteMessage}`);
        const typeId = customType.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agent Types', typeId));

        // 2. Parent & child Category tiers
        const parentCat = await ctx.Provider.GetEntityObject<MJAIAgentCategoryEntity>('MJ: AI Agent Categories', ctx.User);
        parentCat.NewRecord();
        parentCat.Name = `IT195-ParentCat-${tag}`;
        parentCat.Description = `IT195 parent category ${FIXTURE_TAG}`;
        parentCat.DefaultConfiguration = JSON.stringify({
            memory: { maxNotesToInject: 12 },
            skills: { activationMode: 'Auto' },
        });
        Assert(await parentCat.Save(), `Failed to save parent category: ${parentCat.LatestResult?.CompleteMessage}`);
        const parentCatId = parentCat.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agent Categories', parentCatId));

        const childCat = await ctx.Provider.GetEntityObject<MJAIAgentCategoryEntity>('MJ: AI Agent Categories', ctx.User);
        childCat.NewRecord();
        childCat.Name = `IT195-ChildCat-${tag}`;
        childCat.Description = `IT195 child category ${FIXTURE_TAG}`;
        childCat.ParentID = parentCatId;
        childCat.DefaultConfiguration = JSON.stringify({
            memory: { maxNotesToInject: 6 },
            attachments: { maxMessages: 25 },
        });
        Assert(await childCat.Save(), `Failed to save child category: ${childCat.LatestResult?.CompleteMessage}`);
        const childCatId = childCat.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agent Categories', childCatId));

        // 3. Base agent locking down narrow-only invariants
        const baseAgent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
        baseAgent.NewRecord();
        baseAgent.Name = `IT195-BaseCascade-${tag}`;
        baseAgent.Description = `IT195 base cascade agent ${FIXTURE_TAG}`;
        baseAgent.TypeID = typeId;
        baseAgent.CategoryID = childCatId;
        baseAgent.Status = 'Active';
        baseAgent.InstantiationMode = 'Optional';
        baseAgent.Configuration = JSON.stringify({
            execution: { requirePlanMode: true },
            skills: { activationMode: 'RequestedOnly' },
            clientTools: { allowEphemeral: false },
            subAgentExecution: { maxConsultRounds: 3 },
        });
        Assert(await baseAgent.Save(), `Failed to save base cascade agent: ${baseAgent.LatestResult?.CompleteMessage}`);
        const baseAgentId = baseAgent.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', baseAgentId));

        // 4. Derived child agent trying to widen narrow-only settings while overriding maxMessages
        const childAgent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
        childAgent.NewRecord();
        childAgent.Name = `IT195-ChildCascade-${tag}`;
        childAgent.Description = `IT195 derived cascade agent ${FIXTURE_TAG}`;
        childAgent.TypeID = typeId;
        childAgent.BaseAgentID = baseAgentId;
        childAgent.Status = 'Active';
        childAgent.Configuration = JSON.stringify({
            execution: { requirePlanMode: false },
            skills: { activationMode: 'Auto' },
            clientTools: { allowEphemeral: true },
            subAgentExecution: { maxConsultRounds: 9 },
            attachments: { maxMessages: 10 },
        });
        Assert(await childAgent.Save(), `Failed to save child cascade agent: ${childAgent.LatestResult?.CompleteMessage}`);
        const childAgentId = childAgent.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', childAgentId));

        // 5. Refresh AIEngine from live SQL and resolve effective cascade properties
        await AIEngine.Instance.Config(true, ctx.User);
        const eff = AIEngine.Instance.ResolveEffectiveAgentProperties(childAgentId);

        // AgentType default tier
        AssertEqual(eff.ContextWindowMaxTokens, 64000, 'ContextWindowMaxTokens should inherit from AgentType.DefaultAgentConfiguration');
        AssertEqual(eff.CompactionTriggerPercent, 70, 'CompactionTriggerPercent should inherit from AgentType.DefaultAgentConfiguration');

        // Category tree tier (ChildCategory overrides ParentCategory)
        AssertEqual(eff.MaxNotesToInject, 6, 'MaxNotesToInject should inherit from ChildCategory overriding ParentCategory (12 -> 6)');

        // Leaf agent override over Category tier
        AssertEqual(eff.MaxMessages, 10, 'MaxMessages should be overridden by leaf agent over ChildCategory (25 -> 10)');

        // Narrow-only security invariants cannot be loosened down the chain
        AssertEqual(eff.RequirePlanMode, true, 'RequirePlanMode cannot be loosened from true to false');
        AssertEqual(eff.SkillActivationMode, 'RequestedOnly', 'SkillActivationMode cannot be loosened from RequestedOnly to Auto');
        AssertEqual(eff.AllowEphemeralClientTools, false, 'AllowEphemeralClientTools cannot be loosened from false to true');
        AssertEqual(eff.MaxSubAgentConsultRounds, 3, 'MaxSubAgentConsultRounds cannot be loosened from 3 to 9');
    } finally {
        await runCleanups(cleanups);
        await AIEngine.Instance.Config(true, ctx.User).catch(() => undefined);
    }
}

/**
 * AEC3: Bidirectional dirty-field `Save()` sync in `MJAIAgentEntityServer` and
 * `MJAIAgentTypeEntityServer`.
 */
async function checkAec3BidirectionalSaveSync(ctx: IntegrationCheckContext): Promise<void> {
    assertEntityHasField(ctx, 'MJ: AI Agents', 'Configuration');
    assertEntityHasField(ctx, 'MJ: AI Agent Types', 'DefaultAgentConfiguration');
    const cleanups: CleanupFn[] = [];
    const tag = randomUUID().slice(0, 8);
    try {
        const loopTypeId = await getLoopAgentTypeId(ctx);

        // 1. AIAgent: legacy columns -> Configuration JSON on create
        const agent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
        agent.NewRecord();
        agent.Name = `IT195-BiSync-Agent-${tag}`;
        agent.Description = `IT195 bidirectional sync agent ${FIXTURE_TAG}`;
        agent.TypeID = loopTypeId;
        agent.Status = 'Active';
        agent.MaxNotesToInject = 15;
        agent.CompactionTriggerPercent = 82;
        agent.AllowMemoryWrite = false;
        Assert(await agent.Save(), `Failed to save agent with legacy columns: ${agent.LatestResult?.CompleteMessage}`);
        const agentId = agent.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', agentId));

        const reloaded1 = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
        Assert(await reloaded1.Load(agentId), 'Failed to reload agent after legacy-column create');
        const cfg1 = ParseAgentConfiguration(reloaded1.Configuration);
        Assert(cfg1 != null, 'Expected AIAgent.Configuration JSON to be populated from dirty legacy columns');
        AssertEqual(cfg1!.memory?.maxNotesToInject, 15, 'Configuration.memory.maxNotesToInject sync mismatch');
        AssertEqual(cfg1!.contextWindow?.compactionTriggerPercent, 82, 'Configuration.contextWindow.compactionTriggerPercent sync mismatch');
        AssertEqual(cfg1!.memory?.allowMemoryWrite, false, 'Configuration.memory.allowMemoryWrite sync mismatch');

        // 2. AIAgent: Configuration JSON -> legacy columns on update
        reloaded1.Configuration = JSON.stringify({
            ...cfg1,
            memory: { ...(cfg1?.memory ?? {}), maxNotesToInject: 4 },
            attachments: { maxMessages: 33 },
            skills: { activationMode: 'RequestedOnly' },
        });
        Assert(await reloaded1.Save(), `Failed to save agent with updated Configuration JSON: ${reloaded1.LatestResult?.CompleteMessage}`);

        const reloaded2 = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
        Assert(await reloaded2.Load(agentId), 'Failed to reload agent after Configuration JSON update');
        AssertEqual(reloaded2.MaxNotesToInject, 4, 'Legacy MaxNotesToInject did not sync from Configuration JSON');
        AssertEqual(reloaded2.MaxMessages, 33, 'Legacy MaxMessages did not sync from Configuration JSON');
        AssertEqual(reloaded2.SkillActivationMode, 'RequestedOnly', 'Legacy SkillActivationMode did not sync from Configuration JSON');

        // 3. AIAgent: single dirty legacy column -> preserves other Configuration JSON keys
        reloaded2.MaxMessages = 19;
        Assert(await reloaded2.Save(), `Failed to save agent with single dirty legacy column: ${reloaded2.LatestResult?.CompleteMessage}`);

        const reloaded3 = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
        Assert(await reloaded3.Load(agentId), 'Failed to reload agent after single legacy-column update');
        const cfg3 = ParseAgentConfiguration(reloaded3.Configuration);
        AssertEqual(cfg3?.attachments?.maxMessages, 19, 'Configuration.attachments.maxMessages did not sync from legacy MaxMessages');
        AssertEqual(cfg3?.memory?.maxNotesToInject, 4, 'Unmodified Configuration.memory.maxNotesToInject should be preserved');

        // 4. AIAgentType: bidirectional sync between 7 legacy columns and DefaultAgentConfiguration
        const agentType = await ctx.Provider.GetEntityObject<MJAIAgentTypeEntity>('MJ: AI Agent Types', ctx.User);
        agentType.NewRecord();
        agentType.Name = `IT195-BiSync-Type-${tag}`;
        agentType.Description = `IT195 bidirectional sync agent type ${FIXTURE_TAG}`;
        agentType.DriverClass = 'LoopAgentType';
        agentType.ContextWindowMaxTokens = 48000;
        Assert(await agentType.Save(), `Failed to save agent type with legacy column: ${agentType.LatestResult?.CompleteMessage}`);
        const agentTypeId = agentType.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agent Types', agentTypeId));

        const reloadedType1 = await ctx.Provider.GetEntityObject<MJAIAgentTypeEntity>('MJ: AI Agent Types', ctx.User);
        Assert(await reloadedType1.Load(agentTypeId), 'Failed to reload agent type after create');
        const typeCfg1 = ParseAgentConfiguration(reloadedType1.DefaultAgentConfiguration);
        AssertEqual(
            typeCfg1?.contextWindow?.maxTokens,
            48000,
            'AIAgentType.DefaultAgentConfiguration.contextWindow.maxTokens did not sync from ContextWindowMaxTokens'
        );

        reloadedType1.DefaultAgentConfiguration = JSON.stringify({
            contextWindow: {
                ...(typeCfg1?.contextWindow ?? {}),
                compactionTargetPercent: 55,
            },
        });
        Assert(await reloadedType1.Save(), `Failed to save agent type with updated DefaultAgentConfiguration: ${reloadedType1.LatestResult?.CompleteMessage}`);

        const reloadedType2 = await ctx.Provider.GetEntityObject<MJAIAgentTypeEntity>('MJ: AI Agent Types', ctx.User);
        Assert(await reloadedType2.Load(agentTypeId), 'Failed to reload agent type after DefaultAgentConfiguration update');
        AssertEqual(
            reloadedType2.CompactionTargetPercent,
            55,
            'Legacy AIAgentType.CompactionTargetPercent did not sync from DefaultAgentConfiguration'
        );
    } finally {
        await runCleanups(cleanups);
    }
}

/**
 * AEC4: Admin-only `Configuration.helperPlugins` & code-only security seam (`limits`,
 * `actionPolicy`) rejection in live `MJAIAgentEntityServer.Save()`.
 */
async function checkAec4HelperPluginsAndCodeOnlySeamGuards(ctx: IntegrationCheckContext): Promise<void> {
    assertEntityHasField(ctx, 'MJ: AI Agents', 'Configuration');
    const cleanups: CleanupFn[] = [];
    const tag = randomUUID().slice(0, 8);
    try {
        const loopTypeId = await getLoopAgentTypeId(ctx);

        // 1. Even an Administrator/Owner is rejected when attempting code-only seams in Configuration
        for (const forbiddenSeam of ['limits', 'actionPolicy', 'setup', 'steps', 'actions', 'subAgents'] as const) {
            const badAdminAgent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
            badAdminAgent.NewRecord();
            badAdminAgent.Name = `IT195-BadSeam-${forbiddenSeam}-${tag}`;
            badAdminAgent.Description = `IT195 forbidden seam check ${FIXTURE_TAG}`;
            badAdminAgent.TypeID = loopTypeId;
            badAdminAgent.Status = 'Active';
            badAdminAgent.Configuration = JSON.stringify({
                helperPlugins: [{ seam: forbiddenSeam, driverClass: 'ForbiddenOverrideHelper' }],
            });
            const saved = await badAdminAgent.Save();
            if (saved && badAdminAgent.ID) {
                cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', badAdminAgent.ID));
            }
            AssertEqual(saved, false, `Admin Save() MUST reject code-only seam '${forbiddenSeam}' in Configuration.helperPlugins`);
            const msg = badAdminAgent.LatestResult?.CompleteMessage ?? '';
            Assert(/code-only/i.test(msg), `Expected 'code-only' rejection message for '${forbiddenSeam}', got: ${msg}`);
        }

        // 2. Administrator CAN save a valid pluggable seam in Configuration.helperPlugins
        const baseAgent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
        baseAgent.NewRecord();
        baseAgent.Name = `IT195-ValidPluginBase-${tag}`;
        baseAgent.Description = `IT195 valid helperPlugin base agent ${FIXTURE_TAG}`;
        baseAgent.TypeID = loopTypeId;
        baseAgent.Status = 'Active';
        baseAgent.InstantiationMode = 'Optional';
        baseAgent.Configuration = JSON.stringify({
            helperPlugins: [{ seam: 'messaging', driverClass: 'IT195CustomMessagingHelper' }],
        });
        Assert(await baseAgent.Save(), `Admin Save() should allow valid pluggable seam: ${baseAgent.LatestResult?.CompleteMessage}`);
        const baseAgentId = baseAgent.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', baseAgentId));

        // 3. Non-admin UI user with CanRun on baseAgent is REJECTED setting Configuration.helperPlugins
        const runnerRole = await ctx.Provider.GetEntityObject<MJRoleEntity>('MJ: Roles', ctx.User);
        runnerRole.NewRecord();
        runnerRole.Name = `IT195-PluginRunnerRole-${tag}`;
        runnerRole.Description = `IT195 throwaway role ${FIXTURE_TAG}`;
        Assert(await runnerRole.Save(), `Failed to create throwaway role: ${runnerRole.LatestResult?.CompleteMessage}`);
        const runnerRoleId = runnerRole.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: Roles', runnerRoleId));

        const perm = await ctx.Provider.GetEntityObject<MJAIAgentPermissionEntity>('MJ: AI Agent Permissions', ctx.User);
        perm.NewRecord();
        perm.AgentID = baseAgentId;
        perm.RoleID = runnerRoleId;
        perm.CanView = true;
        perm.CanRun = true;
        perm.CanEdit = false;
        perm.CanDelete = false;
        Assert(await perm.Save(), `Failed to grant CanRun permission: ${perm.LatestResult?.CompleteMessage}`);
        const permId = perm.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agent Permissions', permId));

        const alice = await createUiFixtureUser(ctx, cleanups, 'AlicePlugin', tag, [
            { RoleID: runnerRoleId, RoleName: runnerRole.Name },
        ]);

        const nonAdminPluginAgent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', alice);
        nonAdminPluginAgent.NewRecord();
        nonAdminPluginAgent.Name = `IT195-NonAdminPlugin-${tag}`;
        nonAdminPluginAgent.Description = `IT195 non-admin helperPlugins attempt ${FIXTURE_TAG}`;
        nonAdminPluginAgent.TypeID = loopTypeId;
        nonAdminPluginAgent.BaseAgentID = baseAgentId;
        nonAdminPluginAgent.Status = 'Active';
        nonAdminPluginAgent.Configuration = JSON.stringify({
            helperPlugins: [{ seam: 'messaging', driverClass: 'SneakyUserHelper' }],
        });
        const nonAdminSaved = await nonAdminPluginAgent.Save();
        if (nonAdminSaved && nonAdminPluginAgent.ID) {
            cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', nonAdminPluginAgent.ID));
        }
        AssertEqual(nonAdminSaved, false, 'Non-admin Save() MUST reject Configuration.helperPlugins');
        const nonAdminMsg = nonAdminPluginAgent.LatestResult?.CompleteMessage ?? '';
        Assert(
            /only administrators may configure helperPlugins/i.test(nonAdminMsg),
            `Expected admin-only helperPlugins error, got: ${nonAdminMsg}`
        );
    } finally {
        await runCleanups(cleanups);
    }
}

/**
 * AEC5: `#6852` `UI`-role ownership/RLS enforcement & non-admin sandbox rejection
 * (`BaseAgentID`, `CanRun`, `DriverClass`, `Isolation`, `MaxCostPerRun`,
 * `TypeConfiguration.helperPlugins`, and cross-user RLS / write isolation).
 * Uses only columns present on both SQL Server and PostgreSQL so it runs live on both engines.
 */
async function checkAec5UiRoleRlsAndNonAdminSandbox(ctx: IntegrationCheckContext): Promise<void> {
    const cleanups: CleanupFn[] = [];
    const tag = randomUUID().slice(0, 8);
    try {
        const loopTypeId = await getLoopAgentTypeId(ctx);

        // 1. Admin creates instantiable base agent with strict bounds & Worker isolation
        const baseAgent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
        baseAgent.NewRecord();
        baseAgent.Name = `IT195-SandboxBase-${tag}`;
        baseAgent.Description = `IT195 #6852 sandbox base ${FIXTURE_TAG}`;
        baseAgent.TypeID = loopTypeId;
        baseAgent.Status = 'Active';
        baseAgent.InstantiationMode = 'Optional';
        baseAgent.Isolation = 'Worker';
        baseAgent.MaxCostPerRun = 5.0;
        Assert(await baseAgent.Save(), `Failed to save sandbox base agent: ${baseAgent.LatestResult?.CompleteMessage}`);
        const baseAgentId = baseAgent.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', baseAgentId));

        // 2. Grant CanRun ONLY to Alice's role, NOT Bob
        const allowedRole = await ctx.Provider.GetEntityObject<MJRoleEntity>('MJ: Roles', ctx.User);
        allowedRole.NewRecord();
        allowedRole.Name = `IT195-SandboxAllowed-${tag}`;
        allowedRole.Description = `IT195 throwaway allowed role ${FIXTURE_TAG}`;
        Assert(await allowedRole.Save(), `Failed to save allowed role: ${allowedRole.LatestResult?.CompleteMessage}`);
        const allowedRoleId = allowedRole.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: Roles', allowedRoleId));

        const perm = await ctx.Provider.GetEntityObject<MJAIAgentPermissionEntity>('MJ: AI Agent Permissions', ctx.User);
        perm.NewRecord();
        perm.AgentID = baseAgentId;
        perm.RoleID = allowedRoleId;
        perm.CanView = true;
        perm.CanRun = true;
        perm.CanEdit = false;
        perm.CanDelete = false;
        Assert(await perm.Save(), `Failed to save CanRun permission: ${perm.LatestResult?.CompleteMessage}`);
        const permId = perm.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agent Permissions', permId));

        const alice = await createUiFixtureUser(ctx, cleanups, 'Alice', tag, [
            { RoleID: allowedRoleId, RoleName: allowedRole.Name },
        ]);
        const bob = await createUiFixtureUser(ctx, cleanups, 'Bob', tag);

        // 3. Alice (UI role) CANNOT create a root agent without BaseAgentID
        const rootAttempt = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', alice);
        rootAttempt.NewRecord();
        rootAttempt.Name = `IT195-AliceRoot-${tag}`;
        rootAttempt.TypeID = loopTypeId;
        rootAttempt.Status = 'Active';
        const rootSaved = await rootAttempt.Save();
        if (rootSaved && rootAttempt.ID) {
            cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', rootAttempt.ID));
        }
        AssertEqual(rootSaved, false, 'Non-admin UI user MUST NOT create a root agent without BaseAgentID');

        // 4. Alice CANNOT set custom DriverClass, loosen Isolation, exceed MaxCostPerRun, or inject TypeConfiguration.helperPlugins
        const badCases: Array<{
            label: string;
            mutate: (a: MJAIAgentEntity) => void;
            expectedPattern: RegExp;
        }> = [
            {
                label: 'custom DriverClass',
                mutate: (a) => { a.DriverClass = 'MaliciousCustomAgentDriver'; },
                expectedPattern: /DriverClass/i,
            },
            {
                label: 'loosened Isolation',
                mutate: (a) => { a.Isolation = 'InProcess'; },
                expectedPattern: /Isolation/i,
            },
            {
                label: 'MaxCostPerRun above ceiling',
                mutate: (a) => { a.MaxCostPerRun = 10.0; },
                expectedPattern: /MaxCostPerRun/i,
            },
            {
                label: 'TypeConfiguration.helperPlugins',
                mutate: (a) => {
                    a.TypeConfiguration = JSON.stringify({
                        helperPlugins: [{ seam: 'limits', driverClass: 'BypassLimits' }],
                    });
                },
                expectedPattern: /code-only|helperPlugins/i,
            },
        ];

        for (const tc of badCases) {
            const candidate = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', alice);
            candidate.NewRecord();
            candidate.Name = `IT195-Bad-${tc.label}-${tag}`;
            candidate.TypeID = loopTypeId;
            candidate.BaseAgentID = baseAgentId;
            candidate.Status = 'Active';
            candidate.Isolation = 'Worker';
            tc.mutate(candidate);
            const saved = await candidate.Save();
            if (saved && candidate.ID) {
                cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', candidate.ID));
            }
            AssertEqual(saved, false, `Non-admin sandbox MUST reject ${tc.label}`);
            const msg = candidate.LatestResult?.CompleteMessage ?? '';
            Assert(tc.expectedPattern.test(msg), `Expected ${tc.expectedPattern} for ${tc.label}, got: ${msg}`);
        }

        // 5. Bob (WITHOUT CanRun on baseAgent) CANNOT instantiate from baseAgent
        const bobAttempt = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', bob);
        bobAttempt.NewRecord();
        bobAttempt.Name = `IT195-BobNoCanRun-${tag}`;
        bobAttempt.TypeID = loopTypeId;
        bobAttempt.BaseAgentID = baseAgentId;
        bobAttempt.Status = 'Active';
        const bobSaved = await bobAttempt.Save();
        if (bobSaved && bobAttempt.ID) {
            cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', bobAttempt.ID));
        }
        AssertEqual(bobSaved, false, 'UI user without CanRun on BaseAgentID MUST NOT instantiate a derived agent');

        // 6. Alice CAN create a valid derived personal instance within bounds; OwnerUserID stamped to Alice
        const aliceInstance = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', alice);
        aliceInstance.NewRecord();
        aliceInstance.Name = `IT195-AlicePrivate-${tag}`;
        aliceInstance.Description = `Alice private instance ${FIXTURE_TAG}`;
        aliceInstance.TypeID = loopTypeId;
        aliceInstance.BaseAgentID = baseAgentId;
        aliceInstance.Status = 'Active';
        aliceInstance.Isolation = 'Worker';
        aliceInstance.MaxCostPerRun = 2.5;
        Assert(await aliceInstance.Save(), `Alice valid derived instance failed to save: ${aliceInstance.LatestResult?.CompleteMessage}`);
        const aliceInstanceId = aliceInstance.ID;
        cleanups.push(() => deleteEntityById(ctx, 'MJ: AI Agents', aliceInstanceId));
        Assert(
            UUIDsEqual(aliceInstance.OwnerUserID, alice.ID),
            `Expected OwnerUserID=${alice.ID}, got ${aliceInstance.OwnerUserID}`
        );

        // 7. Live SQL RLS hides Alice's private instance from Bob while showing it to Alice
        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const aliceView = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: AI Agents',
                ExtraFilter: `ID='${EscapeSQLString(aliceInstanceId)}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            alice
        );
        Assert(aliceView.Success && aliceView.Results.length === 1, 'Alice should see her own private derived instance via RLS');

        const bobView = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: AI Agents',
                ExtraFilter: `ID='${EscapeSQLString(aliceInstanceId)}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            bob
        );
        Assert(bobView.Success, `Bob RunView failed: ${bobView.ErrorMessage}`);
        AssertEqual(bobView.Results.length, 0, 'RLS MUST hide Alice private derived agent instance from Bob');

        // 8. Bob CANNOT modify or delete Alice's instance even if loading directly by ID
        const bobEdit = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', bob);
        const loadedByBob = await bobEdit.Load(aliceInstanceId);
        if (loadedByBob) {
            bobEdit.Description = 'Unauthorized edit by Bob';
            const bobEditSaved = await bobEdit.Save();
            AssertEqual(bobEditSaved, false, 'Bob MUST NOT be allowed to edit Alice derived instance');
            const bobDeleted = await bobEdit.Delete();
            AssertEqual(bobDeleted, false, 'Bob MUST NOT be allowed to delete Alice derived instance');
        }
    } finally {
        await runCleanups(cleanups);
    }
}

export const AgentExtensionsAndConfigCascadeChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.AEC1`,
        Name: 'AEC1: MJ: AI Agent Step Types DB persistence, StepTypeID FK on AIAgentStep/AIAgentRunStep, and custom BaseAgentStepHandler execution',
        Fn: checkAec1StepTypesPersistenceAndHandlerExecution,
    },
    {
        Id: `${BUNDLE}.AEC2`,
        Name: 'AEC2: SQL-level 3-table IAgentConfiguration cascade (Agent -> BaseAgentID -> Category -> AgentType) and narrow-only enforcement',
        Fn: checkAec2ThreeTableConfigCascadeAndNarrowOnly,
    },
    {
        Id: `${BUNDLE}.AEC3`,
        Name: 'AEC3: Bidirectional dirty-field Save() sync in MJAIAgentEntityServer and MJAIAgentTypeEntityServer',
        Fn: checkAec3BidirectionalSaveSync,
    },
    {
        Id: `${BUNDLE}.AEC4`,
        Name: 'AEC4: Admin-only Configuration.helperPlugins & code-only seam (limits, actionPolicy) rejection in live Save()',
        Fn: checkAec4HelperPluginsAndCodeOnlySeamGuards,
    },
    {
        Id: `${BUNDLE}.AEC5`,
        Name: 'AEC5: #6852 UI-role ownership/RLS enforcement & non-admin sandbox rejection (DriverClass, Isolation, limits, CanRun)',
        Fn: checkAec5UiRoleRlsAndNonAdminSandbox,
    },
];

for (const check of AgentExtensionsAndConfigCascadeChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
