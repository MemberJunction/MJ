---
"@memberjunction/ng-whiteboard": patch
---

`<mj-realtime-whiteboard-host>` gains a `ShowFocusToggle` input (default `true`). The header's Focus toggle ("Move to stage" / "Back to tab") only emits `FocusModeChange`; a host that composes the board into its own chrome has nothing to collapse, so the button was visible and did nothing, and could only be removed by `!important` CSS against an internal class name. Hosts without a stage now pass `[ShowFocusToggle]="false"`. `SetOnStage` and `FocusMode` keep working with the toggle hidden; the rest of the header is unchanged.
