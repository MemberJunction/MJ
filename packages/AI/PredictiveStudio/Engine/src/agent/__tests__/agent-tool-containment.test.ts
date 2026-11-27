import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MJAIAgentActionEntity } from '@memberjunction/core-entities';
import { PayloadManager } from '@memberjunction/ai-agents';

/** The slice of the agent metadata file this test reads (`Status` derived from the entity, never widened to string). */
interface AgentActionLink {
  fields: { ActionID: string; Status: MJAIAgentActionEntity['Status'] };
}
interface AgentMetadataRecord {
  fields: { Name: string };
  relatedEntities?: { 'MJ: AI Agent Actions'?: AgentActionLink[] };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../..');

function activeActions(): string[] {
  const raw = readFileSync(path.join(repoRoot, 'metadata/agents/.model-development-agent.json'), 'utf8');
  const records = JSON.parse(raw) as AgentMetadataRecord[];
  const agent = records.find((r) => r.fields.Name === 'Model Development Agent');
  // A renamed agent or a reshaped file must fail here, not pass both assertions on an empty list.
  if (!agent) {
    throw new Error("metadata/agents/.model-development-agent.json has no 'Model Development Agent' record");
  }
  const links = agent.relatedEntities?.['MJ: AI Agent Actions'];
  if (!links || links.length === 0) {
    throw new Error("The 'Model Development Agent' record has no MJ: AI Agent Actions links to check");
  }
  return links
    .filter((link) => link.fields.Status === 'Active')
    .map((link) => link.fields.ActionID);
}

describe('Model Development Agent — no experiment sessions (F-EXP-1)', () => {
  it('has no active link to Run Experiment Session', () => {
    expect(activeActions().length).toBeGreaterThan(0);
    expect(activeActions()).not.toContain('@lookup:MJ: Actions.Name=Run Experiment Session');
  });

  it('is not told to run or launch experiment sessions', () => {
    const prompt = readFileSync(path.join(repoRoot, 'metadata/prompts/templates/model-development-agent/model-development-agent.template.md'), 'utf8');
    expect(prompt).not.toMatch(/Run Experiment Session/);
    expect(prompt).not.toMatch(/launch manual experiment sessions/);
  });
});

// ----------------------------------------------------------------------------------------- A3 (attacks 5 and 8) --

/** A sub-agent or the orchestrator as the metadata file declares its payload paths and actions. */
interface AgentPathsRecord {
  fields: { Name: string; PayloadSelfWritePaths?: string[]; PayloadUpstreamPaths?: string[] };
  relatedEntities?: {
    'MJ: AI Agents'?: AgentPathsRecord[];
    'MJ: AI Agent Actions'?: Array<AgentActionLink & { deleteRecord?: { delete: boolean } }>;
    'MJ: AI Agent Data Sources'?: Array<{ fields: { Name: string; EntityName: string | null } }>;
  };
}

function orchestratorRecord(): AgentPathsRecord {
  const records = JSON.parse(readFileSync(path.join(repoRoot, 'metadata/agents/.model-development-agent.json'), 'utf8')) as AgentPathsRecord[];
  const agent = records.find((r) => r.fields.Name === 'Model Development Agent');
  if (!agent) throw new Error("metadata/agents/.model-development-agent.json has no 'Model Development Agent' record");
  return agent;
}

function subAgents(): AgentPathsRecord[] {
  const subs = orchestratorRecord().relatedEntities?.['MJ: AI Agents'];
  if (!subs || subs.length === 0) throw new Error('the orchestrator declares no sub-agents');
  return subs;
}

/** The control-path-owned slices no prompt and no sub-agent may write (D5-25). */
const CONTROL_SLICES = { UnitDraft: { Name: 'forged' }, ProtocolDraft: { seed: 99 }, PlanId: 'forged-plan', DraftInputs: { Unit: 'x', Protocol: 'y' } };

describe('A3 attack 5: every writer of the drafts is refused but the control path', () => {
  const parent = { Goal: 'g', Name: 'n' };

  it("an orchestrator LLM payload change writing UnitDraft, ProtocolDraft or PlanId is refused by PayloadSelfWritePaths", () => {
    const allowed = orchestratorRecord().fields.PayloadSelfWritePaths;
    expect(allowed).toEqual(['Name', 'Report']);
    const pm = new PayloadManager();
    for (const [key, value] of Object.entries(CONTROL_SLICES)) {
      const changed = pm.ApplyAgentChangeRequest<Record<string, object | string>>({ ...parent }, { newElements: { [key]: value } }, { allowedPaths: allowed });
      expect(changed.result[key]).toBeUndefined();
    }
  });

  it('a sub-agent upstream path writing them is refused, for every sub-agent (the Pipeline Builder included)', () => {
    const pm = new PayloadManager();
    for (const sub of subAgents()) {
      const upstream = sub.fields.PayloadUpstreamPaths || ['*'];
      expect(upstream).not.toContain('*');
      const merged = pm.MergeUpstreamPayload<Record<string, object | string>>(sub.fields.Name, { ...parent }, { ...parent, ...CONTROL_SLICES }, upstream);
      for (const key of Object.keys(CONTROL_SLICES)) expect(merged.result?.[key], `${sub.fields.Name} wrote ${key}`).toBeUndefined();
    }
  });

  it('the Pipeline Builder may still return its build result', () => {
    const builder = subAgents().find((s) => s.fields.Name === 'Pipeline Builder');
    const merged = new PayloadManager().MergeUpstreamPayload<Record<string, object | string>>('Pipeline Builder', { ...parent }, { ...parent, BuildResult: { success: true } }, builder?.fields.PayloadUpstreamPaths || []);
    expect(merged.result?.BuildResult).toEqual({ success: true });
  });
});

describe('A3: the agent drafts through the two draft Actions and reads a catalog', () => {
  it('the orchestrator holds Draft Prediction Unit and Draft Evaluation Protocol, active and kept', () => {
    const links = orchestratorRecord().relatedEntities?.['MJ: AI Agent Actions'] || [];
    for (const name of ['Draft Prediction Unit', 'Draft Evaluation Protocol']) {
      const link = links.find((l) => l.fields.ActionID === `@lookup:MJ: Actions.Name=${name}`);
      expect(link?.fields.Status, name).toBe('Active');
      expect(link?.deleteRecord?.delete, name).not.toBe(true);
    }
  });

  it('the Goal Analyst has an ALL_ENTITIES catalog source (D5-18)', () => {
    const goal = subAgents().find((s) => s.fields.Name === 'Goal Analyst');
    const sources = goal?.relatedEntities?.['MJ: AI Agent Data Sources'] || [];
    expect(sources.find((s) => s.fields.Name === 'ALL_ENTITIES')?.fields.EntityName).toBe('MJ: Entities');
  });

  it('the Data Scout is not described as drafting Pending queries', () => {
    const scout = subAgents().find((s) => s.fields.Name === 'Data Scout');
    expect(JSON.stringify(scout?.fields)).not.toMatch(/Pending/);
  });
});
