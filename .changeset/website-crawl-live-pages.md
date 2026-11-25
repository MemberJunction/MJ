---
"@memberjunction/core": minor
"@memberjunction/content-autotagging": minor
"@memberjunction/content-pipeline-base": minor
"@memberjunction/network-utils": minor
---

The website crawl behind `AutotagWebsite.Discover` reports only pages it has fetched and found alive, and reads sites politely.

A link is now fetched before it is reported: a lasting client error (a 4xx other than 408, 425 and 429) is remembered as dead and never becomes an item; a Cloudflare challenge (`cf-mitigated`), a server error or no answer is tried once more at the end of the queue and then reported for Extract to decide; a file that is not HTML is reported without its links being read. The pages one level past `MaxDepth` are fetched (to know they are alive) but not read for links. `MaxPages` keeps its meaning, the most pages whose links are read: once it is reached the pages already found are still checked and reported, unread, and dead pages, files and retries do not count. A page's `Last-Modified` now filters it against the walk's `Since`, as a sitemap `lastmod` already did. The resume token is now version 2; a version-1 token restarts the walk from the start page.

Politeness: a host that answers 429 (or 503 with Retry-After) is paused for the longer of what it asks and an exponential backoff, retried, then paced; a page still limited goes to the back of the queue rather than losing its links (`Configuration.Website.RateLimit`: `MaxRetries` 3, `BackoffMs` 2000, `MaxBackoffMs` 60000, `LimitedIntervalMs` 1000). `Website.Concurrency` (default 1) fetches that many pages at a time.

New, all off by default: `Website.MergeWwwAndScheme`, `StripTrackingParams` / `StripQueryParams`, `DedupCanonical`, `DedupRedirects`, `LoopLimit`, `SkipCalendarPaths`, `IncludePatterns` / `ExcludePatterns` (substrings, or `re:` regular expressions; the start page is always visited for its links), `UserAgent` and `MaxResponseBytes`. `network-utils` gains `HttpRequestConfig.UserAgent` and `MaxResponseBytes` (refused while reading, `HttpError.IsTooLarge`; an error answer past it keeps its status, with no body). A sitemap is read up to the protocol's 50 MB rather than `MaxResponseBytes`, and a sitemap that cannot be read is logged. The options are documented on `IContentSourceConfiguration` (metadata JSONType), which CodeGen turns into the generated Configuration type.
