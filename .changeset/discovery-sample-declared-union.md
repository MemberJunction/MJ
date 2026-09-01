---
"@memberjunction/integration-engine": patch
---

Discovery samples the union of declared and runtime objects, and honours a scoped introspection.

Sampling was reachable only through a `DiscoverObjects` hit: the loop that sampled iterated the
runtime list, so a declared object the connector does not re-surface at runtime — the normal shape
for a catalog-driven connector, and for every object when `DiscoverObjects` fails — was never
sampled. It kept whatever width the catalog guessed, which is how a column declared at 255 drops
every longer record at sync time, and it could only gain undeclared columns later, one sync at a
time, through the overflow path.

`StageIntrospect` now iterates declared ∪ runtime, sampling each object exactly once through a
single extracted `SampleDeclaredObjectInPlace`. A `DiscoverObjects` failure is no longer total —
the declared catalog is already in hand, so those objects are still sampled — and the failure is
recorded on the Introspect checkpoint as `discoverObjectsFailed` so a consumer can tell "the source
has no other objects" from "we never got to ask". A scoped introspection's `ObjectNames` filter now
also applies to the runtime pass, which previously pulled and sampled the whole catalog anyway.

Merge direction is unchanged: sampling fills gaps and widens, never overrides, and a sampling
failure leaves the declaration exactly as it was.
