---
"@memberjunction/conversations-runtime": minor
"@memberjunction/ng-conversations": minor
---

Extract the mention-autocomplete engine out of Angular into `@memberjunction/conversations-runtime`, so a non-Angular host can offer the same `@` / `#` / `/` pickers.

**Why.** `MentionAutocompleteService` was 503 lines of permission-filtered caching and ranking — the agent / user / entity / query / skill sets behind every composer trigger, the `/` picker's target-agent narrowing, and the per-trigger match scoring. It imported nothing from `@angular/*` and carried no decorator; it was Angular-coupled purely by which package it sat in. `MentionParser`, the other half of the same feature, already lived in the runtime.

That location was the problem. The React Native app needs the same three pickers, and a native host cannot depend on an Angular library — so reaching them would have meant writing the agent/skill run-permission filtering, the accepted-skills intersection and the ranking a second time. A second copy of a *permission* rule is the copy that drifts, and it drifts silently in the direction of showing someone a skill they may not run.

**What moved:** `MentionAutocomplete` (the engine), `IntersectAcceptedSkills` (the `/` narrowing rule), and the `MentionSuggestion` / `MentionSuggestionPreset` data shapes. Reachable as `ConversationsRuntime.Instance.MentionSuggestions` or directly as `MentionAutocomplete.Instance`.

**On the suggestion types.** `@memberjunction/ng-composer` keeps its own structurally identical `MentionSuggestion` — that one is a *rendering* contract (what a dropdown row and a chip display), this one is a *data* contract (what a suggestion engine produces). They are kept assignable so the Angular shim passes runtime suggestions straight through with no mapping. Deliberately NOT consolidated: `ng-composer`'s type is consumed by Explorer's omnibar across a dozen files, and MJ forbids cross-package re-exports, so unifying them would have meant a wide, unrelated churn in a branch that had no business causing it.

**No behaviour change.** `MentionAutocompleteService` remains importable from `@memberjunction/ng-conversations` with the same name and the same `.Instance` accessor — it is now an alias for the runtime engine, so there is still exactly one instance and one cache warm-up shared with the ClassFactory-instantiated trigger providers. Verified by the package's own suites: 1,319 tests green in `ng-conversations`, 122 in the runtime (the five skill-narrowing tests moved with the code they cover).

`skill-picker-narrowing.ts` is gone from `ng-conversations`; import `IntersectAcceptedSkills` from `@memberjunction/conversations-runtime` instead. No in-repo consumer outside its own test.
