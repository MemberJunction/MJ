---
"@memberjunction/ng-flow-editor": patch
---

Exact-pin `@foblex/flow` to `18.0.0` so downstream npm and yarn installs do not resolve `18.1.0+`, where renamed directive and component exports (`FExternalItemDirective`, `FSelectionAreaComponent`) break the precompiled Ivy output at runtime with `NG0919`.
