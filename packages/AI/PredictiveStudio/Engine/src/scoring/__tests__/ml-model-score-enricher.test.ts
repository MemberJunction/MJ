import { describe, it, expect } from 'vitest';

import { MLModelScoreEnricher } from '../ml-model-score-enricher';
import type {
    IScoreRecordSetRunner,
    ScoreRecordSetRequest,
    ScoreRecordSetResult,
} from '../../actions/score-record-set.action';

/** A test enricher whose scorer is a deterministic fake — no DB / sidecar. */
class FakeRunnerEnricher extends MLModelScoreEnricher {
    constructor(
        private readonly result: ScoreRecordSetResult,
        public readonly captured: { request?: ScoreRecordSetRequest } = {},
    ) {
        super();
    }
    protected override createRunner(): IScoreRecordSetRunner {
        return {
            run: async (request: ScoreRecordSetRequest): Promise<ScoreRecordSetResult> => {
                this.captured.request = request;
                return this.result;
            },
        };
    }
}

function resultWith(predictions: ScoreRecordSetResult['predictions']): ScoreRecordSetResult {
    return {
        scoredCount: predictions?.length ?? 0,
        failedCount: 0,
        skippedCount: 0,
        wroteBack: false,
        predictions,
    };
}

describe('MLModelScoreEnricher', () => {
    it('appends the numeric score to each row, joined by primary key', async () => {
        const enricher = new FakeRunnerEnricher(resultWith([
            { recordId: 'a', score: 0.9 },
            { recordId: 'b', score: 0.1 },
        ]));
        const rows = [{ ID: 'a', Name: 'X' }, { ID: 'b', Name: 'Y' }];
        const out = await enricher.EnrichResults({ rows, config: { modelId: 'M1', outputField: 'RenewalScore' } });
        expect(out[0].RenewalScore).toBe(0.9);
        expect(out[1].RenewalScore).toBe(0.1);
    });

    it("passes the rows' primary keys as the records scope and requests NO write-back (ephemeral)", async () => {
        const enricher = new FakeRunnerEnricher(resultWith([]));
        await enricher.EnrichResults({ rows: [{ ID: 'a' }, { ID: 'b' }], config: { modelId: 'M1', outputField: 'S' } });
        expect(enricher.captured.request?.modelId).toBe('M1');
        expect(enricher.captured.request?.scope.records).toEqual(['a', 'b']);
        expect(enricher.captured.request?.writeBack).toBeUndefined();
    });

    it('leaves rows without a matching prediction untouched', async () => {
        const enricher = new FakeRunnerEnricher(resultWith([{ recordId: 'a', score: 0.5 }]));
        const rows = [{ ID: 'a' }, { ID: 'b' }];
        const out = await enricher.EnrichResults({ rows, config: { modelId: 'M', outputField: 'S' } });
        expect(out[0].S).toBe(0.5);
        expect('S' in out[1]).toBe(false);
    });

    it("writes the class label when valueKind='class'", async () => {
        const enricher = new FakeRunnerEnricher(resultWith([{ recordId: 'a', score: 0.8, class: 'Renewed' }]));
        const out = await enricher.EnrichResults({ rows: [{ ID: 'a' }], config: { modelId: 'M', outputField: 'Pred', valueKind: 'class' } });
        expect(out[0].Pred).toBe('Renewed');
    });

    it('honors a custom primaryKeyField', async () => {
        const enricher = new FakeRunnerEnricher(resultWith([{ recordId: 'm-1', score: 0.3 }]));
        const out = await enricher.EnrichResults({ rows: [{ MemberID: 'm-1' }], config: { modelId: 'M', outputField: 'S', primaryKeyField: 'MemberID' } });
        expect(enricher.captured.request?.scope.records).toEqual(['m-1']);
        expect(out[0].S).toBe(0.3);
    });

    it('returns the rows unchanged (and never scores) when config lacks modelId/outputField', async () => {
        const enricher = new FakeRunnerEnricher(resultWith([{ recordId: 'a', score: 1 }]));
        const rows = [{ ID: 'a' }];
        const out = await enricher.EnrichResults({ rows, config: { outputField: 'S' } });
        expect(out).toBe(rows);
        expect('S' in out[0]).toBe(false);
        expect(enricher.captured.request).toBeUndefined();
    });

    it('returns rows unchanged when there are no primary keys to score', async () => {
        const enricher = new FakeRunnerEnricher(resultWith([{ recordId: 'a', score: 1 }]));
        const out = await enricher.EnrichResults({ rows: [{ Name: 'no-id' }], config: { modelId: 'M', outputField: 'S' } });
        expect('S' in out[0]).toBe(false);
        expect(enricher.captured.request).toBeUndefined();
    });
});
