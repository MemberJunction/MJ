---
"@memberjunction/web-search-engine": patch
"@memberjunction/core-actions": patch
---

fix(web-search): `IncludeAnswer` is a preference, not a requirement

The same workflow then failed at its next step for an unrelated reason that the fix above made visible. The Demo Loop Agent set `IncludeAnswer: true` on its Web Search calls, and the engine responded by filtering the provider list down to answer-capable providers — none, on an install with only Google Custom Search and DuckDuckGo — and failing every search with `NO_ELIGIBLE_PROVIDER`. Whether the flag got set depended on which model was driving the agent, so the identical query worked on one model and failed on another.

An agent can read hits; it cannot read an error. `WebSearchEngine.resolveByPriority` now prefers an answer-capable provider when one exists and otherwise serves plain results from the full priority list, with `IncludeAnswer` cleared before the drivers run and a new `WebSearchResult.Notice` saying what was dropped and why. The explicit-provider path is unchanged: naming a provider and demanding an answer it cannot give is a caller mistake and still returns `PROVIDER_LACKS_CAPABILITY`. The Web Search action surfaces `Notice` as an output parameter.
