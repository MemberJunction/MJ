---
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Section 10 interior chrome pattern applied to every MJ Explorer left-rail shell (Admin × 4, AI Analytics, Knowledge Hub × 4, Testing Explorer, Database Designer, SQL Logging, Dev Tools inspectors, API Keys, App Roles). New shared primitives — `<mj-left-nav>` with optional tree support, two-row `<mj-page-header-interior>`, paired `<mj-page-body-interior>` — replace bespoke per-shell sidebar and chrome implementations across ~25 sub-pages. Chrome slot discipline audit standardizes tab-nav placement, `[meta]` badge content, and `[actions]` ordering across ~65 dashboards; two pre-existing bugs fixed along the way (nested `:has()` SyntaxError that silently hid the interior toolbar row, and an invisible page-header drop shadow).
