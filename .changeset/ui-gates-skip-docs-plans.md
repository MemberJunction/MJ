---
---

ci: exclude `docs/` and `plans/` directories from the UI color/button gates

The hardcoded-color and `.mj-btn`-override CI gates scanned the whole repo for
`.css`/`.scss` files (filtering only `node_modules` and `dist`), so mockup,
prototype, and documentation stylesheets under `plans/` (and any `docs/` dir)
were eligible to be flagged even though they are not shipped component styles.
Both gates now skip any `.css`/`.scss` under a `docs/` or `plans/` path segment
in their `diff` and `--all` modes. No published package is affected (tooling-only
change), so this changeset is intentionally empty.
