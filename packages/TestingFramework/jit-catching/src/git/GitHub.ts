import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

const run = promisify(execFile);
const REPO = 'MemberJunction/MJ';
const ViewSchema = z.object({
    number: z.number(), title: z.string(), body: z.string().nullable(), headRefOid: z.string(), baseRefName: z.string(),
    headRepository: z.object({ name: z.string() }), headRepositoryOwner: z.object({ login: z.string() }), author: z.object({ login: z.string() }),
});
export interface PullRequestInfo { Number: number; Title: string; Body: string; HeadSHA: string; BaseRef: string; HeadRepo: string; Author: string; }
const MERGED_LIST_LIMIT = 1000;
const MergedListSchema = z.array(z.object({
    number: z.number(), title: z.string(), mergedAt: z.string(), mergeCommit: z.object({ oid: z.string() }), author: z.object({ login: z.string() }), headRefName: z.string(),
}));
const MergedViewSchema = z.object({
    number: z.number(), title: z.string(), body: z.string().nullable(), mergedAt: z.string().nullable(), mergeCommit: z.object({ oid: z.string() }).nullable(),
    author: z.object({ login: z.string() }), files: z.array(z.object({ path: z.string() })), headRefName: z.string(),
});
export interface MergedPullRequest { Number: number; Title: string; MergedAt: string; MergeSHA: string; Author: string; HeadRef: string; }
export interface MergedPullRequestDetail extends MergedPullRequest { Body: string; Files: string[]; }
/** Wait and warning hooks for `gh` retries. */
export interface GitHubRetryOptions { Sleep?: (ms: number) => Promise<void>; Warn?: (line: string) => void; }

/** Waits before each retry of a failed `gh` command; the attempt count is one more than its length. */
const RETRY_WAITS_MS = [2000, 8000];
/** `gh` failures that are a definitive answer (not merged, not a PR, auth or missing resource), so a retry cannot help. */
const DEFINITIVE_FAILURE_RE = /is not merged|Could not resolve to a PullRequest|gh auth login|HTTP 40[134]/;

/** Reads pull requests through the `gh` CLI, which is logged in locally and preinstalled on runners. */
export class GitHub {
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly warn: (line: string) => void;
    constructor(private readonly runner: (args: string[]) => Promise<string> = ExecRunner(), o: GitHubRetryOptions = {}) {
        this.sleep = o.Sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
        this.warn = o.Warn ?? ((line) => { process.stderr.write(`${line}\n`); });
    }
    public async GetPullRequest(n: number): Promise<PullRequestInfo> {
        const raw = await this.exec(['pr', 'view', String(n), '--repo', REPO, '--json', 'number,title,body,headRefOid,baseRefName,headRepository,headRepositoryOwner,author']);
        const v = ViewSchema.parse(JSON.parse(raw));
        const headRepo = `${v.headRepositoryOwner.login}/${v.headRepository.name}`;
        if (headRepo !== REPO) throw new Error(`PR #${n} comes from a fork (${headRepo}); only same-repo PRs are supported`);
        return { Number: v.number, Title: v.title, Body: v.body ?? '', HeadSHA: v.headRefOid, BaseRef: v.baseRefName, HeadRepo: headRepo, Author: v.author.login };
    }
    /** Lists PRs merged into `next` between Since and Until (YYYY-MM-DD); throws when the window holds 1000 or more. */
    public async ListMergedPullRequests(o: { Since: string; Until: string }): Promise<MergedPullRequest[]> {
        const raw = await this.exec(['pr', 'list', '--repo', REPO, '--state', 'merged', '--base', 'next', '--search', `merged:${o.Since}..${o.Until}`,
            '--limit', String(MERGED_LIST_LIMIT), '--json', 'number,title,mergedAt,mergeCommit,author,headRefName']);
        const list = MergedListSchema.parse(JSON.parse(raw));
        if (list.length >= MERGED_LIST_LIMIT) throw new Error(`${list.length} merged PRs between ${o.Since} and ${o.Until} hit the ${MERGED_LIST_LIMIT} limit; use a narrower window`);
        return list.map((p) => ({ Number: p.number, Title: p.title, MergedAt: p.mergedAt, MergeSHA: p.mergeCommit.oid, Author: p.author.login, HeadRef: p.headRefName }));
    }
    /** Reads a merged PR with its body and changed file paths; throws when the PR is not merged. */
    public async GetMergedPullRequest(n: number): Promise<MergedPullRequestDetail> {
        const raw = await this.exec(['pr', 'view', String(n), '--repo', REPO, '--json', 'number,title,body,mergedAt,mergeCommit,author,files,headRefName']);
        const v = MergedViewSchema.parse(JSON.parse(raw));
        if (v.mergeCommit === null || v.mergedAt === null) throw new Error(`PR #${n} is not merged`);
        return {
            Number: v.number, Title: v.title, MergedAt: v.mergedAt, MergeSHA: v.mergeCommit.oid, Author: v.author.login, HeadRef: v.headRefName,
            Body: v.body ?? '', Files: v.files.map((f) => f.path),
        };
    }
    /** Runs one `gh` command, retrying a transient failure up to 3 attempts in total; a definitive failure throws at once. */
    private async exec(args: string[]): Promise<string> {
        for (let attempt = 1; ; attempt++) {
            try { return await this.runner(args); }
            catch (e) {
                const reason = failureText(e);
                const wait = RETRY_WAITS_MS[attempt - 1];
                if (wait === undefined || DEFINITIVE_FAILURE_RE.test(reason)) throw e;
                this.warn(`gh retry ${attempt}/${RETRY_WAITS_MS.length + 1} after ${firstLine(reason)}`);
                await this.sleep(wait);
            }
        }
    }
}
/** The stderr of a failed command when present, else the error message. */
function failureText(e: unknown): string {
    if (e instanceof Error && 'stderr' in e && typeof e.stderr === 'string' && e.stderr.trim()) return e.stderr;
    return e instanceof Error ? e.message : String(e);
}
function firstLine(text: string): string { return text.trim().split('\n')[0]; }
/** How `ExecRunner` starts a command: the program, arguments placed before the caller's, and the per-call timeout. */
export interface ExecRunnerOptions { Command?: string; PrefixArgs?: string[]; TimeoutMs?: number; }

/** True when `execFile` killed the command for running past its timeout (not for exceeding `maxBuffer`). */
function isTimeoutKill(e: unknown): boolean {
    if (!(e instanceof Error) || !('killed' in e) || e.killed !== true) return false;
    return !('code' in e && e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
}
/** Default per-call limit for one `gh` command. */
const GH_TIMEOUT_MS = 120_000;

/**
 * A runner that executes `Command` (default `gh`) through `execFile` and resolves with stdout.
 * A command still running after `TimeoutMs` (default 120 s) is killed and rejects with "timed out after <n> ms".
 */
export function ExecRunner(o: ExecRunnerOptions = {}): (args: string[]) => Promise<string> {
    const command = o.Command ?? 'gh';
    const prefix = o.PrefixArgs ?? [];
    const timeout = o.TimeoutMs ?? GH_TIMEOUT_MS;
    return async (args) => {
        try { return (await run(command, [...prefix, ...args], { maxBuffer: 16 * 1024 * 1024, timeout })).stdout; }
        catch (e) {
            if (isTimeoutKill(e)) throw new Error(`timed out after ${timeout} ms: ${command} ${args.join(' ')}`, { cause: e });
            throw e;
        }
    };
}

