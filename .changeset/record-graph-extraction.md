---
"@memberjunction/record-graph": minor
"@memberjunction/version-history": minor
"@memberjunction/metadata-sync": minor
---

Extract `@memberjunction/record-graph` from Version History and Metadata Sync to provide generalized record dependency graph traversal, topological sorting, relationship collection resolution, and link encoding across MemberJunction.

The walker finds IS-A subtype rows on UUID keys (it passed the record-id string where the bare key value is expected), matches soft links stored as the bare key value, and builds its queries from the provider it was given.
