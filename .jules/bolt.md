## 2024-05-02 - [O(n^2) Find in Filter Array Operations]
**Learning:** In code generation and metadata handling, multiple iterations over large entity lists are common. Nested `Array.find()` inside `Array.filter()` operations with string lowercasing can create significant hidden O(n*m) performance bottlenecks that compound when run against large entity sets during code generation.
**Action:** When repeatedly filtering collections against an exclusion/inclusion list, always precompute a `Set` of the normalized (e.g. lowercased) strings to change the lookup from O(m) to O(1) and eliminate repeated string allocations, improving overall complexity from O(n*m) to O(n+m).

## 2024-05-30 - Cache `new Function` compilation in mapping engine loops
**Learning:** Instantiating `new Function` inside tight data mapping loops (e.g. `FieldMappingEngine` evaluating expressions for every field of every record) creates significant overhead because it compiles the string on every iteration.
**Action:** When a string expression doesn't change between records, cache the compiled JS function object returned by `new Function` in a Map using the expression string as the key.
