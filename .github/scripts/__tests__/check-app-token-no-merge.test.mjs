/**
 * Suite for the App-token-never-merges guard.
 *
 * The guard is a deliberately coarse text heuristic, so the assertions that matter most are
 * the ones proving it stays SILENT where firing would be wrong. A guard that fails the repo
 * on day one — publish.yml's `git merge` back-merge is the obvious trap — gets disabled
 * within a week, and then the rule it encodes is folklore again, which is the exact outcome
 * it exists to prevent.
 *
 * The last block sweeps the real .github/workflows, because the only thing that keeps this
 * guard honest against a repo that changes underneath it is running it against that repo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkWorkflowContent, listWorkflowFiles, OPT_OUT_MARKER } from '../check-app-token-no-merge.mjs';

/** Every fixture below needs the token half; keeping it in one place keeps the cases readable. */
const MINT = `
      - name: Mint a token for the bot
        uses: actions/create-github-app-token@v2
        with:
          app-id: \${{ vars.MJ_BOT_APP_ID }}
          private-key: \${{ secrets.MJ_BOT_PRIVATE_KEY }}
`;

const workflow = (body) => `name: Example\non:\n  workflow_dispatch:\njobs:\n  job:\n    runs-on: ubuntu-latest\n    steps:${MINT}${body}`;

describe('a workflow that mints a token but never merges a PR', () => {
    it('is clean', () => {
        const content = workflow(`
      - name: Open the PR
        run: |
          set -euo pipefail
          gh pr create --base next --head "$BRANCH" --title "docs: notes" --body-file /tmp/body.md
`);
        expect(checkWorkflowContent(content)).toEqual([]);
    });

    // The exact false positive that would have failed this repo on the day the guard landed:
    // publish.yml back-merges main into next with plain git, which touches no PR and no
    // ruleset. If this ever starts flagging, the guard is wrong, not publish.yml.
    it('is clean when it runs a plain `git merge` — the main -> next back-merge is not a PR merge', () => {
        const content = workflow(`
      - name: Back-merge main into next
        run: |
          set -euo pipefail
          git checkout next
          git merge --no-edit origin/main
          git push origin next
`);
        expect(checkWorkflowContent(content)).toEqual([]);
    });

    it('is clean when prose merely mentions merging', () => {
        const content = workflow(`
      - name: Explain the failure
        run: echo "::error::  git checkout next && git merge origin/main"
`);
        expect(checkWorkflowContent(content)).toEqual([]);
    });
});

describe('a workflow that mints a token AND merges a PR', () => {
    const flagged = (body) => {
        const problems = checkWorkflowContent(workflow(body), { file: '.github/workflows/example.yml' });
        expect(problems).toHaveLength(1);
        return problems[0];
    };

    it('flags `gh pr merge`', () => {
        const p = flagged(`
      - name: Merge it
        run: gh pr merge "$PR" --squash --delete-branch
`);
        expect(p.code).toBe('gh-pr-merge');
        expect(p.message).toMatch(/bypass actor/);
        // The remedy has to be in the message: whoever reads this is looking at a red check,
        // not at the script's header.
        expect(p.message).toContain(OPT_OUT_MARKER);
    });

    it('flags an auto-merge queued without `gh pr merge` on one line', () => {
        const p = flagged(`
      - name: Queue the merge
        run: |
          gh pr \\
            merge --auto --squash "$PR"
`);
        expect(p.code).toBe('auto-merge');
    });

    it('flags the enable-pull-request-automerge action', () => {
        const p = flagged(`
      - uses: peter-evans/enable-pull-request-automerge@v3
        with:
          pull-request-number: \${{ steps.pr.outputs.number }}
`);
        expect(p.code).toBe('auto-merge');
    });

    it('flags a REST merge through gh api', () => {
        const p = flagged(`
      - name: Merge via the API
        run: gh api --method PUT "repos/\${{ github.repository }}/pulls/$PR/merge" -f merge_method=squash
`);
        expect(p.code).toBe('rest-merge');
    });

    it('flags an octokit pulls.merge call', () => {
        const p = flagged(`
      - uses: actions/github-script@v7
        with:
          script: await github.rest.pulls.merge({ owner, repo, pull_number: 1 });
`);
        expect(p.code).toBe('rest-merge');
    });

    it('reports the line number and the offending text, so the error is actionable', () => {
        const p = flagged(`
      - name: Merge it
        run: gh pr merge "$PR" --squash
`);
        expect(p.line).toBeGreaterThan(0);
        expect(p.message).toContain('gh pr merge "$PR" --squash');
        expect(p.message).toContain('.github/workflows/example.yml');
    });

    it('reports every merge line, not just the first', () => {
        const problems = checkWorkflowContent(
            workflow(`
      - name: Merge one
        run: gh pr merge "$A" --squash
      - name: Merge two
        run: gh pr merge "$B" --squash
`),
        );
        expect(problems).toHaveLength(2);
    });
});

describe('a workflow that merges a PR with NO App token', () => {
    // Merging with GITHUB_TOKEN is ordinary: that identity is not a bypass actor, so the
    // ruleset still applies and this guard has no opinion.
    it('is clean', () => {
        const content = `name: Example
on:
  pull_request:
jobs:
  job:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr merge "$PR" --auto --squash
`;
        expect(checkWorkflowContent(content)).toEqual([]);
    });

    it('does not police opt-out markers there either — they are inert without a token', () => {
        const content = `name: Example
on:
  pull_request:
jobs:
  job:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr merge "$PR" --squash   # ${OPT_OUT_MARKER}
`;
        expect(checkWorkflowContent(content)).toEqual([]);
    });
});

describe('the opt-out marker', () => {
    it('suppresses the finding when it carries a reason', () => {
        const content = workflow(`
      - name: Merge it
        run: gh pr merge "$PR" --squash   # ${OPT_OUT_MARKER}: dependabot lane, never targets next
`);
        expect(checkWorkflowContent(content)).toEqual([]);
    });

    // An unexplained exemption is indistinguishable from someone silencing a red check, which
    // is the decay this guard exists to stop. It must cost a sentence.
    it('is itself a violation when it carries no reason', () => {
        const problems = checkWorkflowContent(
            workflow(`
      - name: Merge it
        run: gh pr merge "$PR" --squash   # ${OPT_OUT_MARKER}
`),
        );
        expect(problems).toHaveLength(1);
        expect(problems[0].code).toBe('opt-out-without-reason');
        expect(problems[0].message).toMatch(/reason/i);
    });

    it('is a violation when the colon is present but nothing follows it', () => {
        const problems = checkWorkflowContent(
            workflow(`
      - run: gh pr merge "$PR" --squash   # ${OPT_OUT_MARKER}:
`),
        );
        expect(problems).toHaveLength(1);
        expect(problems[0].code).toBe('opt-out-without-reason');
    });

    it('suppresses only the line it is on', () => {
        const problems = checkWorkflowContent(
            workflow(`
      - run: gh pr merge "$A" --squash   # ${OPT_OUT_MARKER}: the exempt one
      - run: gh pr merge "$B" --squash
`),
        );
        expect(problems).toHaveLength(1);
        expect(problems[0].code).toBe('gh-pr-merge');
        expect(problems[0].message).toContain('"$B"');
    });
});

describe('input validation', () => {
    it('throws with context rather than reporting a pass on a non-string', () => {
        expect(() => checkWorkflowContent(undefined)).toThrow(/string/);
        expect(() => checkWorkflowContent(null)).toThrow(/string/);
    });

    it('treats an empty file as clean', () => {
        expect(checkWorkflowContent('')).toEqual([]);
    });

    it('handles CRLF line endings', () => {
        const content = workflow('\n      - run: gh pr merge "$PR" --squash\n').replace(/\n/g, '\r\n');
        expect(checkWorkflowContent(content)).toHaveLength(1);
    });
});

describe("the repo's actual workflows", () => {
    const files = listWorkflowFiles();

    it('finds workflows to scan — a pass on an empty scan would be worthless', () => {
        expect(files.length).toBeGreaterThan(10);
    });

    it('are all clean', () => {
        const problems = files.flatMap((file) =>
            checkWorkflowContent(readFileSync(file, 'utf8'), { file }).map((p) => `${p.code} ${p.message}`),
        );
        expect(problems).toEqual([]);
    });

    // Proves the fixtures above are testing the real pattern and not a shape no workflow
    // uses: if the mint pattern stopped matching, every "flagged" case above would still
    // pass by construction while the guard scanned a repo it could no longer see into.
    it('still contains workflows that mint an App token, so the token half is exercised for real', () => {
        const minting = files.filter((file) => readFileSync(file, 'utf8').includes('actions/create-github-app-token'));
        expect(minting.length).toBeGreaterThan(0);
        // Every minting workflow is clean only because none of them merges a PR; if one
        // starts to, this suite fails on the "are all clean" case above with the reason.
        for (const file of minting) {
            expect(checkWorkflowContent(readFileSync(file, 'utf8'), { file })).toEqual([]);
        }
    });
});
