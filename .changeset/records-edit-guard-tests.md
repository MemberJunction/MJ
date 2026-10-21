---
"@memberjunction/ng-explorer-core": patch
---

test(explorer-core): pin the records-region edit-mode guard (#4344)

The preview-tab model (#4154) guarantees a record whose form is in edit mode is never silently replaced by the next record open. The guard was shipped without a test: the base-application pool specs inject their own region predicate, so dropping the `!IsRecordTabEditing(tab.id)` clause from the shell's composed filter left every existing test green while edits vanished.

Three node-preset specs now pin it, no production changes:

- `shell-records-edit-guard.test.ts` drives the REAL `ShellComponent.resolveRecordOpenStyle()` onto a real `WorkspaceStateManager` with a fake tab container: an editing tab is not consumed (the next plain open creates its own tab), the same tab is consumable once editing ends, the startup window before `TabContainerRef` resolves fails safe, docked records stay out of both pools, and the classic style yields no pool at all.
- `record-tab-editing.test.ts` pins `TabContainerComponent.IsRecordTabEditing`: true only for a loaded component reporting edit mode; false for unknown, unloaded, or non-editing tabs.
- `record-resource-editing.test.ts` pins the `EntityRecordResource` -> `SingleRecordComponent` -> `Form.EditMode` reads, each answering false while its view child is unresolved.
