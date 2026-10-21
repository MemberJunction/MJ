---
"@memberjunction/ng-whiteboard": patch
---

Whiteboard: markdown panels can be resized taller or shorter by dragging. Agents add panels with a max-height cap and the text beyond it was clipped with no way to reveal it, because the resize gesture never wrote the height. The drag now moves the cap (with a live preview) and is undoable like any resize.
