/**
 * `HarnessScoring.AttemptOf` reads a refused or failed Score Record Set call from its result code and message: the
 * scoring run the message names and, for a failed run, the "N of M records failed" counts. The message is server text,
 * so the parse must stay linear on any input (CodeQL js/polynomial-redos on the counts pattern).
 */
import { describe, it, expect } from 'vitest';
import type { RemoteOpResult } from '@memberjunction/core';
import type { PredictiveStudioScoreRecordSetOutput } from '@memberjunction/core-entities';
import { HarnessScoring } from '../score';

/**
 * Wall-clock ceiling for the pathological-input check (200k digits). It guards against catastrophic backtracking
 * (seconds), not machine speed: tight bounds fail on the publish gate's single shared runner.
 */
const PATHOLOGICAL_INPUT_CEILING_MS = 2000;

const RUN_ID = '8983F416-CF3E-4DC5-A6CD-8867C5383B50';

function failed(message: string): RemoteOpResult<PredictiveStudioScoreRecordSetOutput> {
  return { Success: false, ResultCode: 'SCORING_RUN_FAILED', ErrorMessage: message };
}

describe('HarnessScoring.AttemptOf', () => {
  it('reads the scoring run and the failed counts of a failed run', () => {
    const attempt = HarnessScoring.AttemptOf(failed(`scoring run ${RUN_ID} failed: 3 of 10 records failed`), 5);
    expect(attempt).toMatchObject({ Ok: false, ScoringRunID: RUN_ID, Status: 'failed', Failed: 3, Total: 10, Written: 0 });
  });

  it('reads no counts from a message without them', () => {
    const attempt = HarnessScoring.AttemptOf(failed(`scoring run ${RUN_ID} failed: the sidecar is unreachable`), 5);
    expect(attempt).toMatchObject({ ScoringRunID: RUN_ID, Failed: 0, Total: 0 });
  });

  it('parses a message holding a long run of digits in linear time', () => {
    const message = `scoring run ${RUN_ID} failed: ${'0'.repeat(200_000)} of`;
    const start = performance.now();
    const attempt = HarnessScoring.AttemptOf(failed(message), 5);
    const elapsedMs = performance.now() - start;
    expect(attempt.Failed).toBe(0);
    expect(elapsedMs).toBeLessThan(PATHOLOGICAL_INPUT_CEILING_MS);
  });
});
