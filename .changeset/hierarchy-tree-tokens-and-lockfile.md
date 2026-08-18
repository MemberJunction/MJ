---
"@memberjunction/ng-hierarchy-tree": patch
---

Repair two things the hierarchy-tree package landed with.

**`pnpm-lock.yaml` was never regenerated**, so the workspace had a package no lockfile
importer described. Every CI job begins with `pnpm install --frozen-lockfile`, which
refuses that state — so unit tests, the deterministic integration tier, the dependency
check and the standards gate all failed before running a single assertion, on `next` and
on every PR branching from it. The lockfile is now regenerated: purely additive, one new
importer plus the `link:` entry in `core-entity-forms`, no dependency resolution churn.

**The component styles hardcoded colors**, which breaks theming and white-labeling. The
brand-tinted `rgba(56, 189, 248, …)` values are now `color-mix()` over
`--mj-brand-primary`; the `#041124` text on brand-colored buttons is `--mj-text-inverse`;
the amber and green node states are `--mj-status-warning` / `--mj-status-success`; the
overlay backdrop is `--mj-bg-overlay`; and the primary-button hover is
`--mj-brand-primary-hover`. Neutral `rgba(0,0,0,…)` / `rgba(255,255,255,…)` shadow and
overlay values are unchanged — the gate permits them and no semantic token replaces them.

`HierarchyTreeConfig.DefaultColor` now defaults to `'var(--mj-brand-primary, #38bdf8)'`
rather than the bare hex. It is bound to `[style.background]` / `[style.color]`, so the
token resolves at paint time and the default node accent follows the active theme instead
of staying a fixed dark-mode blue. The fallback preserves the previous rendering wherever
the token stylesheet is absent, and callers passing their own color are unaffected.
