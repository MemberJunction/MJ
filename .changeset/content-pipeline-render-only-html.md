---
"@memberjunction/content-pipeline": minor
"@memberjunction/content-pipeline-base": minor
"@memberjunction/content-autotagging": minor
---

A source with a page renderer renders only what is HTML, optionally only when a plain fetch finds the page empty, and can tune how the renderer loads a page.

Extract and the website crawl no longer hand every http(s) address to `PageRenderer`: a HEAD (or the plain response) says what the address is, and a document file (`IsDocumentContentType`: PDF, Word, Excel, PowerPoint, OpenDocument, an image...) is fetched plainly; any other answer, `application/octet-stream` included, is rendered as before. `Configuration.PageRenderMode: 'WhenEmpty'` fetches each page plainly first and renders only an empty, script-only page (`LooksLikeEmptyPage`) or one the site refused to the plain fetch (`RendersAfterRefusal`: a 401, 403 or 5xx, not a 404, 410 or 429); the default `Always` keeps today's behaviour for HTML. A rendered page reaches the Html extractor labelled UTF-8, so the site's own `<meta charset>` does not mis-decode it. `Configuration.PageRendererOptions` (`WaitUntil`, `WaitSelector`, `WaitSelectorTimeoutMs`, `ScrollToBottom`, `UserAgent`) reaches the renderer as `PageRenderRequest.Options`; the `Headless` renderer honours them, and takes Chromium launch arguments from `HeadlessPageRenderer.LaunchArgs` or `MJ_HEADLESS_CHROMIUM_ARGS` (e.g. `--no-sandbox` in a container). Extract's plain fetch sends `Website.UserAgent` and refuses a body past `Website.MaxResponseBytes` as a lasting error.
