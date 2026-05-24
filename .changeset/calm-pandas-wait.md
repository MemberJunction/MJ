---
"@memberjunction/graphql-dataprovider": patch
---

Raise fire-and-forget client timeout from 15 minutes to 60 minutes so long-running AI agent runs and test executions don't spuriously fail client-side while the server is still processing.
