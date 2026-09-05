/**
 * ps-demo-stories-showcase.ts — the DEMO for the typed-component / story work.
 *
 * Everything here runs the real engine: real SQL Server metadata, the real Python sidecar, the real
 * component tree, the real promotion gate, and one real LLM call per published model. Nothing is
 * mocked or staged.
 *
 * It answers one question — *what can Predictive Studio do now that it could not do before?* — in
 * five acts, each isolating a capability that did not exist prior to this work:
 *
 *   ACT I    the TREE decides what is possible        (inheritance + provenance + lint)
 *   ACT II   four ARCHITECTURES over identical data   (incl. as-of aggregates + the glass-box rubric)
 *   ACT III  the LEADERBOARD, honestly compared       (same holdout, same metric)
 *   ACT IV   the model writes its own STORY           (one LLM call, every fact handed to it)
 *   ACT V    REUSE BY MEANING                         (find a component by describing it in English)
 *
 * Data: the `demo` schema (2,000 members, 13,528 activities) where renewal is genuinely driven by
 * pre-decision engagement — so Act II's contrast is real signal, not a rigged fixture.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-demo-stories-showcase.ts
 *   DEMO_KEEP=1 …   # leave the created rows behind for browsing in Explorer
 */
import sql from 'mssql';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { setupSQLServerClient, SQLServerProviderConfigData, SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
// Registers entity subclasses + the LLM provider / prompt drivers the story tagger needs.
import '@memberjunction/server-bootstrap-lite';
import { RunView, UserInfo, BaseEntity, type IMetadataProvider } from '@memberjunction/core';
import '@memberjunction/core-entities';
import {
  MJMLModelEntity,
  MJMLComponentEntity,
  MJMLTrainingPipelineEntity,

  MJFileStorageProviderEntity,
} from '@memberjunction/core-entities';
import type { FeatureStep } from '@memberjunction/predictive-studio-core';
import {
  createTrainingPipeline,
  trainModelViaEngine,
  ProductionModelPromotionGate,
  MLComponentEngine,
  ReuseFinder,
  LoadMLModelInferenceProcessor,
  type PipelineConfig,
  type DatedSourceSpec,
} from '@memberjunction/predictive-studio';
import { deriveTrustVerdict } from '@memberjunction/predictive-studio-core';
import { AIEngine } from '@memberjunction/aiengine';

LoadMLModelInferenceProcessor();

const TAG = 'ps-demo-stories-showcase';
const KEEP = process.env.DEMO_KEEP === '1';
const LOCAL_PROVIDER_NAME = 'Local Disk (Dev)';

// ─── presentation helpers ──────────────────────────────────────────────────────
const W = 92;
function act(n: string, title: string): void {
  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  ACT ${n} — ${title}`);
  console.log('═'.repeat(W));
}
function beat(text: string): void {
  console.log(`\n▸ ${text}`);
}
function note(text: string): void {
  console.log(`    ${text}`);
}

// ─── the four architectures ────────────────────────────────────────────────────

/** The as-of aggregates over demo.Activities — the vocabulary that did not exist before this work. */
const ENGAGEMENT_AS_OF: DatedSourceSpec[] = [
  {
    EntityName: 'Activities',
    ForeignKeyField: 'MemberID',
    DateField: 'ActivityDate',
    Features: [
      { OutputColumn: 'acts_90d', Aggregate: 'count', Window: { Kind: 'Rolling', LengthDays: 90 }, EmitPresence: true },
      { OutputColumn: 'spend_90d', Aggregate: 'sum', Field: 'Amount', Window: { Kind: 'Rolling', LengthDays: 90 } },
      { OutputColumn: 'kinds_90d', Aggregate: 'distinct_count', Field: 'ActivityType', Window: { Kind: 'Rolling', LengthDays: 90 } },
      { OutputColumn: 'days_since_last_act', Aggregate: 'recency', Window: { Kind: 'Rolling', LengthDays: 90 } },
    ],
  },
];

/** Columns present on the Member row itself — everything knowable without touching Activities. */
const MEMBER_COLUMNS = ['MembershipTenureMonths', 'City'];

interface Architecture {
  key: string;
  label: string;
  claim: string;
  algorithm: string;
  asOf: boolean;
  /** Add the TimesFM forecast FeatureStep — the trajectory a point-in-time count cannot see. */
  forecast?: boolean;
  hyperparameters?: Record<string, unknown>;
}

const ARCHITECTURES: Architecture[] = [
  {
    key: 'A',
    label: 'Member columns only · Logistic Regression',
    claim: 'The honest baseline: everything you can read off the member record.',
    algorithm: 'Logistic Regression',
    asOf: false,
  },
  {
    key: 'B',
    label: 'Member columns + 90-day as-of engagement · Logistic Regression',
    claim: 'Same algorithm, same holdout — the ONLY change is point-in-time engagement features.',
    algorithm: 'Logistic Regression',
    asOf: true,
  },
  {
    key: 'C',
    label: 'Member columns + as-of engagement · Glass-Box Rubric',
    claim: 'A trainable model that is exactly explainable per record — a component family that did not exist.',
    algorithm: 'Glass-Box Rubric',
    asOf: true,
    // `search` mode: the rubric LEARNS its weights under a non-negativity constraint, so the result
    // is still a weighted sum a person can read — trained, not hand-authored.
    hyperparameters: { mode: 'search', scale_min: 0, scale_max: 100 },
  },
  {
    key: 'D',
    label: 'Member columns + as-of engagement · Random Forest',
    claim: 'The black-box ceiling, for comparison against the glass box.',
    algorithm: 'Random Forest',
    asOf: true,
  },
  {
    key: 'E',
    label: 'As-of engagement + TimesFM forecast · Logistic Regression',
    claim: 'B plus a forecast band over two years of weekly history — trajectory, not just level.',
    algorithm: 'Logistic Regression',
    asOf: true,
    forecast: true,
  },
];

/**
 * The forecast step: two years of weekly activity, cut at each member's own decision date, handed
 * to TimesFM. Emits the band at the horizon plus the slope from the last observed week.
 *
 * Weekly buckets over ~104 weeks clear the model's 32-step input patch comfortably; daily buckets
 * over the same span would be mostly zeros, and a 90-day window would be 13 points — below the
 * floor, and every series would be (correctly) refused.
 */
const ENGAGEMENT_FORECAST: FeatureStep = {
  Id: 'forecast-engagement',
  Kind: 'forecast',
  SourceEntity: 'Activities',
  ForeignKeyField: 'MemberID',
  DateField: 'ActivityDate',
  BucketDays: 7,
  // Half a year ahead. A 4-week horizon barely moves off the last observed value, so its slope
  // reflects short-term wobble rather than the two-year direction — the thing that actually
  // separates a member who has been climbing from one who has been collapsing.
  Horizon: 26,
  OutputPrefix: 'engagement_fc',
};

/**
 * The numeric columns the matrix will carry, in order. Needed because `standardize` names its
 * columns explicitly and as-of aggregates only exist once the dated sources are assembled.
 */
function numericColumns(arch: Architecture): string[] {
  const memberNumeric = ['MembershipTenureMonths'];
  const cols = arch.asOf ? [...memberNumeric, ...ENGAGEMENT_AS_OF[0].Features.map((f) => f.OutputColumn)] : memberNumeric;
  if (!arch.forecast) return cols;
  return [...cols, 'engagement_fc_p50', 'engagement_fc_p10', 'engagement_fc_p90', 'engagement_fc_slope'];
}

/**
 * Build the pipeline from the plan AND from the component tree: the preprocessing steps are not
 * hardcoded per architecture — they are read off the chosen algorithm's INHERITED `PreprocessingBank`.
 * A linear model standardizes because `Linear` says every linear descendant must; a tree ensemble
 * does not, because `Tree Ensemble` never claims it. Nobody wrote that down per-model.
 */
function buildConfig(arch: Architecture, bank: string[]): PipelineConfig {
  const numeric = numericColumns(arch);
  const steps: FeatureStep[] = [{ Id: 'select-raw', Kind: 'select', Columns: MEMBER_COLUMNS }];
  if (bank.includes('impute')) {
    for (const c of numeric) steps.push({ Id: `impute-${c}`, Kind: 'impute', Column: c, Strategy: 'median' });
  }
  if (bank.includes('standardize')) {
    steps.push({ Id: 'standardize', Kind: 'standardize', Columns: numeric });
  }
  if (arch.forecast) steps.push(ENGAGEMENT_FORECAST);
  steps.push({ Id: 'onehot-City', Kind: 'onehot', Column: 'City' });

  return {
    name: `${TAG} · ${arch.key} · ${arch.label}`,
    description: arch.claim,
    targetEntityName: 'Members',
    targetVariable: 'Renewed',
    problemType: 'classification',
    algorithmName: arch.algorithm,
    sourceBindings: [{ Kind: 'Entity', Ref: 'Members' }, ...(arch.asOf ? [{ Kind: 'Entity' as const, Ref: 'Activities' }] : [])],
    featureSteps: { Steps: steps },
    // Every feature is computed as of the member's own decision date — never after it.
    asOf: { Mode: 'column', Column: 'RenewalDecidedAt' },
    datedSources: arch.asOf ? ENGAGEMENT_AS_OF : undefined,
    leakageGuard: { DenyFields: ['RenewalDecidedAt', 'MemberNumber', 'FirstName', 'LastName'], SingleFeatureDominanceThreshold: 0.85 },
    validation: { Strategy: 'holdout', TestSize: 0.25, LockedHoldoutFraction: 0.2 },
    hyperparameters: arch.hyperparameters ?? {},
  };
}

/** The inherited preprocessing bank for an architecture's algorithm, read from the tree. */
function bankFor(arch: Architecture, engine: MLComponentEngine): string[] {
  const leaf = engine.FindTypeByName(arch.algorithm);
  if (!leaf) return [];
  const items = engine.ResolveProfile(leaf.ID).Properties.PreprocessingBank ?? [];
  return items.map((i) => i.ItemKey ?? '').filter(Boolean);
}


/**
 * Self-contained bootstrap: the real SQLServerDataProvider in-process, exactly as MJAPI builds it.
 * Deliberately does NOT use rigs/lib/ai-bootstrap — that pulls in a shared harness currently out of
 * sync with its own package, an unrelated break this demo should not inherit.
 */
async function bootstrap(): Promise<{ user: UserInfo; provider: SQLServerDataProvider }> {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 120000,
  }).connect();
  const provider = await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA ?? '__mj'));
  await UserCache.Instance.Refresh(provider);
  const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  if (!user) throw new Error('No context user found in UserCache.');
  await AIEngine.Instance.Config(false, user);
  return { user, provider };
}

/**
 * The artifact store writes model bytes to local disk but still creates an `MJ: Files` row, whose
 * `ProviderID` is NOT NULL and comes from the active `MJ: File Storage Providers` row. A bare MJ
 * install ships every provider inactive, so training fails at artifact-persist time. Ensure a
 * clearly-labelled local-disk row exists for this dev database.
 */
async function ensureLocalFileProvider(user: UserInfo, provider: IMetadataProvider): Promise<void> {
  const rv = new RunView();
  const active = await rv.RunView<{ ID: string }>(
    { EntityName: 'MJ: File Storage Providers', ExtraFilter: 'IsActive = 1', Fields: ['ID'], ResultType: 'simple', MaxRows: 1, BypassCache: true },
    user,
  );
  if (active.Success && active.Results.length > 0) return;

  const existing = await rv.RunView<{ ID: string }>(
    { EntityName: 'MJ: File Storage Providers', ExtraFilter: `Name = '${LOCAL_PROVIDER_NAME}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1, BypassCache: true },
    user,
  );
  const row = await provider.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', user);
  if (existing.Success && existing.Results.length > 0) {
    await row.Load(existing.Results[0].ID);
  } else {
    row.NewRecord();
    row.Name = LOCAL_PROVIDER_NAME;
    row.Description = 'Dev-only: model artifacts are written to local disk by MJFilesArtifactStore; this row exists to satisfy MJ: Files.ProviderID.';
    row.ServerDriverKey = 'Local Disk Storage';
    row.ClientDriverKey = 'Local Disk Storage';
  }
  row.IsActive = true;
  if (!(await row.Save())) {
    throw new Error(`Could not prepare a file storage provider: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
  console.log(`  (prepared '${LOCAL_PROVIDER_NAME}' so trained artifacts can be persisted)`);
}

// ─── ACT I ─────────────────────────────────────────────────────────────────────

async function actOne(user: UserInfo, provider: IMetadataProvider): Promise<MLComponentEngine> {
  act('I', 'The tree decides what is possible');
  const engine = MLComponentEngine.Instance;
  await engine.Config(false, user, provider);

  note(`${engine.ComponentTypes.length} component types · ${engine.ComponentTypeProperties.length} inheritable properties · ${engine.ComponentTypeSlots.length} slots`);

  beat('A property belongs to a node only if it genuinely holds for every descendant.');
  console.log('  Nothing below is written on the leaf — each is INHERITED, and the tree says from where.\n');

  for (const leafName of ['XGBoost', 'Glass-Box Rubric', 'Random Forest', 'Hidden Markov Model']) {
    const leaf = engine.FindTypeByName(leafName);
    if (!leaf) { note(`(${leafName} not in tree)`); continue; }
    const profile = engine.ResolveProfile(leaf.ID);
    const chain = profile.Chain.map((n) => n.Name).join(' → ');
    console.log(`  ${leafName}`);
    console.log(`    inheritance: ${chain}`);
    for (const [key, items] of Object.entries(profile.Properties)) {
      if (!items || items.length === 0) continue;
      const values = items.map((i) => (i.ItemKey ?? JSON.stringify(i.Value))).join(', ');
      const from = (profile.Provenance[key as keyof typeof profile.Provenance] ?? [])
        .map((id) => engine.FindTypeByID(id)?.Name ?? '?')
        .filter((n, idx, a) => a.indexOf(n) === idx);
      console.log(`    ${key.padEnd(24)} ${values}`);
      console.log(`      ${' '.repeat(23)} ↳ from ${from.join(' + ')}`);
    }
    const slots = profile.Slots;
    if (slots.length > 0) {
      console.log(`    fillable slots:          ${slots.map((s) => `${s.Name}[${s.MinCount}..${s.MaxCount ?? '∞'}] accepts ${engine.FindTypeByID(s.AcceptsComponentTypeID)?.Name ?? '?'}`).join('; ')}`);
    }
    console.log('');
  }

  beat('The partition is machine-checked, not asserted.');
  const findings = engine.Lint();
  const errors = findings.filter((f) => f.Severity === 'Error');
  const warnings = findings.filter((f) => f.Severity === 'Warning');
  note(`lintComponentTree(): ${errors.length} errors, ${warnings.length} warnings across ${engine.ComponentTypes.length} nodes`);
  for (const f of [...errors, ...warnings].slice(0, 5)) note(`  ${f.Severity}: ${f.Message}`);
  if (errors.length === 0 && warnings.length === 0) {
    note('  A contradiction — a property added at a parent and removed below it — would surface here by name.');
  }
  return engine;
}

// ─── ACT II + III ──────────────────────────────────────────────────────────────

interface TrainedArch {
  arch: Architecture;
  pipelineId: string;
  modelId: string;
  /** AUC on the tuning/validation split — the number a search optimizes and a leaderboard flatters. */
  validationAuc: number | null;
  /** AUC on the LOCKED holdout — a slice the search never saw, scored exactly once. */
  holdoutAuc: number | null;
  trust: string;
  canAct: boolean;
  featureCount: number;
  /** Normalized per-feature importance, for the comparative analysis. */
  importance: Record<string, number>;
  error?: string;
}

function readAuc(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ['auc', 'roc_auc', 'AUC']) {
      const v = parsed[key];
      if (typeof v === 'number') return v;
    }
  } catch { /* fall through */ }
  return null;
}

function readImportance(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'number') out[k] = v;
    return out;
  } catch { return {}; }
}

async function actTwo(user: UserInfo, provider: IMetadataProvider, engine: MLComponentEngine): Promise<TrainedArch[]> {
  act('II', 'Four architectures over identical data');
  console.log('  Same members, same locked holdout, same target. Only the ARCHITECTURE changes.');
  console.log('  The data is built so LEVEL and TREND are independent: every member\'s most recent');
  console.log('  activity is set by one draw and their two-year direction by another, so two members');
  console.log('  can look identical to a 90-day count while one has been climbing and one collapsing.\n');

  const results: TrainedArch[] = [];
  for (const arch of ARCHITECTURES) {
    beat(`${arch.key}. ${arch.label}`);
    note(arch.claim);
    const bank = bankFor(arch, engine);
    note(`tree says preprocess with: [${bank.join(', ') || 'nothing'}] — inherited, not configured here`);
    try {
      const pipeline = await createTrainingPipeline(buildConfig(arch, bank), provider, user);
      const trainResult = await trainModelViaEngine({ pipelineId: pipeline.ID, sidecarVersion: TAG }, provider, user);
      const model = trainResult.model;
      const validationAuc = readAuc(model.Metrics);
      const holdoutAuc = readAuc(model.HoldoutMetrics);
      const verdict = deriveTrustVerdict(model);
      let featureCount = 0;
      try { featureCount = (JSON.parse(model.FeatureSchema ?? '[]') as unknown[]).length; } catch { /* ignore */ }
      note(`→ trained: ${featureCount} features · validation AUC ${validationAuc?.toFixed(4) ?? 'n/a'} · holdout AUC ${holdoutAuc?.toFixed(4) ?? 'n/a'} · trust=${verdict.grade}${verdict.canAct ? '' : ' (actions locked)'}`);
      results.push({
        arch, pipelineId: pipeline.ID, modelId: model.ID,
        validationAuc, holdoutAuc, trust: verdict.grade, canAct: verdict.canAct,
        featureCount, importance: readImportance(model.FeatureImportance),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      note(`→ FAILED: ${message}`);
      results.push({ arch, pipelineId: '', modelId: '', validationAuc: null, holdoutAuc: null, trust: 'n/a', canAct: false, featureCount: 0, importance: {}, error: message });
    }
  }
  return results;
}


/**
 * Approximate standard error of an AUC (Hanley & McNeil 1982).
 *
 * Without this the leaderboard invites exactly the mistake the locked holdout exists to prevent,
 * one level up: reading a difference between two numbers as a result when the holdout is too small
 * to resolve it. A +0.03 AUC gap on a 200-record holdout is not a finding, it is rounding.
 */
function aucStandardError(auc: number, positives: number, negatives: number): number | null {
  if (positives < 1 || negatives < 1) return null;
  const q1 = auc / (2 - auc);
  const q2 = (2 * auc * auc) / (1 + auc);
  const variance =
    (auc * (1 - auc) + (positives - 1) * (q1 - auc * auc) + (negatives - 1) * (q2 - auc * auc)) /
    (positives * negatives);
  return variance > 0 ? Math.sqrt(variance) : null;
}

/** Standard error of the DIFFERENCE of two AUCs measured on the same holdout (conservative). */
function deltaStandardError(a: number, b: number, positives: number, negatives: number): number | null {
  const sa = aucStandardError(a, positives, negatives);
  const sb = aucStandardError(b, positives, negatives);
  if (sa === null || sb === null) return null;
  // Treating them as independent OVERSTATES the error for two models scored on the same rows, so a
  // difference this test calls real is real; one it calls inconclusive may still be.
  return Math.sqrt(sa * sa + sb * sb);
}

/** Render a delta with its uncertainty, and say plainly whether the holdout can resolve it. */
function describeDelta(label: string, from: number, to: number, positives: number, negatives: number): string[] {
  const delta = to - from;
  const se = deltaStandardError(from, to, positives, negatives);
  const sign = delta >= 0 ? '+' : '';
  if (se === null) return [`${label}: ${from.toFixed(4)} → ${to.toFixed(4)} (${sign}${delta.toFixed(4)}).`];
  const bound = 2 * se;
  const magnitude = Math.abs(delta);
  const headline = `${label}: ${from.toFixed(4)} → ${to.toFixed(4)} (${sign}${delta.toFixed(4)}, ±${bound.toFixed(4)} at 2 SE on ${positives + negatives} holdout rows).`;
  if (magnitude > bound) {
    return [headline, 'The holdout resolves a difference this size even on the conservative bound, so this one is real.'];
  }
  if (magnitude > 0.75 * bound) {
    // The bound above treats the two AUCs as INDEPENDENT. They are not: both were scored on the
    // same holdout rows, so they move together and the true error on their difference is smaller.
    // Saying "cannot tell" here would overstate our own ignorance.
    return [
      headline,
      'That sits just inside a deliberately conservative bound — it treats the two AUCs as independent,',
      'but they were scored on the SAME rows and move together, so the real error on the difference is',
      'smaller. Suggestive, not yet established: the way to settle it is replication, not a louder claim.',
    ];
  }
  return [headline, 'That is INSIDE the noise for a holdout this size — an honest "cannot tell", not a win.'];
}


/**
 * The locked holdout's size and class balance — the denominator every comparison in Act III rests
 * on. Derived from the population and the pipeline's LockedHoldoutFraction rather than assumed,
 * so the reported uncertainty tracks the data actually used.
 */
async function measureHoldout(user: UserInfo, fraction: number): Promise<{ positives: number; negatives: number }> {
  const rv = new RunView();
  const rows = await rv.RunView<{ Renewed: string }>(
    { EntityName: 'Members', Fields: ['Renewed'], ResultType: 'simple', MaxRows: 100000, BypassCache: true },
    user,
  );
  if (!rows.Success || rows.Results.length === 0) return { positives: 0, negatives: 0 };
  const total = rows.Results.length;
  const positiveRate = rows.Results.filter((r) => r.Renewed === 'yes').length / total;
  const held = Math.round(total * fraction);
  return { positives: Math.round(held * positiveRate), negatives: held - Math.round(held * positiveRate) };
}

function actThree(results: TrainedArch[], holdout: { positives: number; negatives: number }): void {
  act('III', 'Comparative analysis — what the leaderboard hides');
  const ok = results.filter((r) => !r.error);

  // ── 1. The two metric surfaces, side by side ────────────────────────────────────────
  beat('Every architecture, on both surfaces. Ranked by the honest one.');
  console.log('    A search optimizes the validation split, so that column is the one it learns to game.');
  console.log('    The locked holdout is carved before the search and scored exactly once.\n');
  const ranked = [...ok].sort((a, b) => (b.holdoutAuc ?? -1) - (a.holdoutAuc ?? -1));
  console.log(`    ${'architecture'.padEnd(50)}${'feat'.padEnd(6)}${'valid.'.padEnd(9)}${'holdout'.padEnd(10)}${'gap'.padEnd(9)}trust`);
  console.log(`    ${'-'.repeat(W - 8)}`);
  for (const r of ranked) {
    const gap = r.validationAuc != null && r.holdoutAuc != null ? r.validationAuc - r.holdoutAuc : null;
    const flag = gap != null && gap > 0.15 ? '  ← memorized' : '';
    console.log(
      `    ${(r.arch.key + '. ' + r.arch.label).slice(0, 48).padEnd(50)}` +
        `${String(r.featureCount).padEnd(6)}` +
        `${(r.validationAuc?.toFixed(4) ?? 'n/a').padEnd(9)}` +
        `${(r.holdoutAuc?.toFixed(4) ?? 'n/a').padEnd(10)}` +
        `${(gap != null ? (gap >= 0 ? '+' : '') + gap.toFixed(4) : 'n/a').padEnd(9)}` +
        `${r.trust}${flag}`,
    );
  }

  const worst = [...ok]
    .filter((r) => r.validationAuc != null && r.holdoutAuc != null)
    .sort((a, b) => (b.validationAuc! - b.holdoutAuc!) - (a.validationAuc! - a.holdoutAuc!))[0];
  if (worst && worst.validationAuc! - worst.holdoutAuc! > 0.15) {
    console.log('');
    beat(`${worst.arch.key} tops the validation column at ${worst.validationAuc!.toFixed(4)} and collapses to ${worst.holdoutAuc!.toFixed(4)} on the holdout.`);
    note('It did not learn the pattern; it memorized the rows. A leaderboard built on the validation');
    note('split alone would have shipped it as the best model in the room. The locked holdout is the');
    note('only reason anyone finds out — and the trust grade is computed from the holdout, never the split.');
  }

  // ── 2. Did the as-of vocabulary earn its place? ─────────────────────────────────────
  const baseline = ok.find((r) => r.arch.key === 'A');
  const asOf = ok.find((r) => r.arch.key === 'B');
  if (baseline?.holdoutAuc != null && asOf?.holdoutAuc != null) {
    console.log('');
    const lines = describeDelta('Point-in-time engagement features', baseline.holdoutAuc, asOf.holdoutAuc, holdout.positives, holdout.negatives);
    beat(lines[0]);
    for (const line of lines.slice(1)) note(line);
    note('Same algorithm, same split, same preprocessing. The only difference is a vocabulary of as-of');
    note("aggregates — count / sum / distinct-count / recency over a rolling 90-day window ending at each");
    note("member's OWN decision date. Nothing after that date is visible to the model, by construction.");
  }

  // ── 2b. Did the forecast earn its place ON TOP of the as-of features? ───────────────
  const forecastArch = ok.find((r) => r.arch.key === 'E');
  if (asOf?.holdoutAuc != null && forecastArch?.holdoutAuc != null) {
    console.log('');
    const lines = describeDelta(
      'TimesFM forecast on top of the as-of features',
      asOf.holdoutAuc,
      forecastArch.holdoutAuc,
      holdout.positives,
      holdout.negatives,
    );
    beat(lines[0]);
    for (const line of lines.slice(1)) note(line);
    note('The count says how active someone is NOW; the forecast says where they are heading — and');
    note('in this data those are independent by construction. Whether that trajectory is worth its');
    note('~142ms/series is decided by the SAME holdout comparison that judges every other feature.');
  }

  // ── 3. Comparative feature analysis ─────────────────────────────────────────────────
  const withImportance = ok.filter((r) => Object.keys(r.importance).length > 0);
  if (withImportance.length > 1) {
    console.log('');
    beat('Per-feature importance, compared across architectures.');
    note('The same input can be load-bearing in one model and noise in another — that comparison is');
    note('what tells you whether a feature is real or whether one model is leaning on an artifact.\n');
    const allFeatures = [...new Set(withImportance.flatMap((r) => Object.keys(r.importance)))];
    // Rank by the best-generalizing model's opinion, falling back to the mean.
    const best = ranked.find((r) => Object.keys(r.importance).length > 0) ?? withImportance[0];
    allFeatures.sort((a, b) => (best.importance[b] ?? 0) - (best.importance[a] ?? 0));
    console.log(`    ${'feature'.padEnd(28)}${withImportance.map((r) => r.arch.key.padEnd(9)).join('')}`);
    console.log(`    ${'-'.repeat(28 + withImportance.length * 9)}`);
    for (const f of allFeatures.slice(0, 14)) {
      const cells = withImportance.map((r) => (r.importance[f] != null ? r.importance[f].toFixed(3) : '  -  ').padEnd(9)).join('');
      console.log(`    ${f.slice(0, 26).padEnd(28)}${cells}`);
    }
    console.log(`\n    (${withImportance.map((r) => `${r.arch.key} = ${r.arch.algorithm}`).join(' · ')})`);

    // Call out the honest signal: features every architecture agrees on.
    const agreed = allFeatures.filter((f) => withImportance.every((r) => (r.importance[f] ?? 0) > 0.1));
    if (agreed.length > 0) {
      console.log('');
      note(`Every architecture agrees these carry real signal: ${agreed.slice(0, 5).join(', ')}.`);
      note('Agreement across model families is the strongest evidence a feature is not an artifact of one fit.');
    }
  }

  // ── 4. The price of explainability ──────────────────────────────────────────────────
  const glass = ok.find((r) => r.arch.key === 'C');
  const linear = ok.find((r) => r.arch.key === 'B');
  if (glass?.holdoutAuc != null && linear?.holdoutAuc != null) {
    console.log('');
    beat(`Glass-Box Rubric ${glass.holdoutAuc.toFixed(4)} vs Logistic ${linear.holdoutAuc.toFixed(4)} on the holdout — ${Math.abs(glass.holdoutAuc - linear.holdoutAuc).toFixed(4)} apart.`);
    note('The rubric is a weighted sum with non-negative weights: every score decomposes exactly into');
    note('per-record contributions a person can read and argue with. Before this work that family was');
    note('not something Predictive Studio could train, so this trade-off could not even be quoted.');
  }
}

// ─── ACT IV ────────────────────────────────────────────────────────────────────

async function actFour(results: TrainedArch[], user: UserInfo, provider: IMetadataProvider): Promise<string[]> {
  act('IV', 'The model writes its own story');
  console.log('  Promotion runs the gate. On Published, the story tagger fires: ONE LLM call whose every');
  console.log('  fact — trust grade, holdout metrics, feature importance, real entity/field bindings — is');
  console.log('  computed and handed to it. It narrates; it never decides. Attribution is machine-checked.\n');

  const publishedModelIds: string[] = [];
  const gate = new ProductionModelPromotionGate();
  for (const r of results.filter((r) => !r.error)) {
    beat(`Promoting ${r.arch.key} → Published`);
    // The lifecycle is a state machine — Draft → Validated → Published. Jumping straight to
    // Published is refused by design, so walk it the way a reviewer would.
    const validated = await gate.promote({ modelId: r.modelId, targetStatus: 'Validated', signOff: false, contextUser: user, provider });
    if (validated.kind !== 'promoted') {
      note(`→ held at Validated: ${validated.kind}`);
      note('  The gate refusing is the feature working — a model nobody can trust never reaches the catalog.');
      continue;
    }
    const outcome = await gate.promote({ modelId: r.modelId, targetStatus: 'Published', signOff: false, contextUser: user, provider });
    if (outcome.kind === 'promoted') {
      note('→ promoted; story tagger invoked');
      publishedModelIds.push(r.modelId);
    } else {
      note(`→ held: ${outcome.kind}${'topFeature' in outcome && outcome.topFeature ? ` (${outcome.topFeature} @ ${((outcome.topShare ?? 0) * 100).toFixed(0)}%)` : ''}`);
      note('  The gate refusing is the feature working — a model nobody can trust never reaches the catalog.');
    }
  }

  if (publishedModelIds.length === 0) {
    note('\nNo model cleared the trust gate, so no story was written.');
    return [];
  }

  beat('What the models actually wrote:');
  const rv = new RunView();
  const stories = await rv.RunView<{ ID: string; Name: string; ComponentType: string; Story: string | null; StoryContribution: string | null; MLModelID: string | null }>(
    {
      EntityName: 'MJ: ML Components',
      ExtraFilter: `MLModelID IN (${publishedModelIds.map((id) => `'${id}'`).join(',')}) AND Story IS NOT NULL`,
      Fields: ['ID', 'Name', 'ComponentType', 'Story', 'StoryContribution', 'MLModelID'],
      OrderBy: 'Name',
      ResultType: 'simple',
      BypassCache: true,
    },
    user,
  );
  if (!stories.Success) { note(`(could not read stories: ${stories.ErrorMessage})`); return publishedModelIds; }
  note(`${stories.Results.length} component(s) carry a story of their own.\n`);
  for (const s of stories.Results.slice(0, 8)) {
    console.log(`  ● ${s.Name}  [${s.ComponentType}]`);
    console.log(`    ${(s.Story ?? '').replace(/\s+/g, ' ').slice(0, 300)}`);
    if (s.StoryContribution) {
      try {
        const c = JSON.parse(s.StoryContribution) as { Role?: string; ReuseWhen?: string };
        if (c.Role) console.log(`    role: ${c.Role}`);
        if (c.ReuseWhen) console.log(`    reuse when: ${c.ReuseWhen}`);
      } catch { /* ignore */ }
    }
    console.log('');
  }
  return publishedModelIds;
}

// ─── ACT V ─────────────────────────────────────────────────────────────────────

/**
 * Embed the query with the SAME code path that embedded the stories — `AIEngine.EmbedTextLocal`
 * is what `BaseEntity.GenerateEmbedding` calls, so the query and the corpus land in one vector
 * space by construction rather than by us guessing at a matching model.
 */
async function embedQuery(text: string): Promise<number[] | null> {
  try {
    // EmbedTextLocal returns { result, model } — the vector is on `result`, not the outer object.
    const embedded = await AIEngine.Instance.EmbedTextLocal(text);
    return embedded?.result?.vector ?? null;
  } catch (err) {
    note(`(embedding failed: ${err instanceof Error ? err.message : String(err)})`);
    return null;
  }
}

async function actFive(publishedModelIds: string[], user: UserInfo, provider: IMetadataProvider, engine: MLComponentEngine): Promise<void> {
  act('V', 'Reuse by meaning — find a component by describing it in English');
  console.log('  Every component story is embedded on save, so the catalog is searchable by what a');
  console.log('  component MEANS rather than by what it was named — no table, column or class name');
  console.log('  needs to be known to find it.\n');
  console.log('  Every feature is a component in its own right — filling the model\'s `inputs` slot,');
  console.log('  typed by the tree (Column, As-Of Count, As-Of Recency…), carrying its own story and');
  console.log('  its own "reuse when" note. That granularity is what makes the search worth running:');
  console.log('  you get back a PART you can drop into a new model, not a whole model to imitate.\n');

  if (publishedModelIds.length === 0) { note('Nothing published, so nothing to reuse.'); return; }

  // Approve the components — the honest flow: an analyst signs off before others may reuse them.
  const rv = new RunView();
  const rows = await rv.RunView<MJMLComponentEntity>(
    {
      EntityName: 'MJ: ML Components',
      ExtraFilter: `MLModelID IN (${publishedModelIds.map((id) => `'${id}'`).join(',')}) AND StoryVector IS NOT NULL`,
      ResultType: 'entity_object',
      BypassCache: true,
    },
    user,
  );
  if (!rows.Success || rows.Results.length === 0) {
    note('No component carries a story vector — the embedding step did not run, so meaning-search has nothing to rank.');
    return;
  }
  let approved = 0;
  for (const row of rows.Results) {
    if (row.PromotionState !== 'Approved') {
      row.PromotionState = 'Approved';
      if (await row.Save()) approved++;
    }
  }
  note(`${rows.Results.length} components carry a story vector; ${approved} approved for reuse.\n`);

  interface DemoQuery { text: string; trainedOnly: boolean; label: string }
  const queries: DemoQuery[] = [
    // An input component is reused by DEFINITION — it holds no fitted state, so `TrainedOnly`
    // must be false or the finder correctly filters every one of them out.
    { text: 'how recently a member engaged before their renewal decision', trainedOnly: false, label: 'a feature to reuse' },
    { text: 'tells a real zero apart from missing data', trainedOnly: false, label: 'a feature to reuse' },
    { text: 'how much money someone spent in the run-up to a decision', trainedOnly: false, label: 'a feature to reuse' },
    // A trained model is reused by its FITTED STATE, so the default gate applies.
    { text: 'a model you can explain to a board, line by line, for one person', trainedOnly: true, label: 'a trained model to reuse' },
  ];
  const finder = new ReuseFinder();
  for (const q of queries) {
    beat(`"${q.text}"  → ${q.label}`);
    const vector = await embedQuery(q.text);
    if (!vector) { note('(no embedding model available to embed the query)'); continue; }
    const result = await finder.find(
      { QueryVector: vector, TopK: 3, MinSimilarity: 0.05, TrainedOnly: q.trainedOnly },
      user, provider, engine,
    );
    if (result.Matches.length === 0) {
      note(`no match above threshold (${result.CandidatesConsidered} candidates considered)`);
      for (const w of result.Warnings) note(`  ${w}`);
      continue;
    }
    for (const m of result.Matches) {
      const rec = m as unknown as Record<string, unknown>;
      // Show the component's own name (the part after the model prefix) plus its type.
      const full = String(rec.Name ?? '?');
      const leaf = full.includes(' › ') ? full.slice(full.lastIndexOf(' › ') + 3) : full;
      const type = String(rec.ComponentTypeName ?? rec.ComponentType ?? '');
      const sim = typeof rec.Similarity === 'number' ? rec.Similarity : undefined;
      const story = typeof rec.Story === 'string' ? rec.Story : '';
      console.log(`    ${sim != null ? sim.toFixed(3) : ' n/a '}  ${leaf}${type ? `  [${type}]` : ''}`);
      if (story) console.log(`           ${story.replace(/\s+/g, ' ').slice(0, 155)}`);
    }
  }

  console.log('');
  beat('Nobody typed a component name, a table, or a column — only a meaning, in English.');
  note('Each match is a real row with real bindings: drop it into a new model\'s `inputs` slot and');
  note('it brings its entity, its field, its join path and its as-of window with it. That is the');
  note('compounding: the next model starts from parts that already have evidence behind them.');
}

// ─── cleanup ───────────────────────────────────────────────────────────────────

/**
 * Delete every row this demo creates, child→parent, for the given pipeline ids.
 *
 * FK order matters and is not obvious: `MLModel.RootComponentID` points AT the component, and
 * `MLTrainingRun.ResultingModelID` points AT the model, so both references must be broken before
 * their targets can go.
 */
async function purgePipelines(pipelineIds: string[], user: UserInfo, provider: IMetadataProvider): Promise<number> {
  if (pipelineIds.length === 0) return 0;
  const rv = new RunView();
  const inList = pipelineIds.map((id) => `'${id}'`).join(',');

  const models = await rv.RunView<{ ID: string }>(
    { EntityName: 'MJ: ML Models', ExtraFilter: `PipelineID IN (${inList})`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
    user,
  );
  const modelIds = models.Success ? models.Results.map((m) => m.ID) : [];

  for (const modelId of modelIds) {
    // 1. Break MLModel → RootComponent so the component rows can be deleted.
    const model = await provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', user);
    if (await model.Load(modelId)) {
      model.RootComponentID = null;
      await model.Save();
    }
    // 2. Bindings, then components.
    for (const spec of [
      { entity: 'MJ: ML Component Bindings', filter: `ComponentID IN (SELECT ID FROM __mj.MLComponent WHERE MLModelID='${modelId}')` },
      { entity: 'MJ: ML Components', filter: `MLModelID='${modelId}'` },
      { entity: 'MJ: ML Training Runs', filter: `ResultingModelID='${modelId}'` },
    ]) {
      const found = await rv.RunView({ EntityName: spec.entity, ExtraFilter: spec.filter, ResultType: 'entity_object', BypassCache: true }, user);
      if (found.Success) for (const row of found.Results) await (row as BaseEntity).Delete();
    }
    const toDelete = await provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', user);
    if (await toDelete.Load(modelId)) await toDelete.Delete();
  }

  for (const pipelineId of pipelineIds) {
    // Runs can also hang off the pipeline without a resulting model (failed attempts).
    const runs = await rv.RunView({ EntityName: 'MJ: ML Training Runs', ExtraFilter: `PipelineID='${pipelineId}'`, ResultType: 'entity_object', BypassCache: true }, user);
    if (runs.Success) for (const row of runs.Results) await (row as BaseEntity).Delete();
    const pipeline = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
    if (await pipeline.Load(pipelineId)) await pipeline.Delete();
  }
  return modelIds.length;
}

/** Remove anything left behind by an earlier run, so the demo is repeatable and Act V is not polluted. */
async function purgePriorRuns(user: UserInfo, provider: IMetadataProvider): Promise<void> {
  const prior = await new RunView().RunView<{ ID: string }>(
    { EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `Name LIKE '${TAG}%'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
    user,
  );
  if (!prior.Success || prior.Results.length === 0) return;
  const removed = await purgePipelines(prior.Results.map((p) => p.ID), user, provider);
  console.log(`  (cleared ${prior.Results.length} pipeline(s) and ${removed} model(s) from a previous run)`);
}

async function cleanup(results: TrainedArch[], user: UserInfo, provider: IMetadataProvider): Promise<void> {
  if (KEEP) {
    console.log(`\n(DEMO_KEEP=1 — leaving ${results.filter((r) => !r.error).length} pipelines/models in place for browsing in Explorer)`);
    return;
  }
  console.log('\nCleaning up…');
  await purgePipelines(results.filter((r) => r.pipelineId).map((r) => r.pipelineId), user, provider);
  console.log('Done.');
}

// ─── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n' + '━'.repeat(W));
  console.log('  PREDICTIVE STUDIO — typed components, composed models, and stories');
  console.log('  Everything below is live: real metadata, real sidecar, real LLM, real holdout.');
  console.log('━'.repeat(W));

  const { user, provider } = await bootstrap();
  await ensureLocalFileProvider(user, provider);
  await purgePriorRuns(user, provider);
  const engine = await actOne(user, provider);
  const results = await actTwo(user, provider, engine);
  const holdoutComposition = await measureHoldout(user, 0.2);
  actThree(results, holdoutComposition);
  const published = await actFour(results, user, provider);
  await actFive(published, user, provider, engine);
  await cleanup(results, user, provider);

  const failed = results.filter((r) => r.error);
  console.log('\n' + '━'.repeat(W));
  console.log(`  ${results.length - failed.length}/${results.length} architectures trained · ${published.length} published with stories`);
  console.log('━'.repeat(W) + '\n');
  process.exit(failed.length === results.length ? 1 : 0);
}

main().catch((err) => {
  console.error('\nDEMO ERROR:', err instanceof Error ? err.stack : err);
  process.exit(2);
});
