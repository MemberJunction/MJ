---
"@memberjunction/ng-code-editor": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-find-record": patch
"@memberjunction/ng-task-graph-editor": patch
---

Unstick the DOM unit specs that fail under the M5 joined pnpm workspace. Two physical copies of @angular/core / @codemirror/state (parent store vs MJ store) made CodeMirror throw on EditorState.create, AgGrid crash with firstCreatePass of null, angular-split inject() hit NG0203, and bootstrap constructor inject() fail the same way. The specs now skip those host libraries (toolbar-only CodeMirror init, AgGrid/as-split stubs) and bootstrap inlines Angular through Vite so Analog and TestBed share one copy.
