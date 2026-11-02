---
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/server": patch
---

Keep MJAPI running when PostgreSQL drops an idle pooled connection. Every PostgreSQL pool now logs the error instead of crashing the process.
