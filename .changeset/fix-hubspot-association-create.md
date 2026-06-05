---
"@memberjunction/integration-connectors": patch
---

Fix HubSpot association create silently failing. `CreateAssociation` previously derived the association direction from the API path segment order and sent an empty `types: []`, which HubSpot accepts with a 2xx but creates zero associations; it then trusted the bare 2xx and reported success. The create now sends an explicit wire direction with a resolved `HUBSPOT_DEFINED` association type (hardcoded for verified pairs, resolved at runtime via the `/labels` endpoint otherwise), validates the response body (`status`, `results`, `errors`/`numErrors`) instead of the HTTP status, and keeps the stored composite ExternalID in a stable order so create/pull/delete agree. Applies across all association object types; delete maps the stored key to the same wire direction.
