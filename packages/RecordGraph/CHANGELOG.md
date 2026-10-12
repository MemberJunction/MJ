# @memberjunction/record-graph

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [dfe40a4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 7e57b48: Extract `@memberjunction/record-graph` from Version History and Metadata Sync to provide generalized record dependency graph traversal, topological sorting, relationship collection resolution, and link encoding across MemberJunction.

  The walker finds IS-A subtype rows on UUID keys (it passed the record-id string where the bare key value is expected), matches soft links stored as the bare key value, and builds its queries from the provider it was given. `WalkOptions.OnLoadFailure` reports an edge whose rows couldn't be loaded, which the walk otherwise only logs.

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [369e229]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
