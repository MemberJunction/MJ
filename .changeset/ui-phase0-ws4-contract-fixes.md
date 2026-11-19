---
"@memberjunction/theme-engine": patch
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-chat": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-markdown": patch
---

Implement UI Phase 0 Workstream 4 contract fixes: retoken the default MJ font family to Montserrat with a `--mj-font-family-display` seed/token (and Theme Studio heading-font control + seamless normalization for saved themes), bundle Font Awesome Free 6.7.2 from npm in `explorer-app`, remove hardcoded `Ubuntu`/`Inter` font stacks from Angular component stylesheets, and strip hardcoded hex fallbacks and the duplicated TS stylesheet from `card-grid`.

Note for standalone hosts (outside `explorer-app`) that render `<mj-card-grid>`: add `@import '@memberjunction/ng-ui-components/dist/lib/card-grid/card-grid';` to your global stylesheet alongside the other `@memberjunction/ng-ui-components` global styles.
