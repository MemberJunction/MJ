---
"@memberjunction/ng-base-forms": patch
---

Foreign-key picker: a dismissed panel stays dismissed, and a press anywhere off the field closes it.

Escape and leaving the field closed the panel, but a lookup still in flight reopened it when its rows arrived, and a keystroke's debounced search fired after blur. On a related entity large enough to be looked up from the database — a person picker on an order, say — any lookup slower than the 200 ms blur grace period reopened the list with nothing focused. Nothing could then close it: Escape is heard only by the focused input, blur had already run, and there was no outside-press handling. Picking a row or scrolling the page was the only way out, and clearing the field started the same lookup again.

- Every dismiss retires the lookup sequence and cancels the debounce, so nothing started before it can reopen the panel. This also covers a row picked while a lookup was still loading.
- While a dropdown is open, a mouse press anywhere outside the field and its body-portaled panel closes it, whether or not the input has focus.
- A blur whose grace period is interrupted by a refocus no longer closes the panel that refocus opened.
