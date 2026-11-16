---
"@memberjunction/server": patch
"@memberjunction/messaging-adapters": patch
"@memberjunction/component-registry-server": patch
---

Per-IP rate limits, on by default with generous budgets, on MJAPI's OAuth callback and authenticated OAuth routes, the media streaming and upload-staging routes (configurable under `rateLimiting.routes.<oauthCallback|oauthAuthenticated|mediaUpload|mediaRead>`, each with `enabled`, `windowMs`, `maxRequests`), and on the Slack HTTP webhook routes (`WebhookRateLimit` in the extension's settings). The global `rateLimiting.enabled` switch is unchanged. ComponentRegistry README: set `corsOrigins` when `requireAuth` is on.
