---
"@memberjunction/ai-betty-bot": patch
---

`BettyBotLLM` accepts an optional `userId` constructor argument, forwarded to Betty's `/response` endpoint as the `userId` body field so a caller can identify itself for Betty's utilization attribution and get its own rate-limit bucket instead of an anonymous per-IP one (the behavior that tripped Betty's bot detection on Izzy's server IP). Omitting the argument leaves the request body byte-identical to before, so existing consumers are unaffected; the settings/JWT call never carries the identifier.
