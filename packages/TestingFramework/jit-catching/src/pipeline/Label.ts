import { GroupByUUID, IndexByUUID, UUIDsEqual } from '@memberjunction/global';
import { FileCatchStore } from '../store/FileCatchStore';
import type { RedactionCheck } from '../sandbox/Redaction';
import type { CandidateTest, Catch, ExecutionResult, FailureDetail, FeedbackAnswer, Run } from '../types';
import { RunDir } from './RunDir';

/** The answers a PR author can give in a label. */
export const LABEL_ANSWERS = ['Bug', 'Intended', 'TestFault'] as const;
export type LabelAnswer = (typeof LABEL_ANSWERS)[number];

/** True when `answer` is one of the label answers. */
export function IsLabelAnswer(answer: string): answer is LabelAnswer { return LABEL_ANSWERS.some((a) => a === answer); }

/**
 * Appends Feedback { CatchID, User, Answer, Source: 'Label', At: now }. Answer must be Bug, Intended or TestFault.
 * Throws when the catch is not in the store.
 */
export async function LabelCatch(o: { StoreDir: string; CatchID: string; Answer: FeedbackAnswer; User: string; Redaction: RedactionCheck; Now?: () => Date }): Promise<void> {
    if (!IsLabelAnswer(o.Answer)) throw new Error(`a label answer must be Bug, Intended or TestFault, not ${o.Answer}`);
    const store = new FileCatchStore(o.StoreDir, o.Redaction);
    const found = await findCatch(store, o.CatchID);
    if (!found) throw new Error(`catch ${o.CatchID} is not in the store`);
    const at = (o.Now ?? (() => new Date()))().toISOString();
    await store.SaveFeedback({ CatchID: found.ID, User: o.User, Answer: o.Answer, Source: 'Label', At: at });
}

/** The catch with this ID in any run of the store, or null. */
async function findCatch(store: FileCatchStore, catchID: string): Promise<Catch | null> {
    const catches: Catch[] = [];
    for (const run of await store.ListRuns()) catches.push(...await store.ListCatches(run.ID));
    return catches.find((c) => UUIDsEqual(c.ID, catchID)) ?? null;
}

/**
 * Markdown for one run: for each weak, non-dropped catch — PR, test file and source, head failure (message, expected, actual),
 * judges' buckets and reasons, and the exact `jit-catch label` command for each answer. Throws when the text fails the redaction check.
 */
export async function LabelPacket(o: { StoreDir: string; RepoRoot: string; RunID: string; Redaction: RedactionCheck }): Promise<string> {
    const store = new FileCatchStore(o.StoreDir, o.Redaction);
    const run = await store.GetRun(o.RunID);
    if (!run) throw new Error(`run ${o.RunID} is not in the store`);
    const catches = (await store.ListCatches(o.RunID)).filter(IsWeakUndropped).sort(byRank);
    const dir = new RunDir(o.RepoRoot, o.RunID, o.Redaction);
    const tests = IndexByUUID(catches.length > 0 ? dir.ReadGeneration().Tests : []);
    const head = GroupByUUID(catches.length > 0 ? dir.ReadExecution().Results.filter((r) => r.Revision === 'Head') : [], (r) => r.CandidateTestID);
    const sections = catches.map((c) => catchSection(c, tests.Get(c.CandidateTestID) ?? null, head.Get(c.CandidateTestID) ?? []));
    const text = [packetHeader(run, catches.length), ...sections].join('\n');
    o.Redaction.AssertClean(text, `label packet for run ${o.RunID}`);
    return text;
}

/** True for a weak catch that no drop rule removed. */
export function IsWeakUndropped(c: Catch): boolean { return c.Verdict.Label === 'WeakCatch' && c.DroppedByRule === null; }

/** Ranked catches first in rank order, unranked catches last. */
function byRank(a: Catch, b: Catch): number { return (a.Rank ?? Number.MAX_SAFE_INTEGER) - (b.Rank ?? Number.MAX_SAFE_INTEGER); }

function packetHeader(run: Run, count: number): string {
    const pr = run.PRNumber !== null ? `PR #${run.PRNumber}` : 'no PR';
    return `# Label packet: ${pr}, head ${run.HeadSHA.slice(0, 12)}\n\nRun \`${run.ID}\`. ${count} weak catch${count === 1 ? '' : 'es'} to label. ` +
        'For each catch, answer Bug (the PR broke something), Intended (the PR meant to change this) or TestFault (the test is wrong).\n';
}

/** One catch: its test, its first head failure, the judges' answers and the three label commands. */
function catchSection(c: Catch, test: CandidateTest | null, head: ExecutionResult[]): string {
    const failure = head.find((r) => r.Failure !== null)?.Failure ?? null;
    return [
        `## Catch ${c.ID}`, '',
        `- Test file: ${test ? `\`${test.FilePath}\`` : '(not found in the run folder)'}`, '',
        ...(test ? [fenced(test.Source, 'ts'), ''] : []),
        '### Head failure', '', ...failureLines(failure), '',
        '### Judges', '', ...judgeLines(c), '',
        '### Label commands', '', fenced(LABEL_ANSWERS.map((a) => `jit-catch label --catch ${c.ID} --answer ${a} --user <login>`).join('\n'), 'sh'), '',
    ].join('\n');
}

function failureLines(f: FailureDetail | null): string[] {
    if (!f) return ['(no head failure recorded)'];
    return [`- Expected: ${inline(f.Expected)}`, `- Actual: ${inline(f.Actual)}`, '- Message:', '', fenced(f.Message, 'text')];
}

function judgeLines(c: Catch): string[] {
    if (c.JudgeBuckets.length === 0) return ['(no judge answers)'];
    return c.JudgeBuckets.map((j) => `- ${j.Model}: ${j.Bucket ?? 'error'} — ${j.Reason.replace(/\s+/g, ' ').trim()}`);
}

/** A value on one line as inline code, or `(none)` when null. */
function inline(value: string | null): string {
    if (value === null) return '(none)';
    const tick = '`'.repeat(longestTickRun(value) + 1);
    return `${tick} ${value.replace(/\s+/g, ' ')} ${tick}`;
}

/** A fenced code block whose fence is longer than any backtick run in `text`. */
function fenced(text: string, lang: string): string {
    const fence = '`'.repeat(Math.max(3, longestTickRun(text) + 1));
    return `${fence}${lang}\n${text}\n${fence}`;
}

function longestTickRun(text: string): number { return Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length)); }
