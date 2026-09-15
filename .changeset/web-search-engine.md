---
"@memberjunction/web-search-engine": minor
"@memberjunction/core-actions": minor
---

Add `@memberjunction/web-search-engine` — metadata-driven web search with provider failover.

Google discontinues the Custom Search JSON API on 2027-01-01 and Microsoft retired the Bing Search
APIs in 2025. MJ had four independent web-search Actions with three incompatible output contracts,
so nothing could transparently fall back and swapping vendors meant editing every agent that named
one. This makes the vendor a row in a table.

- **New `__mj.WebSearchProvider` table** — `DriverClass`, `Status`, `Priority`, `CredentialID`,
  `ProviderConfig`, `MaxResultsOverride`, `AllowResultCaching`. A near-mirror of `SearchProvider`,
  deliberately, so the two are learnable together.
- **New `WebSearchEngine`** — orders providers by `Priority` and serves from the first Active,
  available one. Failover is conditional: a transient failure (rate limit, 5xx, timeout, a
  rejected credential) moves to the next provider; a permanent one — the query itself rejected —
  stops, because every other vendor will reject it too. That distinction is drawn from the
  response body rather than the status code alone, since Google answers an invalid API key with
  HTTP 400 while Perplexity and Exa use 401. An explicitly named `Provider` never falls back, and
  fails with a code that distinguishes never-configured, parked, uncredentialed and incapable.
- **Five drivers** — Brave (own index, default primary), Tavily, Perplexity (`/search`, not the
  chat models), Google Custom Search (retiring), DuckDuckGo (keyless last resort).
- **`Web Search` Action is now a provider-neutral router**, so agents bind to one stable tool and
  never make the vendor decision. DuckDuckGo becomes one driver behind it rather than the
  implementation. Its HTML-scraping fallback was **removed**, not carried over: CodeQL flagged
  polynomial ReDoS and incomplete sanitization in the parser's regexes over remote HTML, and for a
  fallback inside a last-resort provider the capability was not worth the exposure. The driver now
  answers only what DuckDuckGo's Instant Answer API returns, which is a minority of queries. The
  regression test was removed with the code it tested. No regex runs over remote input anywhere in
  the package.
- **`WebSearch.Query` Remote Operation** — metadata, the `websearch:execute` scope, and the server
  implementation, so browser clients get the same capability without API keys leaving the server.
- **Agents and skills rebound.** Every agent and skill that does web lookups now binds the
  provider-neutral `Web Search` Action and leaves `Provider` unset so the engine can fail over.
  `Google Custom Search` and `Perplexity Search` remain registered for direct or manual execution
  but carry no agent or skill bindings, and the rows removed from metadata are annotated for
  deletion so existing databases lose them too.
