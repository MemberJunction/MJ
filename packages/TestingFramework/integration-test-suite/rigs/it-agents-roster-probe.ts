/**
 * it-agents-roster-probe.ts — read-only verification probe for the extended agents suite metadata
 * foundation (plans/integration-test-expansion/agents-extended-suite-proposal.md §4).
 *
 * Proves that the `metadata-optional/integration-test/ai-*` subtree seeded by `mj sync push`
 * resolves correctly through the SAME path the agent runtime uses — AIEngine metadata:
 *   - every IT: roster agent exists, is Active, Type=Loop, in the IT category,
 *   - each agent's prompt binding resolves to its IT: prompt with SelectionStrategy='Specific',
 *   - each prompt carries the 3-vendor model ladder (Gemini 2.5 Flash-Lite → GPT 5-nano → Qwen 3 32B/Groq),
 *   - the per-agent guard/config fields match the roster spec (payload paths, plan flags, skill
 *     gates, compaction knobs, memory-write flag, search scope access),
 *   - the IT: Probe Skill + IT: Integration Test Scope wiring resolves.
 *
 * READ-ONLY: no records are created, mutated, or deleted. Run from repo root:
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/it-agents-roster-probe.ts
 */
import { RunView } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { bootstrapAI } from './lib/ai-bootstrap';

const eq = (a?: string | null, b?: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
    if (ok) {
        console.log(`  ✓ ${label}`);
    } else {
        failures++;
        console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

/** The §4.2 roster with per-agent config expectations. */
const ROSTER: Array<{
    agent: string;
    prompt: string;
    expect?: (a: import('@memberjunction/core-entities').MJAIAgentEntity) => Array<[string, boolean, string?]>;
}> = [
    { agent: 'IT: Echo Agent', prompt: 'IT: Echo Agent - System Prompt' },
    { agent: 'IT: Tool Loop Agent', prompt: 'IT: Tool Loop Agent - System Prompt' },
    { agent: 'IT: Failover Agent', prompt: 'IT: Failover Agent - System Prompt' },
    { agent: 'IT: Payload Parent', prompt: 'IT: Payload Parent - System Prompt' },
    {
        agent: 'IT: Payload Child', prompt: 'IT: Payload Child - System Prompt',
        expect: (a) => [
            ['PayloadDownstreamPaths=["customer.*"]', (a.PayloadDownstreamPaths ?? '').includes('customer.*'), a.PayloadDownstreamPaths ?? 'null'],
            ['PayloadUpstreamPaths=["analysis.*:add,update"]', (a.PayloadUpstreamPaths ?? '').includes('analysis.*:add,update'), a.PayloadUpstreamPaths ?? 'null'],
        ],
    },
    {
        agent: 'IT: Payload Scoped Child', prompt: 'IT: Payload Scoped Child - System Prompt',
        expect: (a) => [[`PayloadScope='/analysis'`, a.PayloadScope === '/analysis', a.PayloadScope ?? 'null']],
    },
    {
        agent: 'IT: Self-Write Restricted', prompt: 'IT: Self-Write Restricted - System Prompt',
        expect: (a) => [['PayloadSelfWritePaths=["notes.*"]', (a.PayloadSelfWritePaths ?? '').includes('notes.*'), a.PayloadSelfWritePaths ?? 'null']],
    },
    {
        agent: 'IT: Plan Agent', prompt: 'IT: Plan Agent - System Prompt',
        expect: (a) => [['SupportsPlanMode=true', a.SupportsPlanMode === true]],
    },
    {
        agent: 'IT: Always-Plan Agent', prompt: 'IT: Always-Plan Agent - System Prompt',
        expect: (a) => [['RequirePlanMode=true', a.RequirePlanMode === true]],
    },
    {
        agent: 'IT: Skill Probe Agent', prompt: 'IT: Skill Probe Agent - System Prompt',
        expect: (a) => [
            [`AcceptsSkills='Limited'`, a.AcceptsSkills === 'Limited', a.AcceptsSkills],
            [`SkillActivationMode='RequestedOnly'`, a.SkillActivationMode === 'RequestedOnly', a.SkillActivationMode],
        ],
    },
    { agent: 'IT: Artifact Reader', prompt: 'IT: Artifact Reader - System Prompt' },
    {
        agent: 'IT: Compaction Agent', prompt: 'IT: Compaction Agent - System Prompt',
        expect: (a) => [
            ['ContextWindowMaxTokens=8000', a.ContextWindowMaxTokens === 8000, String(a.ContextWindowMaxTokens)],
            ['CompactionTriggerPercent=50', a.CompactionTriggerPercent === 50, String(a.CompactionTriggerPercent)],
            ['CompactionTargetPercent=25', a.CompactionTargetPercent === 25, String(a.CompactionTargetPercent)],
        ],
    },
    {
        agent: 'IT: Memory Writer', prompt: 'IT: Memory Writer - System Prompt',
        expect: (a) => [['AllowMemoryWrite=true', a.AllowMemoryWrite === true]],
    },
    {
        agent: 'IT: Search Agent', prompt: 'IT: Search Agent - System Prompt',
        expect: (a) => [[`SearchScopeAccess='Assigned'`, a.SearchScopeAccess === 'Assigned', a.SearchScopeAccess]],
    },
];

/** Expected model ladder: [model name, vendor name, priority] — highest priority wins. */
const LADDER: Array<[string, string, number]> = [
    ['Gemini 2.5 Flash-Lite', 'Google', 30],
    ['GPT 5-nano', 'OpenAI', 20],
    ['Qwen 3 32B', 'Groq', 10],
];

async function main(): Promise<void> {
    const ctx = await bootstrapAI();
    const ai = AIEngine.Instance;
    const summary: string[] = [];

    for (const row of ROSTER) {
        console.log(`\n▶ ${row.agent}`);
        const agent = ai.Agents.find((a) => eq(a.Name, row.agent));
        check('agent resolves via AIEngine.Agents', !!agent);
        if (!agent) continue;

        check(`Status='Active'`, agent.Status === 'Active', agent.Status);
        const type = ai.AgentTypes.find((t) => eq(t.ID, agent.TypeID ?? ''));
        check(`Type='Loop'`, !!type && eq(type.Name, 'Loop'), type?.Name);
        const cat = ai.AgentCategories.find((c) => eq(c.ID, agent.CategoryID ?? ''));
        check(`Category='IT: Integration Test'`, !!cat && eq(cat.Name, 'IT: Integration Test'), cat?.Name);

        const binding = ai.AgentPrompts.find((ap) => eq(ap.AgentID, agent.ID) && ap.Status === 'Active');
        check('has an Active MJ: AI Agent Prompts binding', !!binding);
        const prompt = binding ? ai.Prompts.find((p) => eq(p.ID, binding.PromptID)) : undefined;
        check(`prompt binding → '${row.prompt}'`, !!prompt && eq(prompt.Name, row.prompt), prompt?.Name);
        if (prompt) {
            check(`prompt SelectionStrategy='Specific'`, prompt.SelectionStrategy === 'Specific', prompt.SelectionStrategy);
            check(`prompt ValidationBehavior='Strict'`, prompt.ValidationBehavior === 'Strict', prompt.ValidationBehavior);
            check('prompt Temperature=0', prompt.Temperature === 0, String(prompt.Temperature));

            const bindings = (ai.PromptModelsByPromptID.get(prompt.ID) ?? [])
                .filter((pm) => pm.Status === 'Active')
                .sort((x, y) => (y.Priority ?? 0) - (x.Priority ?? 0));
            check('3 active MJ: AI Prompt Models bindings', bindings.length === 3, String(bindings.length));
            const chain: string[] = [];
            bindings.forEach((pm, i) => {
                const model = ai.ModelsByID.get(pm.ModelID);
                const vendor = pm.VendorID ? ai.VendorsByID.get(pm.VendorID) : undefined;
                chain.push(`${model?.Name}/${vendor?.Name}(${pm.Priority})`);
                const [expModel, expVendor, expPrio] = LADDER[i] ?? ['?', '?', -1];
                check(
                    `ladder[${i}] = ${expModel} via ${expVendor} @ ${expPrio}`,
                    !!model && eq(model.Name, expModel) && !!vendor && eq(vendor.Name, expVendor) && pm.Priority === expPrio,
                    `${model?.Name}/${vendor?.Name}@${pm.Priority}`,
                );
            });
            summary.push(`${row.agent} → ${chain.join(' → ')}`);
        }

        for (const [label, ok, detail] of row.expect?.(agent) ?? []) {
            check(label, ok, detail);
        }
    }

    // --- sub-agent parenting
    console.log('\n▶ Sub-agent wiring');
    const parent = ai.Agents.find((a) => eq(a.Name, 'IT: Payload Parent'));
    for (const childName of ['IT: Payload Child', 'IT: Payload Scoped Child']) {
        const child = ai.Agents.find((a) => eq(a.Name, childName));
        check(`${childName}.ParentID = IT: Payload Parent`, !!parent && !!child && eq(child.ParentID ?? '', parent.ID));
    }

    // --- action grants
    console.log('\n▶ Action grants');
    const actionGrant = (agentName: string, actionCount: number) => {
        const a = ai.Agents.find((x) => eq(x.Name, agentName));
        const grants = a ? ai.AgentActions.filter((g) => eq(g.AgentID, a.ID) && g.Status === 'Active') : [];
        check(`${agentName} has ${actionCount} Active action grant(s)`, grants.length === actionCount, String(grants.length));
    };
    actionGrant('IT: Tool Loop Agent', 1);
    actionGrant('IT: Plan Agent', 1);
    actionGrant('IT: Always-Plan Agent', 1);
    actionGrant('IT: Search Agent', 1);
    actionGrant('IT: Echo Agent', 0);

    // --- skill wiring
    console.log('\n▶ IT: Probe Skill');
    const skill = ai.Skills.find((s) => eq(s.Name, 'IT: Probe Skill'));
    check('skill resolves via AIEngine.Skills', !!skill);
    if (skill) {
        check(`skill Status='Active'`, skill.Status === 'Active', skill.Status);
        check(`skill ActivationMode='RequestedOnly'`, skill.ActivationMode === 'RequestedOnly', skill.ActivationMode);
        const skillActions = ai.SkillActions.filter((sa) => eq(sa.SkillID, skill.ID));
        check('skill bundles exactly 1 action', skillActions.length === 1, String(skillActions.length));
        const probe = ai.Agents.find((a) => eq(a.Name, 'IT: Skill Probe Agent'));
        const grant = probe ? ai.AgentSkills.find((g) => eq(g.AgentID, probe.ID) && eq(g.SkillID, skill.ID)) : undefined;
        check(`IT: Skill Probe Agent grant exists with Status='Active'`, !!grant && grant.Status === 'Active', grant?.Status);
    }

    // --- search scope wiring (RunView — scopes are not part of AIEngine's caches)
    console.log('\n▶ IT: Integration Test Scope');
    const rv = new RunView(ctx.provider);
    const [scopes, scopeEntities, scopeProviders, agentScopes] = await rv.RunViews(
        [
            { EntityName: 'MJ: Search Scopes', ExtraFilter: `Name='IT: Integration Test Scope'`, ResultType: 'simple' },
            { EntityName: 'MJ: Search Scope Entities', ResultType: 'simple' },
            { EntityName: 'MJ: Search Scope Providers', ResultType: 'simple' },
            { EntityName: 'MJ: AI Agent Search Scopes', ResultType: 'simple' },
        ],
        ctx.user,
    );
    const scope = (scopes.Results as Array<{ ID: string; Status: string }>)[0];
    check('scope row exists', !!scope);
    if (scope) {
        check(`scope Status='Active'`, scope.Status === 'Active', scope.Status);
        const se = (scopeEntities.Results as Array<{ SearchScopeID: string; Entity?: string; ExtraFilter?: string }>).filter((r) => eq(r.SearchScopeID, scope.ID));
        check('scope has 1 entity binding (MJ: AI Agent Notes)', se.length === 1 && eq(se[0]?.Entity ?? '', 'MJ: AI Agent Notes'), JSON.stringify(se.map((x) => x.Entity)));
        check('scope entity ExtraFilter excludes IT-SCOPE-EXCLUDED', (se[0]?.ExtraFilter ?? '').includes('IT-SCOPE-EXCLUDED'), se[0]?.ExtraFilter ?? 'null');
        const sp = (scopeProviders.Results as Array<{ SearchScopeID: string; SearchProvider?: string }>).filter((r) => eq(r.SearchScopeID, scope.ID));
        check(`scope has 1 provider binding (Database)`, sp.length === 1 && eq(sp[0]?.SearchProvider ?? '', 'Database'), JSON.stringify(sp.map((x) => x.SearchProvider)));
        const sa = ai.Agents.find((a) => eq(a.Name, 'IT: Search Agent'));
        const asg = (agentScopes.Results as Array<{ AgentID: string; SearchScopeID: string; Phase: string }>).filter(
            (r) => !!sa && eq(r.AgentID, sa.ID) && eq(r.SearchScopeID, scope.ID),
        );
        check(`IT: Search Agent assigned to scope with Phase='Both'`, asg.length === 1 && asg[0]?.Phase === 'Both', JSON.stringify(asg.map((x) => x.Phase)));
    }

    console.log('\n──────── Roster → model chain ────────');
    for (const line of summary) console.log('  ' + line);

    console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
    await ctx.pool.close();
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error('PROBE CRASHED:', e);
    process.exit(2);
});
