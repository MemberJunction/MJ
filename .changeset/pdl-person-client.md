---
"@memberjunction/actions-peopledatalabs": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/server": minor
---

New package `@memberjunction/actions-peopledatalabs`: a table-agnostic People Data Labs client
(bulk person enrichment with education and employment history, person search, a size-1 count, and
the free school autocomplete and cleaner), a credentials resolver (a company's `People Data Labs`
Company Integration credential, else `PDL_API_KEY`), and the `People Data Labs - Enrich People`
action, which returns data and writes nothing. Adds the `People Data Labs` row to `MJ: Integrations`
(new `metadata/integrations/`) and registers the package in both server bootstrap manifests.
