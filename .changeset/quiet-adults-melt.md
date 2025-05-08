---
"@memberjunction/server": minor
---

Add mapping for an environment variable that indicates whether or not we should run learning cycles. Then, if disabled, we do not start up the learning cycle process at all. If enabled but no endpoint provided, we throw an error idicating as much as disable the recurring calls to the endpoint.
