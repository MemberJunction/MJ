---
'@memberjunction/ng-bootstrap': patch
'@memberjunction/ng-bootstrap-lite': patch
'@memberjunction/server-bootstrap': patch
'@memberjunction/server-bootstrap-lite': patch
---

Regenerate the class-registration manifests. Eleven `@RegisterClass` accounting-action classes were added without regenerating them, so the committed manifests no longer listed every registered class — and a manifest exists precisely to create a static code path the bundler cannot tree-shake. In a bundled app the unlisted classes could be dropped, leaving `ClassFactory` unable to resolve them at runtime: the ERP accounting verbs would fail to register, with no build error to say why.
