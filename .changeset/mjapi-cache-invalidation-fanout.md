---
"@memberjunction/server": patch
---

Every entity save now reaches browsers attached to any MJAPI process, not only the process that made it. With `REDIS_URL` set, each CACHE_INVALIDATION event is forwarded on a `cache-invalidation` Redis channel and republished by the other processes, where the existing entity-permission filter still applies. This is what lets scheduled jobs run in a separate worker process (outside the load balancer) without their changes going unseen: the new "API Processes Plus a Background Worker" section of the caching guide describes that topology and what it does not move yet.
