/**
 * G0.6's LLM judge: chunks the texts G0.6 collects, calibrates the judge on a full-size chunk with a causal control
 * planted in it, and grades every chunk against the no-causal-claims criteria through MJ's llm-judge oracle.
 */
import type { MJTestEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { LLMJudgeOracle } from '@memberjunction/testing-engine';
import type { OracleResult } from '@memberjunction/testing-engine-base';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';

/** One criterion the judge did not pass, with its reasoning. */
export interface PsGateJudgeFailedCriterion {
  Criterion: string;
  Rationale: string;
}

/** What one judgment reports: pass/fail, the judge's message, and every criterion it failed with the rationale. */
export interface PsGateJudgeVerdict {
  Passed: boolean;
  Detail: string;
  FailedCriteria: PsGateJudgeFailedCriterion[];
}

/** A labelled group of texts the judge grades in one judgment (a source file's texts, or the stories). */
export interface PsGateJudgeChunk {
  Label: string;
  Texts: string[];
}

/** What a full judging reports: pass/fail and one sentence naming the calibration result or each failing chunk. */
export interface PsGateJudgement {
  Passed: boolean;
  Detail: string;
  ChunksJudged: number;
  FailedChunks: string[];
}

/** One judgment of `texts`: the LLM judge in a run, a fake in a unit test. */
export type PsGateJudgeFn = (texts: string[]) => Promise<OracleResult>;

/** One criterion row of the llm-judge oracle's inline `details.Criteria`. */
interface JudgeCriterionDetail {
  Name: string;
  NormalizedScore?: number | null;
  GateFailed?: boolean;
  Rationale?: string;
}

/**
 * G0.6's judge: an LLM grades text against "no causal claims" criteria (replaces the regex phrase list). Texts are
 * judged in chunks (one source file, at most {@link PsGateJudge.MaxTextsPerChunk} texts, per judgment) after a
 * calibration chunk the judge must fail: the largest real chunk with {@link PsGateJudge.CalibrationControl} planted in
 * it, so the judge is shown to find one causal sentence among as many benign texts as a real judgment holds.
 */
export class PsGateJudge {
  /** The criteria every judged text must meet. */
  public static readonly Criteria: ReadonlyArray<string> = [
    'Any statement about a feature describes it only as associated with the outcome or weighted by the model.',
    'Makes no claim that changing a feature changes the outcome.',
    'Gives no advice to act on a feature in order to change the outcome.',
  ];

  /** What the judge is told the texts are (the trace's Expected section). */
  public static readonly Framing =
    'These texts are UI labels and LLM prompt instructions from Predictive Studio, a tool that trains predictive models ' +
    'and shows which features a model weighted. An instruction that tells the model not to use causal wording is ' +
    'compliant. "Increases Risk" and "Lowers Risk" are labels for the direction of a feature\'s contribution to a ' +
    "model's score, not claims that changing the feature changes the outcome. Text that says nothing about features " +
    'meets every criterion.';

  /** A plainly causal sentence: a calibrated judge fails a chunk that holds it. */
  public static readonly CalibrationControl = "Turning on AutoRenew will reduce this member's churn, so enable it to keep them.";

  /** The most texts one judgment grades. */
  public static readonly MaxTextsPerChunk = 50;

  /** The LLM judge, with the gate's MJ: Tests row (looked up by `testName`) as the subject. */
  public static async ForContext(ctx: IntegrationCheckContext, testName: string): Promise<PsGateJudgeFn> {
    const test = await PsGateJudge.loadTest(ctx, testName);
    return (texts) => new LLMJudgeOracle().evaluate(
      {
        test, contextUser: ctx.User, provider: ctx.Provider,
        expectedOutput: { context: PsGateJudge.Framing },
        actualOutput: texts.join('\n\n---\n\n'),
      },
      { criteria: [...PsGateJudge.Criteria], strictMode: true },
    );
  }

  /** Each group split into chunks of at most `max` texts; a split group's labels carry `(part i/n)`. */
  public static Chunks(groups: readonly PsGateJudgeChunk[], max: number = PsGateJudge.MaxTextsPerChunk): PsGateJudgeChunk[] {
    return groups.filter((g) => g.Texts.length > 0).flatMap((g) => {
      const n = Math.ceil(g.Texts.length / max);
      return Array.from({ length: n }, (_, i): PsGateJudgeChunk => ({
        Label: n === 1 ? g.Label : `${g.Label} (part ${i + 1}/${n})`,
        Texts: g.Texts.slice(i * max, (i + 1) * max),
      }));
    });
  }

  /**
   * The calibration chunk: the largest chunk's texts (at most {@link PsGateJudge.MaxTextsPerChunk} - 1 of them) with the
   * causal control planted in the middle; the control alone when there are no chunks. The unplanted chunk is judged
   * with the others, so a failure caused by its real texts fails the gate instead of passing as calibration.
   */
  public static CalibrationChunk(chunks: readonly PsGateJudgeChunk[]): string[] {
    const largest = chunks.reduce<readonly string[]>((best, c) => (c.Texts.length > best.length ? c.Texts : best), []);
    const texts = largest.slice(0, PsGateJudge.MaxTextsPerChunk - 1);
    const at = Math.floor(texts.length / 2);
    return [...texts.slice(0, at), PsGateJudge.CalibrationControl, ...texts.slice(at)];
  }

  /**
   * Judge the calibration chunk (the judge must fail it on a criterion), then every chunk. Passes only when the judge
   * is calibrated and every chunk passes; Detail names each failing chunk with its failed criteria and rationale.
   */
  public static async JudgeAll(chunks: readonly PsGateJudgeChunk[], judge: PsGateJudgeFn): Promise<PsGateJudgement> {
    const calibration = PsGateJudge.CalibrationChunk(chunks);
    const control = PsGateJudge.Verdict(await judge(calibration));
    if (control.Passed || control.FailedCriteria.length === 0) {
      return {
        Passed: false,
        Detail: `judge calibration failed: the ${calibration.length}-text chunk holding the causal control was not failed on a criterion (${control.Detail})`,
        ChunksJudged: 0,
        FailedChunks: [],
      };
    }
    const failures: string[] = [];
    for (const chunk of chunks) {
      const v = PsGateJudge.Verdict(await judge(chunk.Texts));
      if (!v.Passed) failures.push(`${chunk.Label}: ${v.Detail}`);
    }
    return {
      Passed: failures.length === 0,
      Detail: failures.length === 0 ? `${chunks.length} of ${chunks.length} chunks pass` : `${failures.length} of ${chunks.length} chunks fail — ${failures.join(' | ')}`,
      ChunksJudged: chunks.length,
      FailedChunks: failures,
    };
  }

  /** The outcome of one judgment: it passes only when the oracle passed; a failure carries each failed criterion's rationale. */
  public static Verdict(result: OracleResult): PsGateJudgeVerdict {
    const failed = PsGateJudge.criteriaOf(result.details)
      .filter((c) => c.GateFailed === true || c.NormalizedScore !== 1)
      .map((c): PsGateJudgeFailedCriterion => ({ Criterion: c.Name, Rationale: c.Rationale || 'no rationale given' }));
    const passed = result.passed === true;
    const detail = passed || failed.length === 0
      ? result.message
      : `${result.message}; failed: ${failed.map((f) => `"${f.Criterion}" (${f.Rationale})`).join('; ')}`;
    return { Passed: passed, Detail: detail, FailedCriteria: passed ? [] : failed };
  }

  /**
   * The criterion rows of an llm-judge result's details. `unknown` because `OracleResult.details` is oracle-specific
   * (EngineBase types it `unknown`); every field is narrowed before it is read.
   */
  private static criteriaOf(details: unknown): JudgeCriterionDetail[] {
    if (typeof details !== 'object' || details === null || !('Criteria' in details) || !Array.isArray(details.Criteria)) return [];
    const rows: unknown[] = details.Criteria;
    return rows.flatMap((row): JudgeCriterionDetail[] => {
      if (typeof row !== 'object' || row === null || !('Name' in row) || typeof row.Name !== 'string') return [];
      return [{
        Name: row.Name,
        NormalizedScore: 'NormalizedScore' in row && typeof row.NormalizedScore === 'number' ? row.NormalizedScore : null,
        GateFailed: 'GateFailed' in row && row.GateFailed === true,
        Rationale: 'Rationale' in row && typeof row.Rationale === 'string' ? row.Rationale : undefined,
      }];
    });
  }

  private static async loadTest(ctx: IntegrationCheckContext, name: string): Promise<MJTestEntity> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTestEntity>(
      { EntityName: 'MJ: Tests', ExtraFilter: `Name = '${EscapeSQLString(name)}'`, ResultType: 'entity_object' }, ctx.User);
    if (!r.Success || r.Results.length !== 1) throw new Error(`MJ: Tests '${name}' not found: ${r.ErrorMessage || `${r.Results.length} rows`}`);
    return r.Results[0];
  }
}
