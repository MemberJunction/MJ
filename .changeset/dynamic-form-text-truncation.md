---
"@memberjunction/ng-forms": patch
---

Stop the chat-embedded interactive form from clipping long text. Agent-authored labels are routinely sentence-length, and the form's layout sized every option to its content width with no ability to shrink — so anything wider than the card ran off the edge and was silently chopped by the card's `overflow: hidden` (no ellipsis, no scrollbar, just missing words).

This is the clip-fix subset of the change on `next` (#4085). Every rule here is a no-op unless the element is already overflowing; the restyle half of that PR — card and field widening, option-label typography, top-aligned option controls — is deliberately not included on this line.

- **Radio and checkbox options now wrap.** Options size to their content and share a row when they fit, but an option too wide for the row takes the row to itself and wraps its label rather than overflowing.
- **Button groups wrap to a second row** instead of scrolling horizontally. The previous `overflow-x` scroller sat inside a vertically-scrolling chat column, where overlay scrollbars hid the overflowing options entirely rather than signalling them; it also clipped the buttons' focus ring.
- **Single-line controls degrade to an ellipsis** rather than a mid-word cut when a value or placeholder still exceeds the field.
- **The submitted-answer pill wraps too** — it was `white-space: nowrap` with no max-width, so a sentence-length answer ran past the message.
- **The multi-field answer card no longer overflows a narrow message column.** Its `min-width: 400px` unconditionally beat its own `max-width: min(800px, 100%)` (min-width always wins), and the guards below it key off the viewport rather than the column — so a narrow chat panel on a wide screen never reached them. Now `min(400px, 100%)`.
- **The form card can shrink inside a narrow message column** (`min-width: 0`), which it previously could not as a flex item.
