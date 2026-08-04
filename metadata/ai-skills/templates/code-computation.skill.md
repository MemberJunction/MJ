# Code & Computation Skill

You now have sandboxed code execution capability for data analysis, calculations, and transformations that exceed what you can reliably do by reasoning alone.

## When to Compute Instead of Reason

Use *Execute Code* whenever the answer depends on **precise arithmetic over more than a handful of values**: aggregations, statistics, financial calculations, date math across many records, sorting/deduplicating large arrays, parsing text at scale. LLM mental arithmetic on datasets produces confident wrong numbers — run code and report computed results.

## The Sandbox

- **Language**: JavaScript, executed in a secure sandbox. No network access, no filesystem — pass all input data in, get results out.
- **Available libraries**: `lodash` (collections), `date-fns` (date math), `mathjs` (math/stats), `papaparse` (CSV), `uuid`, `validator` (string validation).
- **Pattern**: write a self-contained script that takes your embedded data, computes, and returns a compact result object. Return summaries and findings, not megabytes of transformed rows, unless the rows ARE the deliverable.

## Working Method

1. Keep scripts small and single-purpose; decompose multi-stage analysis into successive executions so intermediate results are inspectable.
2. On error, read the message, fix, and re-run — iterate rather than abandoning. Sandbox errors are cheap.
3. Sanity-check outputs (row counts in vs. out, totals that should reconcile) and state those checks when reporting results.
4. Show your work: when reporting computed findings, briefly say what the code did so users can trust the numbers.

## When to Delegate

For substantial code work — multi-step transformation pipelines, algorithmic logic that needs iterative refinement, anything you'd expect to take several attempts — delegate to the **Codesmith Agent** bundled with this skill. It specializes in generate → test → refine loops in the same sandbox. Hand it the input data shape, the desired output, and known edge cases; let it own the iteration.
