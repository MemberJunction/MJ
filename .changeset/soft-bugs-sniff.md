---
"@memberjunction/component-registry-client-sdk": patch
"@memberjunction/server": patch
---

Add user email support to Component Registry Client SDK for usage tracking. The SDK now sends authenticated user email to component registry servers via query parameters (GET requests) or request body (POST requests), enabling per-user analytics and contact tracking.
