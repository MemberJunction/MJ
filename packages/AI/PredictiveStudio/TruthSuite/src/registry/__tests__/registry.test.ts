import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GateRegistry, TruthSuite } from '../load';
import { GateRegistryValidator } from '../validate';
import type { GateEntry } from '../types';

const registry = GateRegistry.Load();
const MJ_ROOT = path.resolve(TruthSuite.Root(), '../../../..');

function countBy<K extends string | number>(key: (g: GateEntry) => K): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of registry) out[String(key(g))] = (out[String(key(g))] || 0) + 1;
  return out;
}

/** A copy of the registry with one gate replaced, for the validator's negative cases. */
function withGate(gateID: string, change: Partial<GateEntry>): GateEntry[] {
  return registry.map((g) => (g.GateID === gateID ? { ...g, ...change } : g));
}

/** A throwaway repository root whose TruthSuite gate folder holds one file with the given source. */
function repoWithGateFile(source: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'registry-'));
  const gates = path.join(root, 'packages/AI/PredictiveStudio/TruthSuite/gates');
  mkdirSync(gates, { recursive: true });
  writeFileSync(path.join(gates, 'any-subject.gates.test.ts'), source);
  return root;
}

describe('gate registry', () => {
  it('holds all 111 gates with unique ids and names', () => {
    expect(registry).toHaveLength(111);
    expect(new Set(registry.map((g) => g.GateID)).size).toBe(111);
    expect(new Set(registry.map((g) => g.TestName)).size).toBe(111);
  });

  it('keeps the per-phase and per-owner counts of the program', () => {
    expect(countBy((g) => g.Phase)).toEqual({ '0': 12, '1': 12, '2': 41, '3': 11, '4': 9, '5': 6, '6': 12, '7': 8 });
    expect(countBy((g) => g.OwnerPR)).toEqual({ '1': 5, '2': 10, '3': 53, '4': 31, '5': 12 });
    // G0.2/G0.3 have OwnerPR 4 and amended thresholds (AmendedBy); the P11 text is kept in P11Threshold.
    expect(['G0.2', 'G0.3'].map((id) => registry.find((g) => g.GateID === id)?.OwnerPR)).toEqual([4, 4]);
    expect(registry.find((g) => g.GateID === 'G0.3')?.Threshold).toContain('reach Published with automated publishing on');
    expect(registry.find((g) => g.GateID === 'G0.2')?.StatRule).toBe('noise-publish-60');
  });

  it('names every gate "<dataset> → <criterion>[ #n]" with U+2192', () => {
    for (const g of registry) {
      expect(g.TestName).toMatch(new RegExp(`^${g.Dataset} → ${g.Criterion.replace('.', '\\.')}( #[23])?$`));
    }
    expect(GateRegistry.Find(registry, 'W1 → S7.5 #3').GateID).toBe('G5.5');
    expect(() => GateRegistry.Find(registry, 'W1 → S99.9')).toThrow(/No gate named/);
  });

  it('passes the structural validator', () => {
    expect(GateRegistryValidator.Validate(registry, MJ_ROOT)).toEqual([]);
  });

  it('reports every structural error it guards against', () => {
    const errorsFor = (r: readonly GateEntry[], root: string = MJ_ROOT): string => GateRegistryValidator.Validate(r, root).join('\n');
    expect(GateRegistryValidator.Validate(registry.slice(1), MJ_ROOT)).toContain('expected 111 gates, found 110');
    expect(errorsFor(withGate('G0.1', { Status: 'flipped' as GateEntry['Status'] }))).toMatch(/G0\.1 .*invalid status flipped/);
    expect(errorsFor(withGate('G0.1', { RunMode: 'hourly' as GateEntry['RunMode'] }))).toMatch(/invalid runMode hourly/);
    expect(errorsFor(withGate('G0.1', { Requires: ['gpu' as GateEntry['Requires'][number]] }))).toMatch(/unknown requirement gpu/);
    expect(errorsFor(withGate('G1.1', { Status: 'required' }))).toMatch(/a stub cannot be required/);
    // A body is found by its declared title in any gate file, never by a file name in the registry.
    expect(errorsFor(withGate('G1.1', { Implementation: { Kind: 'body' } }))).toMatch(/expected exactly one TruthGate\.Define titled .* found 0/);
    const twice = repoWithGateFile("TruthGate.Define('W1 → S7.5', b);\nTruthGate.Define('W1 → S7.5', b);\n");
    expect(errorsFor(withGate('G0.1', { Implementation: { Kind: 'body' } }), twice)).toMatch(/G0\.1 .*found 2 \(gates\/any-subject\.gates\.test\.ts\)/);
    const once = repoWithGateFile("TruthGate.Define('W1 → S7.5', b);\n");
    expect(errorsFor(withGate('G0.1', { Implementation: { Kind: 'stub' } }), once)).toMatch(/G0\.1 .*a stub has a body in gates\/any-subject\.gates\.test\.ts/);
    expect(errorsFor(withGate('G1.1', { Implementation: { Kind: 'external', Package: 'x', File: 'missing.test.ts' } }))).toMatch(/is missing/);
    const tmp = mkdtempSync(path.join(tmpdir(), 'registry-'));
    writeFileSync(path.join(tmp, 'dup.test.ts'), "it('W1 → S7.5', () => {});\nit('W1 → S7.5', () => {});\n");
    const dup = withGate('G0.1', { Implementation: { Kind: 'external', Package: 'x', File: 'dup.test.ts' } }).filter((g) => g.GateID === 'G0.1');
    expect(GateRegistryValidator.Validate(dup, tmp).join('\n')).toMatch(/expected exactly one test titled .* found 2/);
  });

  it('refuses relaxing, removing, renaming or re-owning a gate of the base branch', () => {
    const base = withGate('G0.1', { Status: 'required' });
    const relaxed = withGate('G0.1', { Status: 'expected-fail' });
    expect(GateRegistryValidator.ValidateAgainstBase(relaxed, base)).toEqual(['G0.1 (W1 → S7.5) is required on the base branch but expected-fail here']);
    expect(GateRegistryValidator.ValidateAgainstBase(base, base)).toEqual([]);
    expect(GateRegistryValidator.ValidateAgainstBase(registry.slice(1), registry)).toEqual([`${registry[0]!.GateID} (${registry[0]!.TestName}) was removed`]);
    expect(GateRegistryValidator.ValidateAgainstBase(withGate('G0.1', { TestName: 'W1 → S7.6' }), registry).join('\n')).toMatch(/G0\.1 renamed/);
    expect(GateRegistryValidator.ValidateAgainstBase(withGate('G0.1', { OwnerPR: 3 }), registry).join('\n')).toMatch(/G0\.1 owner changed from PR 2 to PR 3/);
  });
});
