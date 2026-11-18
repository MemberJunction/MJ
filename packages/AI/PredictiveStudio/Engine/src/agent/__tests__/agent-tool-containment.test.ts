import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MJAIAgentActionEntity } from '@memberjunction/core-entities';

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
