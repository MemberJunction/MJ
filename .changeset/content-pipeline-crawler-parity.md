---
"@memberjunction/content-autotagging": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/content-pipeline-base": minor
---

Content pipeline: the website crawler's Discover gains sitemap seeding, walks in parts and page rendering, and Extract can read pages through a renderer.

`AutotagWebsite.Discover` now runs `WebsiteCrawl`: breadth-first over in-scope links (same root URL, pattern, `MaxDepth` and sibling-path rules as before), with its frontier and the URLs it has seen kept in a compact resume token, so a crawl past its deadline carries on in its next walk (each part reads at least one page, so a walk always moves on). New `Configuration.Website` settings: `UseSitemaps` (seed from the sitemaps robots.txt names, else /sitemap.xml, following sitemap indexes; a page whose `lastmod` is older than the walk's `Since` is not reported but its links are followed), `SitemapURLs`, `CrawlDelayMs` (default 1000), `MaxPages` and `RenderTimeoutMs`. The legacy `Autotag` crawl is unchanged.

Page rendering: `BasePageRenderer` (content-pipeline-base) is a registered way of loading a page as a browser builds it, chosen per source with `Configuration.PageRenderer`. The pipeline ships `Headless` (`HeadlessPageRenderer`), which loads pages in a headless Chromium through Playwright, an optional peer dependency imported only when a page is rendered; one browser is shared and closed after a minute idle. Every request a rendered page makes is refused when it resolves to a private or reserved address (MJ's SSRF guard), and the source's session headers go only to the session's own origins. The crawler reads pages through the source's renderer, and Extract fetches a web page through it when the source names one and its driver has no `Fetch` of its own; a page the renderer reports as an error status fails as an HTTP fetch would. Login works as before, through the Access layer.
