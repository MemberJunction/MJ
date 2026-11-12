---
'@memberjunction/testing-integration': patch
---

Add optional `Transport` (`'server' | 'client'`) scoping to `AllowedSkip` in `@memberjunction/testing-integration` so skip allowlist entries for checks whose bundles run on both server and client transports can permit an expected client-transport skip without masking an unexpected server-transport skip.
