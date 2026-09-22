---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-artifacts": patch
---

Ask the user where a generated panel goes, instead of applying the slot it proposed.

`MjFormPlacementDialogComponent` shows the form the panel is about to join — its slots as
targets, its field sections and related grids as context — and collects the answers the
`MJ: Entity Form Contributions` row needs: slot, presentation, title, icon, what it replaces,
and whether it starts now or as a draft. `InteractiveFormApplyService` opens it in place of
the old yes/no confirm and writes what comes back.

The `formContribution` block a component carries now splits by who can know it. Presentation,
title and icon describe what the component is, so they seed the dialog. Slot, claims and
ordering are placement, so they are seeded from a fixed default — the same request produces
the same starting point every time, whether or not the block names one.

A contribution key is written only when the user chooses to stand in for a panel already on
the form. That is what makes one contribution replace another, so it follows the intent
rather than the component's own naming, and the write path still derives the key for a
related-grid claim.

The dialog offers only sections the form actually has, which removes the "that section does
not exist, add it as an extra pane instead?" question the apply flow used to ask afterwards.
`Get Form Composition For Entity` supplies the targets when the caller is not on the record,
which is the common case from a conversation.
