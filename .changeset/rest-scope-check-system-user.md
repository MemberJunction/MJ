---
'@memberjunction/server': patch
---

REST API-key scope checks now run the same check as the GraphQL resolvers: the key is looked up as the system user and a `full_access` key passes. Looking the key up as the key's own user answered 403 "API key not found" on REST writes and views for any user who cannot read `MJ: API Keys`.
