---
"@memberjunction/templates": patch
---

Add optional autoescape control to `TemplateEngineServer.RenderTemplateSimple`. The method now accepts a third `options?: { autoescape?: boolean }` argument, defaulting to the existing autoescape-on behavior. Passing `{ autoescape: false }` renders through a lazily-created, HTML-escape-free Nunjucks environment that shares the same custom filters (`json` / `jsoninline` / `jsonparse`) — intended for plain-text contexts such as email subject lines, where `Acme & Co` must not become `Acme &amp; Co`. Env construction was consolidated into a single factory so the autoescape and no-autoescape environments keep an identical filter surface. Fully backward-compatible: existing two-argument callers are unaffected.
