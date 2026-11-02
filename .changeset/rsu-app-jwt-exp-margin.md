---
"@memberjunction/schema-engine": patch
---

The GitHub App JWT the RSU commit step mints expires 9 minutes out instead of exactly GitHub's 10-minute maximum, so a server clock slightly ahead of GitHub's is no longer refused.
