---
"@memberjunction/actions-apollo": minor
---

Apollo enrichment rework. New `ApolloPeopleClient` (`people/bulk_match` ten at a time with header
auth, `organizations/enrich`, positional correlation, employment split from education, typed
`ApolloRateLimitError`/`ApolloAuthError`/`ApolloRequestError`, one ≤60 s retry on a per-minute limit
and never a longer sleep) over a shared `ApolloHttp` helper that `ApolloRESTClient` now uses too.
Both enrichment actions run on it and fix the known bugs: quoted key predicates and real composite
keys on the configured entities, saves that no longer short-circuit after a failure, values stored
unescaped, keyset paging on the contacts filter, every record sent stamped (misses included),
education written from its own mapping with only the mapped columns, hourly limits returned as
`RATE_LIMIT_EXCEEDED` at once, people discovery through `mixed_people/api_search` then
`bulk_match` by id (the old `mixed_people/search` answers 422), and an optional `CompanyID` param
on both actions. `ApolloRESTClient.searchPeople` reads the current `api_search` shape (top-level
`total_entries`, obfuscated people) and takes `locations` and `keywords`; `Apollo - Search People`
gains `Locations`, `Keywords` and a `TotalEntries` output. Adds the `Apollo` row to
`MJ: Integrations` so the per-company credential path can resolve, and fixes the README's
history-mapping keys.
