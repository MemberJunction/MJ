/**
 * ai-skills-tests.ts — live, deterministic integration tests for the AI Skills feature.
 *
 * Exercises the real server componentry end-to-end against the live DB, WITHOUT any model calls:
 *   - AIEngineBase.GetSkillsForAgent resolution: the three-layer gate (agent AcceptsSkills
 *     None/All/Limited × skill catalog Status × per-agent grant Status).
 *   - The v5.45 DOUBLE ACTIVATION GATE: GetAutoActivatableSkillsForAgent (self-activation requires
 *     Auto on BOTH AISkill.ActivationMode and AIAgent.SkillActivationMode; both default
 *     RequestedOnly; the requested path stays ungated by ActivationMode), plus the persisted
 *     DB default and the Limited×Auto grant intersection.
 *   - The v5.45 observability round-trip: AIAgentRun.PlanMode bit + AIAgentRunStep.Skills
 *     (AgentSkillInvocation[] JSON, read back through the typed SkillsObject accessor).
 *   - Skill permissions: the AISkillPermission grantee-exclusivity validator (exactly one of
 *     UserID/RoleID) and the GetSkillsForAgent(agent, user) permission filter — owner-override,
 *     closed-once-rows-exist, and open-by-default (no rows → visible to everyone).
 *   - GetSkillActionIDs / GetSkillSubAgentIDs bundle resolution.
 *   - SkillImportExportService round-trip: export a skill → SKILL.md → re-import → verify the new
 *     skill + its Action/sub-agent junction rows are recreated by name resolution; unknown-name
 *     imports produce non-fatal warnings, not failures.
 *   - The AISkill.ExportMarkdown / AISkill.ImportMarkdown Remote Operations invoked exactly as any
 *     caller would (`new Op().Execute(input, { provider, user })`), routed through the ClassFactory
 *     → RouteOperation → registered server subclass.
 *
 * Deterministic (no LLM). Creates + deletes its own AI Skills / junction / grant fixtures. It
 * references (never mutates) one existing Action + two existing Agents for valid FKs.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/ai-skills-tests.ts
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI } from './lib/ai-bootstrap';
import { RunView, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    MJAISkillEntity,
    MJAISkillActionEntity,
    MJAISkillSubAgentEntity,
    MJAIAgentSkillEntity,
    MJAISkillPermissionEntity,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntity,
    MJAIAgentRunStepEntity,
    AISkillExportMarkdownOperation,
    AISkillImportMarkdownOperation,
} from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { SkillImportExportService, SkillMarkdownConverter } from '@memberjunction/ai-agents';

const TAG = '(mj-integration-test — safe to delete)';

async function main(): Promise<void> {
    const { user, provider } = await bootstrapAI();
    // GetSkillsForAgent / name resolution read the Action + AI engine caches — load both.
    await ActionEngineServer.Instance.Config(false, user);
    await AIEngine.Instance.Config(false, user);

    const suite = new TestRunner('AI Skills — engine resolution + governance + SKILL.md round-trip + remote ops');

    // ── Resolve real FKs (an Action + two Agents) — referenced, never mutated ────────────────────
    const anyAction = ActionEngineServer.Instance.Actions.find(a => a.Status === 'Active');
    const activeAgents = AIEngine.Instance.Agents.filter(a => a.Status === 'Active');
    Assert(!!anyAction, 'need at least one Active Action in the instance for the bundle FK');
    Assert(activeAgents.length >= 2, 'need at least two Active Agents (one as the bundled sub-agent, one as the grant target)');
    const bundledSubAgent = activeAgents[0];
    const grantTargetAgent = activeAgents[1];

    // Track everything we create so the finally block can tear it down (junctions/grants/permissions first, then skills).
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

    let skillActive: MJAISkillEntity;
    let skillDeprecated: MJAISkillEntity;
    let skillOpen: MJAISkillEntity;
    let skillAuto: MJAISkillEntity;

    try {
        // ── Fixtures ─────────────────────────────────────────────────────────────────────────────
        skillActive = await makeSkill(`Report Builder ${TAG}`, 'Active', 'Build formatted reports carefully. Cite sources.');
        skillDeprecated = await makeSkill(`Old Skill ${TAG}`, 'Deprecated', 'A retired skill.');
        // A second Active skill left WITHOUT any permission rows — the open-by-default control.
        skillOpen = await makeSkill(`Open Skill ${TAG}`, 'Active', 'An unrestricted skill anyone can run.');
        // An explicitly self-activatable skill — the skill side of the v5.45 double activation gate.
        skillAuto = await makeSkill(`Auto Skill ${TAG}`, 'Active', 'A self-activatable skill.', 'Auto');

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

        // Lightweight agent stand-ins — GetSkillsForAgent reads .ID + .AcceptsSkills, and
        // GetAutoActivatableSkillsForAgent additionally reads .SkillActivationMode (grants come
        // from the engine cache keyed by AgentID). This avoids fabricating a full ~20-column AIAgent.
        const agentAs = (
            id: string,
            accepts: MJAIAgentEntityExtended['AcceptsSkills'],
            skillActivationMode: MJAIAgentEntityExtended['SkillActivationMode'] = 'RequestedOnly'
        ) => ({ ID: id, AcceptsSkills: accepts, SkillActivationMode: skillActivationMode }) as MJAIAgentEntityExtended;

        // ── Governance / resolution ────────────────────────────────────────────────────────────────
        suite.Test('AcceptsSkills=None resolves to zero skills', async () => {
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(grantTargetAgent.ID, 'None'));
            AssertEqual(skills.length, 0, 'None must yield no skills');
        });

        suite.Test('AcceptsSkills=All includes an Active skill and excludes a Deprecated one', async () => {
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(grantTargetAgent.ID, 'All'));
            Assert(skills.some(s => UUIDsEqual(s.ID, skillActive.ID)), 'All must include the Active test skill');
            Assert(!skills.some(s => UUIDsEqual(s.ID, skillDeprecated.ID)), 'All must exclude the Deprecated test skill');
        });

        suite.Test('AcceptsSkills=Limited returns only granted Active skills', async () => {
            const granted = AIEngine.Instance.GetSkillsForAgent(agentAs(grantTargetAgent.ID, 'Limited'));
            Assert(granted.some(s => UUIDsEqual(s.ID, skillActive.ID)), 'granted agent must see the granted skill');

            // A different agent with no grant sees none of our test skills under Limited.
            const ungranted = AIEngine.Instance.GetSkillsForAgent(agentAs(bundledSubAgent.ID, 'Limited'));
            Assert(!ungranted.some(s => UUIDsEqual(s.ID, skillActive.ID)), 'an agent without a grant must NOT see the skill under Limited');
        });

        suite.Test('GetSkillActionIDs / GetSkillSubAgentIDs return the bundled IDs', async () => {
            const actionIds = AIEngine.Instance.GetSkillActionIDs(skillActive.ID);
            const subIds = AIEngine.Instance.GetSkillSubAgentIDs(skillActive.ID);
            Assert(actionIds.some(id => UUIDsEqual(id, anyAction!.ID)), 'bundled action ID must be returned');
            Assert(subIds.some(id => UUIDsEqual(id, bundledSubAgent.ID)), 'bundled sub-agent ID must be returned');
        });

        // ── v5.45 double activation gate (availability vs. trigger) ─────────────────────────────────
        suite.Test('ActivationMode defaults to RequestedOnly on a freshly created skill (safe DB default)', async () => {
            // Reload from the DB so we read the persisted default, not client-side state.
            const fresh = await provider.GetEntityObject<MJAISkillEntity>('MJ: AI Skills', user);
            Assert(await fresh.Load(skillActive.ID), 'reload of the fixture skill failed');
            AssertEqual(fresh.ActivationMode, 'RequestedOnly', 'a skill created without ActivationMode must default to RequestedOnly');
        });

        suite.Test('Auto×Auto: an Auto agent self-activates ONLY Auto skills (RequestedOnly + Deprecated excluded)', async () => {
            const auto = AIEngine.Instance.GetAutoActivatableSkillsForAgent(agentAs(grantTargetAgent.ID, 'All', 'Auto'));
            Assert(auto.some(s => UUIDsEqual(s.ID, skillAuto.ID)), 'Auto agent must see the Auto skill in its self-activation set');
            Assert(!auto.some(s => UUIDsEqual(s.ID, skillActive.ID)), 'a RequestedOnly skill must never be self-activatable');
            Assert(!auto.some(s => UUIDsEqual(s.ID, skillDeprecated.ID)), 'availability gates still apply on the auto set');
        });

        suite.Test('A RequestedOnly agent has an EMPTY self-activation set, even for Auto skills', async () => {
            const auto = AIEngine.Instance.GetAutoActivatableSkillsForAgent(agentAs(grantTargetAgent.ID, 'All', 'RequestedOnly'));
            AssertEqual(auto.length, 0, 'agent-side RequestedOnly must zero out the self-activation set');
        });

        suite.Test('The requested path is NOT gated by ActivationMode — availability still includes RequestedOnly skills', async () => {
            const available = AIEngine.Instance.GetSkillsForAgent(agentAs(grantTargetAgent.ID, 'All', 'RequestedOnly'));
            Assert(available.some(s => UUIDsEqual(s.ID, skillActive.ID)), 'a RequestedOnly skill remains available for explicit /skill requests');
            Assert(available.some(s => UUIDsEqual(s.ID, skillAuto.ID)), 'an Auto skill is (of course) also available on the requested path');
        });

        suite.Test('Limited × Auto: the self-activation set intersects with Active grants', async () => {
            // grantTargetAgent has a grant for skillActive (RequestedOnly) only — so its Limited auto set
            // must be empty even though skillAuto is Auto (no grant for it).
            const auto = AIEngine.Instance.GetAutoActivatableSkillsForAgent(agentAs(grantTargetAgent.ID, 'Limited', 'Auto'));
            Assert(!auto.some(s => UUIDsEqual(s.ID, skillAuto.ID)), 'an ungranted Auto skill must not appear under Limited');
            Assert(!auto.some(s => UUIDsEqual(s.ID, skillActive.ID)), 'a granted RequestedOnly skill must not appear in the auto set');
        });

        // ── v5.45 observability: AIAgentRunStep.Skills JSON + AIAgentRun.PlanMode round-trip ────────
        suite.Test('AIAgentRun.PlanMode + AIAgentRunStep.Skills (AgentSkillInvocation[]) round-trip through the DB', async () => {
            const run = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', user);
            run.NewRecord();
            run.AgentID = grantTargetAgent.ID;
            run.Status = 'Running';
            run.StartedAt = new Date();
            run.PlanMode = true;
            Assert(await run.Save(), `creating run fixture failed: ${run.LatestResult?.CompleteMessage}`);
            createdRunFixtures.push({ entity: 'MJ: AI Agent Runs', id: run.ID });

            const invocation = {
                SkillID: skillAuto.ID,
                SkillName: skillAuto.Name,
                ActivationType: 'auto' as const,
                Provenance: {
                    AgentAcceptsSkills: 'All',
                    SkillActivationMode: 'Auto',
                    AgentSkillActivationMode: 'Auto',
                    RequestedBy: 'agent-decision' as const,
                },
                Reason: 'Integration-test provenance record',
            };
            const step = await provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', user);
            step.NewRecord();
            step.AgentRunID = run.ID;
            step.StepNumber = 1;
            step.StepType = 'Skill';
            step.StepName = `Skill: ${skillAuto.Name}`;
            step.Status = 'Completed';
            step.StartedAt = new Date();
            step.Skills = JSON.stringify([invocation]);
            Assert(await step.Save(), `creating step fixture failed: ${step.LatestResult?.CompleteMessage}`);
            // Steps are cascade-safe to delete before the run.
            createdRunFixtures.unshift({ entity: 'MJ: AI Agent Run Steps', id: step.ID });

            // Reload both and verify the round-trip — including the typed JSONType accessor.
            const runBack = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', user);
            Assert(await runBack.Load(run.ID), 'run reload failed');
            AssertEqual(runBack.PlanMode, true, 'PlanMode bit survives the round-trip');

            const stepBack = await provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', user);
            Assert(await stepBack.Load(step.ID), 'step reload failed');
            const parsed = stepBack.SkillsObject;
            Assert(Array.isArray(parsed) && parsed.length === 1, 'SkillsObject accessor parses the JSON array');
            AssertEqual(parsed![0].SkillName, skillAuto.Name, 'invocation SkillName survives');
            AssertEqual(parsed![0].ActivationType, 'auto', 'invocation ActivationType survives');
            AssertEqual(parsed![0].Provenance.RequestedBy, 'agent-decision', 'provenance RequestedBy survives');
            AssertEqual(parsed![0].Reason, 'Integration-test provenance record', 'agent-stated reason survives');
        });

        // ── Permissions: grantee-exclusivity validator + GetSkillsForAgent user filter ───────────────
        /** Helper: build an AISkillPermission and attempt to save it, returning the entity (saved or not). */
        const makePermission = async (
            skillId: string,
            opts: { userId?: string | null; roleId?: string | null; canRun?: boolean }
        ): Promise<MJAISkillPermissionEntity> => {
            const p = await provider.GetEntityObject<MJAISkillPermissionEntity>('MJ: AI Skill Permissions', user);
            p.NewRecord();
            p.SkillID = skillId;
            p.UserID = opts.userId ?? null;
            p.RoleID = opts.roleId ?? null;
            p.CanRun = opts.canRun ?? false;
            return p;
        };

        suite.Test('AISkillPermission rejects a row with BOTH a User and a Role (grantee-exclusivity validator)', async () => {
            const anyRole = provider.Roles?.[0];
            Assert(!!anyRole, 'need at least one Role in the instance to test grantee exclusivity');
            const p = await makePermission(skillOpen.ID, { userId: user.ID, roleId: anyRole!.ID, canRun: true });
            const saved = await p.Save();
            Assert(!saved, 'save must FAIL when both UserID and RoleID are set');
            Assert(
                (p.LatestResult?.CompleteMessage ?? '').toLowerCase().includes('role') ||
                (p.LatestResult?.CompleteMessage ?? '').toLowerCase().includes('user'),
                'failure message should mention the grantee exclusivity rule'
            );
            // Rejected rows never persist — nothing to track for cleanup.
        });

        suite.Test('AISkillPermission rejects a row with NEITHER a User nor a Role', async () => {
            const p = await makePermission(skillOpen.ID, { userId: null, roleId: null, canRun: true });
            const saved = await p.Save();
            Assert(!saved, 'save must FAIL when neither UserID nor RoleID is set');
        });

        suite.Test('AISkillPermission accepts a row with exactly one grantee (a User)', async () => {
            const p = await makePermission(skillActive.ID, { userId: user.ID, canRun: true });
            const saved = await p.Save();
            Assert(saved, `save should SUCCEED with a single grantee: ${p.LatestResult?.CompleteMessage}`);
            createdPermissionIds.push(p.ID);
            // Refresh so GetSkillsForAgent sees the new permission row (skillActive is now "closed").
            await AIEngine.Instance.Config(true, user);
        });

        // A fabricated non-owner user with no roles — GetSkillsForAgent reads only .ID + .UserRoles, so a
        // stand-in suffices to exercise the permission filter without provisioning a second real account.
        const nonOwner = ({ ID: 'F0F0F0F0-1111-2222-3333-444455556666', UserRoles: [] }) as unknown as UserInfo;

        suite.Test('GetSkillsForAgent(agent) WITHOUT a user applies no permission filter', async () => {
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(grantTargetAgent.ID, 'All'));
            Assert(skills.some(s => UUIDsEqual(s.ID, skillActive.ID)), 'unfiltered call includes the restricted skill');
            Assert(skills.some(s => UUIDsEqual(s.ID, skillOpen.ID)), 'unfiltered call includes the open skill');
        });

        suite.Test('GetSkillsForAgent(agent, owner) returns owner-authored skills even when permission rows exist', async () => {
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(grantTargetAgent.ID, 'All'), user);
            Assert(skills.some(s => UUIDsEqual(s.ID, skillActive.ID)), 'owner sees their own skill despite a restrictive row');
            Assert(skills.some(s => UUIDsEqual(s.ID, skillOpen.ID)), 'owner sees the open skill');
        });

        suite.Test('GetSkillsForAgent(agent, nonOwner) excludes a skill with rows the user is not in, but keeps open-by-default skills', async () => {
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(grantTargetAgent.ID, 'All'), nonOwner);
            Assert(!skills.some(s => UUIDsEqual(s.ID, skillActive.ID)), 'non-owner is denied a skill whose rows do not grant them (closed once rows exist)');
            Assert(skills.some(s => UUIDsEqual(s.ID, skillOpen.ID)), 'a skill with NO permission rows stays open to everyone (open-by-default)');
        });

        // ── SKILL.md round-trip via the service ─────────────────────────────────────────────────────
        suite.Test('ExportSkill produces SKILL.md carrying the skill + bundled Action/sub-agent NAMES', async () => {
            const { markdown, skillName } = await SkillImportExportService.ExportSkill(skillActive.ID, user, provider);
            AssertEqual(skillName, skillActive.Name, 'export returns the skill name');
            const parsed = SkillMarkdownConverter.Parse(markdown);
            AssertEqual(parsed.frontmatter.name, skillActive.Name, 'markdown frontmatter carries the name');
            Assert((parsed.frontmatter.actions ?? []).includes(anyAction!.Name), 'markdown lists the bundled Action by name');
            Assert((parsed.frontmatter.subAgents ?? []).includes(bundledSubAgent.Name), 'markdown lists the bundled sub-agent by name');
            Assert(parsed.instructions.includes('Build formatted reports'), 'markdown carries the Instructions body');
        });

        suite.Test('ImportSkill (new) recreates the skill + junctions by name resolution, no warnings', async () => {
            const { markdown } = await SkillImportExportService.ExportSkill(skillActive.ID, user, provider);
            // Rename in the markdown so the import creates a distinct new skill.
            const importedMd = markdown.replace(skillActive.Name, `Imported Copy ${TAG}`);
            const result = await SkillImportExportService.ImportSkill(importedMd, user, undefined, provider);
            createdSkillIds.push(result.skill.ID);

            AssertEqual(result.warnings.length, 0, `import should have no warnings, got: ${result.warnings.join('; ')}`);
            AssertEqual(result.skill.Name, `Imported Copy ${TAG}`, 'imported skill has the renamed name');
            Assert(result.skill.Instructions.includes('Build formatted reports'), 'imported skill carries the instructions');

            // The junction rows must have been recreated (name → ID) for the new skill.
            const rv = new RunView();
            const [acts, subs] = await rv.RunViews([
                { EntityName: 'MJ: AI Skill Actions', ExtraFilter: `SkillID='${result.skill.ID}'`, ResultType: 'simple' },
                { EntityName: 'MJ: AI Skill Sub Agents', ExtraFilter: `SkillID='${result.skill.ID}'`, ResultType: 'simple' },
            ], user);
            // Track the recreated junctions for cleanup.
            for (const r of acts.Results ?? []) createdJunctionRows.push({ entity: 'MJ: AI Skill Actions', id: (r as { ID: string }).ID });
            for (const r of subs.Results ?? []) createdJunctionRows.push({ entity: 'MJ: AI Skill Sub Agents', id: (r as { ID: string }).ID });
            AssertEqual((acts.Results ?? []).length, 1, 'imported skill re-links the bundled action');
            AssertEqual((subs.Results ?? []).length, 1, 'imported skill re-links the bundled sub-agent');
        });

        suite.Test('ImportSkill with an unknown Action name warns (non-fatal) but still creates the skill', async () => {
            const md = SkillMarkdownConverter.Serialize({
                name: `Warned Skill ${TAG}`,
                actionNames: ['A Definitely Nonexistent Action Name 12345'],
                instructions: 'Do the thing.',
            });
            const result = await SkillImportExportService.ImportSkill(md, user, undefined, provider);
            createdSkillIds.push(result.skill.ID);
            Assert(result.warnings.length >= 1, 'unresolvable action name should produce a warning');
            Assert(result.warnings.some(w => w.includes('Nonexistent')), 'warning names the missing action');
            Assert(!!result.skill.ID, 'skill is still created despite the unresolved bundle member');
        });

        // ── Remote Operations (routed in-process, exactly as a client would call them) ───────────────
        suite.Test('AISkill.ExportMarkdown remote op returns markdown + a sanitized filename', async () => {
            const result = await new AISkillExportMarkdownOperation().Execute({ skillID: skillActive.ID }, { provider, user });
            Assert(result.Success, `export op failed: ${result.ErrorMessage}`);
            Assert(!!result.Output?.markdown && result.Output.markdown.includes('Report Builder'), 'op returns the markdown');
            Assert(!!result.Output?.suggestedFileName && !result.Output.suggestedFileName.includes('('), 'filename is sanitized (no parens)');
        });

        suite.Test('AISkill.ImportMarkdown remote op creates a skill and reports warnings', async () => {
            const md = SkillMarkdownConverter.Serialize({ name: `Remote Imported ${TAG}`, instructions: 'Remote import body.' });
            const result = await new AISkillImportMarkdownOperation().Execute({ markdownText: md }, { provider, user });
            Assert(result.Success, `import op failed: ${result.ErrorMessage}`);
            Assert(!!result.Output?.skillID, 'op returns the created skill ID');
            AssertEqual(result.Output?.skillName, `Remote Imported ${TAG}`, 'op returns the skill name');
            if (result.Output?.skillID) createdSkillIds.push(result.Output.skillID);
        });

        const failures = await suite.Run();
        await cleanup(provider, user, createdGrantIds, createdJunctionRows, createdPermissionIds, createdSkillIds, createdRunFixtures);
        process.exit(failures > 0 ? 1 : 0);
    } catch (error) {
        await cleanup(provider, user, createdGrantIds, createdJunctionRows, createdPermissionIds, createdSkillIds, createdRunFixtures);
        throw error;
    }
}

/** Tear down in FK-safe order: run steps + runs, grants + junctions + permissions, then the skills. */
async function cleanup(
    provider: Awaited<ReturnType<typeof bootstrapAI>>['provider'],
    user: Awaited<ReturnType<typeof bootstrapAI>>['user'],
    grantIds: string[],
    junctionRows: { entity: string; id: string }[],
    permissionIds: string[],
    skillIds: string[],
    runFixtures: { entity: string; id: string }[] = [],
): Promise<void> {
    const del = async (entityName: string, id: string) => {
        try {
            const e = await provider.GetEntityObject(entityName, user);
            if (await e.Load(id)) await e.Delete();
        } catch { /* best-effort cleanup */ }
    };
    for (const row of runFixtures) await del(row.entity, row.id); // steps first (unshifted), then runs
    for (const id of grantIds) await del('MJ: AI Agent Skills', id);
    for (const row of junctionRows) await del(row.entity, row.id);
    for (const id of permissionIds) await del('MJ: AI Skill Permissions', id);
    for (const id of skillIds) await del('MJ: AI Skills', id);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
