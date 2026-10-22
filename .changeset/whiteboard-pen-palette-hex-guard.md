---
"@memberjunction/ng-whiteboard": patch
---

`PenPalette` / `PenColors` entries must now be hex colors (`#rgb` or `#rrggbb`); anything else is dropped like a blank entry. The guard is `IsWhiteboardHexColor`, exported from `whiteboard-state` and shared with the agent tools' text-color check. Closes the path where a non-hex entry such as `url(...)` reached the swatch `style.background`, which Angular does not sanitize. README documents the `PenPalette` input.
