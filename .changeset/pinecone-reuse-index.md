---
"@memberjunction/ai-vectors-pinecone": patch
---

`PineconeDatabase` now keeps one Pinecone SDK `Index` object per index name, and one namespace target per namespace, instead of creating a new one for every operation.

Pinecone SDK 2.2.2 compiles 8 Ajv argument validators each time `Index()` or `Index.namespace()` is called. `GetIndex` called `Index()` on every query, upsert, fetch and delete, so each operation paid about 10 ms of CPU on a laptop and about 100 ms on a 4-vCPU cloud host. Duplicate detection runs one vector query per record, so a run spent most of its CPU time compiling validators and blocked the Node event loop for seconds at a time.

- `GetIndex` returns the same `Index` object for a name on every call.
- Every `index.namespace(...)` call goes through one cached target per namespace.
- `DeleteIndex` drops the cached `Index` for that name.

The SDK argument checks stay on. No behaviour change for callers.
