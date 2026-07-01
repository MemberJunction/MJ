/**
 * ai-skills-tests.ts — live, deterministic integration tests for the AI Skills feature.
 *
 * Exercises the real server componentry end-to-end against the live DB, WITHOUT any model calls:
 *   - AIEngineBase.GetSkillsForAgent resolution: the three-layer gate (agent AcceptsSkills
 *     None/All/Limited × skill catalog Status × per-agent grant Status).
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
import { RunView } from '@memberjunction/core';
import {
    MJAISkillEntity,
    MJAISkillActionEntity,
    MJAISkillSubAgentEntity,
    MJAIAgentSkillEntity,
    MJAIAgentEntityExtended,
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

    // Track everything we create so the finally block can tear it down (junctions/grants first, then skills).
    const createdSkillIds: string[] = [];
    const createdJunctionRows: { entity: string; id: string }[] = [];
    const createdGrantIds: string[] = [];

    /** Helper: create an AI Skill fixture. */
    const makeSkill = async (name: string, status: MJAISkillEntity['Status'], instructions: string): Promise<MJAISkillEntity> => {
        const s = await provider.GetEntityObject<MJAISkillEntity>('MJ: AI Skills', user);
        s.NewRecord();
        s.Name = name;
        s.Status = status;
        s.Instructions = instructions;
        s.Description = `Test skill ${TAG}`;
        s.CreatedByUserID = user.ID;
        Assert(await s.Save(), `creating skill "${name}" failed: ${s.LatestResult?.CompleteMessage}`);
        createdSkillIds.push(s.ID);
        return s;
    };

    let skillActive: MJAISkillEntity;
    let skillDeprecated: MJAISkillEntity;

    try {
        // ── Fixtures ─────────────────────────────────────────────────────────────────────────────
        skillActive = await makeSkill(`Report Builder ${TAG}`, 'Active', 'Build formatted reports carefully. Cite sources.');
        skillDeprecated = await makeSkill(`Old Skill ${TAG}`, 'Deprecated', 'A retired skill.');

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

        // Lightweight agent stand-ins — GetSkillsForAgent only reads .ID + .AcceptsSkills (grants come
        // from the engine cache keyed by AgentID). This avoids fabricating a full ~20-column AIAgent.
        const agentAs = (id: string, accepts: MJAIAgentEntityExtended['AcceptsSkills']) =>
            ({ ID: id, AcceptsSkills: accepts }) as MJAIAgentEntityExtended;

        // ── Governance / resolution ────────────────────────────────────────────────────────────────
        suite.Test('AcceptsSkills=None resolves to zero skills', async () => {
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(grantTargetAgent.ID, 'None'));
            AssertEqual(skills.length, 0, 'None must yield no skills');
        });

        suite.Test('AcceptsSkills=All includes an Active skill and excludes a Deprecated one', async () => {
            const skills = AIEngine.Instance.GetSkillsForAgent(agentAs(grantTargetAgent.ID, 'All'));
            Assert(skills.some(s => s.ID === skillActive.ID), 'All must include the Active test skill');
            Assert(!skills.some(s => s.ID === skillDeprecated.ID), 'All must exclude the Deprecated test skill');
        });

        suite.Test('AcceptsSkills=Limited returns only granted Active skills', async () => {
            const granted = AIEngine.Instance.GetSkillsForAgent(agentAs(grantTargetAgent.ID, 'Limited'));
            Assert(granted.some(s => s.ID === skillActive.ID), 'granted agent must see the granted skill');

            // A different agent with no grant sees none of our test skills under Limited.
            const ungranted = AIEngine.Instance.GetSkillsForAgent(agentAs(bundledSubAgent.ID, 'Limited'));
            Assert(!ungranted.some(s => s.ID === skillActive.ID), 'an agent without a grant must NOT see the skill under Limited');
        });

        suite.Test('GetSkillActionIDs / GetSkillSubAgentIDs return the bundled IDs', async () => {
            const actionIds = AIEngine.Instance.GetSkillActionIDs(skillActive.ID);
            const subIds = AIEngine.Instance.GetSkillSubAgentIDs(skillActive.ID);
            Assert(actionIds.includes(anyAction!.ID), 'bundled action ID must be returned');
            Assert(subIds.includes(bundledSubAgent.ID), 'bundled sub-agent ID must be returned');
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
        await cleanup(provider, user, createdGrantIds, createdJunctionRows, createdSkillIds);
        process.exit(failures > 0 ? 1 : 0);
    } catch (error) {
        await cleanup(provider, user, createdGrantIds, createdJunctionRows, createdSkillIds);
        throw error;
    }
}

/** Tear down in FK-safe order: grants + junctions first, then the skills. */
async function cleanup(
    provider: Awaited<ReturnType<typeof bootstrapAI>>['provider'],
    user: Awaited<ReturnType<typeof bootstrapAI>>['user'],
    grantIds: string[],
    junctionRows: { entity: string; id: string }[],
    skillIds: string[],
): Promise<void> {
    const del = async (entityName: string, id: string) => {
        try {
            const e = await provider.GetEntityObject(entityName, user);
            if (await e.Load(id)) await e.Delete();
        } catch { /* best-effort cleanup */ }
    };
    for (const id of grantIds) await del('MJ: AI Agent Skills', id);
    for (const row of junctionRows) await del(row.entity, row.id);
    for (const id of skillIds) await del('MJ: AI Skills', id);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
