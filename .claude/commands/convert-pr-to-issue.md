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
   - Read the PR's metadata: title, body/description, state, head branch (the source branch), base branch, author, and the list of changed files.
   - **Abort if the PR is not open.** Do not touch closed or merged PRs — tell the user you can't convert a `closed`/`merged` PR and stop.

2. **Locate the plan doc (preferred issue source):**
   - A "plan doc" is the design/plan markdown most MJ feature branches carry, almost always under `plans/` (e.g. `plans/my-feature.md`). Look for it in this order and stop at the first hit:
     1. A markdown file under `plans/` in the PR's list of **changed files** (the most reliable signal — the PR added/edited it).
     2. An explicit link or path to a `plans/*.md` file mentioned in the **PR body**.
     3. Any `plans/*.md` whose name closely matches the PR/branch name.
   - If you find a candidate, fetch its **full contents from the PR's head branch** (not from `next`/`main`) so you capture the version the PR actually carries.
   - If no plan doc exists, fall back to the **PR title + description** as the issue body source. State in your final summary which source you used.

3. **Compose the issue:**
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
   ```

   - Carry over relevant labels/assignees from the PR if it's easy to do so (optional, best-effort).

4. **Create the issue** in the same repo and capture its number and URL.

5. **Close the PR with a pointer comment:**
   - Post a comment on the PR first, then close it (so the comment is the last thing readers see). The comment should read roughly:

   > Converting this PR to an issue to deprioritize it. The branch `<HEAD_BRANCH>` is preserved and can be picked back up later. Tracking issue: #<ISSUE_NUMBER>.

   - Then set the PR state to `closed`. **Do not delete the head branch** and **do not merge.**

6. **Report back:**
   - Give the user the new issue URL and confirm the PR was closed and the branch preserved.
   - Note which source was used for the issue body (plan doc vs. PR description).

## Important Notes

- **Never delete the branch.** The entire point is to preserve the work — only the PR goes away.
- **Never merge** the PR — it is closed unmerged.
- Only operate on **open** PRs; refuse on closed/merged.
- Keep the branch name and PR link prominent in the issue so the work is trivially resumable.
- If anything is ambiguous (e.g. multiple candidate plan docs), ask the user which to use rather than guessing.
