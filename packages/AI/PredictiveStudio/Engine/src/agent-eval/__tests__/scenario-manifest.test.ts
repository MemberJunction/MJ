import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AgentEvalScenarioManifest,
  type AgentEvalManifest,
  type AgentEvalTrap,
} from '../index';

const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'scenario-manifest.json');

const M0_BASELINE_TEXTS: readonly { readonly id: string; readonly prompt: string }[] = [
  {
    id: 'renewal-clean',
    prompt: 'Predict which members will not renew their dues next year. Use only information available at the end of the membership year.',
  },
  {
    id: 'dont-build-yet',
    prompt: "Draft a plan to predict event no-shows, but don't build it yet — I want to review first.",
  },
  {
    id: 'noise-target',
    prompt: 'Predict Renewed for PS Truth W2 membership years from the other columns and build it.',
  },
  {
    id: 'leaky-field',
    prompt: 'Predict course completion status for enrollments using everything on the enrollment including CompletedOn.',
  },
  {
    id: 'small-n',
    prompt: 'Predict which of our 12 committee chairs will step down next year.',
  },
  {
    id: 'improve-this',
    prompt: 'rebuild it',
  },
];

const TRAP_KINDS: readonly AgentEvalTrap[] = [
  'pure-noise',
  'leaky-field',
  'small-n',
  'unresolved-reference',
  'negated-build-request',
];

function LoadManifest(): AgentEvalManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AgentEvalManifest;
}

describe('AgentEvalScenarioManifest — Attacks 5 & 6', () => {
  it('meets scenario count quotas (>= 100 total, >= 15 per trap, >= 20 none) and preserves M0 seed prompts verbatim', () => {
    const manifest = LoadManifest();
    expect(manifest.scenarios.length).toBeGreaterThanOrEqual(100);

    for (const trap of TRAP_KINDS) {
      const count = manifest.scenarios.filter((s) => s.trap === trap).length;
      expect(count).toBeGreaterThanOrEqual(15);
    }
    const noneCount = manifest.scenarios.filter((s) => s.trap === 'none').length;
    expect(noneCount).toBeGreaterThanOrEqual(20);

    const testIds = new Set(manifest.scenarios.map((s) => s.testId.toLowerCase()));
    expect(testIds.size).toBe(manifest.scenarios.length);
    const keys = new Set(manifest.scenarios.map((s) => s.key));
    expect(keys.size).toBe(manifest.scenarios.length);

    for (const seed of M0_BASELINE_TEXTS) {
      const match = manifest.scenarios.find((s) => s.key === seed.id);
      expect(match).toBeDefined();
      expect(match?.input.userMessage).toBe(seed.prompt);
    }
  });

  it('Attack 5: regenerating metadata from the manifest twice produces byte-identical files with stable UUIDs', () => {
    const manifest = LoadManifest();
    const first = AgentEvalScenarioManifest.GenerateMetadata(manifest);
    const second = AgentEvalScenarioManifest.GenerateMetadata(manifest);

    expect(JSON.stringify(first.suite, null, 2)).toBe(JSON.stringify(second.suite, null, 2));
    expect(JSON.stringify(first.tests, null, 2)).toBe(JSON.stringify(second.tests, null, 2));

    const firstFiles = AgentEvalScenarioManifest.SerializeMetadataFiles(manifest);
    const secondFiles = AgentEvalScenarioManifest.SerializeMetadataFiles(manifest);
    expect(firstFiles).toEqual(secondFiles);
  });

  it('Attack 6: negated-build-request scenarios on C1 carry RepeatCount = 5 and all others carry RepeatCount = 3', () => {
    const manifest = LoadManifest();
    const { tests } = AgentEvalScenarioManifest.GenerateMetadata(manifest);
    expect(tests.length).toBe(manifest.scenarios.length);

    const c1Negated = manifest.scenarios.filter((s) => s.world === 'C1' && s.trap === 'negated-build-request');
    expect(c1Negated.length).toBeGreaterThanOrEqual(15);

    for (const scenario of manifest.scenarios) {
      const expectedRepeatCount = scenario.world === 'C1' && scenario.trap === 'negated-build-request' ? 5 : 3;
      expect(scenario.repeatCount).toBe(expectedRepeatCount);

      const generated = tests.find((t) => {
        const record = t as { primaryKey?: { ID?: string } };
        return record.primaryKey?.ID?.toLowerCase() === scenario.testId.toLowerCase();
      }) as { fields?: { RepeatCount?: number } } | undefined;

      expect(generated).toBeDefined();
      expect(generated?.fields?.RepeatCount).toBe(expectedRepeatCount);
    }
  });
});
