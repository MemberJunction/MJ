---
description: Show a human-readable digest of the autodev engine's investigation log — what it's tried, open draft PRs, in-flight work, and dead ends.
arguments:
  - name: filter
    description: "Optional: 'prs' (open PRs only), 'blocked', 'dead-end', or a source name (pr-mining|bug|assigned-issue)."
    required: false
---

# /autodev-status — investigation log digest

Show the operator what the autodev engine has been doing. Read-only; never modifies state.

Bundle: `autodev/`. State CLI: `node autodev/lib/state.mjs`.

## Steps

1. **Overall digest:**
   ```
   node autodev/lib/state.mjs digest
   ```

2. **Apply the filter** in `$ARGUMENTS`, if any:
   - `prs` → `node autodev/lib/state.mjs list --status pr-raised`
   - `blocked` → `node autodev/lib/state.mjs list --status blocked`
   - `dead-end` → `node autodev/lib/state.mjs list --status dead-end`
   - a source name → `node autodev/lib/state.mjs list --source <name>`
   - none → just the digest plus the most recent ~15 rows (`list` then show the tail).

3. **Summarize for a human** in a short, skimmable format:
   - Current `prMode` and which sources are enabled (from `autodev/config.json`).
   - Counts by status and source.
   - **Open draft PRs** with links (these need human review/merge).
   - **In-flight / phased** investigations that need a follow-up tick.
   - Any `blocked` items waiting on a human (e.g. ambiguous issues the agent commented on).
   - A one-line health read: is it making progress, idling (capped), or stuck?

4. If the log is empty, say so plainly and point to `/autodev-tick` to run the first investigation.

Do not start an investigation from this command — that's `/autodev-tick`.
