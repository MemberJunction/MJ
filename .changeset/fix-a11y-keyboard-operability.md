---
'@memberjunction/ng-dashboards': patch
---

Make two mouse-only controls keyboard-operable.

- **Query browser splitter** — had no role and no keyboard affordance, so the panel
  could only be resized by dragging. Now a real keyboard-operable separator with TS
  handlers and focus styling.
- **Integration entity-map rows** — were click-only. Now `role="button"`, `tabindex`,
  `aria-label`, and Enter/Space activation.
