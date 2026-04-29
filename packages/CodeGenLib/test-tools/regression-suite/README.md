# mj-codegen-regression — placeholder + example run

This folder is currently a **placeholder** and a **record of one passing run**. It does not yet contain the regression suite source.

## What lives here today

- `example-runs/2026-04-26-clean-pass/` — the report artifacts from the first end-to-end clean pass against PR #2342 (scoped CodeGen Pass 2). Includes:
  - `REPORT.md` — top-level verdict and per-phase summary
  - `PERF.md`, `perf.tsv`, `perf.json` — wall-clock per-phase timings
  - `<phase>/SUMMARY.md`, `classified.json`, `diff.unified.txt` — diff classification per phase
  - `scoped-verify/` — the scoped-vs-forced semantic verifier output (0 diffs)

  The full snapshot trees (`branch/`, `next/`, `scoped/`, `forced/` codegen-output dirs, ~347 MB) are **not** copied — they're reproducible by re-running the suite. What's saved here is the analytical output.

## Where the suite source actually lives

The runnable suite source lives in a **separate, standalone repo** for now:

- https://github.com/pranavrao-BC/mj-codegen-regression

That repo has the bash entry point, the bash helpers, the diff classifier, the perf reporter, the fixtures, and a README covering prereqs, flags, and how the noise filter works.

## Why isn't the source in this monorepo yet?

**Out of scope of PR #2342.** Bringing the suite into the monorepo is on the roadmap (target location: `packages/CodeGenLib/test-tools/regression-suite/{bin,src,fixtures}/`, mirroring the standalone repo's layout), but doing the move alongside the scoping work would have ballooned PR #2342. We landed the example-run record now so reviewers and future readers have a concrete reference for what a clean pass looks like.

## What changes when the suite source moves in

- `bin/`, `src/`, `fixtures/`, `package.json`, `README.md` from the standalone repo land here
- The standalone repo becomes archive-only / read-only
- `example-runs/` keeps growing — each meaningful run gets a dated subdir with the report bundle
