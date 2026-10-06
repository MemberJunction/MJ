import { describe, it, expect } from 'vitest';
import { RuntimeSchemaManager } from '../RuntimeSchemaManager.js';
import type { RSUPipelineBatchResult, RSUPipelineResult } from '../RuntimeSchemaManager.js';

/**
 * The terminal `run.end` event an observer receives. Getting this wrong has a specific, bad
 * failure mode: a run that never receives run.end stays "in flight" forever in whatever the
 * observer is feeding — which is exactly what happens if a throw escapes the pipeline and the
 * mapping doesn't handle a missing result.
 */
function item(over: Partial<RSUPipelineResult> = {}): RSUPipelineResult {
    return {
        Success: true,
        APIRestarted: false,
        GitCommitSuccess: false,
        Steps: [],
        ...over,
    };
}

function batch(results: RSUPipelineResult[]): RSUPipelineBatchResult {
    const SuccessCount = results.filter(r => r.Success).length;
    return {
        Results: results,
        SuccessCount,
        FailureCount: results.length - SuccessCount,
        TotalCount: results.length,
    };
}

describe('RuntimeSchemaManager.BuildRunEndEvent', () => {
    it('reports success when every migration in the batch succeeded', () => {
        const e = RuntimeSchemaManager.BuildRunEndEvent(batch([item(), item()]), 2);

        expect(e.Kind).toBe('run.end');
        expect(e.Success).toBe(true);
        expect(e.SuccessCount).toBe(2);
        expect(e.FailureCount).toBe(0);
        expect(e.TotalCount).toBe(2);
        expect(e.ErrorMessage).toBeUndefined();
        expect(e.ErrorStep).toBeUndefined();
    });

    it('reports failure and names the first failing step when ANY migration failed', () => {
        // Partial success is still a failed run — a batch where one migration didn't apply must not
        // be reported as green just because the others did.
        const e = RuntimeSchemaManager.BuildRunEndEvent(
            batch([
                item(),
                item({ Success: false, ErrorMessage: 'FK violation on Orders', ErrorStep: 'ExecuteMigration' }),
            ]),
            2,
        );

        expect(e.Success).toBe(false);
        expect(e.SuccessCount).toBe(1);
        expect(e.FailureCount).toBe(1);
        expect(e.ErrorMessage).toBe('FK violation on Orders');
        expect(e.ErrorStep).toBe('ExecuteMigration');
    });

    it('surfaces the FIRST failure, not the last, when several failed', () => {
        const e = RuntimeSchemaManager.BuildRunEndEvent(
            batch([
                item({ Success: false, ErrorMessage: 'first', ErrorStep: 'ValidateSQL' }),
                item({ Success: false, ErrorMessage: 'second', ErrorStep: 'ExecuteMigration' }),
            ]),
            2,
        );

        expect(e.ErrorMessage).toBe('first');
        expect(e.ErrorStep).toBe('ValidateSQL');
    });

    it('still produces a FAILED run.end when the pipeline threw before producing a result', () => {
        // Without this, an observer's run would never terminate.
        const e = RuntimeSchemaManager.BuildRunEndEvent(undefined, 3);

        expect(e.Success).toBe(false);
        expect(e.SuccessCount).toBe(0);
        expect(e.FailureCount).toBe(3);
        expect(e.TotalCount).toBe(3);
        expect(e.ErrorMessage).toMatch(/threw/i);
    });
});

describe('RuntimeSchemaManager.PipelineObserver', () => {
    it('defaults to null so an unobserved pipeline pays nothing', () => {
        // The observer is opt-in; a process that never registers one (CLI, tests) must be unaffected.
        expect(RuntimeSchemaManager.Instance.PipelineObserver).toBeNull();
    });
});
