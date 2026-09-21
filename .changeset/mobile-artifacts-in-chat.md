---
"@memberjunction/mobile-app": patch
---

Artifacts in the chat thread, a renderer registry, and the query builder's output.

**In the thread.** An artifact now appears as a card under the turn that produced it.
`MJ: Conversation Details` carries `ArtifactID` directly, so the association is a column read. The
dock above the composer stays — "what did this conversation produce" and "what did *that* turn
produce" are different questions and neither answer replaces the other.

**A registry instead of a heuristic.** Renderers resolve by artifact type name and content type
through `MJGlobal.ClassFactory`, with the same priority ordering and tie-break `ng-conversations`
uses for its viewer plugins — so an artifact type added to MJ metadata reaches a renderer by
registration. The previous path sniffed the type name and then the content to invent a `kind` the
web has no concept of; it survives as the fallback for types not yet moved over, which is honest
about being a guess.

**The Data artifact renders.** Query-builder output shows its interpretation, its rows and the SQL
behind them. `NormalizeToTables` from `@memberjunction/core` already collapses both the multi-table
snapshot and the legacy single-table shape, so mobile uses it directly and cannot disagree with the
web about what a row is. Rows stack as label/value cards rather than a grid: a 9-column grid on a
390pt screen is a horizontal scrollbar with a table hidden behind it.

**Percentage styles no longer vanish.** The web→RN style normalizer grouped `%` with `vh`/`vw` as a
unit React Native "cannot resolve" and dropped it. RN resolves percentages natively on dimensions,
position and spacing — so an agent-authored bar chart rendered as six identical full-width bars,
every one reading 100%. Percentages are now kept on the properties RN resolves them for and dropped
only where RN would ignore them anyway. Found by rendering a real interactive component, which is
the only way this class of defect shows up.
