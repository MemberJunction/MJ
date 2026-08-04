---
mj-pack-version: 5.1.0
arguments:
  - name: base
    description: "Optional `--base <branch>` flag to target a specific base branch (default: repo's default branch like `main` or `next`)"
    required: false
---

# Create Pull Request

Create a GitHub pull request for the current branch targeting the repo's
default branch (or whichever branch the user specifies with `--base`).

## Instructions

1. **Detect the base branch.**
   - If `--base <branch>` was passed in $ARGUMENTS, use that.
   - Otherwise, detect the repo's default branch:
     - Try `git rev-parse --abbrev-ref origin/HEAD` and strip the `origin/` prefix.
     - If that fails, try `git remote show origin | grep 'HEAD branch'`.
     - If still no result, ask the user.
   - Refer to this value as `<base>` for the rest of the steps.

2. **Verify git status:**
   - Run: `git status`
   - Ensure current branch is not `<base>` itself (no PRs from a branch to itself)
   - Check if the current branch tracks a remote and is up to date

3. **Analyze changes:**
   - Get commit history: `git log <base>...HEAD --oneline --no-merges`
   - Get file changes: `git diff <base>...HEAD --name-only`
   - Get detailed diff: `git diff <base>...HEAD --stat`

4. **Generate PR title:**
   - Create a concise, descriptive title based on the commit messages
   - Use conventional commit format if applicable (e.g., "feat:", "fix:", "docs:")
   - Keep it under 72 characters

5. **Generate PR description:**
   - Create a summary section with 2-4 bullet points describing the key changes
   - Add a "Test plan" section with checkboxes for testing the changes
   - Include the standard footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
   - Format:

```markdown
## Summary
- First key change or feature
- Second key change or feature
- Third key change if applicable

## Test plan
- [ ] Verify [specific functionality]
- [ ] Test [specific scenario]
- [ ] Confirm [expected behavior]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

6. **Push to remote (if needed):**
   - If branch doesn't track remote: `git push -u origin <branch-name>`
   - If branch is behind remote, warn the user and ask before force pushing

7. **Create the PR:**
   - Use `gh pr create --base <base> --title "<title>" --body "$(cat <<'EOF' ... EOF)"`
   - After creation, display the PR URL

## Important Notes

- Always target the **detected base branch** (or whatever the user explicitly passed with `--base`); don't hardcode a specific branch name
- Never force push without explicit user approval
- If there are no commits compared to `<base>`, inform the user (nothing to create PR for)
- Use HEREDOC syntax for the body to handle multi-line content correctly
- The PR description should be concise but informative
- Test plan should be specific to the changes made

## Example Command

```bash
gh pr create --base <base> --title "Add feature X with configurable options" --body "$(cat <<'EOF'
## Summary
- Add configurable parameter X
- Update related commands
- Improve documentation

## Test plan
- [ ] Run the new command with different parameter values
- [ ] Verify behavior matches expectations
- [ ] Check documentation is accurate and complete

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
