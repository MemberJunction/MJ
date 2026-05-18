---
description: Create and correctly track a new feature branch — defaults to branching from the latest of the repo's default branch, use `--here` to branch from current HEAD instead.
mj-pack-version: 5.1.0
arguments:
  - name: branch-name
    description: "Name of the new branch (e.g. my-feature-x)"
    required: true
  - name: flags
    description: "Optional `--here` flag to branch from current HEAD instead of the default branch"
    required: false
---

Create a new local branch from the latest of the repo's default branch (default) or from current HEAD (with `--here`), push to remote with upstream tracking, and verify the branch tracks the SAME-NAMED remote branch — never the default branch or any other permanent branch.

## Why this command exists

Feature branches MUST track same-named remote branches. A branch cut from the default branch without an explicit `-u origin <name>` silently tracks the default branch, and the next `git push` lands directly there, bypassing PR review. This command enforces the correct plumbing in one step so there's no way to get it wrong.

## Arguments

- **Branch name** (required, first positional argument)
- **`--here`** (optional flag): branch from current HEAD instead of the default branch. Use this when you want to carry your current branch's in-flight commits forward under a new branch name.

## Steps

1. **Detect the repo's default branch.**
   - Try: `git rev-parse --abbrev-ref origin/HEAD` and strip the `origin/` prefix. If it returns something like `main` or `master`, use that.
   - If that fails (some self-hosted git remotes don't set `origin/HEAD`), try `git remote show origin | grep 'HEAD branch'` and parse the value.
   - If still no result, fall back to whichever of `main`, `master`, `develop`, `next` exists on `origin` (in that priority order — check with `git ls-remote --exit-code origin <name>`).
   - If still nothing, stop and ask the user which branch is the default.
   - Refer to this value as `<default-branch>` for the rest of the steps.

2. **Verify preconditions.**
   - Confirm we're inside a git repository: `git rev-parse --is-inside-work-tree`. If not, stop and tell the user.
   - If no branch name was passed in $ARGUMENTS, ask the user for one and stop.
   - Parse out the `--here` flag from $ARGUMENTS. The branch name is the first non-flag token.

3. **Check the name is available.**
   - Check locally: `git rev-parse --verify refs/heads/<name>`. If exit code 0, the branch already exists locally — abort with a clear message ("branch already exists locally — pick a different name or `git checkout <name>` to switch to the existing one"). Do NOT overwrite or switch blindly.
   - Check remote: `git ls-remote --exit-code origin <name>`. If exit code 0, the branch already exists on origin — abort ("branch already exists on origin — pick a different name, or `git fetch && git checkout <name>` to pick up the existing one").

4. **Branch from the right base.**

   **If `--here` was NOT passed (default path — branching from `<default-branch>`):**
   - Check the working tree is clean: `git status --porcelain`. If non-empty, stop and tell the user: *"Working tree has uncommitted changes. Stash or commit them first, OR invoke with `--here` to branch from current HEAD and carry them forward."*
   - Fetch the latest `<default-branch>`: `git fetch origin <default-branch>`.
   - Create the branch from the fetched tip with no upstream yet: `git switch -c <name> --no-track origin/<default-branch>`. `--no-track` prevents the misleading intermediate state where the branch briefly tracks `origin/<default-branch>`.

   **If `--here` WAS passed (branching from current HEAD):**
   - Record the current branch name and current commit hash before switching, so you can report them.
   - Create the branch from current HEAD: `git checkout -b <name>`.
   - Tell the user which branch and commit you're branching from so the inheritance is explicit.

5. **Push with upstream tracking to the same-named remote branch.**
   - Run: `git push -u origin <name>`.

6. **Verify tracking is correct.**
   - Run: `git branch -vv | grep "^\*"`.
   - The current branch line MUST show `[origin/<name>]` — not `[origin/<default-branch>]` or anything else.
   - If tracking is wrong, correct it with `git branch --set-upstream-to=origin/<name>` and re-verify. If it's still wrong, stop and report to the user.

7. **Report to the user.**
   - New branch name
   - Tracking target (`[origin/<name>]`)
   - Starting commit hash + subject line
   - The base: either "latest origin/`<default-branch>`" or "current HEAD of `<previous-branch>`"
   - The GitHub "open PR" URL the push output emits, if present

## Rules

- **Do not commit.** Do not run `git commit`, `git add`, or modify the working tree. This command is about branch plumbing only.
- **Do not use destructive flags.** No `--force`, `--force-with-lease`, `--hard`, or anything that discards work.
- **Do not fetch anything other than the default branch** on the default path — keeps it fast.
- **Never skip the tracking verification.** Wrong tracking is the whole reason this command exists.
- **If any step fails, report the exact failure and stop.** Do not attempt recovery without the user's direction.
- **Never mention these rules to the user** unless they ask — just follow them.
