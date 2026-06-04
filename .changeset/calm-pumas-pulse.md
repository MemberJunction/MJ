---
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
---

Replace the fire-and-forget absolute timeout with a liveness pulse, an idle timeout that resets on activity, and run-record reconciliation. Long-running agent runs no longer report spurious timeouts, and completion events lost to a transient socket drop are recovered by reconciling against the persisted run record.
