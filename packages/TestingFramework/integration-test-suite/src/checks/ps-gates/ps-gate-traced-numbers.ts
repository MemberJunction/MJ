/**
 * Shared steps of the S9.2 gates (G3.7, G3.8): the experiment report regenerated from a build's stored rows (read fresh,
 * through `ExperimentReports.InputFromRows`, as the agent builds it), a seeded draw without replacement, the recompute
 * of a rendered number from its stored row, and the numeric tokens of a rendered report.
 */
import { RunView } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { TracedNumbers, TrustVerdicts, type TracedNumber } from '@memberjunction/predictive-studio-core';
import { ExperimentReports, type ExperimentReport, type ExperimentReportInput, type ExperimentReportRows } from '@memberjunction/predictive-studio';
import type { TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** The plan's words a report is titled and labelled with. */
export interface ReportWords {
  /** The report's title (the plan's name). */
  readonly Name: string;
  /** The plan's goal. */
  readonly Goal: string;
  /** The plan's target column. */
  readonly TargetVariable: string;
  /** The plan's metric label (shown only when the run stores no comparison). */
  readonly TargetMetric: string;
}

/** A report regenerated from stored rows, with the input it was generated from. */
export interface StoredReport {
  /** The input the report was generated from (the rows as read, the verdict and the catalog status derived from them). */
  readonly Input: ExperimentReportInput;
  /** The regenerated report: its Markdown and its traced numbers. */
  readonly Report: ExperimentReport;
}

/** The outcome of one rendered number's check against its stored row. */
export interface NumberCheck {
  /** True when the number recomputes from its row, appears in its text and prints its stored value. */
  readonly Ok: boolean;
  /** What failed, in words; empty when the number recomputes. */
  readonly Detail: string;
}

/** The model columns a report reads. */
type ReportModelRow = Pick<MJMLModelEntity, 'ID' | 'FeatureImportance' | 'Lineage' | 'Status'>;

/** A seeded draw without replacement. */
export class SeededSample {
  /**
   * `count` items of `items` drawn without replacement by a Fisher–Yates shuffle driven by {@link mulberry32} seeded
   * with `seed`; the same items and seed always draw the same items in the same order. All of them when `count` is not
   * smaller than the list.
   */
  public static Draw<T>(items: readonly T[], count: number, seed: number): T[] {
    const next = SeededSample.mulberry32(seed);
    const pool = [...items];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.max(0, count));
  }

  /** The mulberry32 PRNG: a 32-bit state stepped by a Weyl constant and mixed; returns floats in [0, 1). */
  private static mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}

/** Reading rendered numbers back from the rows they name. */
export class TracedNumberChecks {
  /** The relative tolerance of a recompute: `|r − Value| ≤ 1e-12 · max(1, |Value|)`. */
  private static readonly relativeTolerance = 1e-12;

  /** The report a build delivers, regenerated from its training run and model rows read fresh. */
  public static async RegenerateReport(h: TruthHarness, words: ReportWords, runId: string, modelId: string | null): Promise<StoredReport> {
    const rv = RunView.FromMetadataProvider(h.Provider);
    const runs = await rv.RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'ValidationResults' | 'ComputeSeconds' | 'ComputeCost' | 'TokensUsed'>>(
      { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(runId)}'`, Fields: ['ID', 'ValidationResults', ...ExperimentReports.COST_COLUMNS], ResultType: 'simple', BypassCache: true }, h.User);
    const run = runs.Results[0];
    if (!runs.Success || !run) throw new Error(`reading training run ${runId}: ${runs.ErrorMessage || 'no row'}`);
    const model = modelId === null ? null : await TracedNumberChecks.modelRow(h, modelId);
    const cost = { ID: run.ID, ComputeSeconds: run.ComputeSeconds, ComputeCost: run.ComputeCost, TokensUsed: run.TokensUsed };
    const rows: ExperimentReportRows = { ...words, Run: { ID: run.ID, ValidationResults: run.ValidationResults }, Model: model, Cost: cost };
    const input = ExperimentReports.InputFromRows(rows);
    return { Input: input, Report: ExperimentReports.GenerateMarkdownReport(input) };
  }

  /**
   * One rendered number checked against its stored row, read fresh: the row's JSON column (`ValidationResults` of a
   * training run, or its cost columns for the report's cost line (D5-A6-5); `FeatureImportance` of a model; any other
   * entity fails) recomputes to `Value`; `rendered` contains
   * the token; the token agrees with `Value` at its printed precision.
   */
  public static async Check(h: TruthHarness, n: TracedNumber, rendered: string): Promise<NumberCheck> {
    const json = await TracedNumberChecks.StoredJson(h, n);
    const where = `${n.Text} at ${n.Source.EntityName} ${n.Source.RecordID} ${n.Source.Path}`;
    if (json === null) return { Ok: false, Detail: `${where}: the row or its JSON column could not be read` };
    const r = TracedNumbers.Recompute(n, json);
    if (r === null || Math.abs(r - n.Value) > TracedNumberChecks.relativeTolerance * Math.max(1, Math.abs(n.Value))) {
      return { Ok: false, Detail: `${where}: shown ${n.Value}, the stored row holds ${r === null ? 'no number' : r}` };
    }
    if (!rendered.includes(n.Text)) return { Ok: false, Detail: `${where}: the rendered text does not contain the token` };
    if (!TracedNumberChecks.TokenAgrees(n)) return { Ok: false, Detail: `${where}: the token does not print ${n.Value}` };
    return { Ok: true, Detail: '' };
  }

  /** The JSON column the number was read from, read fresh by its entity and ID; null for an unknown entity or a missing row. */
  public static async StoredJson(h: TruthHarness, n: TracedNumber): Promise<string | null> {
    const id = n.Source.RecordID;
    if (n.Source.EntityName === TrustVerdicts.RunEntityName && ExperimentReports.IsCostPath(n.Source.Path)) {
      // The report's cost line traces to the run's cost columns (D5-A6-5), read here as the JSON the report traced them in.
      const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'ComputeSeconds' | 'ComputeCost' | 'TokensUsed'>>(
        { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(id)}'`, Fields: ['ID', ...ExperimentReports.COST_COLUMNS], ResultType: 'simple', BypassCache: true }, h.User);
      const row = r.Success ? r.Results[0] : undefined;
      return row ? ExperimentReports.CostColumnsJson(row) : null;
    }
    if (n.Source.EntityName === TrustVerdicts.RunEntityName) {
      const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'ValidationResults'>>(
        { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(id)}'`, Fields: ['ID', 'ValidationResults'], ResultType: 'simple', BypassCache: true }, h.User);
      return r.Success ? r.Results[0]?.ValidationResults || null : null;
    }
    if (n.Source.EntityName === ExperimentReports.ModelEntityName) {
      const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLModelEntity, 'ID' | 'FeatureImportance'>>(
        { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(id)}'`, Fields: ['ID', 'FeatureImportance'], ResultType: 'simple', BypassCache: true }, h.User);
      return r.Success ? r.Results[0]?.FeatureImportance || null : null;
    }
    return null;
  }

  /**
   * True when the token prints `Value` at its own precision: the token without `,` and `%` parses to `Value` (`Value×100`
   * for a `%` token) within half a unit of its last printed decimal.
   */
  public static TokenAgrees(n: TracedNumber): boolean {
    const bare = n.Text.replace(/[,%]/g, '');
    const printed = Number(bare);
    if (!Number.isFinite(printed)) return false;
    const decimals = (bare.split('.')[1] || '').length;
    const expected = n.Text.endsWith('%') ? n.Value * 100 : n.Value;
    return Math.abs(printed - expected) <= 0.5 * 10 ** -decimals + 1e-9;
  }

  /**
   * The numeric tokens of a rendered report outside the words that are not measurements: the leaderboard's Rank cells
   * (positions) and every name in `names` (the plan's name, candidate and feature names, which may contain digits).
   */
  public static NumericTokens(markdown: string, names: readonly string[]): string[] {
    let text = markdown.split('\n').map((line) => line.replace(/^\| \d+ \|/, '|')).join('\n');
    for (const name of [...names].filter((n) => n.length > 0).sort((a, b) => b.length - a.length)) text = text.split(name).join(' ');
    return text.match(/-?\d[\d,]*(?:\.\d+)?%?/g) || [];
  }

  /** The model row a report reads; throws when it is missing. */
  private static async modelRow(h: TruthHarness, modelId: string): Promise<ReportModelRow> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<ReportModelRow>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'FeatureImportance', 'Lineage', 'Status'], ResultType: 'simple', BypassCache: true }, h.User);
    const row = r.Results[0];
    if (!r.Success || !row) throw new Error(`reading ML Model ${modelId}: ${r.ErrorMessage || 'no row'}`);
    return row;
  }
}
