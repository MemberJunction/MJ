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

---

**Data Explorer is now the app's own surface when opened from Apps.** The nav items declare
`DataExplorerResource`, `QueryBrowserResource` and `DashboardBrowserResource`, and nothing had
claimed those driver classes — so opening the application showed "opens on desktop" while the same
lists sat one tab away on Home. They are registered through `MJGlobal.ClassFactory` against the
same driver strings the Angular shell resolves, so it is one navigation model with two hosts and no
branch anywhere that recognises Data Explorer by name. A deployment can still override any of them
by registering a higher-priority subclass, which a special case in the host would have prevented.

The list bodies moved to `src/explorer/ExplorerLists.tsx` and are shared by the Home routes and the
hosted surfaces — the host already draws a header and back button, so a screen with its own would
stack two, and a second implementation is how "the list in Apps" and "the list on Home" start
behaving differently.

**The dashboard list shows `Type = 'Config'` only.** A `Code` dashboard's panels ARE an Angular
component and a `Dynamic Code` dashboard's are generated for a browser; neither has anything a
native surface can render, which is why every one of them used to be listed and then apologise. A
list whose rows mostly cannot be opened stops being a menu of what you can do. The standing "built
for desktop" notice went with them, since it is no longer true of anything in the list.
