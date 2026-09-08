---
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-flow-editor": minor
"@memberjunction/ng-core-entity-forms": patch
---

Let a host form own the flow editor's save, and fix the canvas context menu.

**The flow was never part of the agent form's save.** `InternalSaveRecord` persisted templates, prompts and the agent row; steps and paths were written only by the flow editor's own Save button. That gave one record two save buttons with two failure modes — the form could succeed while the flow failed, leaving an agent that looked saved and step edits that were gone.

`BaseFormSectionComponent` gains an opt-in contract so a section that owns an editor can join the host's transaction: `HasPendingChanges`, `ContributeToSave(transactionGroup)` and `OnHostSaveCompleted()`. All three are no-ops by default, so existing sections are unaffected. `BaseFormComponent.HasAdditionalUnsavedChanges` (default `false`) feeds the container's `EffectiveIsDirty`, so a form holding unsaved editor state no longer reports itself clean — previously the navigate-away guard would discard those edits without asking.

`FlowAgentEditorComponent` splits `Save()` into `QueueSaveInto(transactionGroup)` (queue only, caller submits) plus `MarkSaved()`, and exposes `HasUnsavedChanges`. Two new inputs: **`ShowSaveControls`** (default `false`) hides the editor's own Save / Edit / Cancel and its unsaved indicator, for hosts that own persistence — a host that turns it on is declaring it owns its own save; and `CanvasTitle` (`null` hides the toolbar title) for hosts whose chrome already names the record.

**Context menu fix:** `onContextMenuAction` closed the menu before reading its target, and closing nulls the stored node/connection. Every branch then tested those now-null fields and fell through, so right-click **Remove and Edit both did nothing** — for nodes and connections alike, with the menu closing on click making it look like the action had been taken. The target is now captured before the menu closes, and the undo entry is pushed only once a target is confirmed, so a no-op action no longer leaves a phantom step in the undo stack. Covered by 7 regression tests, 6 of which fail against the old ordering.
