---
"@memberjunction/core-actions": minor
---

Add two web-read actions — **Tavily Search** and **Read RSS Feed** — and fix an environment-variable fallback that never worked.

**Tavily Search** (`custom/web/tavily-search.action.ts`) searches through Tavily, whose results arrive as extracted page content rather than as snippets plus links to go fetch. Two capabilities distinguish it from the other search actions here: `Topic: 'news'` is the only topic that returns a publication date per result and the only one the `Days` window applies to, which is what makes recency-sensitive questions answerable; and `IncludeAnswer` returns a synthesized answer alongside the results, so a caller that only needs the conclusion does not have to run its own summarization pass. Authentication is `Authorization: Bearer <key>` — Tavily still accepts an `api_key` body field, but that form puts the credential in the payload and is not used.

Deliberate behaviours: `MaxResults` is **clamped** to Tavily's cap of 20 rather than rejected, because a caller asking for 50 wants as many as possible and the vendor rejects the whole request above the cap. `Days` on a non-news topic is **dropped with the reason stated** in a `Warnings` output param, since silently forwarding it would leave the caller believing their window applied. Zero results is `Success: true` — a narrow query has a real, empty answer, and reporting failure would send a caller into retrying a query that will keep returning nothing. Failure modes are separated so a caller can act on them: `INVALID_API_KEY` (401/403), `RATE_LIMITED` (429), `INVALID_REQUEST` (400/422, retrying unchanged is pointless), `API_ERROR`, and `SEARCH_FAILED` for a failure with no HTTP response at all.

**Read RSS Feed** (`custom/web/rss-feed-read.action.ts`, with the parsing and scoring split out as the dependency-free `custom/web/rss-feed-parsing.ts`) reads any number of RSS 2.0 or Atom feeds, filters by article age, and optionally scores articles for keyword relevance and recency. It needs no credential.

Parsing is regex-based rather than using a strict XML parser, on purpose: feeds in the wild are frequently malformed, and a strict parser fails the entire document over one unescaped ampersand where the regex costs only the affected item's text. Text extraction decodes entities *before* stripping tags, because RSS descriptions overwhelmingly arrive with their HTML escaped (`&lt;p&gt;`, not `<p>`) — strip first and those tags survive as literal text in the output. A second decode pass afterward finishes values that were escaped twice.

One feed failing is a `FeedStatuses` entry, not an action failure, unless `RequireAllFeeds` is set; feed URLs must be http(s) so this cannot become a local file reader. Undated articles are excluded by default and **counted**, as are articles dropped by the age window, and every such count appears in the result message — so an unexpectedly small answer is explained rather than merely small. A single injected clock serves the whole run, so the age filter and the recency score cannot disagree about what "now" is.

**Fix:** `getCoreActionsConfig()` early-returned an empty parsed config whenever no `mj.config.cjs` was found, so environment variables were ignored entirely — contradicting every schema doc comment and every "or `X_API_KEY` environment variable" error message in the package. A deployment configured only through the environment got a config with no keys and every affected action reported its key as missing. The config build is now hoisted out of that early return, so the documented fallbacks (`PERPLEXITY_API_KEY`, `TAVILY_API_KEY`, `GAMMA_API_KEY`, the Google keys) work as described.

103 new tests cover both actions and the parsing module.
