# Update Repository Stats

Record a fresh lines-of-code snapshot in `/stats`, write a narrative analysis of what
changed since the previous snapshot, and fold it into the stats README. Read
[stats/CLAUDE.md](../../stats/CLAUDE.md) first for the folder's conventions.

## Instructions

1. **Run the snapshot:**
   ```bash
   node stats/repo-stats.mjs
   ```
   Requires `cloc` (`brew install cloc` if missing). This writes/updates
   `stats/reports/<today>.md`, upserts `stats/data.csv`, and regenerates `stats/README.md`.

2. **Study what changed.** Read the new report (it includes a "Change since <prev-date>"
   delta table) and the previous snapshot's report. Then look at the actual work between
   the two snapshot commits to explain *why* the numbers moved:
   ```bash
   # Get the two commit SHAs from the last two rows of stats/data.csv, then:
   git log --merges --format="%s" <prevSha>..<newSha>
   ```
   Merge/PR titles are usually enough signal. For a big unexplained jump in one language,
   identify the files responsible:
   ```bash
   git diff --stat <prevSha>..<newSha> -- '*.sql' | tail -20   # adjust extension
   ```

3. **Write the narrative analysis** to `stats/analysis/<today's date>.md`. Structure:
   - `# Analysis — YYYY-MM-DD` title line (the README embed strips it).
   - 2–4 short paragraphs: the headline movement (hand-written source first), what drove
     the biggest deltas (name the actual feature areas / PRs, not just numbers), anything
     notable in the generated-vs-hand split (e.g., a CodeGen run, a baseline consolidation,
     a metadata sync), and any trend observation vs. earlier history.
   - Plain prose, no tables — the deterministic delta tables already live in the report.
   - If a delta looks like a classification gap (a new generated-artifact family counted as
     hand-written), say so and suggest the `GENERATED_PATTERNS` addition.

4. **Re-render the README** so it embeds the new analysis:
   ```bash
   node stats/repo-stats.mjs --render
   ```

5. **Summarize for the user**: headline numbers (hand-written source, total, gen %),
   the 2–3 biggest movements and their causes, and a pointer to the new report.

## Rules

- Do NOT commit anything — leave the changes in the working tree unless the user asks.
- Do NOT hand-edit `stats/README.md`, `stats/data.csv`, or `stats/reports/*` — only the
  script writes those. Your prose goes in `stats/analysis/` only.
- If today's snapshot already exists (same-day rerun), the script replaces it — that's
  fine and idempotent; update the analysis file in place too.
