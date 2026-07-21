/**
 * agent-memory-guards.checks.ts — the 'agent-memory-guards' bundle (MG1–MG5), agents-extended-suite §9.4.
 *
 * LIVE-MODEL tier (ON by default; opt out with RUN_AGENT_TESTS=0). GENERALIZES the agent-memory rig
 * (rigs/agent-memory-tests.ts) into a registered bundle and adds the GUARD legs the rig skips — the
 * in-flight memoryWrites pipeline (MemoryWriteManager.ts): type guard → within-run idempotency →
 * per-run cap (5) → scope clamp → near-dup → persist Provisional. Each guard's outcome is recorded as
 * a StepType='Tool', StepName='Memory Write' step whose OutputData.disposition is the observable
 * (executeMemoryWritesAsSteps, base-agent.ts:6142). Created notes are MJ: AI Agent Notes rows
 * (Status='Provisional', AuthorType='Agent', SourceAIAgentRunID provenance, +7-day ExpiresAt TTL).
 *
 * SEEDED AGENT: 'IT: Memory Writer' (AllowMemoryWrite=true). Its prompt (it-memory-writer.template.md)
 * emits EXACTLY the memoryWrites listed in the user message — same count/order/type/content/scope,
 * verbatim, no merge/dedupe/reword — so every guard is provably ATTEMPTED (anti-vacuity, §3.3).
 *
 * TRANSPORT: server-in-process AgentRunner.RunAgent (synchronous run handle). ISOLATION: every write's
 * content carries a unique per-run MARKER (the rig's technique); teardown deletes marker notes then
 * run steps + runs. DETERMINISM (§3): structural observables only — step dispositions + note-row
 * fields — never the model's chosen wording. Two-phase (§3.3): phase-P (the model emitted the
 * instructed writes) is retried ≤3× then FAILS loudly.
 */
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, AgentMemoryGuardsFixture } from '@memberjunction/testing-integration';

const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 5000);

class ModelNonCompliance extends Error {}
function assertP(cond: boolean, message: string): void {
  if (!cond) {
    throw new ModelNonCompliance(message);
  }
}
async function withBoundedRetry(label: string, fn: () => Promise<void>): Promise<void> {
  let last: ModelNonCompliance | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fn();
      return;
    } catch (e) {
      if (e instanceof ModelNonCompliance) {
        last = e;
        console.warn(`  ⚠ ${label} phase-P miss (attempt ${attempt}/3): ${e.message}`);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`model-noncompliance: ${label} — ${last?.message ?? 'unknown'} (after 3 attempts)`);
}

function requireFixture(ctx: IntegrationCheckContext): AgentMemoryGuardsFixture {
  if (!ctx.AgentMemoryGuardsFixture) {
    throw new Error('AgentMemoryGuardsFixture not initialized — the agent-memory-guards lifecycle Setup must run first.');
  }
  return ctx.AgentMemoryGuardsFixture;
}

async function resolveWriter(ctx: IntegrationCheckContext): Promise<MJAIAgentEntityExtended> {
  await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
  const agent = AIEngine.Instance.Agents.find((a) => (a.Name ?? '').toLowerCase() === 'it: memory writer');
  Assert(!!agent, "seeded agent 'IT: Memory Writer' not found — push metadata-optional/integration-test");
  Assert(agent!.AllowMemoryWrite === true, 'IT: Memory Writer must have AllowMemoryWrite=true');
  return agent!;
}

interface MemWrite {
  type: string;
  content: string;
  scope?: string;
}
/** Build the IT: Memory Writer user message so the model emits EXACTLY these writes (verbatim). */
function memoryWriteMessage(writes: MemWrite[]): string {
  const lines = writes.map((w, i) => `${i + 1}. type=${w.type}, content="${w.content}"${w.scope ? `, scope=${w.scope}` : ''}`);
  return `Emit exactly these memory writes, copying the type, content and scope of each verbatim and in order:\n${lines.join('\n')}`;
}

async function runWriter(ctx: IntegrationCheckContext, agent: MJAIAgentEntityExtended, writes: MemWrite[]): Promise<MJAIAgentRunEntityExtended> {
  const result = await new AgentRunner(ctx.Provider).RunAgent({
    agent,
    conversationMessages: [{ role: 'user', content: memoryWriteMessage(writes) }],
    contextUser: ctx.User,
    provider: ctx.Provider,
  });
  Assert(!!result.agentRun?.ID, 'RunAgent returned no agentRun for IT: Memory Writer');
  requireFixture(ctx).CreatedRunIds.push(result.agentRun.ID);
  await settle(SETTLE_MS);
  return result.agentRun;
}

interface DispositionRow {
  disposition?: string;
  noteId?: string;
  finalScope?: string;
  reason?: string;
}
/** The OutputData dispositions of every 'Memory Write' step of a run (one per attempted write). */
async function memoryWriteDispositions(ctx: IntegrationCheckContext, runId: string): Promise<DispositionRow[]> {
  const r = await new RunView().RunView<{ StepType: string; StepName: string; OutputData: string | null }>(
    {
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID='${runId}'`,
      OrderBy: 'StepNumber',
      Fields: ['StepType', 'StepName', 'OutputData'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  if (!r.Success) {
    return [];
  }
  return r.Results.filter((s) => s.StepType === 'Tool' && s.StepName === 'Memory Write').map((s) => {
    try {
      return JSON.parse(s.OutputData ?? '{}') as DispositionRow;
    } catch {
      return {};
    }
  });
}

interface NoteRow {
  ID: string;
  Note: string | null;
  Status: string;
  AuthorType: string;
  Type: string;
  UserID: string | null;
  SourceAIAgentRunID: string | null;
  ExpiresAt: string | null;
  IsAutoGenerated: boolean;
}
async function notesByMarker(ctx: IntegrationCheckContext, marker: string): Promise<NoteRow[]> {
  const r = await new RunView().RunView<NoteRow>(
    {
      EntityName: 'MJ: AI Agent Notes',
      ExtraFilter: `Note LIKE '%${marker}%'`,
      Fields: ['ID', 'Note', 'Status', 'AuthorType', 'Type', 'UserID', 'SourceAIAgentRunID', 'ExpiresAt', 'IsAutoGenerated'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  return r.Success ? r.Results : [];
}

export const AgentMemoryGuardsChecks: NamedCheck[] = [
  {
    Id: 'agent-memory-guards.MG1',
    Name: 'MG1: a disallowed note type is rejected in-flight (disposition=rejected-type); a valid write lands',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('MG1', async () => {
        const fx = requireFixture(ctx);
        const tag = `${fx.Marker}-MG1`;
        const agent = await resolveWriter(ctx);
        // 'Constraint' is NOT one of the in-flight-allowed types (Preference/Context) → rejected-type.
        const run = await runWriter(ctx, agent, [
          { type: 'Constraint', content: `${tag} disallowed constraint memory` },
          { type: 'Preference', content: `${tag} allowed preference memory` },
        ]);
        const dispositions = await memoryWriteDispositions(ctx, run.ID);
        assertP(dispositions.length >= 2, `IT: Memory Writer emitted ${dispositions.length} writes, expected 2`);
        const kinds = dispositions.map((d) => d.disposition ?? '');
        Assert(kinds.includes('rejected-type'), `the disallowed 'Constraint' write was not rejected-type (got ${JSON.stringify(kinds)})`);
        Assert(kinds.includes('written'), `the allowed 'Preference' write did not land (got ${JSON.stringify(kinds)})`);
        console.log(`      → dispositions ${JSON.stringify(kinds)}`);
      });
    },
  },
  {
    Id: 'agent-memory-guards.MG2',
    Name: 'MG2: per-run cap (5) — 6 valid writes → 5 written, the 6th skipped-cap',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('MG2', async () => {
        const fx = requireFixture(ctx);
        const tag = `${fx.Marker}-MG2`;
        const agent = await resolveWriter(ctx);
        const writes: MemWrite[] = [];
        for (let i = 1; i <= 6; i++) {
          writes.push({ type: 'Preference', content: `${tag} distinct preference number ${i}` });
        }
        const run = await runWriter(ctx, agent, writes);
        const dispositions = await memoryWriteDispositions(ctx, run.ID);
        assertP(dispositions.length >= 6, `expected 6 attempted writes, got ${dispositions.length}`);
        const written = dispositions.filter((d) => d.disposition === 'written').length;
        const capped = dispositions.filter((d) => d.disposition === 'skipped-cap').length;
        AssertEqual(written, 5, `per-run cap must land exactly 5 written (got ${written})`);
        Assert(capped >= 1, `the 6th write must be skipped-cap (got ${capped} capped of ${dispositions.length})`);
        console.log(`      → ${written} written, ${capped} skipped-cap (cap=5 enforced)`);
      });
    },
  },
  {
    Id: 'agent-memory-guards.MG3',
    Name: 'MG3: scope clamp is honored and never broadens — agent-scoped note has UserID null, user-scoped has UserID set',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('MG3', async () => {
        const fx = requireFixture(ctx);
        const tag = `${fx.Marker}-MG3`;
        const agent = await resolveWriter(ctx);
        // The run is tracked for teardown inside runWriter; this check asserts on the note rows, not the run.
        await runWriter(ctx, agent, [
          { type: 'Preference', content: `${tag} agent scoped memory`, scope: 'agent' },
          { type: 'Preference', content: `${tag} user scoped memory`, scope: 'user' },
        ]);
        const notes = await notesByMarker(ctx, tag);
        const agentNote = notes.find((n) => (n.Note ?? '').includes('agent scoped'));
        const userNote = notes.find((n) => (n.Note ?? '').includes('user scoped'));
        assertP(!!agentNote && !!userNote, `expected both scoped notes to persist (found ${notes.length})`);
        // Clamp contract: scopeHint='agent' → UserID null (agent-wide, never broadened to a user);
        // scopeHint='user' → UserID = the context user (never broadened beyond).
        AssertEqual(agentNote!.UserID, null, 'an agent-scoped write must clamp UserID to null');
        Assert(!!userNote!.UserID && UUIDsEqual(userNote!.UserID, ctx.User.ID), 'a user-scoped write must scope UserID to the context user');
        console.log('      → agent-scoped UserID=null; user-scoped UserID=contextUser (clamp never broadens)');
      });
    },
  },
  {
    Id: 'agent-memory-guards.MG4',
    Name: 'MG4: within-run idempotency — the same write twice → one note, second disposition skipped-duplicate',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('MG4', async () => {
        const fx = requireFixture(ctx);
        const tag = `${fx.Marker}-MG4`;
        const agent = await resolveWriter(ctx);
        const identical = `${tag} exactly identical duplicate preference`;
        const run = await runWriter(ctx, agent, [
          { type: 'Preference', content: identical },
          { type: 'Preference', content: identical },
        ]);
        const dispositions = await memoryWriteDispositions(ctx, run.ID);
        assertP(dispositions.length >= 2, `expected 2 attempted writes, got ${dispositions.length}`);
        const written = dispositions.filter((d) => d.disposition === 'written').length;
        const dup = dispositions.filter((d) => d.disposition === 'skipped-duplicate').length;
        AssertEqual(written, 1, `identical writes must land exactly once (got ${written})`);
        Assert(dup >= 1, `the repeat must be skipped-duplicate (got ${dup})`);
        const notes = (await notesByMarker(ctx, tag)).filter((n) => (n.Note ?? '').includes('exactly identical'));
        AssertEqual(notes.length, 1, `exactly one note must persist for identical writes (got ${notes.length})`);
        console.log(`      → 1 written, ${dup} skipped-duplicate, 1 note persisted`);
      });
    },
  },
  {
    Id: 'agent-memory-guards.MG5',
    Name: 'MG5: provenance — a written note is Provisional, AuthorType=Agent, run-sourced, IsAutoGenerated, with a TTL',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      await withBoundedRetry('MG5', async () => {
        const fx = requireFixture(ctx);
        const tag = `${fx.Marker}-MG5`;
        const agent = await resolveWriter(ctx);
        const run = await runWriter(ctx, agent, [{ type: 'Preference', content: `${tag} provenance probe memory` }]);
        const notes = (await notesByMarker(ctx, tag)).filter((n) => (n.Note ?? '').includes('provenance probe'));
        assertP(notes.length >= 1, 'no note formed from the instructed write');
        const note = notes[0];
        AssertEqual(note.Status, 'Provisional', 'an in-flight write must land Status=Provisional');
        AssertEqual(note.AuthorType, 'Agent', 'an agent write must be AuthorType=Agent');
        AssertEqual(note.IsAutoGenerated, true, 'an agent write must be IsAutoGenerated');
        Assert(note.Type === 'Preference' || note.Type === 'Context', `in-flight writes may only be Preference/Context (got ${note.Type})`);
        Assert(!!note.SourceAIAgentRunID && UUIDsEqual(note.SourceAIAgentRunID, run.ID), 'the note must be provenance-linked to its originating run');
        Assert(note.ExpiresAt != null, 'a provisional note must carry a TTL (ExpiresAt) until hardening');
        console.log(`      → note ${note.ID} Provisional/Agent, run-sourced, TTL ${note.ExpiresAt}`);
      });
    },
  },
];

for (const check of AgentMemoryGuardsChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-memory-guards', {
  Setup: async (ctx: IntegrationCheckContext) => {
    ctx.AgentMemoryGuardsFixture = { Marker: `MJMEMGUARD-${Date.now().toString(36)}`, CreatedRunIds: [] };
  },
  Teardown: async (ctx: IntegrationCheckContext) => {
    const fx = ctx.AgentMemoryGuardsFixture;
    if (!fx) {
      return;
    }
    // Notes FIRST (they reference the runs via SourceAIAgentRunID) — marker-isolated sweep, bounded
    // re-poll for the fire-and-forget note saves to land (rig pattern).
    for (let attempt = 0; attempt < 4; attempt++) {
      const notes = await new RunView().RunView<MJAIAgentNoteEntity>(
        {
          EntityName: 'MJ: AI Agent Notes',
          ExtraFilter: `Note LIKE '%${fx.Marker}%'`,
          ResultType: 'entity_object',
          BypassCache: true,
        },
        ctx.User,
      );
      const rows = notes.Success ? notes.Results : [];
      for (const n of rows) {
        try {
          await n.Delete();
        } catch (e) {
          console.error('memory note cleanup failed:', e);
        }
      }
      if (rows.length === 0 && attempt > 0) {
        break;
      }
      await settle(400);
    }
    // Then run steps → runs.
    for (const runId of Array.from(new Set(fx.CreatedRunIds))) {
      try {
        const steps = await new RunView().RunView<{ ID: string }>(
          {
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${runId}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
          },
          ctx.User,
        );
        if (steps.Success) {
          for (const s of steps.Results) {
            try {
              const step = await ctx.Provider.GetEntityObject<MJAIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', ctx.User);
              if (await step.Load(s.ID)) {
                await step.Delete();
              }
            } catch (e) {
              console.error('memory step cleanup failed:', e);
            }
          }
        }
        const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', ctx.User);
        if (await run.Load(runId)) {
          await run.Delete();
        }
      } catch (e) {
        console.error('memory run cleanup failed:', e);
      }
    }
    ctx.AgentMemoryGuardsFixture = undefined;
  },
});
