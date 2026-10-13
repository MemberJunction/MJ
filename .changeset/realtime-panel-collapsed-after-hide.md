---
"@memberjunction/ng-conversations": patch
---

A call's side panel comes back expanded, at its usual width, after the panel area hides while the panel is collapsed to its strip. The panel area hides when a channel's surface takes the stage, when the call gets narrower than the console breakpoint, when the Details control closes it, and when a reviewed session becomes a live call. The panel is created again each time it comes back, and a new panel starts expanded, but the overlay kept the collapsed state the old panel had reported (`RealtimeSessionOverlayComponent.PanelCollapsed`) and sized the new panel as the 40 px strip, with no resize handle. The overlay now sets `PanelCollapsed` back to `false` when the panel goes away, so the panel's width, its resize handle and what it shows agree when it returns.
