/**
 * entity-graph-client.checks.ts — the 'entity-graph-client' bundle (EGC1–EGC8): the related-record
 * collection graph save exercised CLIENT-FIRST, over the real GraphQL wire.
 *
 * WHY THIS BUNDLE EXISTS SEPARATELY FROM IT72. `entity-graph` (IT72) runs at suite sequence 33, in
 * the server-side block, so its `ctx.Provider` is a `SQLServerDataProvider` — `SupportsEntityTransactions`
 * is true and every check takes {@link BaseEntity.ExecuteGraphLocal}. The *other* branch, the one a
 * browser actually uses, is never touched:
 *
 *     SerializeCompanions → MJ.SaveEntityGraph (ONE remote operation) → per-node API-key scope gate
 *     → DeserializeCompanions(mode:'request') → ClassFactory → the SERVER subclass → save
 *
 * That branch has unit coverage against a mock provider, which proves the payload is *shaped*
 * correctly and proves nothing about whether it survives GraphQL. The three failure modes that only
 * a real wire can catch are exactly the ones that are cheapest to get wrong:
 *
 *   1. `'request'` mode must LOAD the existing row before applying the incoming fields. Skip it and
 *      old == new, the record reports clean, and the edit is silently dropped — a passing save that
 *      wrote nothing (EGC4).
 *   2. The client cannot open a transaction. Atomicity is therefore the *server's* job, delegated
 *      wholesale. If the server executes the nodes without wrapping them, a half-written graph
 *      commits and `Save()` still returns false — looking correct while leaving corruption (EGC6).
 *   3. `ClassFactory` must rehydrate to the registered SERVER subclass, not the generated base, or
 *      every server-only invariant silently stops running for graph saves (EGC9).
 *
 * THE FIXTURE PAIR — AND WHY IT IS NOT `MJ: Lists`. IT72 declares its collection on a test-only
 * subclass (`GraphTestListEntity`) registered in the test process. That works in-process and CANNOT
 * work over the wire: MJAPI does not depend on this package, so the server's ClassFactory resolves
 * `MJ: Lists` to the plain generated class, which has no `Details` collection at all. A cross-tier
 * test must therefore use a collection declared in METADATA, so CodeGen emitted it onto the
 * generated class that BOTH processes load.
 *
 * `MJ: AI Agents` → `Prompts` is the only shipped writable one: `Source: 'database'`,
 * `ReadOnly: false`, `OnRemove: 'delete'`, and a `Sequence` policy on `ExecutionOrder` from 0. The
 * other seven core collections are cache-backed and read-only by design, so they cannot be written
 * through at all — EGC7 asserts that refusal rather than pretending otherwise.
 *
 * MUTATION TIER. EGC3–EGC6, EGC8 and EGC9 write and carry `RequiresMutation: true`. EGC1, EGC2 and
 * EGC7 are read-only. Every created row is prefixed per run, tagged "(mj-integration-test — safe to
 * delete)", accumulated into the fixture, and swept FK-safe (prompts before agents) by Teardown; no
 * pre-existing record is ever mutated.
 */
import { RunView } from '@memberjunction/core';
import type { IEntityDataProvider } from '@memberjunction/core';
import { MJAIAgentEntity, MJAIAgentPromptEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, EntityGraphClientFixture } from '@memberjunction/testing-integration';

const AGENT_ENTITY = 'MJ: AI Agents';
const AGENT_PROMPT_ENTITY = 'MJ: AI Agent Prompts';
const PROMPT_ENTITY = 'MJ: AI Prompts';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/**
 * A syntactically valid UUID that resolves to no `MJ: AI Prompts` row. Client-side validation only
 * checks nullability and shape, so this passes the browser and fails the server's FK — which is
 * precisely the shape of failure EGC6 needs: unwritable on the SERVER, inside the graph.
 */
const MISSING_PROMPT_ID = '00000000-0000-0000-0000-0000000000fc';

/** Fetch the fixture (throws if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext): EntityGraphClientFixture {
    Assert(ctx.EntityGraphClientFixture != null, 'entity-graph-client fixture missing (bundle Setup did not run)');
    return ctx.EntityGraphClientFixture!;
}

/**
 * Builds an unsaved throwaway agent over the client provider. Only the fields without a database
 * default are set — everything else comes from `NewRecord()`, which is itself part of what the
 * remote round trip has to preserve.
 */
async function newAgent(ctx: IntegrationCheckContext, label: string): Promise<MJAIAgentEntity> {
    const f = fx(ctx);
    const agent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>(AGENT_ENTITY, ctx.User);
    agent.NewRecord();
    agent.Name = `${f.Prefix}-${label}`;
    agent.Description = FIXTURE_TAG;
    agent.Status = 'Active';
    agent.OwnerUserID = ctx.User.ID;
    if (f.AgentTypeID) {
        agent.TypeID = f.AgentTypeID;
    }
    return agent;
}

/** Stages a prompt on the collection. Only `PromptID` is set — the FK and `ExecutionOrder` are the
 *  collection's job, and proving they survive the wire is the point. */
async function addPrompt(agent: MJAIAgentEntity, promptId: string): Promise<MJAIAgentPromptEntity> {
    const child = await agent.Prompts.Create();
    child.PromptID = promptId;
    return child;
}

/** Reads the persisted children straight from the database, bypassing every cache layer. */
async function readPrompts(ctx: IntegrationCheckContext, agentId: string): Promise<MJAIAgentPromptEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<MJAIAgentPromptEntity>({
        EntityName: AGENT_PROMPT_ENTITY,
        ExtraFilter: `AgentID = '${agentId}'`,
        OrderBy: 'ExecutionOrder ASC',
        ResultType: 'entity_object',
        BypassCache: true
    }, ctx.User);
    Assert(result.Success, `reading ${AGENT_PROMPT_ENTITY} failed: ${result.ErrorMessage}`);
    return result.Results ?? [];
}

/** Records every id the graph persisted so Teardown sweeps them even if a later check throws. */
function trackGraph(ctx: IntegrationCheckContext, agent: MJAIAgentEntity): void {
    const f = fx(ctx);
    if (agent.ID && !f.AgentIds.includes(agent.ID)) {
        f.AgentIds.push(agent.ID);
    }
    for (const child of agent.Prompts.Items) {
        if (child.ID && !f.AgentPromptIds.includes(child.ID)) {
            f.AgentPromptIds.push(child.ID);
        }
    }
}

/** Loads an agent fresh from the wire with its collection materialized. */
async function reloadWithPrompts(ctx: IntegrationCheckContext, agentId: string): Promise<MJAIAgentEntity> {
    const agent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>(AGENT_ENTITY, ctx.User);
    Assert(await agent.Load(agentId), `reload of agent ${agentId} failed`);
    await agent.Prompts.Load();
    return agent;
}

export const EntityGraphClientChecks: NamedCheck[] = [
    {
        Id: 'entity-graph-client.EGC1',
        Name: 'EGC1: the metadata-declared collections reach the CLIENT tier with their configuration intact',
        Fn: async (ctx: IntegrationCheckContext) => {
            // CodeGen emits these onto the GENERATED class, so they must be identical on both tiers.
            // A browser bundle that silently lost them would still compile and still save single rows.
            const agent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>(AGENT_ENTITY, ctx.User);
            Assert(!!agent.Prompts, 'EGC1: MJ: AI Agents should carry a generated Prompts collection');
            Assert(!!agent.Actions && !!agent.SubAgents, 'EGC1: MJ: AI Agents should carry Actions and SubAgents');

            AssertEqual(agent.Prompts.Source, 'database', 'EGC1: Prompts must be database-sourced on the client');
            Assert(!agent.Prompts.IsReadOnly, 'EGC1: Prompts must be writable on the client');
            AssertEqual(agent.Prompts.LoadMode, 'explicit', 'EGC1: Prompts should be explicit-load');

            // The cache-backed half, asserted on the SAME entity rather than on MJ: Actions.
            // MJActionEntityServer is registered for 'MJ: Actions' and THROWS on a non-database
            // provider, so in any process that loads both tiers (this one, and the CLI generally)
            // ClassFactory falls back to bare BaseEntity and every generated member disappears —
            // collections included. That is a pre-existing property of that class, not of this
            // feature, and asserting through it would only ever measure the fallback.
            AssertEqual(agent.Actions.Source, 'cache', 'EGC1: AI Agent Actions must be cache-sourced on the client');
            Assert(agent.Actions.IsReadOnly, 'EGC1: a cache-sourced collection must default read-only on the client');
            AssertEqual(agent.Actions.LoadMode, 'lazy', 'EGC1: AI Agent Actions should be lazy');
        }
    },
    {
        Id: 'entity-graph-client.EGC2',
        Name: 'EGC2: the client provider reports NO entity transactions — the positive control for every check below',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Without this, a misconfigured run could execute the whole bundle on the LOCAL path and
            // pass while proving nothing about the wire. This is the assertion that makes EGC3-EGC6
            // mean what their names claim.
            //
            // The flag is declared on IEntityDataProvider, while ctx.Provider is typed as the
            // metadata half of the same object — every concrete provider implements both, which is
            // why BaseEntity itself reads it off its own ProviderToUse.
            const dataProvider = ctx.Provider as unknown as IEntityDataProvider;
            Assert(dataProvider.SupportsEntityTransactions !== true,
                'EGC2: the client provider claims entity transactions — this bundle would take the LOCAL ' +
                'graph path and its remote-path claims would be vacuous. Is it running on the server tier?');
        }
    },
    {
        Id: 'entity-graph-client.EGC3',
        Name: 'EGC3: parent + two children persist from ONE client Save() — serialized, shipped, rehydrated server-side',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const agent = await newAgent(ctx, 'egc3-graph');
            await addPrompt(agent, f.PromptIDs[0]);
            await addPrompt(agent, f.PromptIDs[1]);
            AssertEqual(agent.Prompts.Count, 2, 'EGC3: two children staged');
            Assert(agent.Dirty, 'EGC3: a parent with staged children must be dirty');

            // ONE call. Everything after this line happened on the server.
            const saved = await agent.Save();
            trackGraph(ctx, agent);
            Assert(saved, `EGC3: graph save failed — ${agent.LatestResult?.CompleteMessage}`);

            Assert(!!agent.ID, 'EGC3: the parent key must come back from the server');
            const rows = await readPrompts(ctx, agent.ID);
            AssertEqual(rows.length, 2, 'EGC3: both children persisted');
            // Never assigned by this check — the collection stamps the FK from the parent key, which
            // on the remote path is a key the SERVER generated after deserializing.
            Assert(rows.every((r) => r.AgentID === agent.ID), 'EGC3: every child must carry the parent FK');
            AssertEqual(rows.map((r) => r.ExecutionOrder).join(','), '0,1',
                'EGC3: the Sequence policy must survive serialization (From: 0)');
            Assert(!agent.Dirty, 'EGC3: the whole graph must be clean after a successful remote save');

            // The server subclass is what enforces server-only invariants. If the graph path
            // instantiated the generated base instead, this field would never have been defaulted
            // by the server-side save at all.
            const reloaded = await reloadWithPrompts(ctx, agent.ID);
            AssertEqual(reloaded.Prompts.Count, 2, 'EGC3: a fresh load must see both children');
        }
    },
    {
        Id: 'entity-graph-client.EGC4',
        Name: 'EGC4: an edit to an EXISTING child survives the wire (the request-mode old==new silent drop)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const agent = await newAgent(ctx, 'egc4-edit');
            await addPrompt(agent, f.PromptIDs[0]);
            Assert(await agent.Save(), `EGC4: seed save failed — ${agent.LatestResult?.CompleteMessage}`);
            trackGraph(ctx, agent);

            // A brand-new client instance, so the edit genuinely travels as "existing row + new value".
            const reloaded = await reloadWithPrompts(ctx, agent.ID);
            AssertEqual(reloaded.Prompts.Count, 1, 'EGC4: one child expected');

            reloaded.Prompts.Items[0].Purpose = `${FIXTURE_TAG} edited`;
            Assert(reloaded.Dirty, 'EGC4: a dirty child must roll up into the parent');
            Assert(await reloaded.Save(), `EGC4: graph save failed — ${reloaded.LatestResult?.CompleteMessage}`);

            const rows = await readPrompts(ctx, agent.ID);
            AssertEqual(rows.length, 1, 'EGC4: an edit must not insert a second row');
            AssertEqual(rows[0].Purpose, `${FIXTURE_TAG} edited`,
                'EGC4: the edit was silently dropped — the server did not load the existing row before applying fields');
        }
    },
    {
        Id: 'entity-graph-client.EGC5',
        Name: 'EGC5: OnRemove delete reaches a real DELETE over the wire, and survivors are renumbered',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const agent = await newAgent(ctx, 'egc5-remove');
            await addPrompt(agent, f.PromptIDs[0]);
            await addPrompt(agent, f.PromptIDs[1]);
            Assert(await agent.Save(), `EGC5: seed save failed — ${agent.LatestResult?.CompleteMessage}`);
            trackGraph(ctx, agent);
            AssertEqual((await readPrompts(ctx, agent.ID)).length, 2, 'EGC5: two children seeded');

            const reloaded = await reloadWithPrompts(ctx, agent.ID);
            const doomed = reloaded.Prompts.Items[0];
            const survivorId = reloaded.Prompts.Items[1].ID;
            reloaded.Prompts.Remove(doomed);
            AssertEqual(reloaded.Prompts.Count, 1, 'EGC5: the collection should show one remaining');
            Assert(reloaded.Dirty, 'EGC5: a pending removal must make the graph dirty');

            Assert(await reloaded.Save(), `EGC5: removal save failed — ${reloaded.LatestResult?.CompleteMessage}`);

            const rows = await readPrompts(ctx, agent.ID);
            AssertEqual(rows.length, 1, 'EGC5: the removed row was orphaned rather than deleted');
            AssertEqual(rows[0].ID, survivorId, 'EGC5: the wrong row was deleted');
            AssertEqual(rows[0].ExecutionOrder, 0, 'EGC5: the survivor must be renumbered from 0');
        }
    },
    {
        Id: 'entity-graph-client.EGC6',
        Name: 'EGC6: a failing child rolls the WHOLE graph back — atomicity the client cannot provide itself',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const agent = await newAgent(ctx, 'egc6-rollback');
            await addPrompt(agent, f.PromptIDs[0]);
            Assert(await agent.Save(), `EGC6: seed save failed — ${agent.LatestResult?.CompleteMessage}`);
            trackGraph(ctx, agent);

            const reloaded = await reloadWithPrompts(ctx, agent.ID);
            const originalDescription = reloaded.Description;

            // Mutate the parent AND stage a child that only the SERVER can reject: the PromptID is a
            // well-formed UUID with no row behind it, so client validation passes and the FK fails
            // mid-graph, after the parent UPDATE has already been issued.
            reloaded.Description = `${FIXTURE_TAG} should-be-rolled-back`;
            await addPrompt(reloaded, MISSING_PROMPT_ID);

            const saved = await reloaded.Save();
            Assert(!saved, 'EGC6: a graph with an unwritable child must not report success');

            // One transaction, one outcome — and the client never opened it.
            const after = await reloadWithPrompts(ctx, agent.ID);
            AssertEqual(after.Description, originalDescription,
                'EGC6: the parent field change survived a failed graph — the server did not wrap the nodes in a transaction');
            AssertEqual((await readPrompts(ctx, agent.ID)).length, 1,
                'EGC6: the child count changed despite the rollback');
        }
    },
    {
        Id: 'entity-graph-client.EGC7',
        Name: 'EGC7: a read-only cache collection refuses mutation on the client, and a lazy miss THROWS rather than reading empty',
        Fn: async (ctx: IntegrationCheckContext) => {
            // MJ: AI Agents, not MJ: Actions — see the note in EGC1 about the server-only class that
            // refuses to construct on a client provider and takes the whole generated class with it.
            const rv = new RunView();
            const found = await rv.RunView<MJAIAgentEntity>({
                EntityName: AGENT_ENTITY, MaxRows: 1, ResultType: 'entity_object', BypassCache: true
            }, ctx.User);
            Assert(found.Success && found.Results.length > 0, 'EGC7: no agent available');
            const agent = found.Results[0];
            Assert(!!agent.SubAgents, 'EGC7: the loaded agent should carry its generated SubAgents collection');

            // Mutation is refused before any cache lookup, so this is deterministic on either tier.
            let threw = false;
            try {
                agent.SubAgents.Clear();
            } catch (e) {
                threw = true;
                Assert(String(e).includes('read-only'), `EGC7: wrong error — ${e}`);
            }
            Assert(threw, 'EGC7: a read-only collection must refuse Clear()');

            // Reading is the interesting half. A client process may have no engine caching this
            // entity, and a lazy declaration ASSERTS one exists — so the contract is a loud throw,
            // never a quiet empty array. Both outcomes are correct; an empty array is not.
            try {
                const items = agent.SubAgents.Items;
                const truth = await rv.RunView({
                    EntityName: AGENT_ENTITY,
                    ExtraFilter: `ParentID = '${agent.ID}'`,
                    ResultType: 'simple',
                    BypassCache: true
                }, ctx.User);
                Assert(truth.Success, `EGC7: reading sub-agents failed — ${truth.ErrorMessage}`);
                AssertEqual(items.length, truth.Results.length,
                    'EGC7: an engine IS loaded here, so the cache view must agree with the database');
                console.log('      → an engine caches MJ: AI Agents on this tier; cache view cross-checked');
            } catch (e) {
                Assert(String(e).toLowerCase().includes('cache') || String(e).toLowerCase().includes('engine'),
                    `EGC7: a lazy cache miss must explain itself, got — ${e}`);
                console.log('      → no engine caches MJ: AI Agents on the client tier; lazy miss threw as designed');
            }
        }
    },
    {
        Id: 'entity-graph-client.EGC8',
        Name: 'EGC8: a CLEAN parent with only a new child still saves over the wire',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const agent = await newAgent(ctx, 'egc8-clean-parent');
            Assert(await agent.Save(), `EGC8: seed save failed — ${agent.LatestResult?.CompleteMessage}`);
            trackGraph(ctx, agent);

            const reloaded = await reloadWithPrompts(ctx, agent.ID);
            Assert(!reloaded.Dirty, 'EGC8: the parent must start clean for this check to mean anything');

            // Nothing on the parent changes. Without the Dirty rollup the client short-circuits before
            // it ever builds a payload, and the save "succeeds" having sent nothing at all.
            await addPrompt(reloaded, f.PromptIDs[0]);
            Assert(reloaded.Dirty, 'EGC8: Dirty must roll up from the collection, or no request is sent');

            Assert(await reloaded.Save(), `EGC8: graph save failed — ${reloaded.LatestResult?.CompleteMessage}`);
            trackGraph(ctx, reloaded);

            const rows = await readPrompts(ctx, agent.ID);
            AssertEqual(rows.length, 1, 'EGC8: the save reported success but persisted nothing');
        }
    },
    {
        Id: 'entity-graph-client.EGC9',
        Name: 'EGC9: the graph path rehydrates to the SERVER subclass — a server-only invariant still fires',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);

            // MJAIAgentEntityServer is the only class that (a) sets DefaultSkipAsyncValidation to
            // false and (b) rejects a TypeConfiguration that is not a JSON OBJECT. On the client that
            // override does not exist and async validation is skipped by default, so a rejection here
            // can ONLY have come from the server having instantiated its own registered subclass.
            //
            // A valid JSON ARRAY is the cleanest trigger: it parses, so this is not a parse-error
            // test, and it is rejected regardless of whether the agent's type publishes a ConfigSchema.
            const agent = await newAgent(ctx, 'egc9-server-subclass');
            agent.TypeConfiguration = '[]';
            // The staged child is what forces NodeCount > 1 and therefore the GRAPH path — a
            // single-node save would take the ordinary route and prove nothing about this branch.
            await addPrompt(agent, f.PromptIDs[0]);

            const saved = await agent.Save();
            trackGraph(ctx, agent);
            Assert(!saved,
                'EGC9: the server-only TypeConfiguration invariant did not run — the graph path ' +
                'instantiated the generated base class instead of the registered server subclass');

            // Positive control: the SAME graph, with the invariant satisfied, must succeed — otherwise
            // the assertion above could be passing for some unrelated reason.
            const control = await newAgent(ctx, 'egc9-control');
            await addPrompt(control, f.PromptIDs[0]);
            Assert(await control.Save(),
                `EGC9: the control graph should save — ${control.LatestResult?.CompleteMessage}`);
            trackGraph(ctx, control);
            AssertEqual((await readPrompts(ctx, control.ID)).length, 1, 'EGC9: the control child should persist');
        }
    }
];

for (const check of EntityGraphClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('entity-graph-client', {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Setup creates NO rows — each mutating check creates what it needs and appends the ids here,
        // so a deterministic-only run (RUN_MUTATION_TESTS unset) writes nothing at all.
        const rv = new RunView();
        // TWO distinct prompts: UQ_AIAgentPrompt_Agent_Prompt_Config forbids staging the same
        // prompt twice on one agent, so a single id would fail the constraint instead of the behavior.
        const prompts = await rv.RunView<{ ID: string }>({
            EntityName: PROMPT_ENTITY, Fields: ['ID'], OrderBy: 'ID ASC', MaxRows: 2, ResultType: 'simple', BypassCache: true
        }, ctx.User);
        Assert(prompts.Success && prompts.Results.length >= 2,
            `entity-graph-client: fewer than two ${PROMPT_ENTITY} rows to reference — the fixture data is not what this bundle assumes`);

        // The agent TYPE is optional on the schema, so a missing one is not fatal; leaving TypeID null
        // also skips the server subclass's TypeConfiguration validation, which is not under test here.
        const types = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: AI Agent Types', Fields: ['ID'], MaxRows: 1, ResultType: 'simple', BypassCache: true
        }, ctx.User);

        ctx.EntityGraphClientFixture = {
            Prefix: `mj-egc-${Date.now()}`,
            PromptIDs: [prompts.Results[0].ID, prompts.Results[1].ID],
            AgentTypeID: types.Success && types.Results.length > 0 ? types.Results[0].ID : undefined,
            AgentIds: [],
            AgentPromptIds: []
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.EntityGraphClientFixture;
        if (!f) {
            return;
        }
        // FK-safe: prompts reference agents, so they go first. Rows a check already deleted simply
        // fail their Load and are skipped — the accumulators deliberately over-approximate.
        for (const id of [...f.AgentPromptIds].reverse()) {
            const row = await ctx.Provider.GetEntityObject<MJAIAgentPromptEntity>(AGENT_PROMPT_ENTITY, ctx.User).catch(() => undefined);
            if (row && (await row.Load(id).catch(() => false))) {
                await row.Delete().catch(() => undefined);
            }
        }
        for (const id of [...f.AgentIds].reverse()) {
            const row = await ctx.Provider.GetEntityObject<MJAIAgentEntity>(AGENT_ENTITY, ctx.User).catch(() => undefined);
            if (row && (await row.Load(id).catch(() => false))) {
                await row.Delete().catch(() => undefined);
            }
        }
        ctx.EntityGraphClientFixture = undefined;
    }
});
