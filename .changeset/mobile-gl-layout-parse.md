---
"@memberjunction/mobile-app": patch
---

Pin the dashboard layout parser against the format MJ Explorer actually writes.

`Dashboard.UIConfigDetails` holds Golden Layout's native `ResolvedLayoutConfig`. The mobile parser
had only ever been fed its own composer's simplified tree, so nothing proved it could read a
dashboard authored on the desktop. Verified against fixtures shaped like the real thing —
components nested in `stack` nodes, `size`/`sizeUnit`, `componentType`, GL's `resolved: true` — and
against two dashboards seeded in that exact format and opened on a device.

It works, and now it is pinned. Two properties matter and are easy to break:

- **Components live inside `stack` nodes**, always, even a stack of one. A walk that only descends
  rows and columns finds nothing in a real Explorer dashboard. A mutation restricting the walk fails
  four of the six new tests.
- **Panels sharing a stack are tabs on a desktop.** A phone has no tabs, so they flatten into the
  list in order and stack vertically — nothing hidden behind a tab the user cannot reach.

`parsePanels` is exported for this.
