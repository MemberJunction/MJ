/**
 * Drift guard for the goal-loop default FLIP: the `DEFAULT_CONTROLLER_PROMPT_NAME` /
 * `DEFAULT_JUDGE_PROMPT_NAME` constants the engine resolves by name MUST match the actual stored prompt
 * `Name`s in `metadata/prompts/.computer-use-prompts.json`. If someone renames the metadata prompt without
 * updating the constant (or vice-versa), the flip silently falls back to auto-selection — this test fails
 * loudly instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DEFAULT_CONTROLLER_PROMPT_NAME, DEFAULT_JUDGE_PROMPT_NAME } from '../engine/MJComputerUseEngine.js';

const here = dirname(fileURLToPath(import.meta.url));
// packages/AI/MJComputerUse/src/__tests__ → repo root → metadata/...
const metadataPath = resolve(here, '../../../../../metadata/prompts/.computer-use-prompts.json');

describe('Computer Use default prompt names — code ↔ metadata alignment', () => {
  const prompts = JSON.parse(readFileSync(metadataPath, 'utf-8')) as Array<{ fields: { Name: string; Status?: string } }>;
  const names = prompts.map(p => p.fields.Name);

  it('DEFAULT_CONTROLLER_PROMPT_NAME matches an Active stored prompt', () => {
    const match = prompts.find(p => p.fields.Name === DEFAULT_CONTROLLER_PROMPT_NAME);
    expect(names).toContain(DEFAULT_CONTROLLER_PROMPT_NAME);
    expect(match?.fields.Status).toBe('Active');
  });

  it('DEFAULT_JUDGE_PROMPT_NAME matches an Active stored prompt', () => {
    const match = prompts.find(p => p.fields.Name === DEFAULT_JUDGE_PROMPT_NAME);
    expect(names).toContain(DEFAULT_JUDGE_PROMPT_NAME);
    expect(match?.fields.Status).toBe('Active');
  });
});
