---
"@memberjunction/ai-agents": patch
"@memberjunction/core-actions": patch
"@memberjunction/core-entities": patch
"@memberjunction/integration-actions": patch
"@memberjunction/ng-action-gallery": patch
"@memberjunction/ng-code-editor": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-entity-relationship-diagram": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-tasks": patch
"@memberjunction/ng-ui-components": patch
"@memberjunction/server": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/skip-types": patch
---

Fix missing dependencies across 17 packages that accumulated while knip dependency checking was silently broken. Repair knip infrastructure: disable crashing vitest plugin, harden CI workflow to fail-fast on tool crashes instead of silently passing, and fix hardcoded Angular version in auto-fix script.
