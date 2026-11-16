// loom.ts — the one import of the Loom engine for every generator (pinned by fixtures/loom.json).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SafeJSONParse } from '@memberjunction/global';
import { TruthSuite } from '../truth-suite';
import type { CsvRow, WorldDomain } from './types';

/** A Loom named RNG stream (the subset of Loom's `RngStream` the generators call). */
export interface LoomRng {
  next(): number;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  bernoulli(p: number): boolean;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  int(min: number, max: number): number;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  normal(mean?: number, stdDev?: number): number;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  pickWeighted<T>(options: ReadonlyArray<{ value: T; weight: number }>): T;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
}

/** Loom's deterministic ID minter. */
export interface LoomIdentityService {
  RegisterNamespace(domain: string, namespaceUuid: string): void;
  MintId(domain: string, entity: string, businessKey: string | readonly string[]): string;
}

/** Options of Loom's `recurringDecision` pattern: per cycle, a cohort faces one calibrated binary choice. */
export interface LoomRecurringDecisionOptions<TCandidate, TCtx> {
  seed: number;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  cycles: readonly number[];  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  cohortOf: (cycle: number) => readonly TCandidate[];  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  prepareCohortContext?: (cohort: readonly TCandidate[], cycle: number) => TCtx;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  scoreOf: (candidate: TCandidate, cycle: number, ctx?: TCtx) => number;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  target: number;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  streamKey: (candidate: TCandidate, cycle: number) => string;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  baselineShift?: (cycle: number) => number;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  onDecision: (candidate: TCandidate, cycle: number, decidedYes: boolean, ctx?: TCtx) => void;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
}

/** Options of Loom's `emitMetadata`: writes mj-sync metadata files for the domain's records. */
export interface LoomMetadataEmitterOptions {
  outputDir: string;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  domain: WorldDomain;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  data: Record<string, ReadonlyArray<CsvRow>>;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
}

/** The Loom engine exports the generators use (declared here because Loom is not a pnpm dependency; see below). */
export interface LoomEngine {
  createRng(seed: number, streamKey?: string): LoomRng;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  IdentityService: new () => LoomIdentityService;
  calibrateIntercept(scores: readonly number[], target: number, tolerance?: number, maxIterations?: number): number;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  sigmoid(x: number): number;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  recurringDecision<TCandidate, TCtx>(opts: LoomRecurringDecisionOptions<TCandidate, TCtx>): void;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
  emitMetadata(options: LoomMetadataEmitterOptions): Promise<string[]>;  // case-violation-ok-legacy-back-compat: mirrors the Loom engine API
}

const loomPin = SafeJSONParse<{ sha: string }>(readFileSync(path.join(TruthSuite.Root(), 'fixtures', 'loom.json'), 'utf8'));
if (!loomPin) throw new Error('fixtures/loom.json is not valid JSON');
const loomSha: string = loomPin.sha;
const loomDir = process.env.TRUTH_LOOM_DIR || path.join(TruthSuite.Root(), '.loom', loomSha);
const loomEntry = path.join(loomDir, 'packages', 'engine', 'dist', 'index.js');
if (!existsSync(loomEntry)) {
  throw new Error(`Loom engine not built at ${loomEntry}. Run: pnpm --filter @memberjunction/predictive-studio-truth-suite run truth:loom`);
}
// Dynamic import, allowed case 5 of .claude/rules/typescript-style.md ("runtime discovery from config"): the module's
// path is the pinned Loom checkout named in fixtures/loom.json, known only at run time. Loom is deliberately not a
// pnpm dependency of MJ (its workspace lockfile and `workspace:*` contracts cannot resolve in MJ's), so no
// static import or package.json entry can name it. One top-of-module load; every generator reads `Loom.Engine`.
const loomEngine: LoomEngine = await import(pathToFileURL(loomEntry).href);

/** The pinned Loom engine. */
export class Loom {
  /** The Loom commit the engine was built from (fixtures/loom.json). */
  public static readonly Sha: string = loomSha;

  /** The loaded engine module. */
  public static readonly Engine: LoomEngine = loomEngine;
}
