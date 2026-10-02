---
"@memberjunction/ai": minor
"@memberjunction/ai-openrouter": minor
"@memberjunction/ai-cloudflare": minor
"@memberjunction/ai-provider-bundle": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add Cloudflare's Clef and Clef-flash decision models. `CloudflareDecision`, in the new `@memberjunction/ai-cloudflare` package, is a `BaseDecision` driver for Workers AI (`@cf/cloudflare/clef`, `@cf/cloudflare/clef-flash`). Its account ID comes from a `<accountId>:<apiToken>` key or from `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_WORKERS_AI_BASE_URL` routes it through an AI Gateway. The System One wire mapping that Jev and Clef share moves out of `OpenRouterDecision` into a new `BaseSystemOneDecision` in `@memberjunction/ai`; `OpenRouterDecision` keeps its behaviour, statics and constructor. Metadata adds the `Cloudflare` vendor and the `Clef` and `Clef-flash` Decision models with their limits and input-token prices. The `Default Decision` prompt's bindings are unchanged.
