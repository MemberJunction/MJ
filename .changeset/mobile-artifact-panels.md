---
"@memberjunction/mobile-app": patch
---

Artifacts render **in** a dashboard panel, including interactive components.

A dashboard's artifact part rendered as a link row reading "Open artifact". A dashboard whose
panels are doors to things is not a dashboard — the point is seeing several things at once without
opening any of them. The panel now renders the artifact through `ArtifactContentView`, the same
dispatch the artifact detail screen uses, extracted from that route so a component drawn on a
dashboard and the same component drawn from a chat thread cannot diverge. A footer link still opens
it full screen, because a panel is a summary.

The dashboard composer offers artifacts alongside saved queries, narrowed to the types that render
as a panel rather than a document. An agent-authored interactive component IS an artifact, so
putting one on a dashboard is how a chart with a drill-down stops being something you open from a
chat thread and becomes something you check. `BuildDashboardConfig` stamps the Artifact part type
and writes `artifactId`, so these dashboards open on the desktop like any other.

Also drops two weak casts introduced in the previous change: `MJConversationArtifactEntity` has a
typed `ArtifactType` getter, and `MJ: Conversation Artifact Versions` has no content-type column at
all — the cast was inventing a field rather than reading one.
