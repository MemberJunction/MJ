# @memberjunction/ng-forms

## 5.51.2

### Patch Changes

- 679bab9: Stop the chat-embedded interactive form from clipping long text. Agent-authored labels are routinely sentence-length, and the form's layout sized every option to its content width with no ability to shrink — so anything wider than the card ran off the edge and was silently chopped by the card's `overflow: hidden` (no ellipsis, no scrollbar, just missing words).

  This is the clip-fix subset of the change on `next` (#4085). Every rule here is a no-op unless the element is already overflowing; the restyle half of that PR — card and field widening, option-label typography, top-aligned option controls — is deliberately not included on this line.
  - **Radio and checkbox options now wrap.** Options size to their content and share a row when they fit, but an option too wide for the row takes the row to itself and wraps its label rather than overflowing.
  - **Button groups wrap to a second row** instead of scrolling horizontally. The previous `overflow-x` scroller sat inside a vertically-scrolling chat column, where overlay scrollbars hid the overflowing options entirely rather than signalling them; it also clipped the buttons' focus ring.
  - **Single-line controls degrade to an ellipsis** rather than a mid-word cut when a value or placeholder still exceeds the field.
  - **The submitted-answer pill wraps too** — it was `white-space: nowrap` with no max-width, so a sentence-length answer ran past the message.
  - **The multi-field answer card no longer overflows a narrow message column.** Its `min-width: 400px` unconditionally beat its own `max-width: min(800px, 100%)` (min-width always wins), and the guards below it key off the viewport rather than the column — so a narrow chat panel on a wide screen never reached them. Now `min(400px, 100%)`.
  - **The form card can shrink inside a narrow message column** (`min-width: 0`), which it previously could not as a flex item.
  - @memberjunction/ai-core-plus@5.51.2
  - @memberjunction/ng-markdown@5.51.2
  - @memberjunction/ng-ui-components@5.51.2

## 5.51.1

### Patch Changes

- @memberjunction/ai-core-plus@5.51.1
- @memberjunction/ng-markdown@5.51.1
- @memberjunction/ng-ui-components@5.51.1

## 5.51.0

### Patch Changes

- @memberjunction/ai-core-plus@5.51.0
- @memberjunction/ng-markdown@5.51.0
- @memberjunction/ng-ui-components@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [623dfc5]
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ng-markdown@5.50.0
  - @memberjunction/ng-ui-components@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [c5e4b9e]
- Updated dependencies [b52ffa8]
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/ng-markdown@5.49.0
  - @memberjunction/ng-ui-components@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/ai-core-plus@5.48.0
- @memberjunction/ng-markdown@5.48.0
- @memberjunction/ng-ui-components@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/ai-core-plus@5.47.0
- @memberjunction/ng-markdown@5.47.0
- @memberjunction/ng-ui-components@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/ai-core-plus@5.46.0
- @memberjunction/ng-markdown@5.46.0
- @memberjunction/ng-ui-components@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ng-markdown@5.45.1
  - @memberjunction/ng-ui-components@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [13716e4]
- Updated dependencies [6125dcd]
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
  - @memberjunction/ng-ui-components@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/ng-markdown@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [f8be8a0]
- Updated dependencies [1e5e449]
- Updated dependencies [0476455]
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/ng-ui-components@5.44.0
  - @memberjunction/ng-markdown@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [9f6aa87]
- Updated dependencies [54183aa]
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/ng-ui-components@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [313c1c5]
- Updated dependencies [256ab06]
- Updated dependencies [e7c2437]
  - @memberjunction/ng-ui-components@5.42.0
  - @memberjunction/ai-core-plus@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [4b3fb9d]
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/ng-ui-components@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai-core-plus@5.40.2
- @memberjunction/ng-ui-components@5.40.2

## 5.40.1

### Patch Changes

- @memberjunction/ai-core-plus@5.40.1
- @memberjunction/ng-ui-components@5.40.1

## 5.40.0

### Patch Changes

- @memberjunction/ai-core-plus@5.40.0
- @memberjunction/ng-ui-components@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [bd95e83]
- Updated dependencies [3b29882]
- Updated dependencies [d1cc0ad]
  - @memberjunction/ng-ui-components@5.39.0
  - @memberjunction/ai-core-plus@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [6b6c321]
- Updated dependencies [8bd97f3]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/ng-ui-components@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [22b775f]
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/ng-ui-components@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [1c0fce9]
  - @memberjunction/ng-ui-components@5.36.0
  - @memberjunction/ai-core-plus@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [ee380f7]
- Updated dependencies [32c4a02]
- Updated dependencies [ac4b9a5]
  - @memberjunction/ng-ui-components@5.35.0
  - @memberjunction/ai-core-plus@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [5abf790]
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ng-ui-components@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/ng-ui-components@5.34.0

## 5.33.0

### Patch Changes

- @memberjunction/ai-core-plus@5.33.0
- @memberjunction/ng-ui-components@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/ai-core-plus@5.32.0
- @memberjunction/ng-ui-components@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/ng-ui-components@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/ng-ui-components@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [4729398]
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/ng-ui-components@5.30.0

## 5.29.0

### Patch Changes

- @memberjunction/ai-core-plus@5.29.0
- @memberjunction/ng-ui-components@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/ai-core-plus@5.28.0
- @memberjunction/ng-ui-components@5.28.0

## 5.27.1

### Patch Changes

- @memberjunction/ai-core-plus@5.27.1
- @memberjunction/ng-ui-components@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai-core-plus@5.27.0
- @memberjunction/ng-ui-components@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
  - @memberjunction/ng-ui-components@5.26.0
  - @memberjunction/ai-core-plus@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/ai-core-plus@5.25.0
- @memberjunction/ng-ui-components@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/ng-ui-components@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [58af481]
- Updated dependencies [fb0c69f]
- Updated dependencies [1d1e02e]
  - @memberjunction/ng-ui-components@5.23.0
  - @memberjunction/ai-core-plus@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
  - @memberjunction/ai-core-plus@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [76cd2bc]
  - @memberjunction/ai-core-plus@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/ai-core-plus@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-core-plus@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
  - @memberjunction/ai-core-plus@5.18.0

## 5.17.0

### Patch Changes

- @memberjunction/ai-core-plus@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/ai-core-plus@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [c3e8b94]
  - @memberjunction/ai-core-plus@5.15.0

## 5.14.0

### Patch Changes

- @memberjunction/ai-core-plus@5.14.0

## 5.13.0

### Patch Changes

- @memberjunction/ai-core-plus@5.13.0

## 5.12.0

### Patch Changes

- @memberjunction/ai-core-plus@5.12.0
