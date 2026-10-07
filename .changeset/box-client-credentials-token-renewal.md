---
"@memberjunction/storage": patch
---

The Box storage driver now renews client-credentials tokens. A driver that authenticates with a client ID, secret and enterprise ID (no refresh token) and is reused for more than about an hour no longer fails every read with `Cannot refresh Box token: missing credentials`. It requests a new client-credentials token and rebuilds its Box client. The refresh-token path is unchanged.
