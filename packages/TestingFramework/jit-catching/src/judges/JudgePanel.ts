import { GetConsensus } from '@memberjunction/rubrics';
import { UNTRUSTED_OPEN, UNTRUSTED_CLOSE } from '../analyzer/ChangeAnalyzer';
import type { BaseCatchJudge } from '../contracts/BaseCatchJudge';
import type { Bucket, CatchContext, JudgeBucket, JudgeScore } from '../types';

const MARKER_RE = /<<<[^>]*>>>/g;
const MARKER_PLACEHOLDER = '[marker removed]';

/** Score of each bucket: High 1, Medium 0, Low −1. */
export const BUCKET_SCORE: Record<Bucket, number> = { High: 1, Medium: 0, Low: -1 };

/** The panel's result for one weak catch. */
export interface PanelResult { TPProb: number | null; Buckets: JudgeBucket[]; Median: Bucket | null; }

/** Replaces every `<<<...>>>` marker in text, so the text cannot open or close an untrusted block. */
function neutralise(text: string | null | undefined): string { return (text ?? '').replace(MARKER_RE, MARKER_PLACEHOLDER); }

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
        c.Test.RiskText ? `Risk: ${neutralise(c.Test.RiskText)}` : '',
        c.Test.Mutant ? `Mutant (a deliberate bug that this test detects):\n${neutralise(c.Test.Mutant.Patch).slice(0, 3000)}` : '',
        `Diff:\n${neutralise(diff).slice(0, 40_000)}`,
        [
            UNTRUSTED_OPEN,
            `PR title: ${neutralise(c.Analysis.Title)}`,
            `PR summary: ${neutralise(c.Analysis.Summary)}`,
            `Test:\n${neutralise(c.Test.Source).slice(0, 12_000)}`,
            `Failure on the PR: ${neutralise(h?.Message)}`,
            `Expected: ${neutralise(h?.Expected)}`,
            `Actual: ${neutralise(h?.Actual)}`,
            UNTRUSTED_CLOSE,
        ].join('\n'),
    ].filter(Boolean).join('\n\n');
}

/** Maps a median bucket score back to a bucket: ≥ 0.5 High, ≤ −0.5 Low, otherwise Medium. */
function toBucket(score: number): Bucket { return score >= 0.5 ? 'High' : score <= -0.5 ? 'Low' : 'Medium'; }

/** Runs every judge on one weak catch. The `TpProb` judge gives TP Prob; the others give buckets, combined by median. */
export class JudgePanel {
    constructor(private readonly judges: BaseCatchJudge[]) {}

    /** Never throws: a failed bucket judge counts as Medium with the error as reason; a failed TP Prob judge gives no TP Prob. */
    public async Judge(c: CatchContext): Promise<PanelResult> {
        const all = await Promise.all(this.judges.map(async (j): Promise<JudgeScore | null> => {
            try {
                return await j.Judge(c);
            } catch (e) {
                if (j.Name === 'TpProb') return null;
                return { Judge: j.Name, Model: j.Name, Score: 0, Bucket: 'Medium', Reason: `judge failed: ${e instanceof Error ? e.message : String(e)}` };
            }
        }));
        const scores = all.filter((s): s is JudgeScore => s !== null);
        const tp = scores.find((s) => s.Judge === 'TpProb');
        const buckets: JudgeBucket[] = scores.flatMap((s) => (s.Bucket === null ? [] : [{ Model: s.Model, Bucket: s.Bucket, Reason: s.Reason }]));
        const median = buckets.length ? GetConsensus(buckets.map((b) => BUCKET_SCORE[b.Bucket]), 'Median').Overall : null;
        return { TPProb: tp?.Score ?? null, Buckets: buckets, Median: median === null ? null : toBucket(median) };
    }
}
