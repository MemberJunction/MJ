---
"@memberjunction/core-actions": minor
---

Add a Brave Search action and give Perplexity Search a structured `search` mode.

Google discontinues the Custom Search JSON API on 2027-01-01 and has already closed it to new
customers, so MJ needs a web-search provider that is not Google's and not a proxy for Google's.
Brave serves from its own index, returns the same `title`/`url`/`snippet` shape the Google action
returns, and therefore fails independently of it.

- **New `Brave Search` action** (`braveApiKey` in `mj.config.cjs`, or `BRAVE_SEARCH_API_KEY`).
  Supports `Count`, `Offset`, `Country`, `SearchLang`, `SafeSearch`, `Freshness` and
  `ExtraSnippets`; clamps out-of-range paging rather than letting Brave reject the request;
  reports zero results as success.
- **`Perplexity Search` gains a `Mode` parameter, defaulting to `search`.** It previously always
  called `/chat/completions` — the Sonar chat models — which bills per token, takes seconds, and
  returns prose plus a flat citation list. `Mode: 'search'` calls the raw `/search` endpoint
  instead: structured results, sub-second, flat-priced per query. `Mode: 'answer'` preserves the
  previous behaviour exactly. `Citations` is still emitted in `search` mode, so callers reading
  only the URL list are unaffected.
- Corrects the `config.ts` guidance that recommended Perplexity as the Google successor; Gemini
  grounding is documented there as non-viable for this use (expiring redirect URLs, no snippets,
  and terms that forbid caching or analysing results).
