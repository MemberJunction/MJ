/**
 * ai-skills.checks.ts — the 'ai-skills' bundle (AS1–AS21): live, deterministic integration checks for
 * the AI Skills feature. Graduated VERBATIM from integration-test-scripts/ai-skills-tests.ts.
 *
 * Exercises real server componentry end-to-end against the live DB, WITHOUT any model calls:
 *   - AIEngineBase.GetSkillsForAgent resolution (AcceptsSkills None/All/Limited × Status × grant Status).
 *   - The v5.45 double activation gate (GetAutoActivatableSkillsForAgent) + the persisted DB default +
 *     the Limited×Auto grant intersection.
 *   - The v5.45 observability round-trip (AIAgentRun.PlanMode + AIAgentRunStep.Skills JSON).
 *   - Skill permissions (grantee-exclusivity validator + GetSkillsForAgent user filter).
 *   - GetSkillActionIDs / GetSkillSubAgentIDs bundle resolution.
 *   - SkillImportExportService SKILL.md round-trip + unknown-name warnings.
 *   - AISkill.ExportMarkdown / AISkill.ImportMarkdown Remote Operations.
 *
 * Deterministic (no LLM). The bundle lifecycle creates the four skills + junction/grant fixtures once
 * and tears them (plus any run/import fixtures the checks create) down in FK-safe order afterwards.
 * References (never mutates) one existing Action + two existing Agents for valid FKs.
 */
import { RunView, BaseEntity, CompositeKey } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    MJAISkillEntity,
    MJAISkillActionEntity,
    MJAISkillSubAgentEntity,
    MJAIAgentSkillEntity,
    MJAISkillPermissionEntity,
    MJAIAgentRunEntity,
    MJAIAgentRunStepEntity,
    AISkillExportMarkdownOperation,
    AISkillImportMarkdownOperation,
} from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { SkillImportExportService, SkillMarkdownConverter } from '@memberjunction/ai-agents';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';
import type { IMetadataProvider } from '@memberjunction/core';

const TAG = '(mj-integration-test — safe to delete)';

/** Fetch the fixture (thrown if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext) {
    Assert(ctx.AiSkillsFixture != null, 'ai-skills fixture missing (bundle Setup did not run)');
    return ctx.AiSkillsFixture!;
}

// Lightweight agent stand-ins — GetSkillsForAgent reads .ID + .AcceptsSkills, and
// GetAutoActivatableSkillsForAgent additionally reads .SkillActivationMode (grants come
// from the engine cache keyed by AgentID). This avoids fabricating a full ~20-column AIAgent.
const agentAs = (
    id: string,
    accepts: MJAIAgentEntityExtended['AcceptsSkills'],
    skillActivationMode: MJAIAgentEntityExtended['SkillActivationMode'] = 'RequestedOnly'
) => ({ ID: id, AcceptsSkills: accepts, SkillActivationMode: skillActivationMode }) as MJAIAgentEntityExtended;

/** Helper: build an AISkillPermission and attempt to save it, returning the entity (saved or not). */
async function makePermission(
    provider: IMetadataProvider,
    user: UserInfo,
    skillId: string,
    opts: { userId?: string | null; roleId?: string | null; canRun?: boolean }
): Promise<MJAISkillPermissionEntity> {
    const p = await provider.GetEntityObject<MJAISkillPermissionEntity>('MJ: AI Skill Permissions', user);
    p.NewRecord();
    p.SkillID = skillId;
    p.UserID = opts.userId ?? null;
    p.RoleID = opts.roleId ?? null;
    p.CanRun = opts.canRun ?? false;
    return p;
}

// A fabricated non-owner user with no roles — GetSkillsForAgent reads only .ID + .UserRoles, so a
// stand-in suffices to exercise the permission filter without provisioning a second real account.
const nonOwner = ({ ID: 'F0F0F0F0-1111-2222-3333-444455556666', UserRoles: [] }) as unknown as UserInfo;

export const AiSkillsChecks: NamedCheck[] = [
    // ── Governance / resolution ────────────────────────────────────────────────────────────────
    {
        Id: 'ai-skills.AS1',
        Name: 'AcceptsSkills=None resolves to zero skills',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(f.GrantTargetAgent.ID, 'None'));
            AssertEqual(skills.length, 0, 'None must yield no skills');
        }
    },
    {
        Id: 'ai-skills.AS2',
        Name: 'AcceptsSkills=All includes an Active skill and excludes a Deprecated one',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(f.GrantTargetAgent.ID, 'All'));
            Assert(skills.some(s => UUIDsEqual(s.ID, f.SkillActive.ID)), 'All must include the Active test skill');
            Assert(!skills.some(s => UUIDsEqual(s.ID, f.SkillDeprecated.ID)), 'All must exclude the Deprecated test skill');
        }
    },
    {
        Id: 'ai-skills.AS3',
        Name: 'AcceptsSkills=Limited returns only granted Active skills',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const granted = AIEngine.Instance.GetSkillsForAgent(agentAs(f.GrantTargetAgent.ID, 'Limited'));
            Assert(granted.some(s => UUIDsEqual(s.ID, f.SkillActive.ID)), 'granted agent must see the granted skill');

            // A different agent with no grant sees none of our test skills under Limited.
            const ungranted = AIEngine.Instance.GetSkillsForAgent(agentAs(f.BundledSubAgent.ID, 'Limited'));
            Assert(!ungranted.some(s => UUIDsEqual(s.ID, f.SkillActive.ID)), 'an agent without a grant must NOT see the skill under Limited');
        }
    },
    {
        Id: 'ai-skills.AS4',
        Name: 'GetSkillActionIDs / GetSkillSubAgentIDs return the bundled IDs',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const actionIds = AIEngine.Instance.GetSkillActionIDs(f.SkillActive.ID);
            const subIds = AIEngine.Instance.GetSkillSubAgentIDs(f.SkillActive.ID);
            Assert(actionIds.some(id => UUIDsEqual(id, f.AnyAction.ID)), 'bundled action ID must be returned');
            Assert(subIds.some(id => UUIDsEqual(id, f.BundledSubAgent.ID)), 'bundled sub-agent ID must be returned');
        }
    },
    // ── v5.45 double activation gate (availability vs. trigger) ─────────────────────────────────
    {
        Id: 'ai-skills.AS5',
        Name: 'ActivationMode defaults to RequestedOnly on a freshly created skill (safe DB default)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            // Reload from the DB so we read the persisted default, not client-side state.
            const fresh = await ctx.Provider.GetEntityObject<MJAISkillEntity>('MJ: AI Skills', ctx.User);
            Assert(await fresh.Load(f.SkillActive.ID), 'reload of the fixture skill failed');
            AssertEqual(fresh.ActivationMode, 'RequestedOnly', 'a skill created without ActivationMode must default to RequestedOnly');
        }
    },
    {
        Id: 'ai-skills.AS6',
        Name: 'Auto×Auto: an Auto agent self-activates ONLY Auto skills (RequestedOnly + Deprecated excluded)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const auto = AIEngine.Instance.GetAutoActivatableSkillsForAgent(agentAs(f.GrantTargetAgent.ID, 'All', 'Auto'));
            Assert(auto.some(s => UUIDsEqual(s.ID, f.SkillAuto.ID)), 'Auto agent must see the Auto skill in its self-activation set');
            Assert(!auto.some(s => UUIDsEqual(s.ID, f.SkillActive.ID)), 'a RequestedOnly skill must never be self-activatable');
            Assert(!auto.some(s => UUIDsEqual(s.ID, f.SkillDeprecated.ID)), 'availability gates still apply on the auto set');
        }
    },
    {
        Id: 'ai-skills.AS7',
        Name: 'A RequestedOnly agent has an EMPTY self-activation set, even for Auto skills',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const auto = AIEngine.Instance.GetAutoActivatableSkillsForAgent(agentAs(f.GrantTargetAgent.ID, 'All', 'RequestedOnly'));
            AssertEqual(auto.length, 0, 'agent-side RequestedOnly must zero out the self-activation set');
        }
    },
    {
        Id: 'ai-skills.AS8',
        Name: 'The requested path is NOT gated by ActivationMode — availability still includes RequestedOnly skills',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const available = AIEngine.Instance.GetSkillsForAgent(agentAs(f.GrantTargetAgent.ID, 'All', 'RequestedOnly'));
            Assert(available.some(s => UUIDsEqual(s.ID, f.SkillActive.ID)), 'a RequestedOnly skill remains available for explicit /skill requests');
            Assert(available.some(s => UUIDsEqual(s.ID, f.SkillAuto.ID)), 'an Auto skill is (of course) also available on the requested path');
        }
    },
    {
        Id: 'ai-skills.AS9',
        Name: 'Limited × Auto: the self-activation set intersects with Active grants',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            // grantTargetAgent has a grant for skillActive (RequestedOnly) only — so its Limited auto set
            // must be empty even though skillAuto is Auto (no grant for it).
            const auto = AIEngine.Instance.GetAutoActivatableSkillsForAgent(agentAs(f.GrantTargetAgent.ID, 'Limited', 'Auto'));
            Assert(!auto.some(s => UUIDsEqual(s.ID, f.SkillAuto.ID)), 'an ungranted Auto skill must not appear under Limited');
            Assert(!auto.some(s => UUIDsEqual(s.ID, f.SkillActive.ID)), 'a granted RequestedOnly skill must not appear in the auto set');
        }
    },
    // ── v5.45 observability: AIAgentRunStep.Skills JSON + AIAgentRun.PlanMode round-trip ────────
    {
        Id: 'ai-skills.AS10',
        Name: 'AIAgentRun.PlanMode + AIAgentRunStep.Skills (AgentSkillInvocation[]) round-trip through the DB',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
            run.NewRecord();
            run.AgentID = f.GrantTargetAgent.ID;
            run.Status = 'Running';
            run.StartedAt = new Date();
            run.PlanMode = true;
            Assert(await run.Save(), `creating run fixture failed: ${run.LatestResult?.CompleteMessage}`);
            f.CreatedRunFixtures.push({ entity: 'MJ: AI Agent Runs', id: run.ID });

            const invocation = {
                SkillID: f.SkillAuto.ID,
                SkillName: f.SkillAuto.Name,
                ActivationType: 'auto' as const,
                Provenance: {
                    AgentAcceptsSkills: 'All',
                    SkillActivationMode: 'Auto',
                    AgentSkillActivationMode: 'Auto',
                    RequestedBy: 'agent-decision' as const,
                },
                Reason: 'Integration-test provenance record',
            };
            const step = await ctx.Provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', ctx.User);
            step.NewRecord();
            step.AgentRunID = run.ID;
            step.StepNumber = 1;
            step.StepType = 'Skill';
            step.StepName = `Skill: ${f.SkillAuto.Name}`;
            step.Status = 'Completed';
            step.StartedAt = new Date();
            step.Skills = JSON.stringify([invocation]);
            Assert(await step.Save(), `creating step fixture failed: ${step.LatestResult?.CompleteMessage}`);
            // Steps are cascade-safe to delete before the run.
            f.CreatedRunFixtures.unshift({ entity: 'MJ: AI Agent Run Steps', id: step.ID });

            // Reload both and verify the round-trip — including the typed JSONType accessor.
            const runBack = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
            Assert(await runBack.Load(run.ID), 'run reload failed');
            AssertEqual(runBack.PlanMode, true, 'PlanMode bit survives the round-trip');

            const stepBack = await ctx.Provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', ctx.User);
            Assert(await stepBack.Load(step.ID), 'step reload failed');
            const parsed = stepBack.SkillsObject;
            Assert(Array.isArray(parsed) && parsed.length === 1, 'SkillsObject accessor parses the JSON array');
            AssertEqual(parsed![0].SkillName, f.SkillAuto.Name, 'invocation SkillName survives');
            AssertEqual(parsed![0].ActivationType, 'auto', 'invocation ActivationType survives');
            AssertEqual(parsed![0].Provenance.RequestedBy, 'agent-decision', 'provenance RequestedBy survives');
            AssertEqual(parsed![0].Reason, 'Integration-test provenance record', 'agent-stated reason survives');
        }
    },
    // ── Permissions: grantee-exclusivity validator + GetSkillsForAgent user filter ───────────────
    {
        Id: 'ai-skills.AS11',
        Name: 'AISkillPermission rejects a row with BOTH a User and a Role (grantee-exclusivity validator)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const anyRole = ctx.Provider.Roles?.[0];
            Assert(!!anyRole, 'need at least one Role in the instance to test grantee exclusivity');
            const p = await makePermission(ctx.Provider, ctx.User, f.SkillOpen.ID, { userId: ctx.User.ID, roleId: anyRole!.ID, canRun: true });
            const saved = await p.Save();
            Assert(!saved, 'save must FAIL when both UserID and RoleID are set');
            Assert(
                (p.LatestResult?.CompleteMessage ?? '').toLowerCase().includes('role') ||
                (p.LatestResult?.CompleteMessage ?? '').toLowerCase().includes('user'),
                'failure message should mention the grantee exclusivity rule'
            );
            // Rejected rows never persist — nothing to track for cleanup.
        }
    },
    {
        Id: 'ai-skills.AS12',
        Name: 'AISkillPermission rejects a row with NEITHER a User nor a Role',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const p = await makePermission(ctx.Provider, ctx.User, f.SkillOpen.ID, { userId: null, roleId: null, canRun: true });
            const saved = await p.Save();
            Assert(!saved, 'save must FAIL when neither UserID nor RoleID is set');
        }
    },
    {
        Id: 'ai-skills.AS13',
        Name: 'AISkillPermission accepts a row with exactly one grantee (a User)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const p = await makePermission(ctx.Provider, ctx.User, f.SkillActive.ID, { userId: ctx.User.ID, canRun: true });
            const saved = await p.Save();
            Assert(saved, `save should SUCCEED with a single grantee: ${p.LatestResult?.CompleteMessage}`);
            f.CreatedPermissionIds.push(p.ID);
            // Refresh so GetSkillsForAgent sees the new permission row (skillActive is now "closed").
            await AIEngine.Instance.Config(true, ctx.User);
        }
    },
    {
        Id: 'ai-skills.AS14',
        Name: 'GetSkillsForAgent(agent) WITHOUT a user applies no permission filter',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(f.GrantTargetAgent.ID, 'All'));
            Assert(skills.some(s => UUIDsEqual(s.ID, f.SkillActive.ID)), 'unfiltered call includes the restricted skill');
            Assert(skills.some(s => UUIDsEqual(s.ID, f.SkillOpen.ID)), 'unfiltered call includes the open skill');
        }
    },
    {
        Id: 'ai-skills.AS15',
        Name: 'GetSkillsForAgent(agent, owner) returns owner-authored skills even when permission rows exist',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(f.GrantTargetAgent.ID, 'All'), ctx.User);
            Assert(skills.some(s => UUIDsEqual(s.ID, f.SkillActive.ID)), 'owner sees their own skill despite a restrictive row');
            Assert(skills.some(s => UUIDsEqual(s.ID, f.SkillOpen.ID)), 'owner sees the open skill');
        }
    },
    {
        Id: 'ai-skills.AS16',
        Name: 'GetSkillsForAgent(agent, nonOwner) excludes a skill with rows the user is not in, but keeps open-by-default skills',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(f.GrantTargetAgent.ID, 'All'), nonOwner);
            Assert(!skills.some(s => UUIDsEqual(s.ID, f.SkillActive.ID)), 'non-owner is denied a skill whose rows do not grant them (closed once rows exist)');
            Assert(skills.some(s => UUIDsEqual(s.ID, f.SkillOpen.ID)), 'a skill with NO permission rows stays open to everyone (open-by-default)');
        }
    },
    // ── SKILL.md round-trip via the service ─────────────────────────────────────────────────────
    {
        Id: 'ai-skills.AS17',
        Name: 'ExportSkill produces SKILL.md carrying the skill + bundled Action/sub-agent NAMES',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const { markdown, skillName } = await SkillImportExportService.ExportSkill(f.SkillActive.ID, ctx.User, ctx.Provider);
            AssertEqual(skillName, f.SkillActive.Name, 'export returns the skill name');
            const parsed = SkillMarkdownConverter.Parse(markdown);
            AssertEqual(parsed.frontmatter.name, f.SkillActive.Name, 'markdown frontmatter carries the name');
            Assert((parsed.frontmatter.actions ?? []).includes(f.AnyAction.Name), 'markdown lists the bundled Action by name');
            Assert((parsed.frontmatter.subAgents ?? []).includes(f.BundledSubAgent.Name), 'markdown lists the bundled sub-agent by name');
            Assert(parsed.instructions.includes('Build formatted reports'), 'markdown carries the Instructions body');
        }
    },
    {
        Id: 'ai-skills.AS18',
        Name: 'ImportSkill (new) recreates the skill + junctions by name resolution, no warnings',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const { markdown } = await SkillImportExportService.ExportSkill(f.SkillActive.ID, ctx.User, ctx.Provider);
            // Rename in the markdown so the import creates a distinct new skill.
            const importedMd = markdown.replace(f.SkillActive.Name, `Imported Copy ${TAG}`);
            const result = await SkillImportExportService.ImportSkill(importedMd, ctx.User, undefined, ctx.Provider);
            f.CreatedSkillIds.push(result.skill.ID);

            AssertEqual(result.warnings.length, 0, `import should have no warnings, got: ${result.warnings.join('; ')}`);
            AssertEqual(result.skill.Name, `Imported Copy ${TAG}`, 'imported skill has the renamed name');
            Assert(result.skill.Instructions.includes('Build formatted reports'), 'imported skill carries the instructions');

            // The junction rows must have been recreated (name → ID) for the new skill.
            const rv = new RunView();
            const [acts, subs] = await rv.RunViews([
                { EntityName: 'MJ: AI Skill Actions', ExtraFilter: `SkillID='${result.skill.ID}'`, ResultType: 'simple' },
                { EntityName: 'MJ: AI Skill Sub Agents', ExtraFilter: `SkillID='${result.skill.ID}'`, ResultType: 'simple' },
            ], ctx.User);
            // Track the recreated junctions for cleanup.
            for (const r of acts.Results ?? []) f.CreatedJunctionRows.push({ entity: 'MJ: AI Skill Actions', id: (r as { ID: string }).ID });
            for (const r of subs.Results ?? []) f.CreatedJunctionRows.push({ entity: 'MJ: AI Skill Sub Agents', id: (r as { ID: string }).ID });
            AssertEqual((acts.Results ?? []).length, 1, 'imported skill re-links the bundled action');
            AssertEqual((subs.Results ?? []).length, 1, 'imported skill re-links the bundled sub-agent');
        }
    },
    {
        Id: 'ai-skills.AS19',
        Name: 'ImportSkill with an unknown Action name warns (non-fatal) but still creates the skill',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const md = SkillMarkdownConverter.Serialize({
                name: `Warned Skill ${TAG}`,
                actionNames: ['A Definitely Nonexistent Action Name 12345'],
                instructions: 'Do the thing.',
            });
            const result = await SkillImportExportService.ImportSkill(md, ctx.User, undefined, ctx.Provider);
            f.CreatedSkillIds.push(result.skill.ID);
            Assert(result.warnings.length >= 1, 'unresolvable action name should produce a warning');
            Assert(result.warnings.some(w => w.includes('Nonexistent')), 'warning names the missing action');
            Assert(!!result.skill.ID, 'skill is still created despite the unresolved bundle member');
        }
    },
    // ── Remote Operations (routed in-process, exactly as a client would call them) ───────────────
    {
        Id: 'ai-skills.AS20',
        Name: 'AISkill.ExportMarkdown remote op returns markdown + a sanitized filename',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const result = await new AISkillExportMarkdownOperation().Execute({ skillID: f.SkillActive.ID }, { provider: ctx.Provider, user: ctx.User });
            Assert(result.Success, `export op failed: ${result.ErrorMessage}`);
            Assert(!!result.Output?.markdown && result.Output.markdown.includes('Report Builder'), 'op returns the markdown');
            Assert(!!result.Output?.suggestedFileName && !result.Output.suggestedFileName.includes('('), 'filename is sanitized (no parens)');
        }
    },
    {
        Id: 'ai-skills.AS21',
        Name: 'AISkill.ImportMarkdown remote op creates a skill and reports warnings',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const md = SkillMarkdownConverter.Serialize({ name: `Remote Imported ${TAG}`, instructions: 'Remote import body.' });
            const result = await new AISkillImportMarkdownOperation().Execute({ markdownText: md }, { provider: ctx.Provider, user: ctx.User });
            Assert(result.Success, `import op failed: ${result.ErrorMessage}`);
            Assert(!!result.Output?.skillID, 'op returns the created skill ID');
            AssertEqual(result.Output?.skillName, `Remote Imported ${TAG}`, 'op returns the skill name');
            if (result.Output?.skillID) f.CreatedSkillIds.push(result.Output.skillID);
        }
    }
];

for (const check of AiSkillsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('ai-skills', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const provider = ctx.Provider;
        const user = ctx.User;
        // GetSkillsForAgent / name resolution read the Action + AI engine caches — load both.
        await ActionEngineServer.Instance.Config(false, user);
        await AIEngine.Instance.Config(false, user);

        // ── Resolve real FKs (an Action + two Agents) — referenced, never mutated ────────────────────
        const anyAction = ActionEngineServer.Instance.Actions.find(a => a.Status === 'Active');
        const activeAgents = AIEngine.Instance.Agents.filter(a => a.Status === 'Active');
        Assert(!!anyAction, 'need at least one Active Action in the instance for the bundle FK');
        Assert(activeAgents.length >= 2, 'need at least two Active Agents (one as the bundled sub-agent, one as the grant target)');
        const bundledSubAgent = activeAgents[0];
        const grantTargetAgent = activeAgents[1];

        // Track everything we create so teardown can tear it down (junctions/grants/permissions first, then skills).
        const createdSkillIds: string[] = [];
        const createdJunctionRows: { entity: string; id: string }[] = [];
        const createdGrantIds: string[] = [];
        const createdPermissionIds: string[] = [];
        // Run/step fixtures for the observability round-trip — deleted in array order (steps are
        // unshifted to the front so they delete before their parent run).
        const createdRunFixtures: { entity: string; id: string }[] = [];

        /** Helper: create an AI Skill fixture. ActivationMode deliberately omitted by default so the
         *  fixture also exercises the column's safe DB default ('RequestedOnly'). */
        const makeSkill = async (
            name: string,
            status: MJAISkillEntity['Status'],
            instructions: string,
            activationMode?: MJAISkillEntity['ActivationMode']
        ): Promise<MJAISkillEntity> => {
            const s = await provider.GetEntityObject<MJAISkillEntity>('MJ: AI Skills', user);
            s.NewRecord();
            s.Name = name;
            s.Status = status;
            s.Instructions = instructions;
            s.Description = `Test skill ${TAG}`;
            s.CreatedByUserID = user.ID;
            if (activationMode) {
                s.ActivationMode = activationMode;
            }
            Assert(await s.Save(), `creating skill "${name}" failed: ${s.LatestResult?.CompleteMessage}`);
            createdSkillIds.push(s.ID);
            return s;
        };

        // ── Fixtures ─────────────────────────────────────────────────────────────────────────────
        const skillActive = await makeSkill(`Report Builder ${TAG}`, 'Active', 'Build formatted reports carefully. Cite sources.');
        const skillDeprecated = await makeSkill(`Old Skill ${TAG}`, 'Deprecated', 'A retired skill.');
        // A second Active skill left WITHOUT any permission rows — the open-by-default control.
        const skillOpen = await makeSkill(`Open Skill ${TAG}`, 'Active', 'An unrestricted skill anyone can run.');
        // An explicitly self-activatable skill — the skill side of the v5.45 double activation gate.
        const skillAuto = await makeSkill(`Auto Skill ${TAG}`, 'Active', 'A self-activatable skill.', 'Auto');

        // Bundle one Action + one sub-agent into skillActive.
        const skAction = await provider.GetEntityObject<MJAISkillActionEntity>('MJ: AI Skill Actions', user);
        skAction.NewRecord();
        skAction.SkillID = skillActive.ID;
        skAction.ActionID = anyAction!.ID;
        Assert(await skAction.Save(), `bundling action failed: ${skAction.LatestResult?.CompleteMessage}`);
        createdJunctionRows.push({ entity: 'MJ: AI Skill Actions', id: skAction.ID });

        const skSub = await provider.GetEntityObject<MJAISkillSubAgentEntity>('MJ: AI Skill Sub Agents', user);
        skSub.NewRecord();
        skSub.SkillID = skillActive.ID;
        skSub.SubAgentID = bundledSubAgent.ID;
        Assert(await skSub.Save(), `bundling sub-agent failed: ${skSub.LatestResult?.CompleteMessage}`);
        createdJunctionRows.push({ entity: 'MJ: AI Skill Sub Agents', id: skSub.ID });

        // Grant skillActive to grantTargetAgent (for the Limited scenario).
        const grant = await provider.GetEntityObject<MJAIAgentSkillEntity>('MJ: AI Agent Skills', user);
        grant.NewRecord();
        grant.AgentID = grantTargetAgent.ID;
        grant.SkillID = skillActive.ID;
        grant.Status = 'Active';
        Assert(await grant.Save(), `creating grant failed: ${grant.LatestResult?.CompleteMessage}`);
        createdGrantIds.push(grant.ID);

        // Refresh the engine so the new skills/junctions/grants are in cache for GetSkillsForAgent.
        await AIEngine.Instance.Config(true, user);

        ctx.AiSkillsFixture = {
            SkillActive: skillActive,
            SkillDeprecated: skillDeprecated,
            SkillOpen: skillOpen,
            SkillAuto: skillAuto,
            AnyAction: { ID: anyAction!.ID, Name: anyAction!.Name },
            BundledSubAgent: { ID: bundledSubAgent.ID, Name: bundledSubAgent.Name ?? '' },
            GrantTargetAgent: { ID: grantTargetAgent.ID, Name: grantTargetAgent.Name ?? '' },
            CreatedSkillIds: createdSkillIds,
            CreatedJunctionRows: createdJunctionRows,
            CreatedGrantIds: createdGrantIds,
            CreatedPermissionIds: createdPermissionIds,
            CreatedRunFixtures: createdRunFixtures,
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.AiSkillsFixture;
        if (!f) {
            return;
        }
        const provider = ctx.Provider;
        const user = ctx.User;
        // Tear down in FK-safe order: run steps + runs, grants + junctions + permissions, then the skills.
        const del = async (entityName: string, id: string) => {
            try {
                const e = await provider.GetEntityObject<BaseEntity>(entityName, user);
                if (await e.InnerLoad(CompositeKey.FromID(id))) await e.Delete();
            } catch { /* best-effort cleanup */ }
        };
        for (const row of f.CreatedRunFixtures) await del(row.entity, row.id); // steps first (unshifted), then runs
        for (const id of f.CreatedGrantIds) await del('MJ: AI Agent Skills', id);
        for (const row of f.CreatedJunctionRows) await del(row.entity, row.id);
        for (const id of f.CreatedPermissionIds) await del('MJ: AI Skill Permissions', id);
        for (const id of f.CreatedSkillIds) await del('MJ: AI Skills', id);
        ctx.AiSkillsFixture = undefined;
    }
});
