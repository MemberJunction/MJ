import type { GitHub, MergedPullRequest, MergedPullRequestDetail } from '../git/GitHub';
import type { GitRepo } from '../git/GitRepo';
import type { PackageMap } from '../analyzer/PackageMap';
import type { DiffHunk } from '../types';
import { ParseUnifiedDiff } from '../git/DiffParser';

export interface CleanCandidate { PR: number; MergeSHA: string; MergedAt: string; Title: string; Files: string[]; }
export interface BugCandidate { FixPR: number; FixMergeSHA: string; FixTitle: string; BugPR: number; BugMergeSHA: string; BugTitle: string; BlamedLines: number; Files: string[]; }
export interface MinerDeps {
    GitHub: Pick<GitHub, 'ListMergedPullRequests' | 'GetMergedPullRequest'>;
    Repo: Pick<GitRepo, 'LaterCommitsTouching' | 'BlameFirstParent' | 'Diff' | 'FirstParent' | 'Subject'>;
    PackageMap: Pick<PackageMap, 'PackageForPath'>;
}
export interface LineRange { Start: number; End: number; }
interface Window { Since: string; Until: string; }

/** `gh pr view --json files` caps the list at 100 entries, so a PR with this many files is treated as too large. */
const MAX_FILES = 100;
const FIX_TITLE_RE = /^fix[(:!]/i;
const MERGE_SUBJECT_RE = /^Merge pull request #(\d+) from /;
const SQUASH_SUBJECT_RE = /\(#(\d+)\)\s*$/;
/** GitHub errors that mean the number is not a merged pull request: not merged yet, or an issue number. */
const NOT_A_MERGED_PR_RE = /is not merged|Could not resolve to a PullRequest/;

/** True for packages/<X>/src/**.ts that is not a test file and whose package has vitest. */
export function IsEligibleSource(path: string, map: Pick<PackageMap, 'PackageForPath'>): boolean {
    if (!/^packages\/.+\/src\/.+\.ts$/.test(path) || /\.(test|spec|d)\.ts$/.test(path) || path.includes('/__tests__/')) return false;
    const pkg = map.PackageForPath(path);
    return pkg !== null && pkg.HasVitest && path.startsWith(`${pkg.Dir}/src/`);
}

/** PR number from a landing commit subject: "Merge pull request #n from …" or a trailing "(#n)"; null otherwise. */
export function PullRequestNumberOf(subject: string): number | null {
    const m = MERGE_SUBJECT_RE.exec(subject) ?? SQUASH_SUBJECT_RE.exec(subject);
    return m ? Number(m[1]) : null;
}

/** Old-side line ranges of each run of removed (`-`) lines, per file. A `\\ No newline at end of file` marker is not a line. */
export function RemovedRangesByFile(hunks: DiffHunk[]): Record<string, LineRange[]> {
    const out: Record<string, LineRange[]> = {};
    for (const h of hunks) {
        let n = h.OldStart; let run: LineRange | null = null;
        for (const l of h.Lines) {
            if (l.startsWith('+') || l.startsWith('\\')) continue;
            if (l.startsWith('-')) {
                if (run) run.End = n; else { run = { Start: n, End: n }; (out[h.Path] ??= []).push(run); }
            } else run = null;
            n++;
        }
    }
    return out;
}

/** Calendar-month windows covering Since..Until (YYYY-MM-DD), both ends inclusive. */
export function MonthWindows(w: Window): Window[] {
    const out: Window[] = [];
    let since = w.Since;
    while (since <= w.Until) {
        const [y, m] = since.split('-').map(Number);
        const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        out.push({ Since: since, Until: monthEnd < w.Until ? monthEnd : w.Until });
        since = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    }
    return out;
}

/** Merged PRs in the window, listed month by month and de-duplicated by number. */
async function listWindow(d: MinerDeps, w: Window): Promise<MergedPullRequest[]> {
    const byNumber = new Map<number, MergedPullRequest>();
    for (const month of MonthWindows(w)) {
        for (const p of await d.GitHub.ListMergedPullRequests(month)) if (!byNumber.has(p.Number)) byNumber.set(p.Number, p);
    }
    return [...byNumber.values()];
}

/** The PR's eligible source files, or null when it has none or is too large to list in full. */
function eligibleFiles(pr: MergedPullRequestDetail, map: Pick<PackageMap, 'PackageForPath'>): string[] | null {
    if (pr.Files.length >= MAX_FILES) return null;
    const files = pr.Files.filter((f) => IsEligibleSource(f, map));
    return files.length > 0 ? files : null;
}

/** Per-run memo of GitHub PR lookups and blame results, so PRs and fixes shared across candidates are resolved once. */
interface MineCache { PullRequests: Map<number, MergedPullRequestDetail | null>; BlamedLines: Map<string, Map<number, number>>; }
function newCache(): MineCache { return { PullRequests: new Map(), BlamedLines: new Map() }; }

/** Merged PRs in the window that changed eligible source and none of whose lines a later fix PR's landing commit on origin/next removed. */
export async function MineClean(d: MinerDeps, window: Window): Promise<CleanCandidate[]> {
    const cache = newCache();
    const out: CleanCandidate[] = [];
    for (const p of await listWindow(d, window)) {
        const files = eligibleFiles(await d.GitHub.GetMergedPullRequest(p.Number), d.PackageMap);
        if (!files || (await laterFixRemovedLinesOf(d, cache, p, files))) continue;
        out.push({ PR: p.Number, MergeSHA: p.MergeSHA, MergedAt: p.MergedAt, Title: p.Title, Files: files });
    }
    return out;
}

/** True when a later landing commit touching `files` belongs to a fix PR and removed a line that blames to `p`. */
async function laterFixRemovedLinesOf(d: MinerDeps, cache: MineCache, p: MergedPullRequest, files: string[]): Promise<boolean> {
    for (const sha of await d.Repo.LaterCommitsTouching(p.MergeSHA, files)) {
        const n = PullRequestNumberOf(await d.Repo.Subject(sha));
        if (n === null || n === p.Number) continue;
        const fix = await cachedPullRequest(d, cache, n);
        if (!fix || !FIX_TITLE_RE.test(fix.Title)) continue;
        if ((await cachedBlamedLines(d, cache, sha)).has(p.Number)) return true;
    }
    return false;
}

async function cachedPullRequest(d: MinerDeps, cache: MineCache, n: number): Promise<MergedPullRequestDetail | null> {
    if (!cache.PullRequests.has(n)) cache.PullRequests.set(n, await mergedPullRequestOrNull(d, n));
    return cache.PullRequests.get(n) ?? null;
}

async function cachedBlamedLines(d: MinerDeps, cache: MineCache, landingSHA: string): Promise<Map<number, number>> {
    let counts = cache.BlamedLines.get(landingSHA);
    if (!counts) { counts = await blamedLinesByPR(d, landingSHA); cache.BlamedLines.set(landingSHA, counts); }
    return counts;
}

/** For each fix PR (title /^fix[(:!]/i) in the window: blame the lines its diff removed at the fix's parent, map the landing commits to PRs, keep the PR with the most blamed lines when it changed eligible source. */
export async function MineBugs(d: MinerDeps, window: Window): Promise<BugCandidate[]> {
    const out: BugCandidate[] = [];
    for (const fix of (await listWindow(d, window)).filter((p) => FIX_TITLE_RE.test(p.Title))) {
        const bug = await bugFor(d, fix);
        if (bug) out.push(bug);
    }
    return out;
}

/** The bug candidate for one fix PR, or null when no eligible introducing PR is found. */
async function bugFor(d: MinerDeps, fix: MergedPullRequest): Promise<BugCandidate | null> {
    const counts = await blamedLinesByPR(d, fix.MergeSHA);
    counts.delete(fix.Number);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (!top) return null;
    const bug = await mergedPullRequestOrNull(d, top[0]);
    const files = bug && eligibleFiles(bug, d.PackageMap);
    if (!bug || !files) return null;
    return { FixPR: fix.Number, FixMergeSHA: fix.MergeSHA, FixTitle: fix.Title, BugPR: bug.Number, BugMergeSHA: bug.MergeSHA, BugTitle: bug.Title, BlamedLines: top[1], Files: files };
}

/** The merged PR `n`, or null when GitHub says it is not merged or not a pull request; other errors propagate. */
async function mergedPullRequestOrNull(d: MinerDeps, n: number): Promise<MergedPullRequestDetail | null> {
    try { return await d.GitHub.GetMergedPullRequest(n); }
    catch (e) { if (e instanceof Error && NOT_A_MERGED_PR_RE.test(e.message)) return null; throw e; }
}

/** Blamed-line counts per PR for the eligible source lines the fix removed, blamed at the fix's first parent. */
async function blamedLinesByPR(d: MinerDeps, fixMergeSHA: string): Promise<Map<number, number>> {
    const parent = await d.Repo.FirstParent(fixMergeSHA);
    const ranges = RemovedRangesByFile(ParseUnifiedDiff(await d.Repo.Diff(parent, fixMergeSHA, [], { NoRenames: true })));
    const shaCounts = new Map<string, number>();
    for (const [path, r] of Object.entries(ranges)) {
        if (!IsEligibleSource(path, d.PackageMap)) continue;
        for (const sha of await d.Repo.BlameFirstParent(parent, path, r)) shaCounts.set(sha, (shaCounts.get(sha) ?? 0) + 1);
    }
    const prCounts = new Map<number, number>();
    for (const [sha, n] of shaCounts) {
        const pr = PullRequestNumberOf(await d.Repo.Subject(sha));
        if (pr !== null) prCounts.set(pr, (prCounts.get(pr) ?? 0) + n);
    }
    return prCounts;
}
