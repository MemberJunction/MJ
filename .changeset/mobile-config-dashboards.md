---
"@memberjunction/mobile-app": patch
---

Compose dashboards from Data Explorer, and make dashboard tables readable on a phone.

**The gap.** All 15 dashboards in MJ are `Type = 'Code'` — their panels are an Angular component,
which is exactly why none of them render anywhere but Explorer, and why the mobile `Dashboards`
resource had nothing real to show. `Config` dashboards are data, and data renders wherever there is
a renderer. There were none, so nothing could demonstrate the generic path.

**Compose one.** `/explorer/dashboard/new` picks approved saved queries, orders them, and saves a
`Config` dashboard. It writes the same Golden Layout tree MJ Explorer reads — a mobile-only shape
with a converter would produce dashboards only one client could open, which defeats building them
from metadata. It composes from saved queries rather than arbitrary SQL because a query is already
named, permissioned and approved.

**Two fixes the first composed dashboard exposed immediately:**

- Tabular panels rendered as a horizontally-scrolling four-column grid, so a phone showed a row of
  GUIDs clipped mid-value with the meaningful columns off the right edge. Rows now stack as
  label/value cards — the same decision the Data artifact renderer makes, and the only layout where
  a wide row stays readable without panning.
- The composer offered queries requiring a parameter with no default. A dashboard panel supplies no
  parameters, so one of those renders `Parameter validation failed` where a panel should be. They
  are excluded, with a count of how many and why.
