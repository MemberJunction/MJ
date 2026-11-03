---
"@memberjunction/graphql-dataprovider": patch
---

Evict only the mismatched field entry in `GraphQLDataProvider.getParentPreSaveFieldSnapshot` so other dirty parent fields on the same IS-A entity remain intact, and remove unreachable fallback code in `GraphQLTransactionGroup`.
