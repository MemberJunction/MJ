---
"@memberjunction/ng-conversations": patch
---

`showAgentRunDetails=false` now hides the whole agent run-details section rather than only its grid, and the gear button that opens the panel renders only when that panel would actually have content.

Previously the flag gated the run-detail grid but left the section's "… Run Details" header — and, more visibly, left the gear icon opening onto an empty popup. The gate now sits at the panel root, and `hasAgentDetailsPanelContent` mirrors the panel's three sibling blocks exactly (run details when enabled, associated tasks, and on non-last messages the delete/rating/pin overflow), so a white-labeled end-user surface with run details off and no message actions gets no gear at all. The rating arm is AND-gated on `messageStatus === 'Complete'` to match the template, which only renders the rating in that branch.

Default behavior is unchanged: with `showAgentRunDetails=true` the gate is unconditionally true, so the gear renders for every agent-run message exactly as before — including the pre-existing window where the run record hasn't loaded yet.
