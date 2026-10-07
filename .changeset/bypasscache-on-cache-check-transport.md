---
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/server": minor
"@memberjunction/generic-database-provider": minor
---

A client's `BypassCache` now reaches the database on the smart-cache-check transport.

`BaseEngine.Config(true)` in a browser could not escape a stale server cache slot. A `RunView` that
asks for `BypassCache: true` alongside `CacheLocal: true` is routed down the smart-cache-check
transport, and that transport never carried `BypassCache` — the client omitted it from its input map
and the resolver omitted it from the params it handed the provider.

The omission **inverted** the caller's intent rather than merely losing it. A bypassing param is
ineligible for a cache status, so none is attached — and a missing `cacheStatus` is also how "the
client has nothing cached yet" arrives, which is the server's cue to answer from its OWN cache
without touching the database. So the strongest available "read true database state" landed on the
one path most likely to avoid one, and a slot left stale by a missed invalidation could not be
escaped from a client until the process restarted. The field's own documentation says the opposite
("the query always hits the database"), as does the GraphQL input type this transport already uses
("the pre-check cache lookup is skipped").

The write half was already correct (`runViewCacheEligible` begins with `!param.BypassCache`), so a
bypassing result was never stored — only the read was wrong, which is why it looked consistent from
every individual vantage point.

Fixed at all three sites: the client sends the field, the resolver forwards it, and a bypassing item
skips the server-cache consult and goes to the database. No schema change was needed — the input type
has always declared it.

This is the third field found missing from the same pair of maps, after `Aggregates` (B40) and
`DataSource`. The new resolver tests pin all three, so a fourth omission fails in CI rather than in a
consumer's UI.
