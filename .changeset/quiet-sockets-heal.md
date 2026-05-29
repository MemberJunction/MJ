---
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
---

Fix WebSocket token expiry log spam on Azure by validating JWT once at connection time (RAII), proactively closing the socket at expiry with retriable close code 4403, and eagerly refreshing the token on close so retries succeed immediately
