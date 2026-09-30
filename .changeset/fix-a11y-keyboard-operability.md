---
'@memberjunction/ng-dashboards': patch
---

Make two mouse-only controls keyboard-operable.

- **Query browser splitter** — had no role and no keyboard affordance, so the panel
  could only be resized by dragging. Now a real keyboard-operable separator with TS
  handlers and focus styling.
- **Integration entity-map rows** — were click-only. Each row now has an open button,
  named for its external object and MJ entity. Focus moves into the field-mapping
  editor when it opens, and back to that row's open button when it closes.
