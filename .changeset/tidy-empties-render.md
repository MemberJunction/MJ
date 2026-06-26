---
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-action-gallery": patch
"@memberjunction/ng-agents": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/ng-archive-manager": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-clustering": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-data-context": patch
"@memberjunction/ng-deep-diff": patch
"@memberjunction/ng-entity-action-ux": patch
"@memberjunction/ng-entity-relationship-diagram": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-file-storage": patch
"@memberjunction/ng-filter-builder": patch
"@memberjunction/ng-flow-editor": patch
"@memberjunction/ng-list-detail-grid": patch
"@memberjunction/ng-list-management": patch
"@memberjunction/ng-livekit-room": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-record-changes": patch
"@memberjunction/ng-record-merge": patch
"@memberjunction/ng-record-process-studio": patch
"@memberjunction/ng-record-tags": patch
"@memberjunction/ng-resource-permissions": patch
"@memberjunction/ng-scheduling": patch
"@memberjunction/ng-search": patch
"@memberjunction/ng-testing": patch
"@memberjunction/ng-timeline": patch
"@memberjunction/ng-trees": patch
"@memberjunction/ng-versions": patch
"@memberjunction/ng-whiteboard": patch
---

Migrate inline empty-state placeholders to the canonical `<mj-empty-state>` component across Explorer and Generic Angular packages (UI-consistency objective O4), wiring the component into the packages that needed it (and adding `@memberjunction/ng-ui-components` as a dependency where missing). Also fixes reset-filter CTA correctness in three picker dialogs (sub-agent selector, add-action, action gallery) where the handler cleared only a subset of the active filter dimensions, and refines the UI adoption measurement script with a transparent three-tier empty-state count (raw widened → non-placeholder false-positives → wrappers-around-migrated → genuine).
