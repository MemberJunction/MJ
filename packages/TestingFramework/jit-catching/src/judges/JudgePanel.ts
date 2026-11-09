import { GetConsensus } from '@memberjunction/rubrics';
import { UNTRUSTED_OPEN, UNTRUSTED_CLOSE } from '../analyzer/ChangeAnalyzer';
import { JUDGE_ERROR_PREFIX } from './SafeChat';
import { NeutraliseMarkers } from '../sandbox/Redaction';
import type { BaseCatchJudge } from '../contracts/BaseCatchJudge';
import type { Bucket, CatchContext, JudgeBucket, JudgeScore, TokenUsage } from '../types';

/** Score of each bucket: High 1, Medium 0, Low −1. */
export const BUCKET_SCORE: Record<Bucket, number> = { High: 1, Medium: 0, Low: -1 };

/** The panel's result for one weak catch. `Usage` lists the token usage each judge reported, in judge order. */
export interface PanelResult { TPProb: number | null; Buckets: JudgeBucket[]; Median: Bucket | null; Usage: TokenUsage[]; }

/**
 * §9.2 judge input for one weak catch. PR title, summary, test source and head failure go in one untrusted block;
 * markers are removed from every free-text field.
 */
export function BuildJudgeInput(c: CatchContext): string {
    const h = c.Head[0]?.Failure;
    const diff = c.Analysis.ChangedFiles.flatMap((f) => f.Hunks).map((x) => `--- ${x.Path}\n${x.Lines.join('\n')}`).join('\n');
    return [
        `Intent: ${c.Analysis.IntentType}`,
        `Boosts that fired: ${c.Boosts.join(', ') || 'none'}`,
        c.Test.RiskText ? `Risk: ${NeutraliseMarkers(c.Test.RiskText)}` : '',
        c.Test.Mutant ? `Mutant (a deliberate bug that this test detects):\n${NeutraliseMarkers(c.Test.Mutant.Patch).slice(0, 3000)}` : '',
        `Diff:\n${NeutraliseMarkers(diff).slice(0, 40_000)}`,
        [
            UNTRUSTED_OPEN,
            `PR title: ${NeutraliseMarkers(c.Analysis.Title)}`,
            `PR summary: ${NeutraliseMarkers(c.Analysis.Summary)}`,
            `Test:\n${NeutraliseMarkers(c.Test.Source).slice(0, 12_000)}`,
            `Failure on the PR: ${NeutraliseMarkers(h?.Message)}`,
            `Expected: ${NeutraliseMarkers(h?.Expected)}`,
            `Actual: ${NeutraliseMarkers(h?.Actual)}`,
            UNTRUSTED_CLOSE,
        ].join('\n'),
    ].filter(Boolean).join('\n\n');
}

/** Maps a median bucket score back to a bucket: ≥ 0.5 High, ≤ −0.5 Low, otherwise Medium. */
function toBucket(score: number): Bucket { return score >= 0.5 ? 'High' : score <= -0.5 ? 'Low' : 'Medium'; }

/** The judge's `Model` when it has one, otherwise its `Name`. */
function modelOf(j: BaseCatchJudge): string {
    return 'Model' in j && typeof j.Model === 'string' ? j.Model : j.Name;
}

/** Runs every judge on one weak catch. The `TpProb` judge gives TP Prob; the others give buckets, combined by median. */
export class JudgePanel {
    constructor(private readonly judges: BaseCatchJudge[]) {}

    /**
     * Never throws. A judge that throws, or whose Reason starts with {@link JUDGE_ERROR_PREFIX}, errored:
     * a bucket judge is then recorded with a null Bucket and left out of the median, and the TP Prob judge gives a null TP Prob.
     * The median is null when no bucket judge answered.
     */
    public async Judge(c: CatchContext): Promise<PanelResult> {
        const all = await Promise.all(this.judges.map(async (j): Promise<JudgeScore | null> => {
            try {
                return await j.Judge(c);
            } catch (e) {
                if (j.Name === 'TpProb') return null;
                return { Judge: j.Name, Model: modelOf(j), Score: 0, Bucket: null, Reason: `${JUDGE_ERROR_PREFIX}judge failed: ${e instanceof Error ? e.message : String(e)}` };
            }
        }));
        const scores = all.filter((s): s is JudgeScore => s !== null);
        const errored = (s: JudgeScore): boolean => s.Reason.startsWith(JUDGE_ERROR_PREFIX);
        const tp = scores.find((s) => s.Judge === 'TpProb' && !errored(s));
        const buckets: JudgeBucket[] = scores.filter((s) => s.Judge !== 'TpProb').map((s) => ({ Model: s.Model, Bucket: errored(s) ? null : s.Bucket, Reason: s.Reason }));
        const answered = buckets.flatMap((b) => (b.Bucket === null ? [] : [BUCKET_SCORE[b.Bucket]]));
        const median = answered.length ? GetConsensus(answered, 'Median').Overall : null;
        const usage = scores.flatMap((s) => (s.Usage ? [s.Usage] : []));
        return { TPProb: tp?.Score ?? null, Buckets: buckets, Median: median === null ? null : toBucket(median), Usage: usage };
    }
}
