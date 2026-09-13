---
"@memberjunction/ng-action-gallery": patch
"@memberjunction/ng-actions": patch
"@memberjunction/ng-agent-client": patch
"@memberjunction/ng-agent-requests": patch
"@memberjunction/ng-agents": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/ng-archive-manager": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-auth-services": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-base-types": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-chat": patch
"@memberjunction/ng-clustering": patch
"@memberjunction/ng-code-editor": patch
"@memberjunction/ng-composer": patch
"@memberjunction/ng-container-directives": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-credentials": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-data-context": patch
"@memberjunction/ng-deep-diff": patch
"@memberjunction/ng-entity-action-ux": patch
"@memberjunction/ng-entity-card": patch
"@memberjunction/ng-entity-communications": patch
"@memberjunction/ng-entity-form-dialog": patch
"@memberjunction/ng-entity-permissions": patch
"@memberjunction/ng-entity-relationship-diagram": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-modules": patch
"@memberjunction/ng-explorer-service-worker": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-export-service": patch
"@memberjunction/ng-feedback": patch
"@memberjunction/ng-file-storage": patch
"@memberjunction/ng-filter-builder": patch
"@memberjunction/ng-find-record": patch
"@memberjunction/ng-flow-editor": patch
"@memberjunction/ng-forms": patch
"@memberjunction/ng-gantt": patch
"@memberjunction/ng-generic-dialog": patch
"@memberjunction/ng-graph-view": patch
"@memberjunction/ng-hierarchy-tree": patch
"@memberjunction/ng-join-grid": patch
"@memberjunction/ng-kanban": patch
"@memberjunction/ng-link-directives": patch
"@memberjunction/ng-list-detail-grid": patch
"@memberjunction/ng-list-management": patch
"@memberjunction/ng-livekit-room": patch
"@memberjunction/ng-map-view": patch
"@memberjunction/ng-markdown": patch
"@memberjunction/ng-media-player": patch
"@memberjunction/ng-mj-livekit-room": patch
"@memberjunction/ng-notifications": patch
"@memberjunction/ng-pagination": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-react": patch
"@memberjunction/ng-record-changes": patch
"@memberjunction/ng-record-merge": patch
"@memberjunction/ng-record-process-studio": patch
"@memberjunction/ng-record-selector": patch
"@memberjunction/ng-record-tags": patch
"@memberjunction/ng-resource-permissions": patch
"@memberjunction/ng-scheduling": patch
"@memberjunction/ng-search": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-simple-record-list": patch
"@memberjunction/ng-tabstrip": patch
"@memberjunction/ng-task-graph-editor": patch
"@memberjunction/ng-tasks": patch
"@memberjunction/ng-testing": patch
"@memberjunction/ng-timeline": patch
"@memberjunction/ng-trees": patch
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-user-avatar": patch
"@memberjunction/ng-user-routines": patch
"@memberjunction/ng-versions": patch
"@memberjunction/ng-whiteboard": patch
"@memberjunction/ng-word-cloud": patch
"@memberjunction/ng-workspace-initializer": patch
---

Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
(i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
(or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
unchanged.

Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).
