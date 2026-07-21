---
"@memberjunction/testing-integration": patch
---

Make the client integration bootstrap browser-faithful. Split the bootstrap into a server-free shared core (`bootstrap-shared`), a server-free client bootstrap (`bootstrap-client`, exported via a new `./client` subpath), and the server bootstrap (`bootstrap`). Client dispatchers importing `bootstrapIntegrationClient` from `@memberjunction/testing-integration/client` now register only the CLIENT generated entity subclasses (via `@memberjunction/core-entities`, exactly like MJExplorer) and never load `@memberjunction/server-bootstrap-lite` / `@memberjunction/sqlserver-dataprovider`. Previously any client import transitively pulled in server-only `*EntityServer` subclasses whose constructors throw on a client provider, making a "client" integration test a server/client hybrid rather than a faithful browser client. The barrel still re-exports everything for the driver / server dispatchers, so existing consumers are unaffected.
