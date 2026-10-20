---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-explorer-core": patch
---

Records preview tabs are promoted on first edit (#4345).

The edit protection #4154 shipped was transient: a record left the records region's
temp-tab pool only while its form was in edit mode, so the moment the user saved, the
tab silently rejoined the pool and the next plain row click replaced it. While editing,
the tab also stayed unpinned and therefore italic — the shell's vocabulary for
"replaceable" — on a tab that was in fact protected.

A records preview tab is now **pinned the moment its form enters edit mode**, matching
VS Code's promote-on-modify: it is neither replaceable nor italic from then on, and
promotion is sticky across save and cancel.

- `BaseFormComponent.EditModeChanged` (`EventEmitter<boolean>`) fires from
  `StartEditMode` / `EndEditMode`; `MjEntityFormHostComponent` relays it and emits
  `true` after mount when a form starts in edit mode (`StartInEditMode`, new records).
- `BaseResourceComponent.ResourceEditModeChangedEvent` is the shell-side callback;
  `EntityRecordResource` forwards the form's edge to it. `IsEditing()` stays as the
  fallback the pool predicate consults.
- `WorkspaceStateManager.PinTab(tabId)` pins idempotently (no configuration write when
  already pinned, so born-pinned new-record tabs stay quiet).
- `TabContainerComponent.PromoteRecordTabOnEdit` pins on the `true` edge, scoped to the
  records region: docked records and classic-style tabs keep user-owned pin state.
- A component reattached from the cache while still in edit mode is promoted on reattach
  (the reattach never re-runs `StartEditMode`, so `IsEditing()` is read at that seam).
