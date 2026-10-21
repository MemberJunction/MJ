import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { GateEntry, GateImplementation, GateRequirement, GateStatus, RunMode } from './types';

/** Structural checks of `gates/gates.json`, alone and against the base branch's copy. */
export class GateRegistryValidator {
  private static readonly statuses: ReadonlySet<GateStatus> = new Set<GateStatus>(['expected-fail', 'required']);
  private static readonly modes: ReadonlySet<RunMode> = new Set<RunMode>(['pr', 'nightly', 'weekly']);
  private static readonly requirements: ReadonlySet<GateRequirement> = new Set<GateRequirement>(['live-model', 'sidecar-16gb', 'bizapps-common']);
  private static readonly gateFolder = 'packages/AI/PredictiveStudio/TruthSuite/gates';

  /** Every structural error of the registry (count, value lists, where each gate is declared); empty when valid. */
  public static Validate(registry: readonly GateEntry[], repoRoot: string): string[] {
    const errors: string[] = [];
    if (registry.length !== 111) errors.push(`expected 111 gates, found ${registry.length}`);
    const gateFiles = GateRegistryValidator.gateFileSources(repoRoot);
    for (const g of registry) errors.push(...GateRegistryValidator.gateErrors(g, repoRoot, gateFiles));
    return errors;
  }

  /** Changes that relax or rewrite a gate of the base branch: removed, renamed, re-owned, required → expected-fail. */
  public static ValidateAgainstBase(branch: readonly GateEntry[], base: readonly GateEntry[]): string[] {
    const errors: string[] = [];
    for (const b of base) {
      const mine = branch.find((g) => g.GateID === b.GateID);
      if (!mine) { errors.push(`${b.GateID} (${b.TestName}) was removed`); continue; }
      if (mine.TestName !== b.TestName) errors.push(`${b.GateID} renamed from "${b.TestName}" to "${mine.TestName}"`);
      if (mine.OwnerPR !== b.OwnerPR) errors.push(`${b.GateID} owner changed from PR ${b.OwnerPR} to PR ${mine.OwnerPR}`);
      if (b.Status === 'required' && mine.Status !== 'required') {
        errors.push(`${b.GateID} (${b.TestName}) is required on the base branch but expected-fail here`);
      }
    }
    return errors;
  }

  /**
   * The source of every `gates/*.gates.test.ts` file, keyed by its path relative to the TruthSuite package. A `body`
   * gate is found by the title it declares here, never by a file name in the registry.
   */
  private static gateFileSources(repoRoot: string): ReadonlyMap<string, string> {
    const folder = path.join(repoRoot, GateRegistryValidator.gateFolder);
    const files = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.gates.test.ts')).sort() : [];
    return new Map(files.map((f) => [`gates/${f}`, readFileSync(path.join(folder, f), 'utf8')]));
  }

  /** The errors of one entry: value lists, stub/required, and where its title is declared. */
  private static gateErrors(g: GateEntry, repoRoot: string, gateFiles: ReadonlyMap<string, string>): string[] {
    const tag = `${g.GateID} (${g.TestName})`;
    const errors: string[] = [];
    if (!GateRegistryValidator.statuses.has(g.Status)) errors.push(`${tag}: invalid status ${g.Status}`);
    if (!GateRegistryValidator.modes.has(g.RunMode)) errors.push(`${tag}: invalid runMode ${g.RunMode}`);
    for (const r of g.Requires) if (!GateRegistryValidator.requirements.has(r)) errors.push(`${tag}: unknown requirement ${r}`);
    if (g.Implementation.Kind === 'external') return [...errors, ...GateRegistryValidator.externalErrors(tag, g.TestName, g.Implementation, repoRoot)];
    const declaredIn = [...gateFiles].filter(([, source]) => GateRegistryValidator.titleOccurrences(source, g.TestName) > 0).map(([file]) => file);
    const n = [...gateFiles.values()].reduce((sum, source) => sum + GateRegistryValidator.titleOccurrences(source, g.TestName), 0);
    if (g.Implementation.Kind === 'stub') {
      if (g.Status === 'required') errors.push(`${tag}: a stub cannot be required`);
      if (n > 0) errors.push(`${tag}: a stub has a body in ${declaredIn.join(', ')}`);
      return errors;
    }
    if (n !== 1) {
      const where = declaredIn.length > 0 ? ` (${declaredIn.join(', ')})` : '';
      errors.push(`${tag}: expected exactly one TruthGate.Define titled "${g.TestName}" across gates/*.gates.test.ts, found ${n}${where}`);
    }
    return errors;
  }

  /** An `external` gate: its file in the other package must hold the title exactly once. */
  private static externalErrors(tag: string, testName: string, impl: Extract<GateImplementation, { Kind: 'external' }>, repoRoot: string): string[] {
    const file = path.join(repoRoot, impl.File);
    if (!existsSync(file)) return [`${tag}: implementation file ${file} is missing`];
    const n = GateRegistryValidator.titleOccurrences(readFileSync(file, 'utf8'), testName);
    return n === 1 ? [] : [`${tag}: expected exactly one test titled "${testName}" in ${file}, found ${n}`];
  }

  /**
   * Count occurrences of an exact title as the first, literal argument of `TruthGate.Define(` (TruthSuite bodies and
   * bridges), `it(` or `test(` in a source file.
   */
  private static titleOccurrences(source: string, title: string): number {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (source.match(new RegExp(`(?:TruthGate\\.Define|it|test)\\(\\s*['"\`]${escaped}['"\`]`, 'g')) || []).length;
  }
}
