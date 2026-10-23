import type { MJTestEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { LLMJudgeOracle } from '@memberjunction/testing-engine';
import type { OracleResult } from '@memberjunction/testing-engine-base';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';

/** What a judged gate half reports: pass/fail and the judge's own message. */
export interface PsGateJudgeVerdict {
  Passed: boolean;
  Detail: string;
}

/** G0.6's judge: an LLM grades text against "no causal claims" criteria (replaces the regex phrase list). */
export class PsGateJudge {
  /** The criteria every judged text must meet. */
  public static readonly Criteria: ReadonlyArray<string> = [
    'Describes features only as associated with the outcome or weighted by the model.',
    'Makes no claim that changing a feature changes the outcome.',
    'Gives no advice to act on a feature in order to change the outcome.',
  ];

  /** Grade `texts` (one judgment over all of them) with the gate's MJ: Tests row as the subject. */
  public static async NoCausalClaims(ctx: IntegrationCheckContext, texts: string[], testName: string): Promise<OracleResult> {
    const test = await PsGateJudge.loadTest(ctx, testName);
    return new LLMJudgeOracle().evaluate(
      { test, actualOutput: texts.join('\n\n---\n\n'), contextUser: ctx.User, provider: ctx.Provider },
      { criteria: [...PsGateJudge.Criteria], strictMode: true },
    );
  }

  /** The gate outcome for an oracle result: it passes only when the oracle passed, and reports the oracle's message. */
  public static Verdict(result: OracleResult): PsGateJudgeVerdict {
    return { Passed: result.passed === true, Detail: result.message };
  }

  private static async loadTest(ctx: IntegrationCheckContext, name: string): Promise<MJTestEntity> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTestEntity>(
      { EntityName: 'MJ: Tests', ExtraFilter: `Name = '${EscapeSQLString(name)}'`, ResultType: 'entity_object' }, ctx.User);
    if (!r.Success || r.Results.length !== 1) throw new Error(`MJ: Tests '${name}' not found: ${r.ErrorMessage || `${r.Results.length} rows`}`);
    return r.Results[0];
  }
}
