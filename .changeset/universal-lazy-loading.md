---
"@memberjunction/global": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/cli": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-dashboard-viewer": patch
---

Universal lazy loading via ClassFactory async API. Fixes HomeApplication being tree-shaken by moving lazy loading from consumer-specific retry patterns into ClassFactory itself with RegisterLazyLoader, CreateInstanceAsync, and GetRegistrationAsync. Lazy config now uses compound keys (BaseClassName::Key) to support any base class. Adds coverage audit to codegen to detect gaps.
