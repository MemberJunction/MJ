---
"@memberjunction/ng-base-forms": patch
---

Generated forms on entities with many related-entity panels no longer peg the CPU. Resolving form contributions keyed every related panel by scanning every other panel with `UUIDsEqual`, which is O(n²) in the entity's `DisplayInForm` relationships. The resolution runs once per `formContext` binding on every change-detection pass, and the MJ: Users form has 134 of those bindings. `ResolveFormContributions` and `ContributionHiddenSectionKeys` now count each related entity once per resolution, which makes the pass linear. `RelatedEntitySectionKey` keeps its signature and output, and now normalizes its target once and stops at the second match.

New public export: `CreateRelatedEntitySectionKeyResolver(displayInFormPeers)` returns a function that gives `RelatedEntitySectionKey`'s answer for any relationship against one fixed peer set. Use it to key many relationships against the same peers in linear time.

`guides/UUID_COMPARISON_GUIDE.md` gains Pattern 8, on nested and per-render comparisons.
