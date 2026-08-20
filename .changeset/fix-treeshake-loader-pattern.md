---
'@memberjunction/ng-dashboards': patch
'@memberjunction/ng-clustering': patch
---

Harden the `@RegisterClass` tree-shaking loader pattern so registration survives an
aggressive build.

Calling the loader functions from a module *constructor* only runs if something
constructs the module, and the calls are plain statements a `sideEffects: false`
build is free to drop. When a loader is elided the component never registers, its
driver class resolves to nothing, and the tab renders "This view isn't available in
the running build."
