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

/** Reads pull requests through the `gh` CLI, which is logged in locally and preinstalled on runners. */
export class GitHub {
    constructor(private readonly runner: (args: string[]) => Promise<string> = defaultRunner) {}
    public async GetPullRequest(n: number): Promise<PullRequestInfo> {
        const raw = await this.runner(['pr', 'view', String(n), '--repo', REPO, '--json', 'number,title,body,headRefOid,baseRefName,headRepository,headRepositoryOwner,author']);
        const v = ViewSchema.parse(JSON.parse(raw));
        const headRepo = `${v.headRepositoryOwner.login}/${v.headRepository.name}`;
        if (headRepo !== REPO) throw new Error(`PR #${n} comes from a fork (${headRepo}); only same-repo PRs are supported`);
        return { Number: v.number, Title: v.title, Body: v.body ?? '', HeadSHA: v.headRefOid, BaseRef: v.baseRefName, HeadRepo: headRepo, Author: v.author.login };
    }
    /** Lists PRs merged into `next` between Since and Until (YYYY-MM-DD); throws when the window holds 1000 or more. */
    public async ListMergedPullRequests(o: { Since: string; Until: string }): Promise<MergedPullRequest[]> {
        const raw = await this.runner(['pr', 'list', '--repo', REPO, '--state', 'merged', '--base', 'next', '--search', `merged:${o.Since}..${o.Until}`,
            '--limit', String(MERGED_LIST_LIMIT), '--json', 'number,title,mergedAt,mergeCommit,author,headRefName']);
        const list = MergedListSchema.parse(JSON.parse(raw));
        if (list.length >= MERGED_LIST_LIMIT) throw new Error(`${list.length} merged PRs between ${o.Since} and ${o.Until} hit the ${MERGED_LIST_LIMIT} limit; use a narrower window`);
        return list.map((p) => ({ Number: p.number, Title: p.title, MergedAt: p.mergedAt, MergeSHA: p.mergeCommit.oid, Author: p.author.login, HeadRef: p.headRefName }));
    }
    /** Reads a merged PR with its body and changed file paths; throws when the PR is not merged. */
    public async GetMergedPullRequest(n: number): Promise<MergedPullRequestDetail> {
        const raw = await this.runner(['pr', 'view', String(n), '--repo', REPO, '--json', 'number,title,body,mergedAt,mergeCommit,author,files,headRefName']);
        const v = MergedViewSchema.parse(JSON.parse(raw));
        if (v.mergeCommit === null || v.mergedAt === null) throw new Error(`PR #${n} is not merged`);
        return {
            Number: v.number, Title: v.title, MergedAt: v.mergedAt, MergeSHA: v.mergeCommit.oid, Author: v.author.login, HeadRef: v.headRefName,
            Body: v.body ?? '', Files: v.files.map((f) => f.path),
        };
    }
}
async function defaultRunner(args: string[]): Promise<string> { return (await run('gh', args, { maxBuffer: 16 * 1024 * 1024 })).stdout; }
