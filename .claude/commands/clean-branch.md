---
description: Create a clean branch from `next` containing only specified files as a single commit, ready for a focused PR.
arguments:
  - name: files
    description: "Space-separated file paths to include (e.g. plans/my-plan.md src/foo.ts)"
    required: true
  - name: branch
    description: "Branch name to create (optional — will be inferred from first filename if omitted)"
    required: false
---

Create a clean branch based on `next` that contains ONLY the specified files in a single commit. This is used when files were created during work on another feature branch but deserve their own isolated PR.

## Steps

1. **Record the current branch name** so we can return to it at the end.

2. **Verify the files exist** on disk. If any file doesn't exist, stop and tell the user.

3. **Copy the files to /tmp** so they survive the branch switch:
   - For each file in $ARGUMENTS, copy it to `/tmp/clean-branch-staging/` preserving the relative path.

4. **Switch to `next`** and create the new branch:
   ```
   git checkout next
   git checkout -b <branch-name>
   ```
   - If the checkout fails due to unstaged changes, **do NOT stash or discard anything**. Stop and tell the user they have uncommitted changes that conflict and need to handle them first.

5. **Copy files back** from `/tmp/clean-branch-staging/` to their original paths, creating directories if needed.

6. **Stage, commit, and push**:
   ```
   git add <files>
   git commit -m "<descriptive message based on file content>"
   git push -u origin <branch-name>
   ```
   - Read the file(s) briefly to write a meaningful commit message.
   - Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` in the commit.

7. **Switch back** to the original branch:
   ```
   git checkout <original-branch>
   ```

8. **Clean up** the temp directory.

9. **Report** the branch name, commit SHA, and the GitHub PR creation URL.

## Branch naming
- If `$ARGUMENTS` includes a branch name argument, use it.
- Otherwise, derive from the first filename: `plans/base-engine-observable-properties.md` → `base-engine-observable-properties`.

## Safety rules
- NEVER stash, discard, or modify any existing uncommitted work
- NEVER force-push
- NEVER delete any branches
- If `git checkout next` fails, stop immediately and explain why
- Verify the new branch has exactly 1 commit ahead of `next` before reporting success
