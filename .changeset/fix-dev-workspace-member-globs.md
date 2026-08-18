---
"@memberjunction/cli": patch
---

`mj dev workspace`: generate member globs from each member's own `pnpm-workspace.yaml` instead of a hardcoded `packages/*`. Fixes the silent split-registry failure where MJ's 42 nested globs (248 packages) fell out of the generated workspace and resolved from npm (#3795). Positive globs must be packages-rooted; negation guards are always kept and re-prefixed; a member whose workspace file yields no packages-rooted globs now triggers a loud warning instead of a silent `packages/*` fallback.
