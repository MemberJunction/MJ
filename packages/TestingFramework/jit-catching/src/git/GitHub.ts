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
}
async function defaultRunner(args: string[]): Promise<string> { return (await run('gh', args, { maxBuffer: 16 * 1024 * 1024 })).stdout; }
