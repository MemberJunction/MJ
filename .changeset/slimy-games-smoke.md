---
"@memberjunction/server": patch
---

Added a check of the learning cycle endpoint provided from the env file such that, in the case the not endpoint is set we simply disable the calls to the learning cycle. In the case that an endpoint is set but fails immediately, we throw an error once and disable the recurring calls to the invalid endpoint.
