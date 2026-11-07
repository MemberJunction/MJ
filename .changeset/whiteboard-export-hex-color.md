---
"@memberjunction/ng-whiteboard": patch
---

Whiteboard export writes a text or ink `Color` only when it is a hex color, and loading a board drops (text) or replaces (ink) a non-hex color, so a shared board cannot hide a CSS declaration such as `red;background:url(...)` in an item's color (#5569).
