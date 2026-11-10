---
"@memberjunction/ai-mcp-server": patch
---

Add `mcpServerSettings.trustProxy` and `mcpServerSettings.auth.proxy.rateLimit` (`windowMs`, `limit`). `trustProxy` is applied as Express's `trust proxy` setting. Behind CloudFront or a load balancer, the OAuth proxy's per-IP rate limit, which also covers `/mcp`, now counts each client by its own address instead of making everyone share one 60-per-minute limit, and the limit can be sized (#6497).
