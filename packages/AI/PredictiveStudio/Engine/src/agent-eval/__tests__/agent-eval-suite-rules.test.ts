import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AgentEvalScenarioManifest,
  AgentEvalSuiteRules,
  type AgentEvalManifest,
  type AgentEvalScenario,
  type AgentEvalSuiteSpec,
} from '../index';

const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'scenario-manifest.json');

function LoadCheckedInManifest(): AgentEvalManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AgentEvalManifest;
}

function CloneSpecWithScenarios(base: AgentEvalSuiteSpec, scenarios: readonly AgentEvalScenario[]): AgentEvalSuiteSpec {
  return {
    ...base,
    scenarios,
    scenarioCount: scenarios.length,
  };
}

describe('AgentEvalSuiteRules — Attack 1', () => {
  it('passes the checked-in scenario manifest', () => {
    const manifest = LoadCheckedInManifest();
    const spec = AgentEvalScenarioManifest.ToSuiteSpec(manifest);
    expect(AgentEvalSuiteRules.Validate(spec)).toEqual([]);
  });

  it('refuses a suite with 99 scenarios', () => {
    const manifest = LoadCheckedInManifest();
    const baseSpec = AgentEvalScenarioManifest.ToSuiteSpec(manifest);
    const ninetyNine = CloneSpecWithScenarios(baseSpec, baseSpec.scenarios.slice(0, 99));
    const errors = AgentEvalSuiteRules.Validate(ninetyNine);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toMatch(/100|scenario/i);
  });

  it('refuses a suite with 2 repeats', () => {
    const manifest = LoadCheckedInManifest();
    const baseSpec = AgentEvalScenarioManifest.ToSuiteSpec(manifest);
    const twoRepeats: AgentEvalSuiteSpec = {
      ...baseSpec,
      repeats: 2,
      passK: 2,
    };
    const errors = AgentEvalSuiteRules.Validate(twoRepeats);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toMatch(/repeat|3/i);
  });

  it('refuses a manifest missing the small-n trap', () => {
    const manifest = LoadCheckedInManifest();
    const baseSpec = AgentEvalScenarioManifest.ToSuiteSpec(manifest);
    const withoutSmallN = baseSpec.scenarios.filter((s) => s.trap !== 'small-n');
    const replacementPool = baseSpec.scenarios.filter((s) => s.trap === 'none');
    const padded = [...withoutSmallN];
    let idx = 0;
    while (padded.length < 100) {
      const donor = replacementPool[idx % replacementPool.length];
      padded.push({
        ...donor,
        testId: `00000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
        key: `pad-${idx}`,
      });
      idx += 1;
    }
    const specMissingSmallN = CloneSpecWithScenarios(baseSpec, padded);
    const errors = AgentEvalSuiteRules.Validate(specMissingSmallN);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toMatch(/small-n/i);
  });
});
