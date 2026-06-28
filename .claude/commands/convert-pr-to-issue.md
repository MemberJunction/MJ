# Convert PR to Issue

Convert an open pull request into a GitHub issue, then close the PR — **without deleting the branch**. This is for *deprioritizing* a PR: the work-in-progress branch stays alive, but it no longer sits in the open-PR queue. The new issue captures the intent (preferably from the PR's plan doc) and links back to both the branch and the now-closed PR so the work can be resumed later.

## Input

The PR is specified by number (e.g. `/convert-pr-to-issue 1234`) or by URL. If neither is provided, **ask the user for the PR number** before doing anything else.

## Tooling

- **Local dev**: use the `gh` CLI for all GitHub operations.
- **Remote / web sessions (no `gh` available)**: use the GitHub MCP tools instead — `mcp__github__pull_request_read`, `mcp__github__issue_write`, `mcp__github__add_issue_comment`, `mcp__github__update_pull_request`, `mcp__github__get_file_contents`, `mcp__github__list_commits`. Pick whichever is available; the steps below describe the *intent*, not a fixed command set.

Operate against the **same repository** that owns the PR. Derive `owner/repo` from the PR URL or the current repo's `origin` remote.

## Instructions

1. **Fetch and validate the PR:**
   - Read the PR's metadata: title, body/description, state, `merged` flag, head branch (the source branch), base branch, author, and the list of changed files.
   - 🛑 **Hard guard — only ever act on an `open`, unmerged PR.** Inspect the PR's `state` and `merged` fields. If `state` is anything other than `open`, **or** `merged` is `true`, **STOP immediately and make no changes whatsoever** — do not create the issue, do not post any comment, do not change the PR state, do not touch the branch. Tell the user you can't convert a `closed`/`merged` PR and stop. This makes the command safe to re-run: a PR it already converted is now `closed`, so a second invocation is a clean no-op instead of creating a duplicate issue or re-commenting.
   - **Re-confirm the PR is still `open` immediately before you close it** in step 6. If its state changed underneath you (someone merged/closed it in the meantime), stop and report rather than proceeding.

2. **Gather the people to notify (for the issue `/cc`):**
   - Assemble the GitHub logins of everyone involved with the PR:
     - the **author** (`user.login`),
     - everyone **assigned** (`assignees`),
     - everyone **requested for review** (requested reviewers) **and** everyone who **submitted a review** (from the reviews list),
     - everyone who **commented** — both PR conversation comments and review/code comments.
   - Use the GitHub MCP read methods to collect these (`pull_request_read` `get` for author/assignees/requested reviewers, `get_reviews`, `get_comments`, `get_review_comments`) or the `gh` equivalents.
   - **Exclude bots and automation accounts.** Drop any login ending in `[bot]`, any account with `type: "Bot"`, and obvious automation (e.g. `changeset-bot`, `claude`, `github-actions`, `dependabot`, `codecov`). When a borderline account is ambiguous, leave it out.
   - **De-duplicate** the remaining logins case-insensitively so each person is tagged exactly once. Keep this list for the issue body (step 4).

3. **Locate the plan doc (preferred issue source):**
   - A "plan doc" is the design/plan markdown most MJ feature branches carry, almost always under `plans/` (e.g. `plans/my-feature.md`). Look for it in this order and stop at the first hit:
     1. A markdown file under `plans/` in the PR's list of **changed files** (the most reliable signal — the PR added/edited it).
     2. An explicit link or path to a `plans/*.md` file mentioned in the **PR body**.
     3. Any `plans/*.md` whose name closely matches the PR/branch name.
   - If you find a candidate, fetch its **full contents from the PR's head branch** (not from `next`/`main`) so you capture the version the PR actually carries.
   - If no plan doc exists, fall back to the **PR title + description** as the issue body source. State in your final summary which source you used.

4. **Compose the issue:**
   - **Title:** reuse a clear title — the plan doc's top-level heading, or the PR title. Prefix with something that signals it's deferred work if helpful, but keep it readable.
   - **Body:** Build from the plan doc (or PR description) and **always** append a clearly-formatted reference section so the branch and PR are one click away:

   ```markdown
   <!-- plan doc content, or PR title + description, goes here -->

   ---

   ## Source

   Converted from PR #<PR_NUMBER> (deprioritized — branch preserved, PR closed).

   - **Pull request:** <PR_URL>
   - **Branch:** [`<HEAD_BRANCH>`](<URL to the branch, e.g. https://github.com/<owner>/<repo>/tree/<HEAD_BRANCH>>)
   - **Original author:** @<pr_author>

   The branch has **not** been deleted. To resume this work, check out `<HEAD_BRANCH>` and reopen a PR.

   /cc @<person1> @<person2> @<person3>
   ```

   - The trailing `/cc` line tags **every non-bot participant** gathered in step 2 (author, assignees, requested reviewers, reviewers, and commenters), de-duplicated, so everyone who touched the PR is notified of the new tracking issue. **If, after excluding bots, nobody is left, omit the `/cc` line entirely** — never emit a dangling `/cc` with no handles.
   - Carry over relevant labels/assignees from the PR if it's easy to do so (optional, best-effort).

5. **Create the issue** in the same repo and capture its number and URL.

6. **Close the PR with a pointer comment:**
   - Post a comment on the PR first, then close it (so the comment is the last thing readers see). The comment should read roughly:

   > Converting this PR to an issue to deprioritize it. The branch `<HEAD_BRANCH>` is preserved and can be picked back up later. Tracking issue: #<ISSUE_NUMBER>.

   - Then set the PR state to `closed`. **Do not delete the head branch** and **do not merge.**

7. **Report back:**
   - Give the user the new issue URL and confirm the PR was closed and the branch preserved.
   - Note which source was used for the issue body (plan doc vs. PR description), and who was `/cc`-tagged (or that everyone involved was a bot, so nobody was tagged).

## Important Notes

- **Never delete the branch.** The entire point is to preserve the work — only the PR goes away.
- **Never merge** the PR — it is closed unmerged.
- **Only operate on `open`, unmerged PRs.** If the PR is already `closed` or `merged`, make **zero** changes — no issue, no comments, no state change — and just tell the user. Re-running on an already-converted PR must be a clean no-op (no duplicate issue, no repeat comment).
- **Tag the humans, not the bots.** The issue's `/cc` line should notify every non-bot person who authored, was assigned to, was asked to review, reviewed, or commented on the PR — de-duplicated. Exclude `[bot]` / `type: Bot` / automation accounts entirely.
- Keep the branch name and PR link prominent in the issue so the work is trivially resumable.
- If anything is ambiguous (e.g. multiple candidate plan docs), ask the user which to use rather than guessing.
