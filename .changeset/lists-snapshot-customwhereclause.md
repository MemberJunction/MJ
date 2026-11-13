---
"@memberjunction/lists": patch
---

Refresh from a saved view snapshot (`UseSnapshot = true`) works again. The snapshot stores the view's `CustomWhereClause` bit as `customWhereClause`, but the refresh read it as filter text: a `false` gave "no usable SourceFilterSnapshot" and a `true` threw on `.trim()`. The refresh now filters on the snapshot's `whereClause`, which is the clause a live run of the view applies, and falls back to `smartFilterWhereClause` when that is empty.
