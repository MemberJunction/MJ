---
"@memberjunction/ai-vector-sync": patch
"@memberjunction/search-engine": patch
---

Vector sync: portable record IDs, minimal-metadata mode, and explicit-inclusion field fixes

- **New `vectorIdStrategy` on `EntityDocumentConfiguration`** — `'hash'` (default, unchanged SHA-1 behavior) or `'recordId'`, which uses the source record's primary key value directly as the vector database ID. UUIDs are normalized to lowercase for SQL Server / PostgreSQL portability; composite PK values are joined with `||`; empty keys and IDs over the 512-byte provider limit fail loudly.
- **New `fieldStrategy: 'explicit'`** — vector metadata contains EXACTLY the configured fields: the system-injected keys (`RecordID`, `Entity`, `TemplateID`) are omitted and `includeEntityIcon` / `includeUpdatedAt` flip to opt-in. Existing `'all'` / `'include'` / `'exclude'` strategies are byte-for-byte unchanged.
- **Explicit inclusion now wins over type heuristics** — under `'include'` / `'explicit'`, fields listed with `included: true` are honored even when the implicit-eligibility filter would skip them (uniqueidentifiers, PKs, `__mj_*` fields). Only genuinely unstorable binary column types are refused, with a logged warning instead of a silent drop. Uniqueidentifier metadata values are normalized to lowercase so metadata filters behave identically across database platforms.
- **SearchEngine `VectorSearchProvider`** — when a match's metadata omits the `Entity` key (e.g. indexes populated with `fieldStrategy: 'explicit'`), the provider now resolves a fallback entity name from the index's entity documents (cached per index, only when unambiguous) instead of labeling results `Unknown`. Record identity already falls back to the vector ID when `RecordID` metadata is absent.

Note: switching an already-populated index to `vectorIdStrategy: 'recordId'` orphans vectors written under the old hashed IDs — purge or re-create the index (or use a fresh namespace) when changing strategy.
