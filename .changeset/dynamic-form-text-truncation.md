---
"@memberjunction/ng-forms": patch
---

Stop the chat-embedded interactive form from clipping long text. Agent-authored labels are routinely sentence-length, and the form's layout sized every option to its content width with no ability to shrink — so anything wider than the card ran off the edge and was silently chopped by the card's `overflow: hidden` (no ellipsis, no scrollbar, just missing words).

- **Radio and checkbox options now wrap.** Options size to their content and share a row when they fit, but an option too wide for the row takes the row to itself and wraps its label rather than overflowing. Options and labels are top-aligned so the control lines up with the first line of a multi-line label.
- **Dropdowns size to their widest option** (bounded by the card) instead of a fixed 350px cap that truncated the selected label. `widthHint: 'auto'` is legal on any question type, so text controls under that hint keep their previous bound — only the select needed the extra room.
- **The form card allows more room** before its contents have to wrap (600px → 720px), and the default text-field width follows (450px → 560px).
- **Button groups wrap to a second row** instead of scrolling horizontally. The previous `overflow-x` scroller sat inside a vertically-scrolling chat column, where overlay scrollbars hid the overflowing options entirely rather than signalling them; it also clipped the buttons' focus ring. Now consistent with `.footer-choice-button` and `.choice-button`, the sibling button paths in the same form.
- **Radio/checkbox option labels are 14px**, matching every other control in the form. They were the only text here with no size of their own, so they inherited the host app's body size (~16px) and rendered larger than the question they answer.
- **Single-line controls degrade to an ellipsis** rather than a mid-word cut when a value or placeholder still exceeds the field.
- **The submitted-answer pill wraps too** — it was `white-space: nowrap` with no max-width, so a sentence-length answer ran past the message.
- **The multi-field answer card no longer overflows a narrow message column.** Its `min-width: 400px` unconditionally beat its own `max-width: min(800px, 100%)` (min-width always wins), and the guards below it key off the viewport rather than the column — so a narrow chat panel on a wide screen never reached them. Now `min(400px, 100%)`.
