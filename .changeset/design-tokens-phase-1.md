---
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-entity-permissions": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-list-detail-grid": patch
"@memberjunction/ng-simple-record-list": patch
"@memberjunction/ng-testing": patch
"@memberjunction/ng-actions": patch
"@memberjunction/ng-agents": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-chat": patch
"@memberjunction/ng-code-editor": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-credentials": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-data-context": patch
"@memberjunction/ng-deep-diff": patch
"@memberjunction/ng-entity-communications": patch
"@memberjunction/ng-entity-relationship-diagram": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-export-service": patch
"@memberjunction/ng-file-storage": patch
"@memberjunction/ng-filter-builder": patch
"@memberjunction/ng-flow-editor": patch
"@memberjunction/ng-join-grid": patch
"@memberjunction/ng-list-management": patch
"@memberjunction/ng-markdown": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-record-changes": patch
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-tabstrip": patch
"@memberjunction/ng-tasks": patch
"@memberjunction/ng-timeline": patch
"@memberjunction/ng-trees": patch
"@memberjunction/ng-versions": patch
---

Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
