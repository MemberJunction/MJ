---
"@memberjunction/server": patch
"@memberjunction/integration-engine": patch
---

Reactivating a connection no longer blocks on a live schema introspect, and stops reporting a failed refresh as a clean zero-count one.

`IntegrationReactivateConnection` was the last schema-refresh path still awaiting the pipeline inline. Its two sibling mutations already gained `awaitSchemaRefresh` plus a detached launch; reactivate never did, and kept a hand-rolled copy of the message the shared builders exist to fix.

- **Detached by default.** Reactivation is durably committed before the refresh begins — the mutation returns as soon as the connection is actually active, naming the run to tail. Holding the response open for the minutes a live introspect takes cannot make the reactivation more true, and a load balancer that terminates a held request at a fixed ceiling turns a succeeded operation into a reported failure with no run ID to check. Create and Update keep blocking by default, because there the caller is sitting on a wizard form and the counts are the answer they asked for. `awaitSchemaRefresh: true` restores blocking here.
- **Failed refreshes say so.** The inline path formatted its counts unconditionally, and a pipeline that fails returns rather than throws with every count at zero — so a refresh that died at the credential check reported "0 created, 0 updated, 0 PK-unresolved", indistinguishable from a source with nothing new. Reactivate now goes through the same `describeFinishedRefresh` the other two use, so a failure is named as one.

Also surfaces apply-time warnings for declared integration rows an apply silently leaves out: an `IntegrationObject`/`IntegrationObjectField` that a rediscovery or a schema-limit breach set to `Disabled` is excluded from the source schema the apply materializes, so the table appears without the column — or a requested object is not created at all — and nothing in the output said why.
