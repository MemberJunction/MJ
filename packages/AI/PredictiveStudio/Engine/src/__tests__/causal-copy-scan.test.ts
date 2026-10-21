import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CausalCopy } from '@memberjunction/predictive-studio-core';

/** Gate W1 → S9.3, static half: no PS UI string, report template or story prompt uses causal or "lever" language. */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

const SCAN_FILES = [
  'packages/AI/PredictiveStudio/Core/src/trust.ts',
  'packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder-agent.ts',
  'packages/Angular/Generic/artifacts/src/lib/components/plugins/ml-experiment-results-viewer.component.ts',
  'packages/Angular/Generic/artifacts/src/lib/components/plugins/ml-experiment-results-viewer.component.html',
];
const SCAN_DIRS = [
  'packages/Angular/Explorer/dashboards/src/PredictiveStudio',
  'packages/Angular/Explorer/core-entity-forms/src/lib/custom/MLModels',
  'packages/Angular/Explorer/core-entity-forms/src/lib/panels/model-predictions',
  'metadata/prompts/templates/model-development-agent',
];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...filesUnder(full));
    } else if (/\.(ts|html|md)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('causal copy scan (W1 → S9.3, static half)', () => {
  const files = [...SCAN_FILES.map((f) => path.join(repoRoot, f)), ...SCAN_DIRS.flatMap((d) => filesUnder(path.join(repoRoot, d)))];

  it('scans a real set of files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('finds 0 causal or "lever" phrases', () => {
    const hits = files.flatMap((f) => CausalCopy.FindPhrases(readFileSync(f, 'utf8')).map((label) => `${path.relative(repoRoot, f)}: ${label}`));
    expect(hits).toEqual([]);
  });
});
