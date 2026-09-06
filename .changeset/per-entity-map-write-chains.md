---
"@memberjunction/integration-engine": patch
---

Writes for different entity maps no longer queue behind each other.

Every engine write went through one provider-wide chain. That was necessary but too broad: the
provider holds a single transaction on a single connection, so a write issued while that transaction
is open joins it — and the chain was the only thing preventing one batch's transaction from
swallowing an unrelated map's watermark save. The cost was that maps syncing concurrently also
serialized all their bookkeeping, including when no transaction existed at all.

`WriteSerializer` replaces the chain with a two-mode lock. Work that opens the provider transaction
runs exclusively, exactly as before. Work scoped to one entity map that opens no transaction —
watermark bookkeeping, match resolution, and the post-batch flushes of a batched apply — runs keyed
by entity map: different maps overlap, the same map stays ordered.

Waits are acyclic by construction: an exclusive section snapshots the in-flight keyed work at call
time, and a keyed call captures the barrier at call time, so nothing ever waits on work created
after it. Chains continue past rejections, so one errored batch cannot wedge later writers.
