---
"@memberjunction/core-actions": patch
---

Add SSRF protection to server-side web/HTTP actions: private, loopback, link-local (incl. cloud metadata 169.254.169.254), and reserved IP ranges are now blocked, and redirects are re-validated per hop.
