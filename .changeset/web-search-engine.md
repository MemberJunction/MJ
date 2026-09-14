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
- **New `WebSearchEngine`** — loads Active providers, orders by `Priority`, and serves from the
  first available one. Failover is conditional: a transient failure (rate limit, 5xx, timeout)
  moves to the next provider; a permanent one (the request itself is rejected) stops, because
  every other vendor will reject it too. An explicitly named `Provider` never falls back.
- **Five drivers** — Brave (own index, default primary), Tavily, Perplexity (`/search`, not the
  chat models), Google Custom Search (retiring), DuckDuckGo (keyless last resort).
- **`Web Search` Action is now a provider-neutral router**, so agents bind to one stable tool and
  never make the vendor decision. DuckDuckGo becomes one driver behind it rather than the
  implementation; its HTML parser and the regression test guarding its silently-empty-snippet
  defect move into the driver.
- **`WebSearch.Query` Remote Operation** metadata and `websearch:execute` scope, so browser clients
  get the same capability without API keys leaving the server.

The migration ships with an empty CodeGen tail — it was authored without a database. See the
banner in the migration and the package README for the local completion steps.
