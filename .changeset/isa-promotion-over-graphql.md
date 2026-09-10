---
'@memberjunction/graphql-dataprovider': patch
'@memberjunction/server': patch
---

IS-A promotion — an EXISTING parent record gaining a subtype ("this Animal is now also a Dog") —
now works over GraphQL. It already worked against a direct database provider, which is what made it
expensive to find: every server-side reproduction passed while the browser silently inserted a
**second copy of the parent row** (surfacing as a unique-constraint violation on an unrelated column,
with a different GUID on every retry).

Two independent defects, both required:

- **Client** (`GraphQLDataProvider.Save`): the create-side field filter admitted a primary key only
  when the entity was already saved, and an IS-A child's key is ReadOnly (the shared key is the
  relationship), so on a promotion the key never left the browser. The parent's own save is
  short-circuited (`IsParentEntitySave`) on the premise that the leaf mutation carries the whole
  chain — so nothing told the server which parent row this was about. The create input now carries
  the shared key for an unsaved IS-A child.
- **Server** (`ResolverBase.CreateRecord`): `NewRecord()` reset the whole chain to "new", so even
  with the key present the parent saved as a CREATE. When a child create carries a complete key,
  the resolver now binds the new child to the existing parent row with `AttachToParent` (#3825):
  the parent saves as an UPDATE and only the child is INSERTed. A key that matches no row is the
  ordinary whole-chain create and proceeds on the caller's key; non-IS-A entities are untouched.
