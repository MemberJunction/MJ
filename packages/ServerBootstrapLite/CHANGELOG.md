# @memberjunction/server-bootstrap-lite

## 6.1.0-edge.5

### Patch Changes

- 8b78695: Regenerate the class-registration manifests so every one of them is on the chunked format.

  The chunked manifest format (`CLASS_REGISTRATIONS_0`, `CLASS_REGISTRATIONS_1`, …) was introduced to keep
  TypeScript from hitting TS2590 on a single union that had grown too large. Only `server-bootstrap` and
  `server-bootstrap-lite` were regenerated at the time, so the remaining manifests stayed on the old
  single-array shape and the `Build` job's manifest gate has been failing on `next` ever since.

  This regenerates all of them from a fully-built workspace. Alongside the format change the sweep picks up
  registrations that had drifted out: `MJAIUsageTypeEntity` and the `LinearPriceUnitType` /
  `PerImagePriceUnitType` / `TimePerHourPriceUnitType` / `TimePerMinutePriceUnitType` pricing unit types in the
  Angular bootstraps, and `MJEntityPermissionEntityServer` / `MJTenantFilterMiddleware` / `RateLimitMiddleware`
  from `@memberjunction/server` in the server bootstrap.

  Generated output only; no hand edits, no runtime behaviour change.

  One thing worth knowing for anyone regenerating these in future: **the manifest generator is sensitive to
  build state.** `resolveSubpathExportsDetailed()` resolves a package's lazy-loading subpaths by reading the
  `.d.ts` each `exports` entry points at, and it `continue`s past any that is missing. Run `mj codegen manifest`
  against a workspace whose `dist/` folders are absent and the subpaths silently resolve to nothing — the
  package falls through to the whole-package branch and `lazy-feature-config.ts` collapses its twelve
  per-dashboard chunks into one eager import, with no warning. Build the workspace first.

- Updated dependencies [6dbe524]
- Updated dependencies [b1b24d7]
- Updated dependencies [10010b2]
- Updated dependencies [c42c0e8]
- Updated dependencies [79483bf]
- Updated dependencies [6fd0a73]
- Updated dependencies [22ec804]
- Updated dependencies [8206993]
- Updated dependencies [1a2ce13]
- Updated dependencies [e63ac04]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [eac9819]
- Updated dependencies [d66a26a]
- Updated dependencies [5f33ca8]
- Updated dependencies [23c2521]
- Updated dependencies [9cbe17f]
- Updated dependencies [5fc861f]
- Updated dependencies [88d751d]
- Updated dependencies [d7feeae]
- Updated dependencies [28cd302]
- Updated dependencies [29c3dc8]
- Updated dependencies [905820a]
  - @memberjunction/actions-bizapps-accounting@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/actions-apollo@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-agents@6.1.0-edge.5
  - @memberjunction/actions-bizapps-social@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/ai-engine-base@6.1.0-edge.5
  - @memberjunction/core-entities-server@6.1.0-edge.5
  - @memberjunction/ai-groq@6.1.0-edge.5
  - @memberjunction/ai-openai@6.1.0-edge.5
  - @memberjunction/core-actions@6.1.0-edge.5
  - @memberjunction/ai-prompts@6.1.0-edge.5
  - @memberjunction/ai-elevenlabs@6.1.0-edge.5
  - @memberjunction/storage@6.1.0-edge.5
  - @memberjunction/actions-bizapps-lms@6.1.0-edge.5
  - @memberjunction/search-engine@6.1.0-edge.5
  - @memberjunction/scheduling-engine@6.1.0-edge.5
  - @memberjunction/ai-agent-harness@6.1.0-edge.5
  - @memberjunction/predictive-studio@6.1.0-edge.5
  - @memberjunction/ai-anthropic@6.1.0-edge.5
  - @memberjunction/ai-assemblyai@6.1.0-edge.5
  - @memberjunction/ai-azure@6.1.0-edge.5
  - @memberjunction/ai-bedrock@6.1.0-edge.5
  - @memberjunction/ai-betty-bot@6.1.0-edge.5
  - @memberjunction/ai-blackforestlabs@6.1.0-edge.5
  - @memberjunction/ai-cerebras@6.1.0-edge.5
  - @memberjunction/ai-cohere@6.1.0-edge.5
  - @memberjunction/ai-fireworks@6.1.0-edge.5
  - @memberjunction/ai-gemini@6.1.0-edge.5
  - @memberjunction/ai-heygen@6.1.0-edge.5
  - @memberjunction/ai-inception@6.1.0-edge.5
  - @memberjunction/ai-inworld@6.1.0-edge.5
  - @memberjunction/ai-lmstudio@6.1.0-edge.5
  - @memberjunction/ai-llamacpp@6.1.0-edge.5
  - @memberjunction/ai-local-embeddings@6.1.0-edge.5
  - @memberjunction/ai-minimax@6.1.0-edge.5
  - @memberjunction/ai-mistral@6.1.0-edge.5
  - @memberjunction/ai-ollama@6.1.0-edge.5
  - @memberjunction/ai-openrouter@6.1.0-edge.5
  - @memberjunction/ai-recommendations-rex@6.1.0-edge.5
  - @memberjunction/ai-vertex@6.1.0-edge.5
  - @memberjunction/ai-zhipu@6.1.0-edge.5
  - @memberjunction/ai-xai@6.1.0-edge.5
  - @memberjunction/ai-reranker@6.1.0-edge.5
  - @memberjunction/ai-vector-dupe@6.1.0-edge.5
  - @memberjunction/actions@6.1.0-edge.5
  - @memberjunction/content-autotagging@6.1.0-edge.5
  - @memberjunction/queue@6.1.0-edge.5
  - @memberjunction/templates@6.1.0-edge.5
  - @memberjunction/testing-engine@6.1.0-edge.5
  - @memberjunction/ai-agent-manager@6.1.0-edge.5
  - @memberjunction/ai-form-builder@6.1.0-edge.5
  - @memberjunction/ai-vectors-pinecone@6.1.0-edge.5
  - @memberjunction/record-set-processor@6.1.0-edge.5
  - @memberjunction/task-graph@6.1.0-edge.5
  - @memberjunction/tag-engine-base@6.1.0-edge.5
  - @memberjunction/actions-base@6.1.0-edge.5
  - @memberjunction/actions-bizapps-crm@6.1.0-edge.5
  - @memberjunction/actions-bizapps-formbuilders@6.1.0-edge.5
  - @memberjunction/communication-types@6.1.0-edge.5
  - @memberjunction/doc-utils@6.1.0-edge.5
  - @memberjunction/encryption@6.1.0-edge.5
  - @memberjunction/react-linter@6.1.0-edge.5
  - @memberjunction/record-comparison@6.1.0-edge.5
  - @memberjunction/scheduling-actions@6.1.0-edge.5
  - @memberjunction/scheduling-engine-base@6.1.0-edge.5
  - @memberjunction/geo-core@6.1.0-edge.5
  - @memberjunction/ai-vectors-memory@6.1.0-edge.5
  - @memberjunction/ai-vectors-qdrant@6.1.0-edge.5
  - @memberjunction/ai-vectors-sqlserver@6.1.0-edge.5
  - @memberjunction/ai-vectors-pgvector@6.1.0-edge.5
  - @memberjunction/data-context-server@6.1.0-edge.5
  - @memberjunction/ai-provider-bundle@6.1.0-edge.5

## 6.1.0-edge.4

### Minor Changes

- 00a2483: Introduces Identity Claims infrastructure in MemberJunction core for guest record claiming, account linking, and invite verification workflows (#4012).
  - Schema & Entities: Adds `IdentityClaimType` and `IdentityClaim` entities with lifecycle state transitions (`Pending`, `Claimed`, `Expired`, `Revoked`).
  - Pluggable Driver Substrate: Supports custom claim handler implementations via `BaseIdentityClaimDriver` and `@RegisterClass`.
  - Server Engine: `IdentityClaimEngineServer` handles cryptographic claim creation, SHA-256 token hashing at rest, timing-safe token verification, email notifications via MJ Communications framework with HTML escaping, configurable email providers, polymorphic entity resolution, and atomic claim redemption.

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [e2ad3c0]
- Updated dependencies [de6eb14]
- Updated dependencies [a2c528f]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [516f4fb]
- Updated dependencies [647bd71]
- Updated dependencies [7857d8e]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [faac5b5]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/geo-core@6.1.0-edge.4
  - @memberjunction/core-actions@6.1.0-edge.4
  - @memberjunction/core-entities-server@6.1.0-edge.4
  - @memberjunction/actions-bizapps-social@6.1.0-edge.4
  - @memberjunction/actions-bizapps-formbuilders@6.1.0-edge.4
  - @memberjunction/actions-apollo@6.1.0-edge.4
  - @memberjunction/content-autotagging@6.1.0-edge.4
  - @memberjunction/doc-utils@6.1.0-edge.4
  - @memberjunction/ai-betty-bot@6.1.0-edge.4
  - @memberjunction/ai-heygen@6.1.0-edge.4
  - @memberjunction/ai-recommendations-rex@6.1.0-edge.4
  - @memberjunction/ai-agent-harness@6.1.0-edge.4
  - @memberjunction/ai-agents@6.1.0-edge.4
  - @memberjunction/ai-engine-base@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/predictive-studio@6.1.0-edge.4
  - @memberjunction/ai-prompts@6.1.0-edge.4
  - @memberjunction/ai-anthropic@6.1.0-edge.4
  - @memberjunction/ai-assemblyai@6.1.0-edge.4
  - @memberjunction/ai-azure@6.1.0-edge.4
  - @memberjunction/ai-bedrock@6.1.0-edge.4
  - @memberjunction/ai-blackforestlabs@6.1.0-edge.4
  - @memberjunction/ai-cerebras@6.1.0-edge.4
  - @memberjunction/ai-cohere@6.1.0-edge.4
  - @memberjunction/ai-elevenlabs@6.1.0-edge.4
  - @memberjunction/ai-fireworks@6.1.0-edge.4
  - @memberjunction/ai-gemini@6.1.0-edge.4
  - @memberjunction/ai-groq@6.1.0-edge.4
  - @memberjunction/ai-inception@6.1.0-edge.4
  - @memberjunction/ai-inworld@6.1.0-edge.4
  - @memberjunction/ai-lmstudio@6.1.0-edge.4
  - @memberjunction/ai-llamacpp@6.1.0-edge.4
  - @memberjunction/ai-local-embeddings@6.1.0-edge.4
  - @memberjunction/ai-minimax@6.1.0-edge.4
  - @memberjunction/ai-mistral@6.1.0-edge.4
  - @memberjunction/ai-ollama@6.1.0-edge.4
  - @memberjunction/ai-openai@6.1.0-edge.4
  - @memberjunction/ai-openrouter@6.1.0-edge.4
  - @memberjunction/ai-vertex@6.1.0-edge.4
  - @memberjunction/ai-zhipu@6.1.0-edge.4
  - @memberjunction/ai-xai@6.1.0-edge.4
  - @memberjunction/ai-reranker@6.1.0-edge.4
  - @memberjunction/ai-vector-dupe@6.1.0-edge.4
  - @memberjunction/actions@6.1.0-edge.4
  - @memberjunction/queue@6.1.0-edge.4
  - @memberjunction/search-engine@6.1.0-edge.4
  - @memberjunction/templates@6.1.0-edge.4
  - @memberjunction/testing-engine@6.1.0-edge.4
  - @memberjunction/ai-agent-manager@6.1.0-edge.4
  - @memberjunction/ai-form-builder@6.1.0-edge.4
  - @memberjunction/ai-vectors-pinecone@6.1.0-edge.4
  - @memberjunction/record-set-processor@6.1.0-edge.4
  - @memberjunction/task-graph@6.1.0-edge.4
  - @memberjunction/tag-engine-base@6.1.0-edge.4
  - @memberjunction/actions-base@6.1.0-edge.4
  - @memberjunction/actions-bizapps-accounting@6.1.0-edge.4
  - @memberjunction/actions-bizapps-crm@6.1.0-edge.4
  - @memberjunction/actions-bizapps-lms@6.1.0-edge.4
  - @memberjunction/communication-types@6.1.0-edge.4
  - @memberjunction/encryption@6.1.0-edge.4
  - @memberjunction/storage@6.1.0-edge.4
  - @memberjunction/react-linter@6.1.0-edge.4
  - @memberjunction/record-comparison@6.1.0-edge.4
  - @memberjunction/scheduling-actions@6.1.0-edge.4
  - @memberjunction/scheduling-engine-base@6.1.0-edge.4
  - @memberjunction/scheduling-engine@6.1.0-edge.4
  - @memberjunction/ai-vectors-memory@6.1.0-edge.4
  - @memberjunction/ai-vectors-qdrant@6.1.0-edge.4
  - @memberjunction/ai-vectors-sqlserver@6.1.0-edge.4
  - @memberjunction/ai-vectors-pgvector@6.1.0-edge.4
  - @memberjunction/data-context-server@6.1.0-edge.4
  - @memberjunction/ai-provider-bundle@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- be0bdb2: Follow-up hardening for Query & Entity Materialization (#3735). Each item below fails toward doing the
  wrong thing rather than doing nothing, so none of them surface as an error in normal operation.

  **Row-restriction gates read both fence layers.** MJ enforces row restrictions in two AND-composed
  layers — role RLS and API-key row filters — and the mint, drift and runtime Leak-1 gates each re-derived
  a role-only predicate inline. An entity fenced _only_ by an API-key row filter therefore read as
  unrestricted; because the mint gives the materialized entity a NEW EntityID, the key's EntityID-keyed
  binding stops matching it, and the principal is served a full unscoped snapshot of rows it cannot read
  live. All gates now compose both layers, and an unproven layer counts as restricted.

  **Lost provenance is now drift.** Deleting a source query cascade-deletes the `MaterializedResultQuery`
  join row while the snapshot, the minted entity and its read grants all survive — which silently disarmed
  both the RLS re-check and the read-grant re-narrow, leaving the unscoped snapshot serving indefinitely.
  It now revokes read and holds.

  **A zero-row external query no longer destroys the snapshot.** Columns are derived from the returned
  rows, so an empty result built a surrogate-only shadow, dropped the canonical table and renamed that
  shell into its place — every subsequent read failing on a missing column while the refresh reported
  success. An empty result now refuses the rebuild and leaves the existing snapshot serving.

  **The refresher snapshots the statement the read path executes.** Reads resolve SQL through
  `GetPlatformSQL(PlatformKey)`; the refresher snapshotted the base `SQL`, so a query carrying a
  per-platform variant was materialized from a different statement than live serves.

  **`XACT_ABORT` no longer escapes onto the pooled connection.** The swap, recompute and dirty-group
  batches each set it ON and never restored it. SET options persist for the session, so unrelated requests
  handed the same physical connection inherited it — turning their recoverable statement-level errors into
  full transaction aborts, far from anything to do with materialization.

  **The DDL identifier guard no longer opens on its own failure.** `assertSafeObjectNames` throws on a
  tampered `SchemaName`, but the failure path then passed that same rejected name to the best-effort shadow
  cleanup, which interpolated it raw into `DROP TABLE`/`OBJECT_ID`. The cleanup now re-checks and declines.

  **Two analyzers that produced silently wrong rows.** A `UNION`/`EXCEPT`/`INTERSECT` parses to a single
  `select` root whose `groupby` and `columns` describe only the first branch, so a set operation yielded an
  aggregation key covering one branch and the incremental MERGE collided both branches on the same hash.
  And a row-filter predicate was bound to an output column by bare name, which cannot tell `o.Status` from
  `c.Status` across a join, nor an alias from the column it rebinds.

  **Missing manifest registrations.** Neither new `@RegisterClass` class was in the pre-built manifests, so
  a bundled MJAPI tree-shook both away: the refresh driver never resolved, nothing was ever refreshed, and
  `Status` stayed `Active` while the read paths served mint-time data forever.

  **Read-routing distinguishes a failed lookup from "not materialized".** Only three roles hold `CanRead`
  on `MJ: Materialized Results`, so a restricted user silently got live data for every materialized request
  while an admin got the snapshot. The live fallback is correct and unchanged; the silence was the defect.

  **Note on coverage.** The predicate-binding proof and the join-qualifier requirement are deliberately
  conservative and will refuse shapes that previously qualified: a row-filter query whose predicate or
  projection is unqualified across a join now stays live-only, and an aggregation over a join with an
  unqualified `GROUP BY` loses its incremental key and falls back to `FullRebuild`. Both refusals are
  logged with the specific reason. Falling back to live is always correct — but a query that silently gets
  slower is easier to diagnose knowing this changed.

- Updated dependencies [834f8d7]
- Updated dependencies [d4a5b4c]
- Updated dependencies [f5ec13b]
- Updated dependencies [199eb2b]
- Updated dependencies [f80bdb7]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [8c9ed6f]
- Updated dependencies [9cd81ca]
- Updated dependencies [2875f6f]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [e68d90d]
- Updated dependencies [68b9cf0]
- Updated dependencies [3b6be0b]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [f5ec13b]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [2741d46]
- Updated dependencies [b6416f4]
- Updated dependencies [bc45ded]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [ae2baef]
- Updated dependencies [4b1257f]
- Updated dependencies [6cd337d]
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai-agents@6.1.0-edge.3
  - @memberjunction/scheduling-engine@6.1.0-edge.3
  - @memberjunction/scheduling-engine-base@6.1.0-edge.3
  - @memberjunction/content-autotagging@6.1.0-edge.3
  - @memberjunction/core-entities-server@6.1.0-edge.3
  - @memberjunction/ai-azure@6.1.0-edge.3
  - @memberjunction/ai-cerebras@6.1.0-edge.3
  - @memberjunction/ai-groq@6.1.0-edge.3
  - @memberjunction/ai-minimax@6.1.0-edge.3
  - @memberjunction/ai-mistral@6.1.0-edge.3
  - @memberjunction/ai-ollama@6.1.0-edge.3
  - @memberjunction/ai-openrouter@6.1.0-edge.3
  - @memberjunction/ai-zhipu@6.1.0-edge.3
  - @memberjunction/task-graph@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/ai-prompts@6.1.0-edge.3
  - @memberjunction/actions-bizapps-social@6.1.0-edge.3
  - @memberjunction/testing-engine@6.1.0-edge.3
  - @memberjunction/react-linter@6.1.0-edge.3
  - @memberjunction/storage@6.1.0-edge.3
  - @memberjunction/core-actions@6.1.0-edge.3
  - @memberjunction/queue@6.1.0-edge.3
  - @memberjunction/search-engine@6.1.0-edge.3
  - @memberjunction/ai-agent-harness@6.1.0-edge.3
  - @memberjunction/ai-agent-manager@6.1.0-edge.3
  - @memberjunction/ai-engine-base@6.1.0-edge.3
  - @memberjunction/ai-form-builder@6.1.0-edge.3
  - @memberjunction/tag-engine-base@6.1.0-edge.3
  - @memberjunction/predictive-studio@6.1.0-edge.3
  - @memberjunction/ai-anthropic@6.1.0-edge.3
  - @memberjunction/ai-assemblyai@6.1.0-edge.3
  - @memberjunction/ai-bedrock@6.1.0-edge.3
  - @memberjunction/ai-betty-bot@6.1.0-edge.3
  - @memberjunction/ai-blackforestlabs@6.1.0-edge.3
  - @memberjunction/ai-cohere@6.1.0-edge.3
  - @memberjunction/ai-elevenlabs@6.1.0-edge.3
  - @memberjunction/ai-fireworks@6.1.0-edge.3
  - @memberjunction/ai-gemini@6.1.0-edge.3
  - @memberjunction/ai-heygen@6.1.0-edge.3
  - @memberjunction/ai-inception@6.1.0-edge.3
  - @memberjunction/ai-inworld@6.1.0-edge.3
  - @memberjunction/ai-lmstudio@6.1.0-edge.3
  - @memberjunction/ai-llamacpp@6.1.0-edge.3
  - @memberjunction/ai-local-embeddings@6.1.0-edge.3
  - @memberjunction/ai-openai@6.1.0-edge.3
  - @memberjunction/ai-recommendations-rex@6.1.0-edge.3
  - @memberjunction/ai-vertex@6.1.0-edge.3
  - @memberjunction/ai-xai@6.1.0-edge.3
  - @memberjunction/ai-reranker@6.1.0-edge.3
  - @memberjunction/ai-vector-dupe@6.1.0-edge.3
  - @memberjunction/ai-vectors-memory@6.1.0-edge.3
  - @memberjunction/ai-vectors-pinecone@6.1.0-edge.3
  - @memberjunction/ai-vectors-qdrant@6.1.0-edge.3
  - @memberjunction/ai-vectors-sqlserver@6.1.0-edge.3
  - @memberjunction/ai-vectors-pgvector@6.1.0-edge.3
  - @memberjunction/actions-apollo@6.1.0-edge.3
  - @memberjunction/actions-base@6.1.0-edge.3
  - @memberjunction/actions-bizapps-accounting@6.1.0-edge.3
  - @memberjunction/actions-bizapps-crm@6.1.0-edge.3
  - @memberjunction/actions-bizapps-formbuilders@6.1.0-edge.3
  - @memberjunction/actions-bizapps-lms@6.1.0-edge.3
  - @memberjunction/actions@6.1.0-edge.3
  - @memberjunction/communication-types@6.1.0-edge.3
  - @memberjunction/doc-utils@6.1.0-edge.3
  - @memberjunction/encryption@6.1.0-edge.3
  - @memberjunction/data-context-server@6.1.0-edge.3
  - @memberjunction/record-comparison@6.1.0-edge.3
  - @memberjunction/record-set-processor@6.1.0-edge.3
  - @memberjunction/scheduling-actions@6.1.0-edge.3
  - @memberjunction/templates@6.1.0-edge.3
  - @memberjunction/geo-core@6.1.0-edge.3
  - @memberjunction/ai-provider-bundle@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [71817db]
- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
- Updated dependencies [102a692]
- Updated dependencies [11de1a3]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [9fc0e2d]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [82a8585]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/search-engine@6.1.0-edge.2
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai-elevenlabs@6.1.0-edge.2
  - @memberjunction/ai-assemblyai@6.1.0-edge.2
  - @memberjunction/ai-openai@6.1.0-edge.2
  - @memberjunction/ai-gemini@6.1.0-edge.2
  - @memberjunction/ai-inworld@6.1.0-edge.2
  - @memberjunction/ai-agents@6.1.0-edge.2
  - @memberjunction/actions-base@6.1.0-edge.2
  - @memberjunction/actions@6.1.0-edge.2
  - @memberjunction/core-entities-server@6.1.0-edge.2
  - @memberjunction/scheduling-engine@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/task-graph@6.1.0-edge.2
  - @memberjunction/ai-groq@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/ai-engine-base@6.1.0-edge.2
  - @memberjunction/ai-xai@6.1.0-edge.2
  - @memberjunction/ai-agent-manager@6.1.0-edge.2
  - @memberjunction/storage@6.1.0-edge.2
  - @memberjunction/core-actions@6.1.0-edge.2
  - @memberjunction/ai-vector-dupe@6.1.0-edge.2
  - @memberjunction/ai-agent-harness@6.1.0-edge.2
  - @memberjunction/ai-form-builder@6.1.0-edge.2
  - @memberjunction/tag-engine-base@6.1.0-edge.2
  - @memberjunction/predictive-studio@6.1.0-edge.2
  - @memberjunction/ai-prompts@6.1.0-edge.2
  - @memberjunction/ai-recommendations-rex@6.1.0-edge.2
  - @memberjunction/ai-reranker@6.1.0-edge.2
  - @memberjunction/actions-apollo@6.1.0-edge.2
  - @memberjunction/actions-bizapps-accounting@6.1.0-edge.2
  - @memberjunction/actions-bizapps-crm@6.1.0-edge.2
  - @memberjunction/actions-bizapps-formbuilders@6.1.0-edge.2
  - @memberjunction/actions-bizapps-lms@6.1.0-edge.2
  - @memberjunction/actions-bizapps-social@6.1.0-edge.2
  - @memberjunction/communication-types@6.1.0-edge.2
  - @memberjunction/content-autotagging@6.1.0-edge.2
  - @memberjunction/doc-utils@6.1.0-edge.2
  - @memberjunction/encryption@6.1.0-edge.2
  - @memberjunction/queue@6.1.0-edge.2
  - @memberjunction/react-linter@6.1.0-edge.2
  - @memberjunction/record-comparison@6.1.0-edge.2
  - @memberjunction/record-set-processor@6.1.0-edge.2
  - @memberjunction/scheduling-actions@6.1.0-edge.2
  - @memberjunction/scheduling-engine-base@6.1.0-edge.2
  - @memberjunction/templates@6.1.0-edge.2
  - @memberjunction/testing-engine@6.1.0-edge.2
  - @memberjunction/geo-core@6.1.0-edge.2
  - @memberjunction/ai-anthropic@6.1.0-edge.2
  - @memberjunction/ai-azure@6.1.0-edge.2
  - @memberjunction/ai-bedrock@6.1.0-edge.2
  - @memberjunction/ai-betty-bot@6.1.0-edge.2
  - @memberjunction/ai-blackforestlabs@6.1.0-edge.2
  - @memberjunction/ai-cerebras@6.1.0-edge.2
  - @memberjunction/ai-cohere@6.1.0-edge.2
  - @memberjunction/ai-fireworks@6.1.0-edge.2
  - @memberjunction/ai-heygen@6.1.0-edge.2
  - @memberjunction/ai-inception@6.1.0-edge.2
  - @memberjunction/ai-lmstudio@6.1.0-edge.2
  - @memberjunction/ai-llamacpp@6.1.0-edge.2
  - @memberjunction/ai-local-embeddings@6.1.0-edge.2
  - @memberjunction/ai-minimax@6.1.0-edge.2
  - @memberjunction/ai-mistral@6.1.0-edge.2
  - @memberjunction/ai-ollama@6.1.0-edge.2
  - @memberjunction/ai-openrouter@6.1.0-edge.2
  - @memberjunction/ai-vertex@6.1.0-edge.2
  - @memberjunction/ai-zhipu@6.1.0-edge.2
  - @memberjunction/ai-provider-bundle@6.1.0-edge.2
  - @memberjunction/ai-vectors-memory@6.1.0-edge.2
  - @memberjunction/ai-vectors-pinecone@6.1.0-edge.2
  - @memberjunction/ai-vectors-qdrant@6.1.0-edge.2
  - @memberjunction/ai-vectors-sqlserver@6.1.0-edge.2
  - @memberjunction/ai-vectors-pgvector@6.1.0-edge.2
  - @memberjunction/data-context-server@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: Phase 0 of the unified workflow DAG engine program (plan: PR #3456) — retires three dead or superseded subsystems so the **Workflow** name is freed for the program's user-facing vocabulary, and so the task-graph engine isn't built alongside a parallel, non-functioning orchestration model.

  **Eleven tables dropped** — the Skip v1-era workflow schema (`Workflow`, `WorkflowRun`, `WorkflowEngine`), the Skip v1-era report artifact (`Report`, `ReportCategory`, `ReportSnapshot`, `ReportUserState`, `ReportVersion`), the legacy `ScheduledAction` / `ScheduledActionParam` pair, and the report-era `OutputTriggerType`. All were verified dead or superseded: nothing outside generated code read the workflow tables, the `Reports` resource type named a `DriverClass` (`ReportResource`) that exists nowhere in the repo, and the legacy scheduled-action cron due-check is mathematically always-false so authored schedules could never fire.

  **Breaking — the report execution surface is gone.** `RunReport` was already marked `@deprecated` ("Reports are no longer supported... Interactive Components and Artifacts are replacements") and read `vwReports`, which this migration drops. Removed: `IRunReportProvider`, the `RunReport` class, `RunReportParams` / `RunReportResult`, `BaseEntity.RunReportProviderToUse`, `BaseAngularComponent.RunReportToUse`, `GraphQLDataProvider.GetReportData`, the `GetReportData` GraphQL query and `CreateReportFromConversationDetailID` mutation, and the `GET /reports/:reportId` REST endpoint. Accepted deliberately in the open v6 breaking-change window. Consumers should use Interactive Components and Artifacts.

  **Scheduled Actions are superseded by Scheduled Jobs, and the UI moved with them.** Contrary to the original plan's read, the entities were live authoring surface: four Knowledge Hub / AI dashboards created and read them. Those surfaces now author a `MJ: Scheduled Jobs` row of type **Action** — the same work, executed by `ActionScheduledJobDriver`, with the action and its parameters carried in the job's `Configuration` JSON rather than in child parameter rows. `ContentSource.ScheduledActionID` becomes `ContentSource.ScheduledJobID`. A shared `action-scheduled-job` helper in `ng-dashboards` owns the mapping so it isn't triplicated across surfaces.

  **Also removed:** the `@memberjunction/scheduled-actions` and `@memberjunction/scheduled-actions-server` packages (nothing depended on either), the `MJScheduledActionEntityExtended` subclass, the "coming soon" Scheduled Actions placeholder dashboard, and the Explorer report wiring (route, `TabService.OpenReport`, `NavigationService.OpenReport`, resource-type map entry, home-pin matcher, and the dashboard add-item Reports branch).

### Patch Changes

- 394d276: Register the external agent harness adapters in the server bootstraps

  Without this, an agent of type `Harness` **silently runs as an ordinary prompt agent** in MJAPI.

  `@memberjunction/ai-agent-harness` was not a dependency of either server bootstrap, so its
  `@RegisterClass` decorators never executed in the server process. `AgentRunner` resolves the agent
  type's `DriverClass` against the `BaseAgent` registry and falls back to plain `BaseAgent` when it
  finds nothing — which does not error. The agent runs, reports success, and has no harness, no
  sandbox and no credentials.

  Adds the dependency to both bootstraps and regenerates the manifests, so `HarnessAgentType`,
  `HarnessAgentBase` and all six adapters are registered where the server actually runs.

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/actions@6.1.0-edge.1
  - @memberjunction/storage@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/ai-agent-harness@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-agents@6.1.0-edge.1
  - @memberjunction/ai-mistral@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/task-graph@6.1.0-edge.1
  - @memberjunction/scheduling-engine@6.1.0-edge.1
  - @memberjunction/scheduling-actions@6.1.0-edge.1
  - @memberjunction/ai-vectors-pinecone@6.1.0-edge.1
  - @memberjunction/content-autotagging@6.1.0-edge.1
  - @memberjunction/ai-agent-manager@6.1.0-edge.1
  - @memberjunction/ai-form-builder@6.1.0-edge.1
  - @memberjunction/predictive-studio@6.1.0-edge.1
  - @memberjunction/actions-apollo@6.1.0-edge.1
  - @memberjunction/actions-bizapps-accounting@6.1.0-edge.1
  - @memberjunction/actions-bizapps-crm@6.1.0-edge.1
  - @memberjunction/actions-bizapps-formbuilders@6.1.0-edge.1
  - @memberjunction/actions-bizapps-lms@6.1.0-edge.1
  - @memberjunction/actions-bizapps-social@6.1.0-edge.1
  - @memberjunction/core-actions@6.1.0-edge.1
  - @memberjunction/record-set-processor@6.1.0-edge.1
  - @memberjunction/search-engine@6.1.0-edge.1
  - @memberjunction/ai-engine-base@6.1.0-edge.1
  - @memberjunction/tag-engine-base@6.1.0-edge.1
  - @memberjunction/ai-prompts@6.1.0-edge.1
  - @memberjunction/ai-recommendations-rex@6.1.0-edge.1
  - @memberjunction/ai-reranker@6.1.0-edge.1
  - @memberjunction/ai-vector-dupe@6.1.0-edge.1
  - @memberjunction/ai-vectors-memory@6.1.0-edge.1
  - @memberjunction/ai-vectors-qdrant@6.1.0-edge.1
  - @memberjunction/ai-vectors-sqlserver@6.1.0-edge.1
  - @memberjunction/ai-vectors-pgvector@6.1.0-edge.1
  - @memberjunction/actions-base@6.1.0-edge.1
  - @memberjunction/communication-types@6.1.0-edge.1
  - @memberjunction/doc-utils@6.1.0-edge.1
  - @memberjunction/encryption@6.1.0-edge.1
  - @memberjunction/core-entities-server@6.1.0-edge.1
  - @memberjunction/data-context-server@6.1.0-edge.1
  - @memberjunction/queue@6.1.0-edge.1
  - @memberjunction/react-linter@6.1.0-edge.1
  - @memberjunction/record-comparison@6.1.0-edge.1
  - @memberjunction/scheduling-engine-base@6.1.0-edge.1
  - @memberjunction/templates@6.1.0-edge.1
  - @memberjunction/testing-engine@6.1.0-edge.1
  - @memberjunction/geo-core@6.1.0-edge.1
  - @memberjunction/ai-provider-bundle@6.1.0-edge.1
  - @memberjunction/ai-anthropic@6.1.0-edge.1
  - @memberjunction/ai-assemblyai@6.1.0-edge.1
  - @memberjunction/ai-azure@6.1.0-edge.1
  - @memberjunction/ai-bedrock@6.1.0-edge.1
  - @memberjunction/ai-betty-bot@6.1.0-edge.1
  - @memberjunction/ai-blackforestlabs@6.1.0-edge.1
  - @memberjunction/ai-cerebras@6.1.0-edge.1
  - @memberjunction/ai-cohere@6.1.0-edge.1
  - @memberjunction/ai-elevenlabs@6.1.0-edge.1
  - @memberjunction/ai-fireworks@6.1.0-edge.1
  - @memberjunction/ai-gemini@6.1.0-edge.1
  - @memberjunction/ai-groq@6.1.0-edge.1
  - @memberjunction/ai-heygen@6.1.0-edge.1
  - @memberjunction/ai-inception@6.1.0-edge.1
  - @memberjunction/ai-inworld@6.1.0-edge.1
  - @memberjunction/ai-lmstudio@6.1.0-edge.1
  - @memberjunction/ai-llamacpp@6.1.0-edge.1
  - @memberjunction/ai-local-embeddings@6.1.0-edge.1
  - @memberjunction/ai-minimax@6.1.0-edge.1
  - @memberjunction/ai-ollama@6.1.0-edge.1
  - @memberjunction/ai-openai@6.1.0-edge.1
  - @memberjunction/ai-openrouter@6.1.0-edge.1
  - @memberjunction/ai-vertex@6.1.0-edge.1
  - @memberjunction/ai-zhipu@6.1.0-edge.1
  - @memberjunction/ai-xai@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [24b22c9]
- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [0acf96e]
- Updated dependencies [8d0d45a]
- Updated dependencies [1100077]
  - @memberjunction/ai-elevenlabs@6.1.0-edge.0
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/actions@6.1.0-edge.0
  - @memberjunction/actions-base@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/search-engine@6.1.0-edge.0
  - @memberjunction/core-actions@6.1.0-edge.0
  - @memberjunction/react-linter@6.1.0-edge.0
  - @memberjunction/ai-provider-bundle@6.1.0-edge.0
  - @memberjunction/ai-agent-manager@6.1.0-edge.0
  - @memberjunction/ai-agents@6.1.0-edge.0
  - @memberjunction/ai-engine-base@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/ai-form-builder@6.1.0-edge.0
  - @memberjunction/tag-engine-base@6.1.0-edge.0
  - @memberjunction/predictive-studio@6.1.0-edge.0
  - @memberjunction/ai-prompts@6.1.0-edge.0
  - @memberjunction/ai-recommendations-rex@6.1.0-edge.0
  - @memberjunction/ai-reranker@6.1.0-edge.0
  - @memberjunction/ai-vector-dupe@6.1.0-edge.0
  - @memberjunction/actions-apollo@6.1.0-edge.0
  - @memberjunction/actions-bizapps-accounting@6.1.0-edge.0
  - @memberjunction/actions-bizapps-crm@6.1.0-edge.0
  - @memberjunction/actions-bizapps-formbuilders@6.1.0-edge.0
  - @memberjunction/actions-bizapps-lms@6.1.0-edge.0
  - @memberjunction/actions-bizapps-social@6.1.0-edge.0
  - @memberjunction/communication-types@6.1.0-edge.0
  - @memberjunction/content-autotagging@6.1.0-edge.0
  - @memberjunction/doc-utils@6.1.0-edge.0
  - @memberjunction/encryption@6.1.0-edge.0
  - @memberjunction/core-entities-server@6.1.0-edge.0
  - @memberjunction/queue@6.1.0-edge.0
  - @memberjunction/storage@6.1.0-edge.0
  - @memberjunction/record-comparison@6.1.0-edge.0
  - @memberjunction/record-set-processor@6.1.0-edge.0
  - @memberjunction/scheduling-actions@6.1.0-edge.0
  - @memberjunction/scheduling-engine-base@6.1.0-edge.0
  - @memberjunction/scheduling-engine@6.1.0-edge.0
  - @memberjunction/templates@6.1.0-edge.0
  - @memberjunction/testing-engine@6.1.0-edge.0
  - @memberjunction/geo-core@6.1.0-edge.0
  - @memberjunction/ai-vectors-memory@6.1.0-edge.0
  - @memberjunction/ai-vectors-pinecone@6.1.0-edge.0
  - @memberjunction/ai-vectors-qdrant@6.1.0-edge.0
  - @memberjunction/ai-vectors-sqlserver@6.1.0-edge.0
  - @memberjunction/ai-vectors-pgvector@6.1.0-edge.0
  - @memberjunction/data-context-server@6.1.0-edge.0
  - @memberjunction/ai-anthropic@6.1.0-edge.0
  - @memberjunction/ai-assemblyai@6.1.0-edge.0
  - @memberjunction/ai-azure@6.1.0-edge.0
  - @memberjunction/ai-bedrock@6.1.0-edge.0
  - @memberjunction/ai-betty-bot@6.1.0-edge.0
  - @memberjunction/ai-blackforestlabs@6.1.0-edge.0
  - @memberjunction/ai-cerebras@6.1.0-edge.0
  - @memberjunction/ai-cohere@6.1.0-edge.0
  - @memberjunction/ai-fireworks@6.1.0-edge.0
  - @memberjunction/ai-gemini@6.1.0-edge.0
  - @memberjunction/ai-groq@6.1.0-edge.0
  - @memberjunction/ai-heygen@6.1.0-edge.0
  - @memberjunction/ai-inception@6.1.0-edge.0
  - @memberjunction/ai-inworld@6.1.0-edge.0
  - @memberjunction/ai-lmstudio@6.1.0-edge.0
  - @memberjunction/ai-llamacpp@6.1.0-edge.0
  - @memberjunction/ai-local-embeddings@6.1.0-edge.0
  - @memberjunction/ai-minimax@6.1.0-edge.0
  - @memberjunction/ai-mistral@6.1.0-edge.0
  - @memberjunction/ai-ollama@6.1.0-edge.0
  - @memberjunction/ai-openai@6.1.0-edge.0
  - @memberjunction/ai-openrouter@6.1.0-edge.0
  - @memberjunction/ai-vertex@6.1.0-edge.0
  - @memberjunction/ai-zhipu@6.1.0-edge.0
  - @memberjunction/ai-xai@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-agent-manager@6.0.0
  - @memberjunction/ai-agents@6.0.0
  - @memberjunction/ai-engine-base@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/ai-form-builder@6.0.0
  - @memberjunction/tag-engine-base@6.0.0
  - @memberjunction/predictive-studio@6.0.0
  - @memberjunction/ai-prompts@6.0.0
  - @memberjunction/ai-recommendations-rex@6.0.0
  - @memberjunction/ai-reranker@6.0.0
  - @memberjunction/ai-vector-dupe@6.0.0
  - @memberjunction/ai-vectors-memory@6.0.0
  - @memberjunction/ai-vectors-pinecone@6.0.0
  - @memberjunction/ai-vectors-qdrant@6.0.0
  - @memberjunction/ai-vectors-sqlserver@6.0.0
  - @memberjunction/ai-vectors-pgvector@6.0.0
  - @memberjunction/actions-apollo@6.0.0
  - @memberjunction/actions-base@6.0.0
  - @memberjunction/actions-bizapps-accounting@6.0.0
  - @memberjunction/actions-bizapps-crm@6.0.0
  - @memberjunction/actions-bizapps-formbuilders@6.0.0
  - @memberjunction/actions-bizapps-lms@6.0.0
  - @memberjunction/actions-bizapps-social@6.0.0
  - @memberjunction/core-actions@6.0.0
  - @memberjunction/actions@6.0.0
  - @memberjunction/communication-types@6.0.0
  - @memberjunction/content-autotagging@6.0.0
  - @memberjunction/doc-utils@6.0.0
  - @memberjunction/encryption@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/core-entities-server@6.0.0
  - @memberjunction/data-context-server@6.0.0
  - @memberjunction/queue@6.0.0
  - @memberjunction/storage@6.0.0
  - @memberjunction/react-linter@6.0.0
  - @memberjunction/record-comparison@6.0.0
  - @memberjunction/record-set-processor@6.0.0
  - @memberjunction/scheduling-actions@6.0.0
  - @memberjunction/scheduling-engine-base@6.0.0
  - @memberjunction/scheduling-engine@6.0.0
  - @memberjunction/search-engine@6.0.0
  - @memberjunction/templates@6.0.0
  - @memberjunction/testing-engine@6.0.0
  - @memberjunction/geo-core@6.0.0
  - @memberjunction/ai-provider-bundle@6.0.0
  - @memberjunction/ai-anthropic@6.0.0
  - @memberjunction/ai-assemblyai@6.0.0
  - @memberjunction/ai-azure@6.0.0
  - @memberjunction/ai-bedrock@6.0.0
  - @memberjunction/ai-betty-bot@6.0.0
  - @memberjunction/ai-blackforestlabs@6.0.0
  - @memberjunction/ai-cerebras@6.0.0
  - @memberjunction/ai-cohere@6.0.0
  - @memberjunction/ai-elevenlabs@6.0.0
  - @memberjunction/ai-fireworks@6.0.0
  - @memberjunction/ai-gemini@6.0.0
  - @memberjunction/ai-groq@6.0.0
  - @memberjunction/ai-heygen@6.0.0
  - @memberjunction/ai-inception@6.0.0
  - @memberjunction/ai-inworld@6.0.0
  - @memberjunction/ai-lmstudio@6.0.0
  - @memberjunction/ai-llamacpp@6.0.0
  - @memberjunction/ai-local-embeddings@6.0.0
  - @memberjunction/ai-minimax@6.0.0
  - @memberjunction/ai-mistral@6.0.0
  - @memberjunction/ai-ollama@6.0.0
  - @memberjunction/ai-openai@6.0.0
  - @memberjunction/ai-openrouter@6.0.0
  - @memberjunction/ai-vertex@6.0.0
  - @memberjunction/ai-zhipu@6.0.0
  - @memberjunction/ai-xai@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [c382605]
- Updated dependencies [a8fc549]
  - @memberjunction/ai-agents@5.51.0
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-agent-manager@5.51.0
  - @memberjunction/ai-form-builder@5.51.0
  - @memberjunction/predictive-studio@5.51.0
  - @memberjunction/core-actions@5.51.0
  - @memberjunction/record-set-processor@5.51.0
  - @memberjunction/scheduling-engine@5.51.0
  - @memberjunction/testing-engine@5.51.0
  - @memberjunction/ai-engine-base@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/tag-engine-base@5.51.0
  - @memberjunction/ai-prompts@5.51.0
  - @memberjunction/ai-recommendations-rex@5.51.0
  - @memberjunction/ai-reranker@5.51.0
  - @memberjunction/ai-vector-dupe@5.51.0
  - @memberjunction/ai-vectors-memory@5.51.0
  - @memberjunction/ai-vectors-pinecone@5.51.0
  - @memberjunction/ai-vectors-qdrant@5.51.0
  - @memberjunction/ai-vectors-sqlserver@5.51.0
  - @memberjunction/ai-vectors-pgvector@5.51.0
  - @memberjunction/actions-apollo@5.51.0
  - @memberjunction/actions-base@5.51.0
  - @memberjunction/actions-bizapps-accounting@5.51.0
  - @memberjunction/actions-bizapps-crm@5.51.0
  - @memberjunction/actions-bizapps-formbuilders@5.51.0
  - @memberjunction/actions-bizapps-lms@5.51.0
  - @memberjunction/actions-bizapps-social@5.51.0
  - @memberjunction/actions@5.51.0
  - @memberjunction/communication-types@5.51.0
  - @memberjunction/content-autotagging@5.51.0
  - @memberjunction/doc-utils@5.51.0
  - @memberjunction/encryption@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/core-entities-server@5.51.0
  - @memberjunction/data-context-server@5.51.0
  - @memberjunction/queue@5.51.0
  - @memberjunction/storage@5.51.0
  - @memberjunction/react-linter@5.51.0
  - @memberjunction/record-comparison@5.51.0
  - @memberjunction/scheduling-actions@5.51.0
  - @memberjunction/scheduling-engine-base@5.51.0
  - @memberjunction/search-engine@5.51.0
  - @memberjunction/templates@5.51.0
  - @memberjunction/geo-core@5.51.0
  - @memberjunction/ai-provider-bundle@5.51.0
  - @memberjunction/ai-anthropic@5.51.0
  - @memberjunction/ai-assemblyai@5.51.0
  - @memberjunction/ai-azure@5.51.0
  - @memberjunction/ai-bedrock@5.51.0
  - @memberjunction/ai-betty-bot@5.51.0
  - @memberjunction/ai-blackforestlabs@5.51.0
  - @memberjunction/ai-cerebras@5.51.0
  - @memberjunction/ai-cohere@5.51.0
  - @memberjunction/ai-elevenlabs@5.51.0
  - @memberjunction/ai-fireworks@5.51.0
  - @memberjunction/ai-gemini@5.51.0
  - @memberjunction/ai-groq@5.51.0
  - @memberjunction/ai-heygen@5.51.0
  - @memberjunction/ai-inception@5.51.0
  - @memberjunction/ai-inworld@5.51.0
  - @memberjunction/ai-lmstudio@5.51.0
  - @memberjunction/ai-llamacpp@5.51.0
  - @memberjunction/ai-local-embeddings@5.51.0
  - @memberjunction/ai-minimax@5.51.0
  - @memberjunction/ai-mistral@5.51.0
  - @memberjunction/ai-ollama@5.51.0
  - @memberjunction/ai-openai@5.51.0
  - @memberjunction/ai-openrouter@5.51.0
  - @memberjunction/ai-vertex@5.51.0
  - @memberjunction/ai-zhipu@5.51.0
  - @memberjunction/ai-xai@5.51.0

## 5.50.0

### Patch Changes

- 623dfc5: Break CodeGen FK cycle between AIAgentRun, AIPromptRun, and ConversationDetail. Move SummaryPromptRunID from ConversationDetail to a new ConversationCompactionRun audit table. Remove AgentRunID from AIPromptRun (derivable via AIAgentRunStep.TargetLogID). Remove agentRunId from AIPromptParams and all write sites across the prompt/agent stack.
- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [86832fa]
- Updated dependencies [deb02b4]
- Updated dependencies [8b4c6b2]
- Updated dependencies [0686d52]
- Updated dependencies [c7b6710]
- Updated dependencies [764d6f6]
- Updated dependencies [408e4bf]
- Updated dependencies [0ba33b3]
- Updated dependencies [03fc891]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-agents@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai-prompts@5.50.0
  - @memberjunction/content-autotagging@5.50.0
  - @memberjunction/communication-types@5.50.0
  - @memberjunction/search-engine@5.50.0
  - @memberjunction/core-entities-server@5.50.0
  - @memberjunction/actions-base@5.50.0
  - @memberjunction/core-actions@5.50.0
  - @memberjunction/storage@5.50.0
  - @memberjunction/testing-engine@5.50.0
  - @memberjunction/ai-agent-manager@5.50.0
  - @memberjunction/ai-engine-base@5.50.0
  - @memberjunction/ai-form-builder@5.50.0
  - @memberjunction/tag-engine-base@5.50.0
  - @memberjunction/predictive-studio@5.50.0
  - @memberjunction/ai-recommendations-rex@5.50.0
  - @memberjunction/ai-reranker@5.50.0
  - @memberjunction/ai-vector-dupe@5.50.0
  - @memberjunction/actions-apollo@5.50.0
  - @memberjunction/actions-bizapps-accounting@5.50.0
  - @memberjunction/actions-bizapps-crm@5.50.0
  - @memberjunction/actions-bizapps-formbuilders@5.50.0
  - @memberjunction/actions-bizapps-lms@5.50.0
  - @memberjunction/actions-bizapps-social@5.50.0
  - @memberjunction/actions@5.50.0
  - @memberjunction/doc-utils@5.50.0
  - @memberjunction/encryption@5.50.0
  - @memberjunction/queue@5.50.0
  - @memberjunction/react-linter@5.50.0
  - @memberjunction/record-comparison@5.50.0
  - @memberjunction/record-set-processor@5.50.0
  - @memberjunction/scheduling-actions@5.50.0
  - @memberjunction/scheduling-engine-base@5.50.0
  - @memberjunction/scheduling-engine@5.50.0
  - @memberjunction/templates@5.50.0
  - @memberjunction/geo-core@5.50.0
  - @memberjunction/ai-vectors-memory@5.50.0
  - @memberjunction/ai-vectors-pinecone@5.50.0
  - @memberjunction/ai-vectors-qdrant@5.50.0
  - @memberjunction/ai-vectors-sqlserver@5.50.0
  - @memberjunction/ai-vectors-pgvector@5.50.0
  - @memberjunction/data-context-server@5.50.0
  - @memberjunction/ai-anthropic@5.50.0
  - @memberjunction/ai-assemblyai@5.50.0
  - @memberjunction/ai-azure@5.50.0
  - @memberjunction/ai-bedrock@5.50.0
  - @memberjunction/ai-betty-bot@5.50.0
  - @memberjunction/ai-blackforestlabs@5.50.0
  - @memberjunction/ai-cerebras@5.50.0
  - @memberjunction/ai-cohere@5.50.0
  - @memberjunction/ai-elevenlabs@5.50.0
  - @memberjunction/ai-fireworks@5.50.0
  - @memberjunction/ai-gemini@5.50.0
  - @memberjunction/ai-groq@5.50.0
  - @memberjunction/ai-heygen@5.50.0
  - @memberjunction/ai-inception@5.50.0
  - @memberjunction/ai-inworld@5.50.0
  - @memberjunction/ai-lmstudio@5.50.0
  - @memberjunction/ai-llamacpp@5.50.0
  - @memberjunction/ai-local-embeddings@5.50.0
  - @memberjunction/ai-minimax@5.50.0
  - @memberjunction/ai-mistral@5.50.0
  - @memberjunction/ai-ollama@5.50.0
  - @memberjunction/ai-openai@5.50.0
  - @memberjunction/ai-openrouter@5.50.0
  - @memberjunction/ai-vertex@5.50.0
  - @memberjunction/ai-zhipu@5.50.0
  - @memberjunction/ai-xai@5.50.0
  - @memberjunction/ai-provider-bundle@5.50.0

## 5.49.0

### Patch Changes

- c5e4b9e: Agent conversation compaction: durable cross-turn summaries stored on the conversation (Sequence + SummaryPromptRunID, budget knobs on AIAgentType/AIAgent, Compaction run steps), conversation-history retrieval tools (getMessageBySequence, getMessagesByRange, searchConversation, summarizeRange), edit handling with OriginalMessageChanged flagging and a wired chat edit affordance, plus hardening fixes: failed message expansions now surface a reason to the model (breaks an unbounded retry loop), json5 ESM import fix restores the local JSON-repair tier, and SQLConverter no longer truncates PG column comments at escaped apostrophes.
- 6c910ef: Dialect-aware query extraction with QuerySQL-triggered re-extraction, PG double-quoted identifier unwrapping in SQL parser, lazy-load QueryEngine in MJQuerySQLEntityServer, and suppress full_access scope probe from API key usage logs
- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [88d707b]
- Updated dependencies [7af258e]
- Updated dependencies [ea945da]
- Updated dependencies [7db8ef5]
- Updated dependencies [505c8b5]
- Updated dependencies [6c910ef]
- Updated dependencies [70113b1]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [9fb3fda]
- Updated dependencies [5473e9a]
- Updated dependencies [9e2278c]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [373c5f6]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
- Updated dependencies [9d6e3d9]
- Updated dependencies [78a5e44]
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-agents@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/ai-prompts@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/core-entities-server@5.49.0
  - @memberjunction/communication-types@5.49.0
  - @memberjunction/scheduling-engine@5.49.0
  - @memberjunction/core-actions@5.49.0
  - @memberjunction/ai-cohere@5.49.0
  - @memberjunction/ai-gemini@5.49.0
  - @memberjunction/ai-mistral@5.49.0
  - @memberjunction/ai-azure@5.49.0
  - @memberjunction/ai-bedrock@5.49.0
  - @memberjunction/actions@5.49.0
  - @memberjunction/testing-engine@5.49.0
  - @memberjunction/ai-anthropic@5.49.0
  - @memberjunction/ai-betty-bot@5.49.0
  - @memberjunction/ai-cerebras@5.49.0
  - @memberjunction/ai-fireworks@5.49.0
  - @memberjunction/ai-groq@5.49.0
  - @memberjunction/ai-inception@5.49.0
  - @memberjunction/ai-lmstudio@5.49.0
  - @memberjunction/ai-ollama@5.49.0
  - @memberjunction/ai-openai@5.49.0
  - @memberjunction/predictive-studio@5.49.0
  - @memberjunction/ai-xai@5.49.0
  - @memberjunction/ai-vectors-pinecone@5.49.0
  - @memberjunction/search-engine@5.49.0
  - @memberjunction/templates@5.49.0
  - @memberjunction/ai-agent-manager@5.49.0
  - @memberjunction/ai-engine-base@5.49.0
  - @memberjunction/ai-form-builder@5.49.0
  - @memberjunction/tag-engine-base@5.49.0
  - @memberjunction/ai-recommendations-rex@5.49.0
  - @memberjunction/ai-reranker@5.49.0
  - @memberjunction/ai-vector-dupe@5.49.0
  - @memberjunction/ai-vectors-memory@5.49.0
  - @memberjunction/ai-vectors-qdrant@5.49.0
  - @memberjunction/ai-vectors-sqlserver@5.49.0
  - @memberjunction/ai-vectors-pgvector@5.49.0
  - @memberjunction/actions-apollo@5.49.0
  - @memberjunction/actions-base@5.49.0
  - @memberjunction/actions-bizapps-accounting@5.49.0
  - @memberjunction/actions-bizapps-crm@5.49.0
  - @memberjunction/actions-bizapps-formbuilders@5.49.0
  - @memberjunction/actions-bizapps-lms@5.49.0
  - @memberjunction/actions-bizapps-social@5.49.0
  - @memberjunction/content-autotagging@5.49.0
  - @memberjunction/doc-utils@5.49.0
  - @memberjunction/encryption@5.49.0
  - @memberjunction/data-context-server@5.49.0
  - @memberjunction/queue@5.49.0
  - @memberjunction/storage@5.49.0
  - @memberjunction/react-linter@5.49.0
  - @memberjunction/record-comparison@5.49.0
  - @memberjunction/record-set-processor@5.49.0
  - @memberjunction/scheduling-actions@5.49.0
  - @memberjunction/scheduling-engine-base@5.49.0
  - @memberjunction/geo-core@5.49.0
  - @memberjunction/ai-assemblyai@5.49.0
  - @memberjunction/ai-blackforestlabs@5.49.0
  - @memberjunction/ai-elevenlabs@5.49.0
  - @memberjunction/ai-heygen@5.49.0
  - @memberjunction/ai-inworld@5.49.0
  - @memberjunction/ai-llamacpp@5.49.0
  - @memberjunction/ai-local-embeddings@5.49.0
  - @memberjunction/ai-minimax@5.49.0
  - @memberjunction/ai-openrouter@5.49.0
  - @memberjunction/ai-vertex@5.49.0
  - @memberjunction/ai-zhipu@5.49.0
  - @memberjunction/ai-provider-bundle@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [2143b98]
- Updated dependencies [bda123a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai-agents@5.48.0
  - @memberjunction/core-actions@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/core-entities-server@5.48.0
  - @memberjunction/ai-agent-manager@5.48.0
  - @memberjunction/ai-engine-base@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/ai-form-builder@5.48.0
  - @memberjunction/tag-engine-base@5.48.0
  - @memberjunction/predictive-studio@5.48.0
  - @memberjunction/ai-prompts@5.48.0
  - @memberjunction/ai-recommendations-rex@5.48.0
  - @memberjunction/ai-reranker@5.48.0
  - @memberjunction/ai-vector-dupe@5.48.0
  - @memberjunction/ai-vectors-memory@5.48.0
  - @memberjunction/ai-vectors-pinecone@5.48.0
  - @memberjunction/ai-vectors-qdrant@5.48.0
  - @memberjunction/ai-vectors-sqlserver@5.48.0
  - @memberjunction/ai-vectors-pgvector@5.48.0
  - @memberjunction/actions-apollo@5.48.0
  - @memberjunction/actions-base@5.48.0
  - @memberjunction/actions-bizapps-accounting@5.48.0
  - @memberjunction/actions-bizapps-crm@5.48.0
  - @memberjunction/actions-bizapps-formbuilders@5.48.0
  - @memberjunction/actions-bizapps-lms@5.48.0
  - @memberjunction/actions-bizapps-social@5.48.0
  - @memberjunction/actions@5.48.0
  - @memberjunction/communication-types@5.48.0
  - @memberjunction/content-autotagging@5.48.0
  - @memberjunction/doc-utils@5.48.0
  - @memberjunction/encryption@5.48.0
  - @memberjunction/data-context-server@5.48.0
  - @memberjunction/queue@5.48.0
  - @memberjunction/storage@5.48.0
  - @memberjunction/react-linter@5.48.0
  - @memberjunction/record-comparison@5.48.0
  - @memberjunction/record-set-processor@5.48.0
  - @memberjunction/scheduling-actions@5.48.0
  - @memberjunction/scheduling-engine-base@5.48.0
  - @memberjunction/scheduling-engine@5.48.0
  - @memberjunction/search-engine@5.48.0
  - @memberjunction/templates@5.48.0
  - @memberjunction/testing-engine@5.48.0
  - @memberjunction/geo-core@5.48.0
  - @memberjunction/ai-anthropic@5.48.0
  - @memberjunction/ai-assemblyai@5.48.0
  - @memberjunction/ai-azure@5.48.0
  - @memberjunction/ai-bedrock@5.48.0
  - @memberjunction/ai-betty-bot@5.48.0
  - @memberjunction/ai-blackforestlabs@5.48.0
  - @memberjunction/ai-cerebras@5.48.0
  - @memberjunction/ai-cohere@5.48.0
  - @memberjunction/ai-elevenlabs@5.48.0
  - @memberjunction/ai-fireworks@5.48.0
  - @memberjunction/ai-gemini@5.48.0
  - @memberjunction/ai-groq@5.48.0
  - @memberjunction/ai-heygen@5.48.0
  - @memberjunction/ai-inception@5.48.0
  - @memberjunction/ai-inworld@5.48.0
  - @memberjunction/ai-lmstudio@5.48.0
  - @memberjunction/ai-llamacpp@5.48.0
  - @memberjunction/ai-local-embeddings@5.48.0
  - @memberjunction/ai-minimax@5.48.0
  - @memberjunction/ai-mistral@5.48.0
  - @memberjunction/ai-ollama@5.48.0
  - @memberjunction/ai-openai@5.48.0
  - @memberjunction/ai-openrouter@5.48.0
  - @memberjunction/ai-vertex@5.48.0
  - @memberjunction/ai-zhipu@5.48.0
  - @memberjunction/ai-xai@5.48.0
  - @memberjunction/ai-provider-bundle@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
- Updated dependencies [46a06ac]
  - @memberjunction/core@5.47.0
  - @memberjunction/predictive-studio@5.47.0
  - @memberjunction/ai-agent-manager@5.47.0
  - @memberjunction/ai-agents@5.47.0
  - @memberjunction/ai-engine-base@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/ai-form-builder@5.47.0
  - @memberjunction/tag-engine-base@5.47.0
  - @memberjunction/ai-prompts@5.47.0
  - @memberjunction/ai-recommendations-rex@5.47.0
  - @memberjunction/ai-reranker@5.47.0
  - @memberjunction/ai-vector-dupe@5.47.0
  - @memberjunction/ai-vectors-memory@5.47.0
  - @memberjunction/ai-vectors-pinecone@5.47.0
  - @memberjunction/ai-vectors-qdrant@5.47.0
  - @memberjunction/ai-vectors-sqlserver@5.47.0
  - @memberjunction/ai-vectors-pgvector@5.47.0
  - @memberjunction/actions-apollo@5.47.0
  - @memberjunction/actions-base@5.47.0
  - @memberjunction/actions-bizapps-accounting@5.47.0
  - @memberjunction/actions-bizapps-crm@5.47.0
  - @memberjunction/actions-bizapps-formbuilders@5.47.0
  - @memberjunction/actions-bizapps-lms@5.47.0
  - @memberjunction/actions-bizapps-social@5.47.0
  - @memberjunction/core-actions@5.47.0
  - @memberjunction/actions@5.47.0
  - @memberjunction/communication-types@5.47.0
  - @memberjunction/content-autotagging@5.47.0
  - @memberjunction/doc-utils@5.47.0
  - @memberjunction/encryption@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/core-entities-server@5.47.0
  - @memberjunction/data-context-server@5.47.0
  - @memberjunction/queue@5.47.0
  - @memberjunction/storage@5.47.0
  - @memberjunction/react-linter@5.47.0
  - @memberjunction/record-comparison@5.47.0
  - @memberjunction/record-set-processor@5.47.0
  - @memberjunction/scheduling-actions@5.47.0
  - @memberjunction/scheduling-engine-base@5.47.0
  - @memberjunction/scheduling-engine@5.47.0
  - @memberjunction/search-engine@5.47.0
  - @memberjunction/templates@5.47.0
  - @memberjunction/testing-engine@5.47.0
  - @memberjunction/geo-core@5.47.0
  - @memberjunction/ai-provider-bundle@5.47.0
  - @memberjunction/ai-anthropic@5.47.0
  - @memberjunction/ai-assemblyai@5.47.0
  - @memberjunction/ai-azure@5.47.0
  - @memberjunction/ai-bedrock@5.47.0
  - @memberjunction/ai-betty-bot@5.47.0
  - @memberjunction/ai-blackforestlabs@5.47.0
  - @memberjunction/ai-cerebras@5.47.0
  - @memberjunction/ai-cohere@5.47.0
  - @memberjunction/ai-elevenlabs@5.47.0
  - @memberjunction/ai-fireworks@5.47.0
  - @memberjunction/ai-gemini@5.47.0
  - @memberjunction/ai-groq@5.47.0
  - @memberjunction/ai-heygen@5.47.0
  - @memberjunction/ai-inception@5.47.0
  - @memberjunction/ai-inworld@5.47.0
  - @memberjunction/ai-lmstudio@5.47.0
  - @memberjunction/ai-llamacpp@5.47.0
  - @memberjunction/ai-local-embeddings@5.47.0
  - @memberjunction/ai-minimax@5.47.0
  - @memberjunction/ai-mistral@5.47.0
  - @memberjunction/ai-ollama@5.47.0
  - @memberjunction/ai-openai@5.47.0
  - @memberjunction/ai-openrouter@5.47.0
  - @memberjunction/ai-vertex@5.47.0
  - @memberjunction/ai-zhipu@5.47.0
  - @memberjunction/ai-xai@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ai-engine-base@5.46.0
  - @memberjunction/ai-agents@5.46.0
  - @memberjunction/ai-prompts@5.46.0
  - @memberjunction/ai-agent-manager@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/ai-form-builder@5.46.0
  - @memberjunction/tag-engine-base@5.46.0
  - @memberjunction/predictive-studio@5.46.0
  - @memberjunction/ai-recommendations-rex@5.46.0
  - @memberjunction/ai-reranker@5.46.0
  - @memberjunction/ai-vector-dupe@5.46.0
  - @memberjunction/ai-vectors-memory@5.46.0
  - @memberjunction/ai-vectors-pinecone@5.46.0
  - @memberjunction/ai-vectors-qdrant@5.46.0
  - @memberjunction/ai-vectors-sqlserver@5.46.0
  - @memberjunction/ai-vectors-pgvector@5.46.0
  - @memberjunction/actions-apollo@5.46.0
  - @memberjunction/actions-base@5.46.0
  - @memberjunction/actions-bizapps-accounting@5.46.0
  - @memberjunction/actions-bizapps-crm@5.46.0
  - @memberjunction/actions-bizapps-formbuilders@5.46.0
  - @memberjunction/actions-bizapps-lms@5.46.0
  - @memberjunction/actions-bizapps-social@5.46.0
  - @memberjunction/core-actions@5.46.0
  - @memberjunction/actions@5.46.0
  - @memberjunction/communication-types@5.46.0
  - @memberjunction/content-autotagging@5.46.0
  - @memberjunction/doc-utils@5.46.0
  - @memberjunction/encryption@5.46.0
  - @memberjunction/core-entities-server@5.46.0
  - @memberjunction/data-context-server@5.46.0
  - @memberjunction/queue@5.46.0
  - @memberjunction/storage@5.46.0
  - @memberjunction/react-linter@5.46.0
  - @memberjunction/record-comparison@5.46.0
  - @memberjunction/record-set-processor@5.46.0
  - @memberjunction/scheduling-actions@5.46.0
  - @memberjunction/scheduling-engine-base@5.46.0
  - @memberjunction/scheduling-engine@5.46.0
  - @memberjunction/search-engine@5.46.0
  - @memberjunction/templates@5.46.0
  - @memberjunction/testing-engine@5.46.0
  - @memberjunction/geo-core@5.46.0
  - @memberjunction/ai-provider-bundle@5.46.0
  - @memberjunction/ai-anthropic@5.46.0
  - @memberjunction/ai-assemblyai@5.46.0
  - @memberjunction/ai-azure@5.46.0
  - @memberjunction/ai-bedrock@5.46.0
  - @memberjunction/ai-betty-bot@5.46.0
  - @memberjunction/ai-blackforestlabs@5.46.0
  - @memberjunction/ai-cerebras@5.46.0
  - @memberjunction/ai-cohere@5.46.0
  - @memberjunction/ai-elevenlabs@5.46.0
  - @memberjunction/ai-fireworks@5.46.0
  - @memberjunction/ai-gemini@5.46.0
  - @memberjunction/ai-groq@5.46.0
  - @memberjunction/ai-heygen@5.46.0
  - @memberjunction/ai-inception@5.46.0
  - @memberjunction/ai-inworld@5.46.0
  - @memberjunction/ai-lmstudio@5.46.0
  - @memberjunction/ai-llamacpp@5.46.0
  - @memberjunction/ai-local-embeddings@5.46.0
  - @memberjunction/ai-minimax@5.46.0
  - @memberjunction/ai-mistral@5.46.0
  - @memberjunction/ai-ollama@5.46.0
  - @memberjunction/ai-openai@5.46.0
  - @memberjunction/ai-openrouter@5.46.0
  - @memberjunction/ai-vertex@5.46.0
  - @memberjunction/ai-zhipu@5.46.0
  - @memberjunction/ai-xai@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ai-agent-manager@5.45.1
  - @memberjunction/ai-agents@5.45.1
  - @memberjunction/ai-engine-base@5.45.1
  - @memberjunction/ai-form-builder@5.45.1
  - @memberjunction/predictive-studio@5.45.1
  - @memberjunction/ai-prompts@5.45.1
  - @memberjunction/ai-reranker@5.45.1
  - @memberjunction/ai-vector-dupe@5.45.1
  - @memberjunction/core-actions@5.45.1
  - @memberjunction/content-autotagging@5.45.1
  - @memberjunction/core-entities-server@5.45.1
  - @memberjunction/record-set-processor@5.45.1
  - @memberjunction/scheduling-engine@5.45.1
  - @memberjunction/templates@5.45.1
  - @memberjunction/testing-engine@5.45.1
  - @memberjunction/ai-vectors-pinecone@5.45.1
  - @memberjunction/queue@5.45.1
  - @memberjunction/search-engine@5.45.1
  - @memberjunction/ai-provider-bundle@5.45.1
  - @memberjunction/react-linter@5.45.1
  - @memberjunction/tag-engine-base@5.45.1
  - @memberjunction/ai-anthropic@5.45.1
  - @memberjunction/ai-assemblyai@5.45.1
  - @memberjunction/ai-azure@5.45.1
  - @memberjunction/ai-bedrock@5.45.1
  - @memberjunction/ai-betty-bot@5.45.1
  - @memberjunction/ai-blackforestlabs@5.45.1
  - @memberjunction/ai-cerebras@5.45.1
  - @memberjunction/ai-cohere@5.45.1
  - @memberjunction/ai-elevenlabs@5.45.1
  - @memberjunction/ai-fireworks@5.45.1
  - @memberjunction/ai-gemini@5.45.1
  - @memberjunction/ai-groq@5.45.1
  - @memberjunction/ai-heygen@5.45.1
  - @memberjunction/ai-inception@5.45.1
  - @memberjunction/ai-inworld@5.45.1
  - @memberjunction/ai-lmstudio@5.45.1
  - @memberjunction/ai-llamacpp@5.45.1
  - @memberjunction/ai-local-embeddings@5.45.1
  - @memberjunction/ai-minimax@5.45.1
  - @memberjunction/ai-mistral@5.45.1
  - @memberjunction/ai-ollama@5.45.1
  - @memberjunction/ai-openai@5.45.1
  - @memberjunction/ai-openrouter@5.45.1
  - @memberjunction/ai-recommendations-rex@5.45.1
  - @memberjunction/ai-vertex@5.45.1
  - @memberjunction/ai-zhipu@5.45.1
  - @memberjunction/ai-xai@5.45.1
  - @memberjunction/ai-vectors-memory@5.45.1
  - @memberjunction/ai-vectors-qdrant@5.45.1
  - @memberjunction/ai-vectors-sqlserver@5.45.1
  - @memberjunction/ai-vectors-pgvector@5.45.1
  - @memberjunction/actions-apollo@5.45.1
  - @memberjunction/actions-base@5.45.1
  - @memberjunction/actions-bizapps-accounting@5.45.1
  - @memberjunction/actions-bizapps-crm@5.45.1
  - @memberjunction/actions-bizapps-formbuilders@5.45.1
  - @memberjunction/actions-bizapps-lms@5.45.1
  - @memberjunction/actions-bizapps-social@5.45.1
  - @memberjunction/actions@5.45.1
  - @memberjunction/communication-types@5.45.1
  - @memberjunction/doc-utils@5.45.1
  - @memberjunction/encryption@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/data-context-server@5.45.1
  - @memberjunction/storage@5.45.1
  - @memberjunction/record-comparison@5.45.1
  - @memberjunction/scheduling-actions@5.45.1
  - @memberjunction/scheduling-engine-base@5.45.1
  - @memberjunction/geo-core@5.45.1

## 5.45.0

### Minor Changes

- b2927f1: Omnibus fixes: (1) skill-granted sub-agent execution — resolveSubAgentByName now resolves from the same runtime-effective set the prompt offers and validation approves (skill activations / subAgentChanges), the resolved entity threads into child dispatch, and execution-time not-found retries are bounded by the shared validation-retry cap with a self-correcting available-sub-agents message (fixes an infinite delegation loop observed live on Research Agent → Infographic Agent); (2) RunView dedup/linger cache write-invalidation on entity events (@memberjunction/core); (3) regenerated class-registration manifests.

### Patch Changes

- 21e33fe: Move Skip to a client-side Open App and remove server-embedded agent; scope-gate query/view/search resolvers with API-key scope authorization; add credential-store fallback for component registry keys; support Open App in-process lifecycle hooks with interactive prompts.
- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [19ec4b0]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
- Updated dependencies [d461df0]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities-server@5.45.0
  - @memberjunction/ai-agents@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/ai-engine-base@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/scheduling-engine@5.45.0
  - @memberjunction/scheduling-engine-base@5.45.0
  - @memberjunction/ai-agent-manager@5.45.0
  - @memberjunction/ai-form-builder@5.45.0
  - @memberjunction/tag-engine-base@5.45.0
  - @memberjunction/predictive-studio@5.45.0
  - @memberjunction/ai-prompts@5.45.0
  - @memberjunction/ai-recommendations-rex@5.45.0
  - @memberjunction/ai-reranker@5.45.0
  - @memberjunction/ai-vector-dupe@5.45.0
  - @memberjunction/ai-vectors-memory@5.45.0
  - @memberjunction/ai-vectors-pinecone@5.45.0
  - @memberjunction/ai-vectors-qdrant@5.45.0
  - @memberjunction/ai-vectors-sqlserver@5.45.0
  - @memberjunction/ai-vectors-pgvector@5.45.0
  - @memberjunction/actions-apollo@5.45.0
  - @memberjunction/actions-base@5.45.0
  - @memberjunction/actions-bizapps-accounting@5.45.0
  - @memberjunction/actions-bizapps-crm@5.45.0
  - @memberjunction/actions-bizapps-formbuilders@5.45.0
  - @memberjunction/actions-bizapps-lms@5.45.0
  - @memberjunction/actions-bizapps-social@5.45.0
  - @memberjunction/core-actions@5.45.0
  - @memberjunction/actions@5.45.0
  - @memberjunction/communication-types@5.45.0
  - @memberjunction/content-autotagging@5.45.0
  - @memberjunction/doc-utils@5.45.0
  - @memberjunction/encryption@5.45.0
  - @memberjunction/data-context-server@5.45.0
  - @memberjunction/queue@5.45.0
  - @memberjunction/storage@5.45.0
  - @memberjunction/react-linter@5.45.0
  - @memberjunction/record-comparison@5.45.0
  - @memberjunction/record-set-processor@5.45.0
  - @memberjunction/scheduling-actions@5.45.0
  - @memberjunction/search-engine@5.45.0
  - @memberjunction/templates@5.45.0
  - @memberjunction/testing-engine@5.45.0
  - @memberjunction/geo-core@5.45.0
  - @memberjunction/ai-anthropic@5.45.0
  - @memberjunction/ai-assemblyai@5.45.0
  - @memberjunction/ai-azure@5.45.0
  - @memberjunction/ai-bedrock@5.45.0
  - @memberjunction/ai-betty-bot@5.45.0
  - @memberjunction/ai-blackforestlabs@5.45.0
  - @memberjunction/ai-cerebras@5.45.0
  - @memberjunction/ai-cohere@5.45.0
  - @memberjunction/ai-elevenlabs@5.45.0
  - @memberjunction/ai-fireworks@5.45.0
  - @memberjunction/ai-gemini@5.45.0
  - @memberjunction/ai-groq@5.45.0
  - @memberjunction/ai-heygen@5.45.0
  - @memberjunction/ai-inception@5.45.0
  - @memberjunction/ai-inworld@5.45.0
  - @memberjunction/ai-lmstudio@5.45.0
  - @memberjunction/ai-llamacpp@5.45.0
  - @memberjunction/ai-local-embeddings@5.45.0
  - @memberjunction/ai-minimax@5.45.0
  - @memberjunction/ai-mistral@5.45.0
  - @memberjunction/ai-ollama@5.45.0
  - @memberjunction/ai-openai@5.45.0
  - @memberjunction/ai-openrouter@5.45.0
  - @memberjunction/ai-vertex@5.45.0
  - @memberjunction/ai-zhipu@5.45.0
  - @memberjunction/ai-xai@5.45.0
  - @memberjunction/ai-provider-bundle@5.45.0

## 5.44.0

### Patch Changes

- 89ea055: feat(ai): SupportsBatchEmbeddings + safe default EmbedTexts on BaseEmbeddings; rename GeminiEmbedding2 → GeminiEmbedding

  `BaseEmbeddings.EmbedTexts` is now a concrete dispatcher on a new `SupportsBatchEmbeddings` getter (default `false`): providers with a native batch endpoint return `true` and implement `embedBatch()`; everyone else inherits a safe per-text fallback (`embedPerText` — bounded concurrency, per-text retry-with-backoff, a hard 1:1 count guard, and a graceful empty-on-failure contract) that can never silently collapse a batch into fewer/blended vectors. A provider that claims batch support but doesn't implement `embedBatch()` throws, keeping the flag and the implementation honest.

  Per-text embedding on the fallback path (and in Gemini's own `EmbedTexts`) now retries transient failures with bounded exponential backoff before giving up, so one transient 429/500 among N texts no longer degrades the whole batch — addressing the failure-rate-scales-with-N concern from review.

  The OpenAI, Azure, Cohere, and Mistral embedding providers declare `SupportsBatchEmbeddings = true` and move their array call into `embedBatch()`. This generalizes the `GeminiEmbedding2` batch-collapse fix to the whole embedding layer and prevents the class of bug for any future provider that only implements single-text `EmbedText`.

  Also renames the `GeminiEmbedding2` class (and its `@RegisterClass` key / `DriverClass`) to `GeminiEmbedding` — the class outlives any single model version. The `DriverClass` change is carried by the AI-models metadata (`metadata/ai-models/.ai-models.json`) and the regenerated class-registration manifests in the bootstrap packages; no hand-written migration.

- Updated dependencies [eb38a42]
- Updated dependencies [3633fbb]
- Updated dependencies [d88568e]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [91842c3]
- Updated dependencies [89ea055]
- Updated dependencies [7279819]
- Updated dependencies [a7c1f2f]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [18b5bf0]
- Updated dependencies [04f7863]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/ai-agents@5.44.0
  - @memberjunction/ai-engine-base@5.44.0
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core-entities-server@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/ai-openai@5.44.0
  - @memberjunction/ai-azure@5.44.0
  - @memberjunction/ai-cohere@5.44.0
  - @memberjunction/ai-mistral@5.44.0
  - @memberjunction/ai-gemini@5.44.0
  - @memberjunction/ai-vector-dupe@5.44.0
  - @memberjunction/ai-vectors-memory@5.44.0
  - @memberjunction/record-comparison@5.44.0
  - @memberjunction/predictive-studio@5.44.0
  - @memberjunction/storage@5.44.0
  - @memberjunction/ai-agent-manager@5.44.0
  - @memberjunction/ai-form-builder@5.44.0
  - @memberjunction/core-actions@5.44.0
  - @memberjunction/record-set-processor@5.44.0
  - @memberjunction/scheduling-engine@5.44.0
  - @memberjunction/testing-engine@5.44.0
  - @memberjunction/ai-prompts@5.44.0
  - @memberjunction/ai-reranker@5.44.0
  - @memberjunction/content-autotagging@5.44.0
  - @memberjunction/templates@5.44.0
  - @memberjunction/ai-vectors-pinecone@5.44.0
  - @memberjunction/queue@5.44.0
  - @memberjunction/search-engine@5.44.0
  - @memberjunction/tag-engine-base@5.44.0
  - @memberjunction/ai-recommendations-rex@5.44.0
  - @memberjunction/actions-apollo@5.44.0
  - @memberjunction/actions-base@5.44.0
  - @memberjunction/actions-bizapps-accounting@5.44.0
  - @memberjunction/actions-bizapps-crm@5.44.0
  - @memberjunction/actions-bizapps-formbuilders@5.44.0
  - @memberjunction/actions-bizapps-lms@5.44.0
  - @memberjunction/actions-bizapps-social@5.44.0
  - @memberjunction/actions@5.44.0
  - @memberjunction/communication-types@5.44.0
  - @memberjunction/doc-utils@5.44.0
  - @memberjunction/encryption@5.44.0
  - @memberjunction/react-linter@5.44.0
  - @memberjunction/scheduling-actions@5.44.0
  - @memberjunction/scheduling-engine-base@5.44.0
  - @memberjunction/geo-core@5.44.0
  - @memberjunction/ai-vectors-qdrant@5.44.0
  - @memberjunction/ai-vectors-sqlserver@5.44.0
  - @memberjunction/ai-vectors-pgvector@5.44.0
  - @memberjunction/data-context-server@5.44.0
  - @memberjunction/ai-anthropic@5.44.0
  - @memberjunction/ai-assemblyai@5.44.0
  - @memberjunction/ai-bedrock@5.44.0
  - @memberjunction/ai-betty-bot@5.44.0
  - @memberjunction/ai-blackforestlabs@5.44.0
  - @memberjunction/ai-cerebras@5.44.0
  - @memberjunction/ai-elevenlabs@5.44.0
  - @memberjunction/ai-fireworks@5.44.0
  - @memberjunction/ai-groq@5.44.0
  - @memberjunction/ai-heygen@5.44.0
  - @memberjunction/ai-inception@5.44.0
  - @memberjunction/ai-inworld@5.44.0
  - @memberjunction/ai-lmstudio@5.44.0
  - @memberjunction/ai-llamacpp@5.44.0
  - @memberjunction/ai-local-embeddings@5.44.0
  - @memberjunction/ai-minimax@5.44.0
  - @memberjunction/ai-ollama@5.44.0
  - @memberjunction/ai-openrouter@5.44.0
  - @memberjunction/ai-vertex@5.44.0
  - @memberjunction/ai-zhipu@5.44.0
  - @memberjunction/ai-xai@5.44.0
  - @memberjunction/ai-provider-bundle@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [aa21fef]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [a975e3d]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/ai-agents@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/actions@5.43.0
  - @memberjunction/record-set-processor@5.43.0
  - @memberjunction/ai-prompts@5.43.0
  - @memberjunction/ai-gemini@5.43.0
  - @memberjunction/ai-openai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/react-linter@5.43.0
  - @memberjunction/ai-agent-manager@5.43.0
  - @memberjunction/ai-engine-base@5.43.0
  - @memberjunction/ai-form-builder@5.43.0
  - @memberjunction/tag-engine-base@5.43.0
  - @memberjunction/ai-recommendations-rex@5.43.0
  - @memberjunction/ai-reranker@5.43.0
  - @memberjunction/ai-vectors-memory@5.43.0
  - @memberjunction/ai-vectors-pinecone@5.43.0
  - @memberjunction/ai-vectors-qdrant@5.43.0
  - @memberjunction/ai-vectors-sqlserver@5.43.0
  - @memberjunction/ai-vectors-pgvector@5.43.0
  - @memberjunction/actions-apollo@5.43.0
  - @memberjunction/actions-base@5.43.0
  - @memberjunction/actions-bizapps-accounting@5.43.0
  - @memberjunction/actions-bizapps-crm@5.43.0
  - @memberjunction/actions-bizapps-formbuilders@5.43.0
  - @memberjunction/actions-bizapps-lms@5.43.0
  - @memberjunction/actions-bizapps-social@5.43.0
  - @memberjunction/core-actions@5.43.0
  - @memberjunction/communication-types@5.43.0
  - @memberjunction/content-autotagging@5.43.0
  - @memberjunction/doc-utils@5.43.0
  - @memberjunction/encryption@5.43.0
  - @memberjunction/core-entities-server@5.43.0
  - @memberjunction/data-context-server@5.43.0
  - @memberjunction/queue@5.43.0
  - @memberjunction/storage@5.43.0
  - @memberjunction/scheduling-actions@5.43.0
  - @memberjunction/scheduling-engine-base@5.43.0
  - @memberjunction/scheduling-engine@5.43.0
  - @memberjunction/search-engine@5.43.0
  - @memberjunction/templates@5.43.0
  - @memberjunction/testing-engine@5.43.0
  - @memberjunction/geo-core@5.43.0
  - @memberjunction/ai-anthropic@5.43.0
  - @memberjunction/ai-assemblyai@5.43.0
  - @memberjunction/ai-azure@5.43.0
  - @memberjunction/ai-bedrock@5.43.0
  - @memberjunction/ai-betty-bot@5.43.0
  - @memberjunction/ai-blackforestlabs@5.43.0
  - @memberjunction/ai-cerebras@5.43.0
  - @memberjunction/ai-cohere@5.43.0
  - @memberjunction/ai-elevenlabs@5.43.0
  - @memberjunction/ai-fireworks@5.43.0
  - @memberjunction/ai-groq@5.43.0
  - @memberjunction/ai-heygen@5.43.0
  - @memberjunction/ai-inception@5.43.0
  - @memberjunction/ai-inworld@5.43.0
  - @memberjunction/ai-lmstudio@5.43.0
  - @memberjunction/ai-llamacpp@5.43.0
  - @memberjunction/ai-local-embeddings@5.43.0
  - @memberjunction/ai-minimax@5.43.0
  - @memberjunction/ai-mistral@5.43.0
  - @memberjunction/ai-ollama@5.43.0
  - @memberjunction/ai-openrouter@5.43.0
  - @memberjunction/ai-vertex@5.43.0
  - @memberjunction/ai-zhipu@5.43.0
  - @memberjunction/ai-xai@5.43.0
  - @memberjunction/ai-provider-bundle@5.43.0

## 5.42.0

### Minor Changes

- 9b9b484: Field active-status enforcement relocation, plus the "Meet" app rename, quieter operational logging, and a telemetry suppression refinement.

  **Field active-status enforcement (`@memberjunction/core`, `@memberjunction/generic-database-provider`)**
  - Deprecated-field warnings and disabled-field exceptions are now enforced at the field-access boundary genuine code flows through — `BaseEntity.Get()`, `Set()`, and `SetMany()` (what the generated strongly-typed accessors call) — instead of on the low-level `EntityField.Value` accessor. This flips a leaky blocklist (assert on every `.Value` touch, then suppress at each internal call site) into a precise allowlist, and fixes false deprecation warnings emitted on every load/save of a record that merely _contains_ a deprecated column (e.g. `"MJ: AI Agent Runs".AgentState`) even when no code uses it.
  - New memoized `EntityInfo.HasInactiveFields` fast-path gate: entities whose fields are all `Active` (the vast majority) pay only a single cached boolean check in the hot read/write paths.
  - `EntityField.ActiveStatusAssertions` is retained as a `@deprecated` no-op for backward compatibility; the six now-redundant internal suppression toggles were removed. Warning caller strings are now accurate (`BaseEntity.Get`/`Set`) instead of the misleading `"EntityField.Value setter"`.

  **Telemetry (`@memberjunction/core`)**
  - Suppress "load this into a dedicated engine cache" telemetry suggestions for entities that have explicitly opted out of caching (`EntityInfo.AllowCaching = false`), reusing the existing flag as the single source of truth.

  **Quieter operational logging (`@memberjunction/scheduling-engine`, `@memberjunction/ai-agents`, `@memberjunction/server`, `@memberjunction/server-bootstrap`, `@memberjunction/server-bootstrap-lite`)**
  - Scheduled-job no-op runs (e.g. the Agent Memory Manager finding no new activity) now collapse to the engine's `Starting`/`Completed` heartbeat; the per-agent and memory-manager internal traces are verbose-only.
  - Cleaner server startup logging: transient boot spinner, true total timing, less redundant output, and the `CustomColumnPromoter` registration log demoted to verbose-only.

  **"Meet" app + local LiveKit dev (`@memberjunction/ng-explorer-core`, `@memberjunction/livekit-room-server`, `@memberjunction/auth-providers`, `@memberjunction/server`)**
  - Renamed the Realtime app to "Meet", with the Live Room now defaulting to the Realtime co-agent instead of starting with no agent, plus a local LiveKit dev server and supporting docs.

### Patch Changes

- Updated dependencies [256ab06]
- Updated dependencies [c871a4d]
- Updated dependencies [9b9b484]
- Updated dependencies [d185a5c]
- Updated dependencies [e7c2437]
- Updated dependencies [37c73f6]
- Updated dependencies [0c6bf61]
- Updated dependencies [78f834d]
- Updated dependencies [4ec1732]
- Updated dependencies [008f449]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/ai-agents@5.42.0
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/ai-prompts@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/scheduling-engine@5.42.0
  - @memberjunction/actions@5.42.0
  - @memberjunction/communication-types@5.42.0
  - @memberjunction/templates@5.42.0
  - @memberjunction/core-actions@5.42.0
  - @memberjunction/ai-agent-manager@5.42.0
  - @memberjunction/ai-vectors-memory@5.42.0
  - @memberjunction/actions-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/record-set-processor@5.42.0
  - @memberjunction/core-entities-server@5.42.0
  - @memberjunction/ai-form-builder@5.42.0
  - @memberjunction/testing-engine@5.42.0
  - @memberjunction/ai-engine-base@5.42.0
  - @memberjunction/ai-reranker@5.42.0
  - @memberjunction/content-autotagging@5.42.0
  - @memberjunction/tag-engine-base@5.42.0
  - @memberjunction/ai-recommendations-rex@5.42.0
  - @memberjunction/ai-vectors-pinecone@5.42.0
  - @memberjunction/ai-vectors-qdrant@5.42.0
  - @memberjunction/ai-vectors-sqlserver@5.42.0
  - @memberjunction/ai-vectors-pgvector@5.42.0
  - @memberjunction/actions-apollo@5.42.0
  - @memberjunction/actions-bizapps-accounting@5.42.0
  - @memberjunction/actions-bizapps-crm@5.42.0
  - @memberjunction/actions-bizapps-formbuilders@5.42.0
  - @memberjunction/actions-bizapps-lms@5.42.0
  - @memberjunction/actions-bizapps-social@5.42.0
  - @memberjunction/doc-utils@5.42.0
  - @memberjunction/encryption@5.42.0
  - @memberjunction/data-context-server@5.42.0
  - @memberjunction/queue@5.42.0
  - @memberjunction/storage@5.42.0
  - @memberjunction/react-linter@5.42.0
  - @memberjunction/scheduling-actions@5.42.0
  - @memberjunction/scheduling-engine-base@5.42.0
  - @memberjunction/search-engine@5.42.0
  - @memberjunction/geo-core@5.42.0
  - @memberjunction/ai-anthropic@5.42.0
  - @memberjunction/ai-assemblyai@5.42.0
  - @memberjunction/ai-azure@5.42.0
  - @memberjunction/ai-bedrock@5.42.0
  - @memberjunction/ai-betty-bot@5.42.0
  - @memberjunction/ai-blackforestlabs@5.42.0
  - @memberjunction/ai-cerebras@5.42.0
  - @memberjunction/ai-cohere@5.42.0
  - @memberjunction/ai-elevenlabs@5.42.0
  - @memberjunction/ai-fireworks@5.42.0
  - @memberjunction/ai-gemini@5.42.0
  - @memberjunction/ai-groq@5.42.0
  - @memberjunction/ai-heygen@5.42.0
  - @memberjunction/ai-inception@5.42.0
  - @memberjunction/ai-inworld@5.42.0
  - @memberjunction/ai-lmstudio@5.42.0
  - @memberjunction/ai-llamacpp@5.42.0
  - @memberjunction/ai-local-embeddings@5.42.0
  - @memberjunction/ai-minimax@5.42.0
  - @memberjunction/ai-mistral@5.42.0
  - @memberjunction/ai-ollama@5.42.0
  - @memberjunction/ai-openai@5.42.0
  - @memberjunction/ai-openrouter@5.42.0
  - @memberjunction/ai-vertex@5.42.0
  - @memberjunction/ai-zhipu@5.42.0
  - @memberjunction/ai-xai@5.42.0
  - @memberjunction/ai-provider-bundle@5.42.0

## 5.41.0

### Minor Changes

- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).
- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

### Patch Changes

- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- Updated dependencies [8fd6f59]
- Updated dependencies [6f227ab]
- Updated dependencies [1e81848]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
- Updated dependencies [4b3fb9d]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/core-entities-server@5.41.0
  - @memberjunction/ai-agents@5.41.0
  - @memberjunction/ai-xai@5.41.0
  - @memberjunction/scheduling-engine@5.41.0
  - @memberjunction/ai-gemini@5.41.0
  - @memberjunction/ai-cohere@5.41.0
  - @memberjunction/ai-vertex@5.41.0
  - @memberjunction/ai-engine-base@5.41.0
  - @memberjunction/ai-elevenlabs@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/ai-openai@5.41.0
  - @memberjunction/ai-assemblyai@5.41.0
  - @memberjunction/core-actions@5.41.0
  - @memberjunction/ai-inworld@5.41.0
  - @memberjunction/ai-provider-bundle@5.41.0
  - @memberjunction/ai-agent-manager@5.41.0
  - @memberjunction/ai-form-builder@5.41.0
  - @memberjunction/tag-engine-base@5.41.0
  - @memberjunction/ai-recommendations-rex@5.41.0
  - @memberjunction/ai-reranker@5.41.0
  - @memberjunction/ai-vectors-memory@5.41.0
  - @memberjunction/ai-vectors-pinecone@5.41.0
  - @memberjunction/ai-vectors-qdrant@5.41.0
  - @memberjunction/ai-vectors-sqlserver@5.41.0
  - @memberjunction/ai-vectors-pgvector@5.41.0
  - @memberjunction/actions-apollo@5.41.0
  - @memberjunction/actions-base@5.41.0
  - @memberjunction/actions-bizapps-accounting@5.41.0
  - @memberjunction/actions-bizapps-crm@5.41.0
  - @memberjunction/actions-bizapps-formbuilders@5.41.0
  - @memberjunction/actions-bizapps-lms@5.41.0
  - @memberjunction/actions-bizapps-social@5.41.0
  - @memberjunction/actions@5.41.0
  - @memberjunction/communication-types@5.41.0
  - @memberjunction/content-autotagging@5.41.0
  - @memberjunction/doc-utils@5.41.0
  - @memberjunction/encryption@5.41.0
  - @memberjunction/data-context-server@5.41.0
  - @memberjunction/queue@5.41.0
  - @memberjunction/storage@5.41.0
  - @memberjunction/react-linter@5.41.0
  - @memberjunction/scheduling-actions@5.41.0
  - @memberjunction/scheduling-engine-base@5.41.0
  - @memberjunction/search-engine@5.41.0
  - @memberjunction/templates@5.41.0
  - @memberjunction/testing-engine@5.41.0
  - @memberjunction/geo-core@5.41.0
  - @memberjunction/ai-anthropic@5.41.0
  - @memberjunction/ai-azure@5.41.0
  - @memberjunction/ai-bedrock@5.41.0
  - @memberjunction/ai-betty-bot@5.41.0
  - @memberjunction/ai-blackforestlabs@5.41.0
  - @memberjunction/ai-cerebras@5.41.0
  - @memberjunction/ai-fireworks@5.41.0
  - @memberjunction/ai-groq@5.41.0
  - @memberjunction/ai-heygen@5.41.0
  - @memberjunction/ai-inception@5.41.0
  - @memberjunction/ai-lmstudio@5.41.0
  - @memberjunction/ai-llamacpp@5.41.0
  - @memberjunction/ai-local-embeddings@5.41.0
  - @memberjunction/ai-minimax@5.41.0
  - @memberjunction/ai-mistral@5.41.0
  - @memberjunction/ai-ollama@5.41.0
  - @memberjunction/ai-openrouter@5.41.0
  - @memberjunction/ai-zhipu@5.41.0

## 5.40.2

### Patch Changes

- Updated dependencies [da2ee38]
  - @memberjunction/core-entities-server@5.40.2
  - @memberjunction/ai-agents@5.40.2
  - @memberjunction/core-actions@5.40.2
  - @memberjunction/ai-agent-manager@5.40.2
  - @memberjunction/ai-form-builder@5.40.2
  - @memberjunction/scheduling-engine@5.40.2
  - @memberjunction/testing-engine@5.40.2
  - @memberjunction/ai-engine-base@5.40.2
  - @memberjunction/ai-core-plus@5.40.2
  - @memberjunction/tag-engine-base@5.40.2
  - @memberjunction/ai-anthropic@5.40.2
  - @memberjunction/ai-azure@5.40.2
  - @memberjunction/ai-bedrock@5.40.2
  - @memberjunction/ai-betty-bot@5.40.2
  - @memberjunction/ai-blackforestlabs@5.40.2
  - @memberjunction/ai-provider-bundle@5.40.2
  - @memberjunction/ai-cerebras@5.40.2
  - @memberjunction/ai-cohere@5.40.2
  - @memberjunction/ai-elevenlabs@5.40.2
  - @memberjunction/ai-fireworks@5.40.2
  - @memberjunction/ai-gemini@5.40.2
  - @memberjunction/ai-groq@5.40.2
  - @memberjunction/ai-heygen@5.40.2
  - @memberjunction/ai-inception@5.40.2
  - @memberjunction/ai-lmstudio@5.40.2
  - @memberjunction/ai-llamacpp@5.40.2
  - @memberjunction/ai-local-embeddings@5.40.2
  - @memberjunction/ai-minimax@5.40.2
  - @memberjunction/ai-mistral@5.40.2
  - @memberjunction/ai-ollama@5.40.2
  - @memberjunction/ai-openai@5.40.2
  - @memberjunction/ai-openrouter@5.40.2
  - @memberjunction/ai-recommendations-rex@5.40.2
  - @memberjunction/ai-vertex@5.40.2
  - @memberjunction/ai-zhipu@5.40.2
  - @memberjunction/ai-xai@5.40.2
  - @memberjunction/ai-reranker@5.40.2
  - @memberjunction/ai-vectors-memory@5.40.2
  - @memberjunction/ai-vectors-pinecone@5.40.2
  - @memberjunction/ai-vectors-qdrant@5.40.2
  - @memberjunction/ai-vectors-sqlserver@5.40.2
  - @memberjunction/ai-vectors-pgvector@5.40.2
  - @memberjunction/actions-apollo@5.40.2
  - @memberjunction/actions-base@5.40.2
  - @memberjunction/actions-bizapps-accounting@5.40.2
  - @memberjunction/actions-bizapps-crm@5.40.2
  - @memberjunction/actions-bizapps-formbuilders@5.40.2
  - @memberjunction/actions-bizapps-lms@5.40.2
  - @memberjunction/actions-bizapps-social@5.40.2
  - @memberjunction/actions@5.40.2
  - @memberjunction/communication-types@5.40.2
  - @memberjunction/content-autotagging@5.40.2
  - @memberjunction/doc-utils@5.40.2
  - @memberjunction/encryption@5.40.2
  - @memberjunction/core@5.40.2
  - @memberjunction/core-entities@5.40.2
  - @memberjunction/data-context-server@5.40.2
  - @memberjunction/queue@5.40.2
  - @memberjunction/storage@5.40.2
  - @memberjunction/react-linter@5.40.2
  - @memberjunction/scheduling-actions@5.40.2
  - @memberjunction/scheduling-engine-base@5.40.2
  - @memberjunction/search-engine@5.40.2
  - @memberjunction/templates@5.40.2
  - @memberjunction/geo-core@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-agent-manager@5.40.1
  - @memberjunction/ai-agents@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/ai-form-builder@5.40.1
  - @memberjunction/tag-engine-base@5.40.1
  - @memberjunction/ai-recommendations-rex@5.40.1
  - @memberjunction/ai-reranker@5.40.1
  - @memberjunction/ai-vectors-memory@5.40.1
  - @memberjunction/ai-vectors-pinecone@5.40.1
  - @memberjunction/ai-vectors-qdrant@5.40.1
  - @memberjunction/ai-vectors-sqlserver@5.40.1
  - @memberjunction/ai-vectors-pgvector@5.40.1
  - @memberjunction/actions-apollo@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/actions-bizapps-accounting@5.40.1
  - @memberjunction/actions-bizapps-crm@5.40.1
  - @memberjunction/actions-bizapps-formbuilders@5.40.1
  - @memberjunction/actions-bizapps-lms@5.40.1
  - @memberjunction/actions-bizapps-social@5.40.1
  - @memberjunction/core-actions@5.40.1
  - @memberjunction/actions@5.40.1
  - @memberjunction/communication-types@5.40.1
  - @memberjunction/content-autotagging@5.40.1
  - @memberjunction/doc-utils@5.40.1
  - @memberjunction/encryption@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/core-entities-server@5.40.1
  - @memberjunction/data-context-server@5.40.1
  - @memberjunction/queue@5.40.1
  - @memberjunction/storage@5.40.1
  - @memberjunction/react-linter@5.40.1
  - @memberjunction/scheduling-actions@5.40.1
  - @memberjunction/scheduling-engine-base@5.40.1
  - @memberjunction/scheduling-engine@5.40.1
  - @memberjunction/search-engine@5.40.1
  - @memberjunction/templates@5.40.1
  - @memberjunction/testing-engine@5.40.1
  - @memberjunction/geo-core@5.40.1
  - @memberjunction/ai-provider-bundle@5.40.1
  - @memberjunction/ai-anthropic@5.40.1
  - @memberjunction/ai-azure@5.40.1
  - @memberjunction/ai-bedrock@5.40.1
  - @memberjunction/ai-betty-bot@5.40.1
  - @memberjunction/ai-blackforestlabs@5.40.1
  - @memberjunction/ai-cerebras@5.40.1
  - @memberjunction/ai-cohere@5.40.1
  - @memberjunction/ai-elevenlabs@5.40.1
  - @memberjunction/ai-fireworks@5.40.1
  - @memberjunction/ai-gemini@5.40.1
  - @memberjunction/ai-groq@5.40.1
  - @memberjunction/ai-heygen@5.40.1
  - @memberjunction/ai-inception@5.40.1
  - @memberjunction/ai-lmstudio@5.40.1
  - @memberjunction/ai-llamacpp@5.40.1
  - @memberjunction/ai-local-embeddings@5.40.1
  - @memberjunction/ai-minimax@5.40.1
  - @memberjunction/ai-mistral@5.40.1
  - @memberjunction/ai-ollama@5.40.1
  - @memberjunction/ai-openai@5.40.1
  - @memberjunction/ai-openrouter@5.40.1
  - @memberjunction/ai-vertex@5.40.1
  - @memberjunction/ai-zhipu@5.40.1
  - @memberjunction/ai-xai@5.40.1

## 5.40.0

### Minor Changes

- 253a188: Knowledge Hub Classify redesign
  - **Clustering**: new `@memberjunction/clustering-engine` (framework-agnostic fetch → cluster → reduce → LLM-name pipeline), a "Run Cluster Analysis" action, a `RunClusterAnalysis` GraphQL resolver, a `GraphQLClusterClient` transport, and the Angular `ClusteringService` thinned to delegate to the server.
  - **View-type plug-in architecture (entity viewer)**: `ViewType` registry + `ViewTypeEngine` + `IViewTypeDescriptor`/`IViewRenderer`/`IViewPropSheet` contracts in `ng-entity-viewer`, with Grid/Cards/Timeline/Map descriptors. The host now **dynamic-mounts** any registered plug-in view type (via `ViewContainerRef`) with zero host changes, and the switcher shows the active type's icon + label, collapsing from an icon strip to a dropdown as the list grows. **Cluster view type** added in `@memberjunction/ng-clustering` (descriptor + `IViewRenderer` wrapper over the scatter + `IViewPropSheet` + an Entity-Document availability engine) — available on any entity with vectors, reusing the same `ClusteringService`. The active view type persists to `UserView.ViewTypeID` (new source of truth; backfilled from the legacy `DisplayState.defaultMode`) and per-view-type config to `UserView.DisplayState.viewTypeConfigs` (new typed `IViewTypeConfigEntry`). `ViewType.Icon` is now `ExtendedType='Icon'` for the admin icon picker. See `packages/Angular/Generic/entity-viewer/VIEW_TYPE_PLUGINS.md`.
  - **Classify UX**: per-tab scroll fix, Refresh buttons, meaningful content-item display names, loading states, `BaseEntityEvent` reactivity, and load-more pagination.
  - **Audit & analytics**: direct tag→prompt-run lineage (`AIPromptRunID` + `Reasoning` on Content Item Tags), `ClassifyAnalyticsEngine`, reusable item grid + drilldown, and an Overview analytics section.
  - **Setup & onboarding**: contextual prompt injection (org/content-type/source aggregation), `generateSeedTaxonomy` (clustering-backed) + resolver, source-form domain-context UI, org-context editor, inline Entity Document creation, seed-taxonomy review, and a guided setup wizard.
  - **Visualize surface**: Knowledge Hub "Clusters" tab generalized to a "Visualize" host with Clusters / Tag Cloud modes, a `TagCloudEngine`, and a shared record drilldown.
  - **Foundations**: `ApplicationSettingEngine` (global + app-scoped settings), and the `tag-engine` → `tag-engine-base` split so browser code no longer pulls server-only AI dependencies.
  - **Fix**: stop server-only packages (`templates` → `aiengine`/`ai-provider-bundle`, storage, vector-DB and LLM provider SDKs) from leaking into the browser class-registration manifest, which previously broke the MJExplorer cold build. Added CLAUDE.md guardrails to the Bootstrap and BootstrapLite packages.

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [f2cca15]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
- Updated dependencies [6ea4de7]
- Updated dependencies [54c9526]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ai-agents@5.40.0
  - @memberjunction/content-autotagging@5.40.0
  - @memberjunction/core-actions@5.40.0
  - @memberjunction/tag-engine-base@5.40.0
  - @memberjunction/scheduling-engine@5.40.0
  - @memberjunction/ai-agent-manager@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/ai-form-builder@5.40.0
  - @memberjunction/ai-recommendations-rex@5.40.0
  - @memberjunction/ai-reranker@5.40.0
  - @memberjunction/ai-vectors-memory@5.40.0
  - @memberjunction/ai-vectors-pinecone@5.40.0
  - @memberjunction/ai-vectors-qdrant@5.40.0
  - @memberjunction/ai-vectors-sqlserver@5.40.0
  - @memberjunction/ai-vectors-pgvector@5.40.0
  - @memberjunction/actions-apollo@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/actions-bizapps-accounting@5.40.0
  - @memberjunction/actions-bizapps-crm@5.40.0
  - @memberjunction/actions-bizapps-formbuilders@5.40.0
  - @memberjunction/actions-bizapps-lms@5.40.0
  - @memberjunction/actions-bizapps-social@5.40.0
  - @memberjunction/actions@5.40.0
  - @memberjunction/communication-types@5.40.0
  - @memberjunction/doc-utils@5.40.0
  - @memberjunction/encryption@5.40.0
  - @memberjunction/core-entities-server@5.40.0
  - @memberjunction/data-context-server@5.40.0
  - @memberjunction/queue@5.40.0
  - @memberjunction/storage@5.40.0
  - @memberjunction/react-linter@5.40.0
  - @memberjunction/scheduling-actions@5.40.0
  - @memberjunction/scheduling-engine-base@5.40.0
  - @memberjunction/search-engine@5.40.0
  - @memberjunction/templates@5.40.0
  - @memberjunction/testing-engine@5.40.0
  - @memberjunction/geo-core@5.40.0
  - @memberjunction/ai-provider-bundle@5.40.0
  - @memberjunction/ai-anthropic@5.40.0
  - @memberjunction/ai-azure@5.40.0
  - @memberjunction/ai-bedrock@5.40.0
  - @memberjunction/ai-betty-bot@5.40.0
  - @memberjunction/ai-blackforestlabs@5.40.0
  - @memberjunction/ai-cerebras@5.40.0
  - @memberjunction/ai-cohere@5.40.0
  - @memberjunction/ai-elevenlabs@5.40.0
  - @memberjunction/ai-fireworks@5.40.0
  - @memberjunction/ai-gemini@5.40.0
  - @memberjunction/ai-groq@5.40.0
  - @memberjunction/ai-heygen@5.40.0
  - @memberjunction/ai-inception@5.40.0
  - @memberjunction/ai-lmstudio@5.40.0
  - @memberjunction/ai-llamacpp@5.40.0
  - @memberjunction/ai-local-embeddings@5.40.0
  - @memberjunction/ai-minimax@5.40.0
  - @memberjunction/ai-mistral@5.40.0
  - @memberjunction/ai-ollama@5.40.0
  - @memberjunction/ai-openai@5.40.0
  - @memberjunction/ai-openrouter@5.40.0
  - @memberjunction/ai-vertex@5.40.0
  - @memberjunction/ai-zhipu@5.40.0
  - @memberjunction/ai-xai@5.40.0

## 5.39.0

### Patch Changes

- 7dfacc7: Add support for storing and querying embeddings inside the application's own database instead of a separate vector service. `VectorDBBase` gains an `IColocatedVectorHost` adapter (implemented by the PostgreSQL and SQL Server data providers) and a `ColocatedQuery` API; the new `PgVectorColocated` provider does vector + keyword (RRF) search in one statement, and the new `@memberjunction/ai-vectors-sqlserver` package adds a SQL Server 2025 native `VECTOR` provider with sibling-table and entity-column storage modes. `VectorSearchProvider` and `EntityVectorSyncer` route these indexes through the borrowed connection.
- Updated dependencies [26761b8]
- Updated dependencies [3d4510c]
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [0bef51b]
- Updated dependencies [3c53858]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [8c39dd9]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [a2aecc7]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [315ff4d]
- Updated dependencies [a101a34]
  - @memberjunction/actions@5.39.0
  - @memberjunction/ai-agents@5.39.0
  - @memberjunction/scheduling-engine@5.39.0
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-vectors-pgvector@5.39.0
  - @memberjunction/ai-vectors-sqlserver@5.39.0
  - @memberjunction/search-engine@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/core-actions@5.39.0
  - @memberjunction/core-entities-server@5.39.0
  - @memberjunction/ai-gemini@5.39.0
  - @memberjunction/ai-anthropic@5.39.0
  - @memberjunction/ai-azure@5.39.0
  - @memberjunction/ai-bedrock@5.39.0
  - @memberjunction/ai-cerebras@5.39.0
  - @memberjunction/ai-fireworks@5.39.0
  - @memberjunction/ai-groq@5.39.0
  - @memberjunction/ai-openai@5.39.0
  - @memberjunction/ai-engine-base@5.39.0
  - @memberjunction/ai-openrouter@5.39.0
  - @memberjunction/react-linter@5.39.0
  - @memberjunction/ai-form-builder@5.39.0
  - @memberjunction/actions-apollo@5.39.0
  - @memberjunction/actions-bizapps-accounting@5.39.0
  - @memberjunction/actions-bizapps-crm@5.39.0
  - @memberjunction/actions-bizapps-formbuilders@5.39.0
  - @memberjunction/actions-bizapps-lms@5.39.0
  - @memberjunction/actions-bizapps-social@5.39.0
  - @memberjunction/scheduling-actions@5.39.0
  - @memberjunction/ai-agent-manager@5.39.0
  - @memberjunction/testing-engine@5.39.0
  - @memberjunction/tag-engine-base@5.39.0
  - @memberjunction/ai-recommendations-rex@5.39.0
  - @memberjunction/ai-reranker@5.39.0
  - @memberjunction/ai-vectors-memory@5.39.0
  - @memberjunction/ai-vectors-pinecone@5.39.0
  - @memberjunction/ai-vectors-qdrant@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/communication-types@5.39.0
  - @memberjunction/content-autotagging@5.39.0
  - @memberjunction/doc-utils@5.39.0
  - @memberjunction/encryption@5.39.0
  - @memberjunction/data-context-server@5.39.0
  - @memberjunction/queue@5.39.0
  - @memberjunction/storage@5.39.0
  - @memberjunction/scheduling-engine-base@5.39.0
  - @memberjunction/templates@5.39.0
  - @memberjunction/geo-core@5.39.0
  - @memberjunction/ai-provider-bundle@5.39.0
  - @memberjunction/ai-vertex@5.39.0
  - @memberjunction/ai-betty-bot@5.39.0
  - @memberjunction/ai-blackforestlabs@5.39.0
  - @memberjunction/ai-cohere@5.39.0
  - @memberjunction/ai-elevenlabs@5.39.0
  - @memberjunction/ai-heygen@5.39.0
  - @memberjunction/ai-inception@5.39.0
  - @memberjunction/ai-lmstudio@5.39.0
  - @memberjunction/ai-llamacpp@5.39.0
  - @memberjunction/ai-local-embeddings@5.39.0
  - @memberjunction/ai-minimax@5.39.0
  - @memberjunction/ai-mistral@5.39.0
  - @memberjunction/ai-ollama@5.39.0
  - @memberjunction/ai-zhipu@5.39.0
  - @memberjunction/ai-xai@5.39.0

## 5.38.0

### Patch Changes

- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [6b6c321]
- Updated dependencies [67d6562]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [b2ad244]
- Updated dependencies [275afda]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [b2e6782]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [48dc77a]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-agents@5.38.0
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/testing-engine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/content-autotagging@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/search-engine@5.38.0
  - @memberjunction/core-actions@5.38.0
  - @memberjunction/core-entities-server@5.38.0
  - @memberjunction/ai-agent-manager@5.38.0
  - @memberjunction/ai-form-builder@5.38.0
  - @memberjunction/scheduling-engine@5.38.0
  - @memberjunction/ai-engine-base@5.38.0
  - @memberjunction/ai-reranker@5.38.0
  - @memberjunction/templates@5.38.0
  - @memberjunction/ai-vectors-pinecone@5.38.0
  - @memberjunction/queue@5.38.0
  - @memberjunction/tag-engine-base@5.38.0
  - @memberjunction/ai-recommendations-rex@5.38.0
  - @memberjunction/ai-vectors-memory@5.38.0
  - @memberjunction/ai-vectors-qdrant@5.38.0
  - @memberjunction/ai-vectors-pgvector@5.38.0
  - @memberjunction/actions-apollo@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/actions-bizapps-accounting@5.38.0
  - @memberjunction/actions-bizapps-crm@5.38.0
  - @memberjunction/actions-bizapps-formbuilders@5.38.0
  - @memberjunction/actions-bizapps-lms@5.38.0
  - @memberjunction/actions-bizapps-social@5.38.0
  - @memberjunction/actions@5.38.0
  - @memberjunction/communication-types@5.38.0
  - @memberjunction/doc-utils@5.38.0
  - @memberjunction/encryption@5.38.0
  - @memberjunction/data-context-server@5.38.0
  - @memberjunction/storage@5.38.0
  - @memberjunction/react-linter@5.38.0
  - @memberjunction/scheduling-actions@5.38.0
  - @memberjunction/scheduling-engine-base@5.38.0
  - @memberjunction/geo-core@5.38.0
  - @memberjunction/ai-anthropic@5.38.0
  - @memberjunction/ai-azure@5.38.0
  - @memberjunction/ai-bedrock@5.38.0
  - @memberjunction/ai-betty-bot@5.38.0
  - @memberjunction/ai-blackforestlabs@5.38.0
  - @memberjunction/ai-cerebras@5.38.0
  - @memberjunction/ai-cohere@5.38.0
  - @memberjunction/ai-elevenlabs@5.38.0
  - @memberjunction/ai-fireworks@5.38.0
  - @memberjunction/ai-gemini@5.38.0
  - @memberjunction/ai-groq@5.38.0
  - @memberjunction/ai-heygen@5.38.0
  - @memberjunction/ai-inception@5.38.0
  - @memberjunction/ai-lmstudio@5.38.0
  - @memberjunction/ai-llamacpp@5.38.0
  - @memberjunction/ai-local-embeddings@5.38.0
  - @memberjunction/ai-minimax@5.38.0
  - @memberjunction/ai-mistral@5.38.0
  - @memberjunction/ai-ollama@5.38.0
  - @memberjunction/ai-openai@5.38.0
  - @memberjunction/ai-openrouter@5.38.0
  - @memberjunction/ai-vertex@5.38.0
  - @memberjunction/ai-zhipu@5.38.0
  - @memberjunction/ai-xai@5.38.0
  - @memberjunction/ai-provider-bundle@5.38.0

## 5.37.0

### Patch Changes

- 464f30c: Refresh pre-built class registration manifests from a full repo-wide rebuild.
- Updated dependencies [e32f21f]
- Updated dependencies [22b775f]
- Updated dependencies [1af94d0]
- Updated dependencies [4f15f31]
  - @memberjunction/core-actions@5.37.0
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/actions@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ai-agent-manager@5.37.0
  - @memberjunction/ai-agents@5.37.0
  - @memberjunction/ai-engine-base@5.37.0
  - @memberjunction/ai-reranker@5.37.0
  - @memberjunction/content-autotagging@5.37.0
  - @memberjunction/core-entities-server@5.37.0
  - @memberjunction/scheduling-engine@5.37.0
  - @memberjunction/templates@5.37.0
  - @memberjunction/testing-engine@5.37.0
  - @memberjunction/actions-apollo@5.37.0
  - @memberjunction/actions-bizapps-accounting@5.37.0
  - @memberjunction/actions-bizapps-crm@5.37.0
  - @memberjunction/actions-bizapps-formbuilders@5.37.0
  - @memberjunction/actions-bizapps-lms@5.37.0
  - @memberjunction/actions-bizapps-social@5.37.0
  - @memberjunction/scheduling-actions@5.37.0
  - @memberjunction/tag-engine-base@5.37.0
  - @memberjunction/ai-recommendations-rex@5.37.0
  - @memberjunction/ai-vectors-memory@5.37.0
  - @memberjunction/ai-vectors-pinecone@5.37.0
  - @memberjunction/ai-vectors-qdrant@5.37.0
  - @memberjunction/ai-vectors-pgvector@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/communication-types@5.37.0
  - @memberjunction/doc-utils@5.37.0
  - @memberjunction/encryption@5.37.0
  - @memberjunction/data-context-server@5.37.0
  - @memberjunction/queue@5.37.0
  - @memberjunction/storage@5.37.0
  - @memberjunction/scheduling-engine-base@5.37.0
  - @memberjunction/search-engine@5.37.0
  - @memberjunction/geo-core@5.37.0
  - @memberjunction/ai-provider-bundle@5.37.0
  - @memberjunction/ai-anthropic@5.37.0
  - @memberjunction/ai-azure@5.37.0
  - @memberjunction/ai-bedrock@5.37.0
  - @memberjunction/ai-betty-bot@5.37.0
  - @memberjunction/ai-blackforestlabs@5.37.0
  - @memberjunction/ai-cerebras@5.37.0
  - @memberjunction/ai-cohere@5.37.0
  - @memberjunction/ai-elevenlabs@5.37.0
  - @memberjunction/ai-fireworks@5.37.0
  - @memberjunction/ai-gemini@5.37.0
  - @memberjunction/ai-groq@5.37.0
  - @memberjunction/ai-heygen@5.37.0
  - @memberjunction/ai-inception@5.37.0
  - @memberjunction/ai-lmstudio@5.37.0
  - @memberjunction/ai-llamacpp@5.37.0
  - @memberjunction/ai-local-embeddings@5.37.0
  - @memberjunction/ai-minimax@5.37.0
  - @memberjunction/ai-mistral@5.37.0
  - @memberjunction/ai-ollama@5.37.0
  - @memberjunction/ai-openai@5.37.0
  - @memberjunction/ai-openrouter@5.37.0
  - @memberjunction/ai-vertex@5.37.0
  - @memberjunction/ai-zhipu@5.37.0
  - @memberjunction/ai-xai@5.37.0

## 5.36.0

### Patch Changes

- 1c0fce9: Section 10 interior chrome pattern applied to every MJ Explorer left-rail shell (Admin × 4, AI Analytics, Knowledge Hub × 4, Testing Explorer, Database Designer, SQL Logging, Dev Tools inspectors, API Keys, App Roles). New shared primitives — `<mj-left-nav>` with optional tree support, two-row `<mj-page-header-interior>`, paired `<mj-page-body-interior>` — replace bespoke per-shell sidebar and chrome implementations across ~25 sub-pages. Chrome slot discipline audit standardizes tab-nav placement, `[meta]` badge content, and `[actions]` ordering across ~65 dashboards; two pre-existing bugs fixed along the way (nested `:has()` SyntaxError that silently hid the interior toolbar row, and an invisible page-header drop shadow).
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-actions@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ai-agent-manager@5.36.0
  - @memberjunction/ai-agents@5.36.0
  - @memberjunction/ai-engine-base@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/tag-engine-base@5.36.0
  - @memberjunction/ai-recommendations-rex@5.36.0
  - @memberjunction/ai-reranker@5.36.0
  - @memberjunction/actions-apollo@5.36.0
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/actions-bizapps-accounting@5.36.0
  - @memberjunction/actions-bizapps-crm@5.36.0
  - @memberjunction/actions-bizapps-formbuilders@5.36.0
  - @memberjunction/actions-bizapps-lms@5.36.0
  - @memberjunction/actions-bizapps-social@5.36.0
  - @memberjunction/actions@5.36.0
  - @memberjunction/communication-types@5.36.0
  - @memberjunction/content-autotagging@5.36.0
  - @memberjunction/doc-utils@5.36.0
  - @memberjunction/encryption@5.36.0
  - @memberjunction/core-entities-server@5.36.0
  - @memberjunction/queue@5.36.0
  - @memberjunction/storage@5.36.0
  - @memberjunction/scheduling-actions@5.36.0
  - @memberjunction/scheduling-engine-base@5.36.0
  - @memberjunction/scheduling-engine@5.36.0
  - @memberjunction/search-engine@5.36.0
  - @memberjunction/templates@5.36.0
  - @memberjunction/testing-engine@5.36.0
  - @memberjunction/geo-core@5.36.0
  - @memberjunction/ai-vectors-memory@5.36.0
  - @memberjunction/ai-vectors-pinecone@5.36.0
  - @memberjunction/ai-vectors-qdrant@5.36.0
  - @memberjunction/ai-vectors-pgvector@5.36.0
  - @memberjunction/data-context-server@5.36.0
  - @memberjunction/ai-provider-bundle@5.36.0
  - @memberjunction/ai-anthropic@5.36.0
  - @memberjunction/ai-azure@5.36.0
  - @memberjunction/ai-bedrock@5.36.0
  - @memberjunction/ai-betty-bot@5.36.0
  - @memberjunction/ai-blackforestlabs@5.36.0
  - @memberjunction/ai-cerebras@5.36.0
  - @memberjunction/ai-cohere@5.36.0
  - @memberjunction/ai-elevenlabs@5.36.0
  - @memberjunction/ai-fireworks@5.36.0
  - @memberjunction/ai-gemini@5.36.0
  - @memberjunction/ai-groq@5.36.0
  - @memberjunction/ai-heygen@5.36.0
  - @memberjunction/ai-inception@5.36.0
  - @memberjunction/ai-lmstudio@5.36.0
  - @memberjunction/ai-llamacpp@5.36.0
  - @memberjunction/ai-local-embeddings@5.36.0
  - @memberjunction/ai-minimax@5.36.0
  - @memberjunction/ai-mistral@5.36.0
  - @memberjunction/ai-ollama@5.36.0
  - @memberjunction/ai-openai@5.36.0
  - @memberjunction/ai-openrouter@5.36.0
  - @memberjunction/ai-vertex@5.36.0
  - @memberjunction/ai-zhipu@5.36.0
  - @memberjunction/ai-xai@5.36.0

## 5.35.0

### Patch Changes

- c1f1cad: Add pluggable geocoding provider abstraction with Google, Geocod.io, and HERE implementations (expands GeoCodeSource enum and adds provider registry). Polish the Home dashboard pin empty state with a dismissible "Don't show this again" preference persisted via UserInfoEngine, and speed up the Add Pin panel by reading from cached DashboardEngine, UserViewEngine, QueryEngine, and ActionEngineBase singletons instead of firing fresh RunViews on every open, with background pre-warm on home load.
- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [7332992]
- Updated dependencies [9580189]
- Updated dependencies [e9d4b1c]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [c3f4154]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/geo-core@5.35.0
  - @memberjunction/core-actions@5.35.0
  - @memberjunction/ai-agents@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/core-entities-server@5.35.0
  - @memberjunction/ai-gemini@5.35.0
  - @memberjunction/ai-agent-manager@5.35.0
  - @memberjunction/ai-engine-base@5.35.0
  - @memberjunction/tag-engine-base@5.35.0
  - @memberjunction/ai-recommendations-rex@5.35.0
  - @memberjunction/ai-reranker@5.35.0
  - @memberjunction/ai-vectors-memory@5.35.0
  - @memberjunction/ai-vectors-pinecone@5.35.0
  - @memberjunction/ai-vectors-qdrant@5.35.0
  - @memberjunction/ai-vectors-pgvector@5.35.0
  - @memberjunction/actions-apollo@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/actions-bizapps-accounting@5.35.0
  - @memberjunction/actions-bizapps-crm@5.35.0
  - @memberjunction/actions-bizapps-formbuilders@5.35.0
  - @memberjunction/actions-bizapps-lms@5.35.0
  - @memberjunction/actions-bizapps-social@5.35.0
  - @memberjunction/actions@5.35.0
  - @memberjunction/communication-types@5.35.0
  - @memberjunction/content-autotagging@5.35.0
  - @memberjunction/doc-utils@5.35.0
  - @memberjunction/encryption@5.35.0
  - @memberjunction/data-context-server@5.35.0
  - @memberjunction/queue@5.35.0
  - @memberjunction/storage@5.35.0
  - @memberjunction/scheduling-actions@5.35.0
  - @memberjunction/scheduling-engine-base@5.35.0
  - @memberjunction/scheduling-engine@5.35.0
  - @memberjunction/search-engine@5.35.0
  - @memberjunction/templates@5.35.0
  - @memberjunction/testing-engine@5.35.0
  - @memberjunction/ai-provider-bundle@5.35.0
  - @memberjunction/ai-vertex@5.35.0
  - @memberjunction/ai-anthropic@5.35.0
  - @memberjunction/ai-azure@5.35.0
  - @memberjunction/ai-bedrock@5.35.0
  - @memberjunction/ai-betty-bot@5.35.0
  - @memberjunction/ai-blackforestlabs@5.35.0
  - @memberjunction/ai-cerebras@5.35.0
  - @memberjunction/ai-cohere@5.35.0
  - @memberjunction/ai-elevenlabs@5.35.0
  - @memberjunction/ai-fireworks@5.35.0
  - @memberjunction/ai-groq@5.35.0
  - @memberjunction/ai-heygen@5.35.0
  - @memberjunction/ai-inception@5.35.0
  - @memberjunction/ai-lmstudio@5.35.0
  - @memberjunction/ai-llamacpp@5.35.0
  - @memberjunction/ai-local-embeddings@5.35.0
  - @memberjunction/ai-minimax@5.35.0
  - @memberjunction/ai-mistral@5.35.0
  - @memberjunction/ai-ollama@5.35.0
  - @memberjunction/ai-openai@5.35.0
  - @memberjunction/ai-openrouter@5.35.0
  - @memberjunction/ai-zhipu@5.35.0
  - @memberjunction/ai-xai@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/ai-agents@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-agent-manager@5.34.1
  - @memberjunction/ai-engine-base@5.34.1
  - @memberjunction/tag-engine-base@5.34.1
  - @memberjunction/ai-recommendations-rex@5.34.1
  - @memberjunction/ai-reranker@5.34.1
  - @memberjunction/ai-vectors-memory@5.34.1
  - @memberjunction/ai-vectors-pinecone@5.34.1
  - @memberjunction/ai-vectors-qdrant@5.34.1
  - @memberjunction/ai-vectors-pgvector@5.34.1
  - @memberjunction/actions-apollo@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/actions-bizapps-accounting@5.34.1
  - @memberjunction/actions-bizapps-crm@5.34.1
  - @memberjunction/actions-bizapps-formbuilders@5.34.1
  - @memberjunction/actions-bizapps-lms@5.34.1
  - @memberjunction/actions-bizapps-social@5.34.1
  - @memberjunction/core-actions@5.34.1
  - @memberjunction/actions@5.34.1
  - @memberjunction/communication-types@5.34.1
  - @memberjunction/content-autotagging@5.34.1
  - @memberjunction/doc-utils@5.34.1
  - @memberjunction/encryption@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/core-entities-server@5.34.1
  - @memberjunction/data-context-server@5.34.1
  - @memberjunction/queue@5.34.1
  - @memberjunction/storage@5.34.1
  - @memberjunction/scheduling-actions@5.34.1
  - @memberjunction/scheduling-engine-base@5.34.1
  - @memberjunction/scheduling-engine@5.34.1
  - @memberjunction/search-engine@5.34.1
  - @memberjunction/templates@5.34.1
  - @memberjunction/testing-engine@5.34.1
  - @memberjunction/ai-provider-bundle@5.34.1
  - @memberjunction/ai-anthropic@5.34.1
  - @memberjunction/ai-azure@5.34.1
  - @memberjunction/ai-bedrock@5.34.1
  - @memberjunction/ai-betty-bot@5.34.1
  - @memberjunction/ai-blackforestlabs@5.34.1
  - @memberjunction/ai-cerebras@5.34.1
  - @memberjunction/ai-cohere@5.34.1
  - @memberjunction/ai-elevenlabs@5.34.1
  - @memberjunction/ai-fireworks@5.34.1
  - @memberjunction/ai-gemini@5.34.1
  - @memberjunction/ai-groq@5.34.1
  - @memberjunction/ai-heygen@5.34.1
  - @memberjunction/ai-inception@5.34.1
  - @memberjunction/ai-lmstudio@5.34.1
  - @memberjunction/ai-llamacpp@5.34.1
  - @memberjunction/ai-local-embeddings@5.34.1
  - @memberjunction/ai-minimax@5.34.1
  - @memberjunction/ai-mistral@5.34.1
  - @memberjunction/ai-ollama@5.34.1
  - @memberjunction/ai-openai@5.34.1
  - @memberjunction/ai-openrouter@5.34.1
  - @memberjunction/ai-vertex@5.34.1
  - @memberjunction/ai-zhipu@5.34.1
  - @memberjunction/ai-xai@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [4b8d9ed]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [7ccaf70]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [8dad9c5]
- Updated dependencies [72cb92e]
  - @memberjunction/core-entities-server@5.34.0
  - @memberjunction/ai-agent-manager@5.34.0
  - @memberjunction/ai-agents@5.34.0
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/tag-engine-base@5.34.0
  - @memberjunction/ai-azure@5.34.0
  - @memberjunction/ai-bedrock@5.34.0
  - @memberjunction/ai-betty-bot@5.34.0
  - @memberjunction/ai-blackforestlabs@5.34.0
  - @memberjunction/ai-provider-bundle@5.34.0
  - @memberjunction/ai-cerebras@5.34.0
  - @memberjunction/ai-cohere@5.34.0
  - @memberjunction/ai-elevenlabs@5.34.0
  - @memberjunction/ai-fireworks@5.34.0
  - @memberjunction/ai-groq@5.34.0
  - @memberjunction/ai-heygen@5.34.0
  - @memberjunction/ai-inception@5.34.0
  - @memberjunction/ai-lmstudio@5.34.0
  - @memberjunction/ai-llamacpp@5.34.0
  - @memberjunction/ai-local-embeddings@5.34.0
  - @memberjunction/ai-minimax@5.34.0
  - @memberjunction/ai-ollama@5.34.0
  - @memberjunction/ai-openrouter@5.34.0
  - @memberjunction/ai-recommendations-rex@5.34.0
  - @memberjunction/ai-vertex@5.34.0
  - @memberjunction/ai-zhipu@5.34.0
  - @memberjunction/ai-xai@5.34.0
  - @memberjunction/ai-reranker@5.34.0
  - @memberjunction/ai-vectors-memory@5.34.0
  - @memberjunction/ai-vectors-pinecone@5.34.0
  - @memberjunction/ai-vectors-qdrant@5.34.0
  - @memberjunction/ai-vectors-pgvector@5.34.0
  - @memberjunction/actions-apollo@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/actions-bizapps-accounting@5.34.0
  - @memberjunction/actions-bizapps-crm@5.34.0
  - @memberjunction/actions-bizapps-formbuilders@5.34.0
  - @memberjunction/actions-bizapps-lms@5.34.0
  - @memberjunction/actions-bizapps-social@5.34.0
  - @memberjunction/core-actions@5.34.0
  - @memberjunction/actions@5.34.0
  - @memberjunction/communication-types@5.34.0
  - @memberjunction/content-autotagging@5.34.0
  - @memberjunction/doc-utils@5.34.0
  - @memberjunction/encryption@5.34.0
  - @memberjunction/data-context-server@5.34.0
  - @memberjunction/storage@5.34.0
  - @memberjunction/scheduling-actions@5.34.0
  - @memberjunction/scheduling-engine-base@5.34.0
  - @memberjunction/scheduling-engine@5.34.0
  - @memberjunction/search-engine@5.34.0
  - @memberjunction/templates@5.34.0
  - @memberjunction/testing-engine@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/queue@5.34.0
  - @memberjunction/ai-anthropic@5.34.0
  - @memberjunction/ai-gemini@5.34.0
  - @memberjunction/ai-mistral@5.34.0
  - @memberjunction/ai-openai@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/core-entities-server@5.33.0
  - @memberjunction/core-actions@5.33.0
  - @memberjunction/search-engine@5.33.0
  - @memberjunction/ai-agent-manager@5.33.0
  - @memberjunction/ai-agents@5.33.0
  - @memberjunction/ai-engine-base@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/tag-engine-base@5.33.0
  - @memberjunction/ai-recommendations-rex@5.33.0
  - @memberjunction/ai-reranker@5.33.0
  - @memberjunction/ai-vectors-pinecone@5.33.0
  - @memberjunction/ai-vectors-qdrant@5.33.0
  - @memberjunction/ai-vectors-pgvector@5.33.0
  - @memberjunction/actions-apollo@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/actions-bizapps-accounting@5.33.0
  - @memberjunction/actions-bizapps-crm@5.33.0
  - @memberjunction/actions-bizapps-formbuilders@5.33.0
  - @memberjunction/actions-bizapps-lms@5.33.0
  - @memberjunction/actions-bizapps-social@5.33.0
  - @memberjunction/actions@5.33.0
  - @memberjunction/communication-types@5.33.0
  - @memberjunction/content-autotagging@5.33.0
  - @memberjunction/doc-utils@5.33.0
  - @memberjunction/encryption@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/data-context-server@5.33.0
  - @memberjunction/queue@5.33.0
  - @memberjunction/storage@5.33.0
  - @memberjunction/scheduling-actions@5.33.0
  - @memberjunction/scheduling-engine-base@5.33.0
  - @memberjunction/scheduling-engine@5.33.0
  - @memberjunction/templates@5.33.0
  - @memberjunction/testing-engine@5.33.0
  - @memberjunction/ai-anthropic@5.33.0
  - @memberjunction/ai-azure@5.33.0
  - @memberjunction/ai-bedrock@5.33.0
  - @memberjunction/ai-betty-bot@5.33.0
  - @memberjunction/ai-blackforestlabs@5.33.0
  - @memberjunction/ai-cerebras@5.33.0
  - @memberjunction/ai-cohere@5.33.0
  - @memberjunction/ai-elevenlabs@5.33.0
  - @memberjunction/ai-fireworks@5.33.0
  - @memberjunction/ai-gemini@5.33.0
  - @memberjunction/ai-groq@5.33.0
  - @memberjunction/ai-heygen@5.33.0
  - @memberjunction/ai-inception@5.33.0
  - @memberjunction/ai-lmstudio@5.33.0
  - @memberjunction/ai-llamacpp@5.33.0
  - @memberjunction/ai-local-embeddings@5.33.0
  - @memberjunction/ai-minimax@5.33.0
  - @memberjunction/ai-mistral@5.33.0
  - @memberjunction/ai-ollama@5.33.0
  - @memberjunction/ai-openai@5.33.0
  - @memberjunction/ai-openrouter@5.33.0
  - @memberjunction/ai-vertex@5.33.0
  - @memberjunction/ai-zhipu@5.33.0
  - @memberjunction/ai-xai@5.33.0
  - @memberjunction/ai-provider-bundle@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [26ee07c]
- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/scheduling-engine@5.32.0
  - @memberjunction/core@5.32.0
  - @memberjunction/core-actions@5.32.0
  - @memberjunction/ai-agent-manager@5.32.0
  - @memberjunction/ai-agents@5.32.0
  - @memberjunction/ai-engine-base@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/tag-engine-base@5.32.0
  - @memberjunction/ai-recommendations-rex@5.32.0
  - @memberjunction/ai-reranker@5.32.0
  - @memberjunction/ai-vectors-pinecone@5.32.0
  - @memberjunction/ai-vectors-qdrant@5.32.0
  - @memberjunction/ai-vectors-pgvector@5.32.0
  - @memberjunction/actions-apollo@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/actions-bizapps-accounting@5.32.0
  - @memberjunction/actions-bizapps-crm@5.32.0
  - @memberjunction/actions-bizapps-formbuilders@5.32.0
  - @memberjunction/actions-bizapps-lms@5.32.0
  - @memberjunction/actions-bizapps-social@5.32.0
  - @memberjunction/actions@5.32.0
  - @memberjunction/communication-types@5.32.0
  - @memberjunction/content-autotagging@5.32.0
  - @memberjunction/doc-utils@5.32.0
  - @memberjunction/encryption@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/core-entities-server@5.32.0
  - @memberjunction/data-context-server@5.32.0
  - @memberjunction/queue@5.32.0
  - @memberjunction/storage@5.32.0
  - @memberjunction/scheduling-actions@5.32.0
  - @memberjunction/scheduling-engine-base@5.32.0
  - @memberjunction/search-engine@5.32.0
  - @memberjunction/templates@5.32.0
  - @memberjunction/testing-engine@5.32.0
  - @memberjunction/ai-provider-bundle@5.32.0
  - @memberjunction/ai-anthropic@5.32.0
  - @memberjunction/ai-azure@5.32.0
  - @memberjunction/ai-bedrock@5.32.0
  - @memberjunction/ai-betty-bot@5.32.0
  - @memberjunction/ai-blackforestlabs@5.32.0
  - @memberjunction/ai-cerebras@5.32.0
  - @memberjunction/ai-cohere@5.32.0
  - @memberjunction/ai-elevenlabs@5.32.0
  - @memberjunction/ai-fireworks@5.32.0
  - @memberjunction/ai-gemini@5.32.0
  - @memberjunction/ai-groq@5.32.0
  - @memberjunction/ai-heygen@5.32.0
  - @memberjunction/ai-inception@5.32.0
  - @memberjunction/ai-lmstudio@5.32.0
  - @memberjunction/ai-llamacpp@5.32.0
  - @memberjunction/ai-local-embeddings@5.32.0
  - @memberjunction/ai-minimax@5.32.0
  - @memberjunction/ai-mistral@5.32.0
  - @memberjunction/ai-ollama@5.32.0
  - @memberjunction/ai-openai@5.32.0
  - @memberjunction/ai-openrouter@5.32.0
  - @memberjunction/ai-vertex@5.32.0
  - @memberjunction/ai-zhipu@5.32.0
  - @memberjunction/ai-xai@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/core-entities-server@5.31.0
  - @memberjunction/tag-engine-base@5.31.0
  - @memberjunction/content-autotagging@5.31.0
  - @memberjunction/ai-agent-manager@5.31.0
  - @memberjunction/ai-agents@5.31.0
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/ai-anthropic@5.31.0
  - @memberjunction/ai-azure@5.31.0
  - @memberjunction/ai-bedrock@5.31.0
  - @memberjunction/ai-betty-bot@5.31.0
  - @memberjunction/ai-blackforestlabs@5.31.0
  - @memberjunction/ai-provider-bundle@5.31.0
  - @memberjunction/ai-cerebras@5.31.0
  - @memberjunction/ai-cohere@5.31.0
  - @memberjunction/ai-elevenlabs@5.31.0
  - @memberjunction/ai-fireworks@5.31.0
  - @memberjunction/ai-gemini@5.31.0
  - @memberjunction/ai-groq@5.31.0
  - @memberjunction/ai-heygen@5.31.0
  - @memberjunction/ai-inception@5.31.0
  - @memberjunction/ai-lmstudio@5.31.0
  - @memberjunction/ai-llamacpp@5.31.0
  - @memberjunction/ai-local-embeddings@5.31.0
  - @memberjunction/ai-minimax@5.31.0
  - @memberjunction/ai-mistral@5.31.0
  - @memberjunction/ai-ollama@5.31.0
  - @memberjunction/ai-openai@5.31.0
  - @memberjunction/ai-openrouter@5.31.0
  - @memberjunction/ai-recommendations-rex@5.31.0
  - @memberjunction/ai-vertex@5.31.0
  - @memberjunction/ai-zhipu@5.31.0
  - @memberjunction/ai-xai@5.31.0
  - @memberjunction/ai-reranker@5.31.0
  - @memberjunction/ai-vectors-pinecone@5.31.0
  - @memberjunction/ai-vectors-qdrant@5.31.0
  - @memberjunction/ai-vectors-pgvector@5.31.0
  - @memberjunction/actions-apollo@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/actions-bizapps-accounting@5.31.0
  - @memberjunction/actions-bizapps-crm@5.31.0
  - @memberjunction/actions-bizapps-formbuilders@5.31.0
  - @memberjunction/actions-bizapps-lms@5.31.0
  - @memberjunction/actions-bizapps-social@5.31.0
  - @memberjunction/core-actions@5.31.0
  - @memberjunction/actions@5.31.0
  - @memberjunction/communication-types@5.31.0
  - @memberjunction/doc-utils@5.31.0
  - @memberjunction/encryption@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/data-context-server@5.31.0
  - @memberjunction/queue@5.31.0
  - @memberjunction/storage@5.31.0
  - @memberjunction/scheduling-actions@5.31.0
  - @memberjunction/scheduling-engine-base@5.31.0
  - @memberjunction/scheduling-engine@5.31.0
  - @memberjunction/search-engine@5.31.0
  - @memberjunction/templates@5.31.0
  - @memberjunction/testing-engine@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-agent-manager@5.30.1
- @memberjunction/ai-agents@5.30.1
- @memberjunction/ai-engine-base@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/tag-engine-base@5.30.1
- @memberjunction/ai-anthropic@5.30.1
- @memberjunction/ai-azure@5.30.1
- @memberjunction/ai-bedrock@5.30.1
- @memberjunction/ai-betty-bot@5.30.1
- @memberjunction/ai-blackforestlabs@5.30.1
- @memberjunction/ai-provider-bundle@5.30.1
- @memberjunction/ai-cerebras@5.30.1
- @memberjunction/ai-cohere@5.30.1
- @memberjunction/ai-elevenlabs@5.30.1
- @memberjunction/ai-fireworks@5.30.1
- @memberjunction/ai-gemini@5.30.1
- @memberjunction/ai-groq@5.30.1
- @memberjunction/ai-heygen@5.30.1
- @memberjunction/ai-inception@5.30.1
- @memberjunction/ai-lmstudio@5.30.1
- @memberjunction/ai-llamacpp@5.30.1
- @memberjunction/ai-local-embeddings@5.30.1
- @memberjunction/ai-minimax@5.30.1
- @memberjunction/ai-mistral@5.30.1
- @memberjunction/ai-ollama@5.30.1
- @memberjunction/ai-openai@5.30.1
- @memberjunction/ai-openrouter@5.30.1
- @memberjunction/ai-recommendations-rex@5.30.1
- @memberjunction/ai-vertex@5.30.1
- @memberjunction/ai-zhipu@5.30.1
- @memberjunction/ai-xai@5.30.1
- @memberjunction/ai-reranker@5.30.1
- @memberjunction/ai-vectors-pinecone@5.30.1
- @memberjunction/ai-vectors-qdrant@5.30.1
- @memberjunction/ai-vectors-pgvector@5.30.1
- @memberjunction/actions-apollo@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/actions-bizapps-accounting@5.30.1
- @memberjunction/actions-bizapps-crm@5.30.1
- @memberjunction/actions-bizapps-formbuilders@5.30.1
- @memberjunction/actions-bizapps-lms@5.30.1
- @memberjunction/actions-bizapps-social@5.30.1
- @memberjunction/core-actions@5.30.1
- @memberjunction/actions@5.30.1
- @memberjunction/communication-types@5.30.1
- @memberjunction/content-autotagging@5.30.1
- @memberjunction/doc-utils@5.30.1
- @memberjunction/encryption@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/core-entities-server@5.30.1
- @memberjunction/data-context-server@5.30.1
- @memberjunction/queue@5.30.1
- @memberjunction/storage@5.30.1
- @memberjunction/scheduling-actions@5.30.1
- @memberjunction/scheduling-engine-base@5.30.1
- @memberjunction/scheduling-engine@5.30.1
- @memberjunction/search-engine@5.30.1
- @memberjunction/templates@5.30.1
- @memberjunction/testing-engine@5.30.1

## 5.30.0

### Minor Changes

- 4729398: Runtime Actions — Phase 1 complete. Introduces `Action.Type='Runtime'`, a new action type where agents dynamically generate, test, and persist JavaScript actions that execute in MJ's isolated-vm sandbox with a permissioned bridge to metadata, views, queries, entity CRUD, other actions, agents, and AI prompts. Ships the v5.29.x migration (new `RuntimeActionConfiguration`, universal `MaxExecutionTimeMS`, and `CreatedByAgentID` columns on `Action`), the JSONType-authored config interface, the Zod validator with drift detection, the bidirectional IPC bridge in WorkerPool, the full `utilities.*` handler surface, the ActionSmith meta-agent with `Create Runtime Action` / `Test Runtime Action` helpers, Agent Manager wiring, the generic `Execute Agent` action, and Runtime-aware approval UI enhancements. Minor bumps across all touched packages because the schema migration + metadata records are coupled surface changes.

### Patch Changes

- 366e646: Refactor component linter: extract rules into self-registering individual files, then consolidate overlapping rules from 63 down to 55 (including merging 10 RunView/RunQuery rules into 3). Add search utility validation rules, improve render-loop detection with rate-of-growth analysis, fix variable reference resolution in RunQuery parameters, and fix @babel/traverse ESM default imports. Enhance TypeInferenceEngine with useState/callback/setState type propagation, implement 3-tier metadata fallback (spec → registry → skip-with-warning), and add individual-test-per-fixture for clear regression debugging. Includes architecture documentation updates.
- c199f3b: Phase 2 of the unified permissions architecture: introduces the `IPermissionProvider` interface with 9 domain providers (Entity, Application Role, Dashboard, Resource, Artifact, AI Agent, Collection, Query, Access Control Rule) aggregated by a new `PermissionEngine` singleton, adds explicit Allow/Deny support to `EntityPermission`, and ships the Permissions admin dashboard. Includes migrations for the Permission Domain catalog, EntityPermission.Type column, Dashboard FK cascade delete, ResourcePermission.SharedByUserID, and UI role permission fixes.
- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [70c054d]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [4e2da93]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/ai-agents@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core-entities-server@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ai-llamacpp@5.30.0
  - @memberjunction/ai-provider-bundle@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/actions@5.30.0
  - @memberjunction/core-actions@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/ai-inception@5.30.0
  - @memberjunction/ai-engine-base@5.30.0
  - @memberjunction/encryption@5.30.0
  - @memberjunction/ai-agent-manager@5.30.0
  - @memberjunction/scheduling-engine@5.30.0
  - @memberjunction/testing-engine@5.30.0
  - @memberjunction/ai-reranker@5.30.0
  - @memberjunction/ai-vectors-pinecone@5.30.0
  - @memberjunction/content-autotagging@5.30.0
  - @memberjunction/queue@5.30.0
  - @memberjunction/search-engine@5.30.0
  - @memberjunction/templates@5.30.0
  - @memberjunction/tag-engine-base@5.30.0
  - @memberjunction/ai-recommendations-rex@5.30.0
  - @memberjunction/actions-apollo@5.30.0
  - @memberjunction/actions-bizapps-accounting@5.30.0
  - @memberjunction/actions-bizapps-crm@5.30.0
  - @memberjunction/actions-bizapps-formbuilders@5.30.0
  - @memberjunction/actions-bizapps-lms@5.30.0
  - @memberjunction/actions-bizapps-social@5.30.0
  - @memberjunction/communication-types@5.30.0
  - @memberjunction/doc-utils@5.30.0
  - @memberjunction/storage@5.30.0
  - @memberjunction/scheduling-actions@5.30.0
  - @memberjunction/scheduling-engine-base@5.30.0
  - @memberjunction/ai-vectors-qdrant@5.30.0
  - @memberjunction/ai-vectors-pgvector@5.30.0
  - @memberjunction/data-context-server@5.30.0
  - @memberjunction/ai-anthropic@5.30.0
  - @memberjunction/ai-azure@5.30.0
  - @memberjunction/ai-bedrock@5.30.0
  - @memberjunction/ai-betty-bot@5.30.0
  - @memberjunction/ai-blackforestlabs@5.30.0
  - @memberjunction/ai-cerebras@5.30.0
  - @memberjunction/ai-cohere@5.30.0
  - @memberjunction/ai-elevenlabs@5.30.0
  - @memberjunction/ai-fireworks@5.30.0
  - @memberjunction/ai-gemini@5.30.0
  - @memberjunction/ai-groq@5.30.0
  - @memberjunction/ai-heygen@5.30.0
  - @memberjunction/ai-lmstudio@5.30.0
  - @memberjunction/ai-local-embeddings@5.30.0
  - @memberjunction/ai-minimax@5.30.0
  - @memberjunction/ai-mistral@5.30.0
  - @memberjunction/ai-ollama@5.30.0
  - @memberjunction/ai-openai@5.30.0
  - @memberjunction/ai-openrouter@5.30.0
  - @memberjunction/ai-vertex@5.30.0
  - @memberjunction/ai-zhipu@5.30.0
  - @memberjunction/ai-xai@5.30.0

## 5.29.0

### Patch Changes

- 5c7a57f: Add in-app feedback system with mj-dialog UI, GitHub App authentication for issue creation, and shell header integration. Feedback submissions create formatted GitHub issues with labels, severity, environment info, and browser details.
- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
- Updated dependencies [98bad3a]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities-server@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-agent-manager@5.29.0
  - @memberjunction/ai-agents@5.29.0
  - @memberjunction/ai-engine-base@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/tag-engine-base@5.29.0
  - @memberjunction/ai-recommendations-rex@5.29.0
  - @memberjunction/ai-reranker@5.29.0
  - @memberjunction/ai-vectors-pinecone@5.29.0
  - @memberjunction/ai-vectors-qdrant@5.29.0
  - @memberjunction/ai-vectors-pgvector@5.29.0
  - @memberjunction/actions-apollo@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/actions-bizapps-accounting@5.29.0
  - @memberjunction/actions-bizapps-crm@5.29.0
  - @memberjunction/actions-bizapps-formbuilders@5.29.0
  - @memberjunction/actions-bizapps-lms@5.29.0
  - @memberjunction/actions-bizapps-social@5.29.0
  - @memberjunction/core-actions@5.29.0
  - @memberjunction/actions@5.29.0
  - @memberjunction/communication-types@5.29.0
  - @memberjunction/content-autotagging@5.29.0
  - @memberjunction/doc-utils@5.29.0
  - @memberjunction/encryption@5.29.0
  - @memberjunction/data-context-server@5.29.0
  - @memberjunction/queue@5.29.0
  - @memberjunction/storage@5.29.0
  - @memberjunction/scheduling-actions@5.29.0
  - @memberjunction/scheduling-engine-base@5.29.0
  - @memberjunction/scheduling-engine@5.29.0
  - @memberjunction/search-engine@5.29.0
  - @memberjunction/templates@5.29.0
  - @memberjunction/testing-engine@5.29.0
  - @memberjunction/ai-provider-bundle@5.29.0
  - @memberjunction/ai-anthropic@5.29.0
  - @memberjunction/ai-azure@5.29.0
  - @memberjunction/ai-bedrock@5.29.0
  - @memberjunction/ai-betty-bot@5.29.0
  - @memberjunction/ai-blackforestlabs@5.29.0
  - @memberjunction/ai-cerebras@5.29.0
  - @memberjunction/ai-cohere@5.29.0
  - @memberjunction/ai-elevenlabs@5.29.0
  - @memberjunction/ai-fireworks@5.29.0
  - @memberjunction/ai-gemini@5.29.0
  - @memberjunction/ai-groq@5.29.0
  - @memberjunction/ai-heygen@5.29.0
  - @memberjunction/ai-lmstudio@5.29.0
  - @memberjunction/ai-local-embeddings@5.29.0
  - @memberjunction/ai-minimax@5.29.0
  - @memberjunction/ai-mistral@5.29.0
  - @memberjunction/ai-ollama@5.29.0
  - @memberjunction/ai-openai@5.29.0
  - @memberjunction/ai-openrouter@5.29.0
  - @memberjunction/ai-vertex@5.29.0
  - @memberjunction/ai-zhipu@5.29.0
  - @memberjunction/ai-xai@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/core-actions@5.28.0
  - @memberjunction/scheduling-engine@5.28.0
  - @memberjunction/ai-agents@5.28.0
  - @memberjunction/ai-reranker@5.28.0
  - @memberjunction/actions@5.28.0
  - @memberjunction/content-autotagging@5.28.0
  - @memberjunction/core-entities-server@5.28.0
  - @memberjunction/testing-engine@5.28.0
  - @memberjunction/ai-agent-manager@5.28.0
  - @memberjunction/ai-engine-base@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/tag-engine-base@5.28.0
  - @memberjunction/ai-recommendations-rex@5.28.0
  - @memberjunction/ai-vectors-pinecone@5.28.0
  - @memberjunction/ai-vectors-qdrant@5.28.0
  - @memberjunction/ai-vectors-pgvector@5.28.0
  - @memberjunction/actions-apollo@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/actions-bizapps-accounting@5.28.0
  - @memberjunction/actions-bizapps-crm@5.28.0
  - @memberjunction/actions-bizapps-formbuilders@5.28.0
  - @memberjunction/actions-bizapps-lms@5.28.0
  - @memberjunction/actions-bizapps-social@5.28.0
  - @memberjunction/communication-types@5.28.0
  - @memberjunction/doc-utils@5.28.0
  - @memberjunction/encryption@5.28.0
  - @memberjunction/data-context-server@5.28.0
  - @memberjunction/queue@5.28.0
  - @memberjunction/storage@5.28.0
  - @memberjunction/scheduling-actions@5.28.0
  - @memberjunction/scheduling-engine-base@5.28.0
  - @memberjunction/search-engine@5.28.0
  - @memberjunction/templates@5.28.0
  - @memberjunction/ai-provider-bundle@5.28.0
  - @memberjunction/ai-anthropic@5.28.0
  - @memberjunction/ai-azure@5.28.0
  - @memberjunction/ai-bedrock@5.28.0
  - @memberjunction/ai-betty-bot@5.28.0
  - @memberjunction/ai-blackforestlabs@5.28.0
  - @memberjunction/ai-cerebras@5.28.0
  - @memberjunction/ai-cohere@5.28.0
  - @memberjunction/ai-elevenlabs@5.28.0
  - @memberjunction/ai-fireworks@5.28.0
  - @memberjunction/ai-gemini@5.28.0
  - @memberjunction/ai-groq@5.28.0
  - @memberjunction/ai-heygen@5.28.0
  - @memberjunction/ai-lmstudio@5.28.0
  - @memberjunction/ai-local-embeddings@5.28.0
  - @memberjunction/ai-minimax@5.28.0
  - @memberjunction/ai-mistral@5.28.0
  - @memberjunction/ai-ollama@5.28.0
  - @memberjunction/ai-openai@5.28.0
  - @memberjunction/ai-openrouter@5.28.0
  - @memberjunction/ai-vertex@5.28.0
  - @memberjunction/ai-zhipu@5.28.0
  - @memberjunction/ai-xai@5.28.0

## 5.27.1

### Patch Changes

- @memberjunction/ai-agent-manager@5.27.1
- @memberjunction/ai-agents@5.27.1
- @memberjunction/ai-engine-base@5.27.1
- @memberjunction/ai-core-plus@5.27.1
- @memberjunction/tag-engine-base@5.27.1
- @memberjunction/ai-anthropic@5.27.1
- @memberjunction/ai-azure@5.27.1
- @memberjunction/ai-bedrock@5.27.1
- @memberjunction/ai-betty-bot@5.27.1
- @memberjunction/ai-blackforestlabs@5.27.1
- @memberjunction/ai-cerebras@5.27.1
- @memberjunction/ai-cohere@5.27.1
- @memberjunction/ai-elevenlabs@5.27.1
- @memberjunction/ai-fireworks@5.27.1
- @memberjunction/ai-gemini@5.27.1
- @memberjunction/ai-groq@5.27.1
- @memberjunction/ai-heygen@5.27.1
- @memberjunction/ai-lmstudio@5.27.1
- @memberjunction/ai-local-embeddings@5.27.1
- @memberjunction/ai-minimax@5.27.1
- @memberjunction/ai-mistral@5.27.1
- @memberjunction/ai-ollama@5.27.1
- @memberjunction/ai-openai@5.27.1
- @memberjunction/ai-openrouter@5.27.1
- @memberjunction/ai-recommendations-rex@5.27.1
- @memberjunction/ai-vertex@5.27.1
- @memberjunction/ai-zhipu@5.27.1
- @memberjunction/ai-xai@5.27.1
- @memberjunction/ai-reranker@5.27.1
- @memberjunction/ai-vectors-pinecone@5.27.1
- @memberjunction/ai-vectors-qdrant@5.27.1
- @memberjunction/ai-vectors-pgvector@5.27.1
- @memberjunction/actions-apollo@5.27.1
- @memberjunction/actions-base@5.27.1
- @memberjunction/actions-bizapps-accounting@5.27.1
- @memberjunction/actions-bizapps-crm@5.27.1
- @memberjunction/actions-bizapps-formbuilders@5.27.1
- @memberjunction/actions-bizapps-lms@5.27.1
- @memberjunction/actions-bizapps-social@5.27.1
- @memberjunction/core-actions@5.27.1
- @memberjunction/actions@5.27.1
- @memberjunction/communication-types@5.27.1
- @memberjunction/content-autotagging@5.27.1
- @memberjunction/doc-utils@5.27.1
- @memberjunction/encryption@5.27.1
- @memberjunction/core@5.27.1
- @memberjunction/core-entities@5.27.1
- @memberjunction/core-entities-server@5.27.1
- @memberjunction/data-context-server@5.27.1
- @memberjunction/queue@5.27.1
- @memberjunction/storage@5.27.1
- @memberjunction/scheduling-actions@5.27.1
- @memberjunction/scheduling-engine-base@5.27.1
- @memberjunction/scheduling-engine@5.27.1
- @memberjunction/search-engine@5.27.1
- @memberjunction/templates@5.27.1
- @memberjunction/testing-engine@5.27.1
- @memberjunction/ai-provider-bundle@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [4357090]
  - @memberjunction/content-autotagging@5.27.0
  - @memberjunction/core-entities-server@5.27.0
  - @memberjunction/core-actions@5.27.0
  - @memberjunction/scheduling-engine@5.27.0
  - @memberjunction/ai-agent-manager@5.27.0
  - @memberjunction/ai-agents@5.27.0
  - @memberjunction/ai-engine-base@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/tag-engine-base@5.27.0
  - @memberjunction/ai-anthropic@5.27.0
  - @memberjunction/ai-azure@5.27.0
  - @memberjunction/ai-bedrock@5.27.0
  - @memberjunction/ai-betty-bot@5.27.0
  - @memberjunction/ai-blackforestlabs@5.27.0
  - @memberjunction/ai-provider-bundle@5.27.0
  - @memberjunction/ai-cerebras@5.27.0
  - @memberjunction/ai-cohere@5.27.0
  - @memberjunction/ai-elevenlabs@5.27.0
  - @memberjunction/ai-fireworks@5.27.0
  - @memberjunction/ai-gemini@5.27.0
  - @memberjunction/ai-groq@5.27.0
  - @memberjunction/ai-heygen@5.27.0
  - @memberjunction/ai-lmstudio@5.27.0
  - @memberjunction/ai-local-embeddings@5.27.0
  - @memberjunction/ai-minimax@5.27.0
  - @memberjunction/ai-mistral@5.27.0
  - @memberjunction/ai-ollama@5.27.0
  - @memberjunction/ai-openai@5.27.0
  - @memberjunction/ai-openrouter@5.27.0
  - @memberjunction/ai-recommendations-rex@5.27.0
  - @memberjunction/ai-vertex@5.27.0
  - @memberjunction/ai-zhipu@5.27.0
  - @memberjunction/ai-xai@5.27.0
  - @memberjunction/ai-reranker@5.27.0
  - @memberjunction/ai-vectors-pinecone@5.27.0
  - @memberjunction/ai-vectors-qdrant@5.27.0
  - @memberjunction/ai-vectors-pgvector@5.27.0
  - @memberjunction/actions-apollo@5.27.0
  - @memberjunction/actions-base@5.27.0
  - @memberjunction/actions-bizapps-accounting@5.27.0
  - @memberjunction/actions-bizapps-crm@5.27.0
  - @memberjunction/actions-bizapps-formbuilders@5.27.0
  - @memberjunction/actions-bizapps-lms@5.27.0
  - @memberjunction/actions-bizapps-social@5.27.0
  - @memberjunction/actions@5.27.0
  - @memberjunction/communication-types@5.27.0
  - @memberjunction/doc-utils@5.27.0
  - @memberjunction/encryption@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/data-context-server@5.27.0
  - @memberjunction/queue@5.27.0
  - @memberjunction/storage@5.27.0
  - @memberjunction/scheduling-actions@5.27.0
  - @memberjunction/scheduling-engine-base@5.27.0
  - @memberjunction/search-engine@5.27.0
  - @memberjunction/templates@5.27.0
  - @memberjunction/testing-engine@5.27.0

## 5.26.0

### Patch Changes

- 55de456: Fix missing dependencies across 17 packages that accumulated while knip dependency checking was silently broken. Repair knip infrastructure: disable crashing vitest plugin, harden CI workflow to fail-fast on tool crashes instead of silently passing, and fix hardcoded Angular version in auto-fix script.
- a1002f4: - Entities now expose AllowCaching as the runtime source of truth for
- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/ai-agents@5.26.0
  - @memberjunction/core-actions@5.26.0
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-agent-manager@5.26.0
  - @memberjunction/scheduling-engine@5.26.0
  - @memberjunction/testing-engine@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/tag-engine-base@5.26.0
  - @memberjunction/ai-recommendations-rex@5.26.0
  - @memberjunction/ai-reranker@5.26.0
  - @memberjunction/actions-apollo@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/actions-bizapps-accounting@5.26.0
  - @memberjunction/actions-bizapps-crm@5.26.0
  - @memberjunction/actions-bizapps-formbuilders@5.26.0
  - @memberjunction/actions-bizapps-lms@5.26.0
  - @memberjunction/actions-bizapps-social@5.26.0
  - @memberjunction/actions@5.26.0
  - @memberjunction/communication-types@5.26.0
  - @memberjunction/content-autotagging@5.26.0
  - @memberjunction/doc-utils@5.26.0
  - @memberjunction/encryption@5.26.0
  - @memberjunction/core-entities-server@5.26.0
  - @memberjunction/queue@5.26.0
  - @memberjunction/storage@5.26.0
  - @memberjunction/scheduling-actions@5.26.0
  - @memberjunction/scheduling-engine-base@5.26.0
  - @memberjunction/search-engine@5.26.0
  - @memberjunction/templates@5.26.0
  - @memberjunction/ai-vectors-pinecone@5.26.0
  - @memberjunction/ai-vectors-qdrant@5.26.0
  - @memberjunction/ai-vectors-pgvector@5.26.0
  - @memberjunction/data-context-server@5.26.0
  - @memberjunction/ai-provider-bundle@5.26.0
  - @memberjunction/ai-anthropic@5.26.0
  - @memberjunction/ai-azure@5.26.0
  - @memberjunction/ai-bedrock@5.26.0
  - @memberjunction/ai-betty-bot@5.26.0
  - @memberjunction/ai-blackforestlabs@5.26.0
  - @memberjunction/ai-cerebras@5.26.0
  - @memberjunction/ai-cohere@5.26.0
  - @memberjunction/ai-elevenlabs@5.26.0
  - @memberjunction/ai-fireworks@5.26.0
  - @memberjunction/ai-gemini@5.26.0
  - @memberjunction/ai-groq@5.26.0
  - @memberjunction/ai-heygen@5.26.0
  - @memberjunction/ai-lmstudio@5.26.0
  - @memberjunction/ai-local-embeddings@5.26.0
  - @memberjunction/ai-minimax@5.26.0
  - @memberjunction/ai-mistral@5.26.0
  - @memberjunction/ai-ollama@5.26.0
  - @memberjunction/ai-openai@5.26.0
  - @memberjunction/ai-openrouter@5.26.0
  - @memberjunction/ai-vertex@5.26.0
  - @memberjunction/ai-zhipu@5.26.0
  - @memberjunction/ai-xai@5.26.0

## 5.25.0

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [62af878]
- Updated dependencies [cbcf477]
- Updated dependencies [33802a7]
  - @memberjunction/core@5.25.0
  - @memberjunction/content-autotagging@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/core-entities-server@5.25.0
  - @memberjunction/actions@5.25.0
  - @memberjunction/ai-agents@5.25.0
  - @memberjunction/actions-bizapps-social@5.25.0
  - @memberjunction/ai-agent-manager@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/tag-engine-base@5.25.0
  - @memberjunction/ai-recommendations-rex@5.25.0
  - @memberjunction/ai-reranker@5.25.0
  - @memberjunction/ai-vectors-pinecone@5.25.0
  - @memberjunction/ai-vectors-qdrant@5.25.0
  - @memberjunction/ai-vectors-pgvector@5.25.0
  - @memberjunction/actions-apollo@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/actions-bizapps-accounting@5.25.0
  - @memberjunction/actions-bizapps-crm@5.25.0
  - @memberjunction/actions-bizapps-formbuilders@5.25.0
  - @memberjunction/actions-bizapps-lms@5.25.0
  - @memberjunction/core-actions@5.25.0
  - @memberjunction/communication-types@5.25.0
  - @memberjunction/doc-utils@5.25.0
  - @memberjunction/encryption@5.25.0
  - @memberjunction/data-context-server@5.25.0
  - @memberjunction/queue@5.25.0
  - @memberjunction/storage@5.25.0
  - @memberjunction/scheduling-actions@5.25.0
  - @memberjunction/scheduling-engine-base@5.25.0
  - @memberjunction/scheduling-engine@5.25.0
  - @memberjunction/templates@5.25.0
  - @memberjunction/testing-engine@5.25.0
  - @memberjunction/ai-provider-bundle@5.25.0
  - @memberjunction/ai-anthropic@5.25.0
  - @memberjunction/ai-azure@5.25.0
  - @memberjunction/ai-bedrock@5.25.0
  - @memberjunction/ai-betty-bot@5.25.0
  - @memberjunction/ai-blackforestlabs@5.25.0
  - @memberjunction/ai-cerebras@5.25.0
  - @memberjunction/ai-cohere@5.25.0
  - @memberjunction/ai-elevenlabs@5.25.0
  - @memberjunction/ai-fireworks@5.25.0
  - @memberjunction/ai-gemini@5.25.0
  - @memberjunction/ai-groq@5.25.0
  - @memberjunction/ai-heygen@5.25.0
  - @memberjunction/ai-lmstudio@5.25.0
  - @memberjunction/ai-local-embeddings@5.25.0
  - @memberjunction/ai-minimax@5.25.0
  - @memberjunction/ai-mistral@5.25.0
  - @memberjunction/ai-ollama@5.25.0
  - @memberjunction/ai-openai@5.25.0
  - @memberjunction/ai-openrouter@5.25.0
  - @memberjunction/ai-vertex@5.25.0
  - @memberjunction/ai-zhipu@5.25.0
  - @memberjunction/ai-xai@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [c8caf2c]
- Updated dependencies [1912726]
  - @memberjunction/ai-agents@5.24.0
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/tag-engine-base@5.24.0
  - @memberjunction/ai-vectors-pinecone@5.24.0
  - @memberjunction/ai-vectors-qdrant@5.24.0
  - @memberjunction/ai-vectors-pgvector@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/core-entities-server@5.24.0
  - @memberjunction/actions-bizapps-lms@5.24.0
  - @memberjunction/ai-agent-manager@5.24.0
  - @memberjunction/core-actions@5.24.0
  - @memberjunction/scheduling-engine@5.24.0
  - @memberjunction/testing-engine@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/ai-reranker@5.24.0
  - @memberjunction/actions@5.24.0
  - @memberjunction/templates@5.24.0
  - @memberjunction/ai-provider-bundle@5.24.0
  - @memberjunction/ai-recommendations-rex@5.24.0
  - @memberjunction/actions-apollo@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/actions-bizapps-accounting@5.24.0
  - @memberjunction/actions-bizapps-crm@5.24.0
  - @memberjunction/actions-bizapps-formbuilders@5.24.0
  - @memberjunction/actions-bizapps-social@5.24.0
  - @memberjunction/doc-utils@5.24.0
  - @memberjunction/encryption@5.24.0
  - @memberjunction/data-context-server@5.24.0
  - @memberjunction/scheduling-actions@5.24.0
  - @memberjunction/scheduling-engine-base@5.24.0
  - @memberjunction/ai-anthropic@5.24.0
  - @memberjunction/ai-azure@5.24.0
  - @memberjunction/ai-bedrock@5.24.0
  - @memberjunction/ai-betty-bot@5.24.0
  - @memberjunction/ai-blackforestlabs@5.24.0
  - @memberjunction/ai-cerebras@5.24.0
  - @memberjunction/ai-cohere@5.24.0
  - @memberjunction/ai-elevenlabs@5.24.0
  - @memberjunction/ai-fireworks@5.24.0
  - @memberjunction/ai-gemini@5.24.0
  - @memberjunction/ai-groq@5.24.0
  - @memberjunction/ai-heygen@5.24.0
  - @memberjunction/ai-lmstudio@5.24.0
  - @memberjunction/ai-local-embeddings@5.24.0
  - @memberjunction/ai-minimax@5.24.0
  - @memberjunction/ai-mistral@5.24.0
  - @memberjunction/ai-ollama@5.24.0
  - @memberjunction/ai-openai@5.24.0
  - @memberjunction/ai-openrouter@5.24.0
  - @memberjunction/ai-vertex@5.24.0
  - @memberjunction/ai-zhipu@5.24.0
  - @memberjunction/ai-xai@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
  - @memberjunction/core@5.23.0
  - @memberjunction/core-entities-server@5.23.0
  - @memberjunction/ai-agents@5.23.0
  - @memberjunction/ai-vectors-pinecone@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/ai-agent-manager@5.23.0
  - @memberjunction/ai-engine-base@5.23.0
  - @memberjunction/ai-recommendations-rex@5.23.0
  - @memberjunction/ai-reranker@5.23.0
  - @memberjunction/actions-apollo@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/actions-bizapps-accounting@5.23.0
  - @memberjunction/actions-bizapps-crm@5.23.0
  - @memberjunction/actions-bizapps-formbuilders@5.23.0
  - @memberjunction/actions-bizapps-lms@5.23.0
  - @memberjunction/actions-bizapps-social@5.23.0
  - @memberjunction/core-actions@5.23.0
  - @memberjunction/actions@5.23.0
  - @memberjunction/doc-utils@5.23.0
  - @memberjunction/encryption@5.23.0
  - @memberjunction/data-context-server@5.23.0
  - @memberjunction/scheduling-actions@5.23.0
  - @memberjunction/scheduling-engine-base@5.23.0
  - @memberjunction/scheduling-engine@5.23.0
  - @memberjunction/templates@5.23.0
  - @memberjunction/testing-engine@5.23.0
  - @memberjunction/ai-anthropic@5.23.0
  - @memberjunction/ai-azure@5.23.0
  - @memberjunction/ai-bedrock@5.23.0
  - @memberjunction/ai-betty-bot@5.23.0
  - @memberjunction/ai-blackforestlabs@5.23.0
  - @memberjunction/ai-cerebras@5.23.0
  - @memberjunction/ai-cohere@5.23.0
  - @memberjunction/ai-elevenlabs@5.23.0
  - @memberjunction/ai-fireworks@5.23.0
  - @memberjunction/ai-gemini@5.23.0
  - @memberjunction/ai-groq@5.23.0
  - @memberjunction/ai-heygen@5.23.0
  - @memberjunction/ai-lmstudio@5.23.0
  - @memberjunction/ai-local-embeddings@5.23.0
  - @memberjunction/ai-minimax@5.23.0
  - @memberjunction/ai-mistral@5.23.0
  - @memberjunction/ai-ollama@5.23.0
  - @memberjunction/ai-openai@5.23.0
  - @memberjunction/ai-openrouter@5.23.0
  - @memberjunction/ai-vertex@5.23.0
  - @memberjunction/ai-zhipu@5.23.0
  - @memberjunction/ai-xai@5.23.0
  - @memberjunction/ai-provider-bundle@5.23.0

## 5.22.0

### Minor Changes

- a42aba6: metadata

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [21e0b69]
- Updated dependencies [a42aba6]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/ai-agents@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/ai-vectors-pinecone@5.22.0
  - @memberjunction/ai-agent-manager@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/ai-reranker@5.22.0
  - @memberjunction/core-actions@5.22.0
  - @memberjunction/actions@5.22.0
  - @memberjunction/core-entities-server@5.22.0
  - @memberjunction/scheduling-engine@5.22.0
  - @memberjunction/templates@5.22.0
  - @memberjunction/testing-engine@5.22.0
  - @memberjunction/ai-recommendations-rex@5.22.0
  - @memberjunction/actions-apollo@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/actions-bizapps-accounting@5.22.0
  - @memberjunction/actions-bizapps-crm@5.22.0
  - @memberjunction/actions-bizapps-formbuilders@5.22.0
  - @memberjunction/actions-bizapps-lms@5.22.0
  - @memberjunction/actions-bizapps-social@5.22.0
  - @memberjunction/doc-utils@5.22.0
  - @memberjunction/encryption@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/data-context-server@5.22.0
  - @memberjunction/scheduling-actions@5.22.0
  - @memberjunction/scheduling-engine-base@5.22.0
  - @memberjunction/ai-provider-bundle@5.22.0
  - @memberjunction/ai-anthropic@5.22.0
  - @memberjunction/ai-azure@5.22.0
  - @memberjunction/ai-bedrock@5.22.0
  - @memberjunction/ai-betty-bot@5.22.0
  - @memberjunction/ai-blackforestlabs@5.22.0
  - @memberjunction/ai-cerebras@5.22.0
  - @memberjunction/ai-cohere@5.22.0
  - @memberjunction/ai-elevenlabs@5.22.0
  - @memberjunction/ai-fireworks@5.22.0
  - @memberjunction/ai-gemini@5.22.0
  - @memberjunction/ai-groq@5.22.0
  - @memberjunction/ai-heygen@5.22.0
  - @memberjunction/ai-lmstudio@5.22.0
  - @memberjunction/ai-local-embeddings@5.22.0
  - @memberjunction/ai-minimax@5.22.0
  - @memberjunction/ai-mistral@5.22.0
  - @memberjunction/ai-ollama@5.22.0
  - @memberjunction/ai-openai@5.22.0
  - @memberjunction/ai-openrouter@5.22.0
  - @memberjunction/ai-vertex@5.22.0
  - @memberjunction/ai-zhipu@5.22.0
  - @memberjunction/ai-xai@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [b29716c]
- Updated dependencies [76cd2bc]
  - @memberjunction/ai-vectors-pinecone@5.21.0
  - @memberjunction/core@5.21.0
  - @memberjunction/core-entities-server@5.21.0
  - @memberjunction/ai-agents@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ai-provider-bundle@5.21.0
  - @memberjunction/core-actions@5.21.0
  - @memberjunction/ai-agent-manager@5.21.0
  - @memberjunction/ai-engine-base@5.21.0
  - @memberjunction/ai-recommendations-rex@5.21.0
  - @memberjunction/ai-reranker@5.21.0
  - @memberjunction/actions-apollo@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/actions-bizapps-accounting@5.21.0
  - @memberjunction/actions-bizapps-crm@5.21.0
  - @memberjunction/actions-bizapps-formbuilders@5.21.0
  - @memberjunction/actions-bizapps-lms@5.21.0
  - @memberjunction/actions-bizapps-social@5.21.0
  - @memberjunction/actions@5.21.0
  - @memberjunction/doc-utils@5.21.0
  - @memberjunction/encryption@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/data-context-server@5.21.0
  - @memberjunction/scheduling-actions@5.21.0
  - @memberjunction/scheduling-engine-base@5.21.0
  - @memberjunction/scheduling-engine@5.21.0
  - @memberjunction/templates@5.21.0
  - @memberjunction/testing-engine@5.21.0
  - @memberjunction/ai-anthropic@5.21.0
  - @memberjunction/ai-azure@5.21.0
  - @memberjunction/ai-bedrock@5.21.0
  - @memberjunction/ai-betty-bot@5.21.0
  - @memberjunction/ai-blackforestlabs@5.21.0
  - @memberjunction/ai-cerebras@5.21.0
  - @memberjunction/ai-cohere@5.21.0
  - @memberjunction/ai-elevenlabs@5.21.0
  - @memberjunction/ai-fireworks@5.21.0
  - @memberjunction/ai-gemini@5.21.0
  - @memberjunction/ai-groq@5.21.0
  - @memberjunction/ai-heygen@5.21.0
  - @memberjunction/ai-lmstudio@5.21.0
  - @memberjunction/ai-local-embeddings@5.21.0
  - @memberjunction/ai-minimax@5.21.0
  - @memberjunction/ai-mistral@5.21.0
  - @memberjunction/ai-ollama@5.21.0
  - @memberjunction/ai-openai@5.21.0
  - @memberjunction/ai-openrouter@5.21.0
  - @memberjunction/ai-vertex@5.21.0
  - @memberjunction/ai-zhipu@5.21.0
  - @memberjunction/ai-xai@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [7ab01a8]
- Updated dependencies [2298f8a]
  - @memberjunction/ai-agents@5.20.0
  - @memberjunction/core@5.20.0
  - @memberjunction/core-actions@5.20.0
  - @memberjunction/core-entities-server@5.20.0
  - @memberjunction/ai-agent-manager@5.20.0
  - @memberjunction/scheduling-engine@5.20.0
  - @memberjunction/testing-engine@5.20.0
  - @memberjunction/ai-engine-base@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/ai-recommendations-rex@5.20.0
  - @memberjunction/ai-vectors-pinecone@5.20.0
  - @memberjunction/ai-reranker@5.20.0
  - @memberjunction/actions-apollo@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/actions-bizapps-accounting@5.20.0
  - @memberjunction/actions-bizapps-crm@5.20.0
  - @memberjunction/actions-bizapps-formbuilders@5.20.0
  - @memberjunction/actions-bizapps-lms@5.20.0
  - @memberjunction/actions-bizapps-social@5.20.0
  - @memberjunction/actions@5.20.0
  - @memberjunction/doc-utils@5.20.0
  - @memberjunction/encryption@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/data-context-server@5.20.0
  - @memberjunction/scheduling-actions@5.20.0
  - @memberjunction/scheduling-engine-base@5.20.0
  - @memberjunction/templates@5.20.0
  - @memberjunction/ai-provider-bundle@5.20.0
  - @memberjunction/ai-anthropic@5.20.0
  - @memberjunction/ai-azure@5.20.0
  - @memberjunction/ai-bedrock@5.20.0
  - @memberjunction/ai-betty-bot@5.20.0
  - @memberjunction/ai-blackforestlabs@5.20.0
  - @memberjunction/ai-cerebras@5.20.0
  - @memberjunction/ai-cohere@5.20.0
  - @memberjunction/ai-elevenlabs@5.20.0
  - @memberjunction/ai-fireworks@5.20.0
  - @memberjunction/ai-gemini@5.20.0
  - @memberjunction/ai-groq@5.20.0
  - @memberjunction/ai-heygen@5.20.0
  - @memberjunction/ai-lmstudio@5.20.0
  - @memberjunction/ai-local-embeddings@5.20.0
  - @memberjunction/ai-minimax@5.20.0
  - @memberjunction/ai-mistral@5.20.0
  - @memberjunction/ai-ollama@5.20.0
  - @memberjunction/ai-openai@5.20.0
  - @memberjunction/ai-openrouter@5.20.0
  - @memberjunction/ai-vertex@5.20.0
  - @memberjunction/ai-zhipu@5.20.0
  - @memberjunction/ai-xai@5.20.0

## 5.19.0

### Patch Changes

- Updated dependencies [f9001de]
  - @memberjunction/ai-agents@5.19.0
  - @memberjunction/ai-agent-manager@5.19.0
  - @memberjunction/core-actions@5.19.0
  - @memberjunction/scheduling-engine@5.19.0
  - @memberjunction/testing-engine@5.19.0
  - @memberjunction/ai-engine-base@5.19.0
  - @memberjunction/ai-core-plus@5.19.0
  - @memberjunction/ai-anthropic@5.19.0
  - @memberjunction/ai-azure@5.19.0
  - @memberjunction/ai-bedrock@5.19.0
  - @memberjunction/ai-betty-bot@5.19.0
  - @memberjunction/ai-blackforestlabs@5.19.0
  - @memberjunction/ai-provider-bundle@5.19.0
  - @memberjunction/ai-cerebras@5.19.0
  - @memberjunction/ai-cohere@5.19.0
  - @memberjunction/ai-elevenlabs@5.19.0
  - @memberjunction/ai-fireworks@5.19.0
  - @memberjunction/ai-gemini@5.19.0
  - @memberjunction/ai-groq@5.19.0
  - @memberjunction/ai-heygen@5.19.0
  - @memberjunction/ai-lmstudio@5.19.0
  - @memberjunction/ai-local-embeddings@5.19.0
  - @memberjunction/ai-minimax@5.19.0
  - @memberjunction/ai-mistral@5.19.0
  - @memberjunction/ai-ollama@5.19.0
  - @memberjunction/ai-openai@5.19.0
  - @memberjunction/ai-openrouter@5.19.0
  - @memberjunction/ai-recommendations-rex@5.19.0
  - @memberjunction/ai-vectors-pinecone@5.19.0
  - @memberjunction/ai-vertex@5.19.0
  - @memberjunction/ai-zhipu@5.19.0
  - @memberjunction/ai-xai@5.19.0
  - @memberjunction/ai-reranker@5.19.0
  - @memberjunction/actions-apollo@5.19.0
  - @memberjunction/actions-base@5.19.0
  - @memberjunction/actions-bizapps-accounting@5.19.0
  - @memberjunction/actions-bizapps-crm@5.19.0
  - @memberjunction/actions-bizapps-formbuilders@5.19.0
  - @memberjunction/actions-bizapps-lms@5.19.0
  - @memberjunction/actions-bizapps-social@5.19.0
  - @memberjunction/actions@5.19.0
  - @memberjunction/doc-utils@5.19.0
  - @memberjunction/encryption@5.19.0
  - @memberjunction/core@5.19.0
  - @memberjunction/core-entities@5.19.0
  - @memberjunction/core-entities-server@5.19.0
  - @memberjunction/data-context-server@5.19.0
  - @memberjunction/scheduling-actions@5.19.0
  - @memberjunction/scheduling-engine-base@5.19.0
  - @memberjunction/templates@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
- Updated dependencies [931740a]
- Updated dependencies [5f91957]
- Updated dependencies [ee4bf94]
  - @memberjunction/ai-agents@5.18.0
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/core-entities-server@5.18.0
  - @memberjunction/ai-agent-manager@5.18.0
  - @memberjunction/core-actions@5.18.0
  - @memberjunction/scheduling-engine@5.18.0
  - @memberjunction/testing-engine@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/ai-reranker@5.18.0
  - @memberjunction/actions@5.18.0
  - @memberjunction/templates@5.18.0
  - @memberjunction/ai-vectors-pinecone@5.18.0
  - @memberjunction/actions-apollo@5.18.0
  - @memberjunction/actions-bizapps-accounting@5.18.0
  - @memberjunction/actions-bizapps-crm@5.18.0
  - @memberjunction/actions-bizapps-formbuilders@5.18.0
  - @memberjunction/actions-bizapps-lms@5.18.0
  - @memberjunction/actions-bizapps-social@5.18.0
  - @memberjunction/scheduling-actions@5.18.0
  - @memberjunction/ai-provider-bundle@5.18.0
  - @memberjunction/ai-anthropic@5.18.0
  - @memberjunction/ai-azure@5.18.0
  - @memberjunction/ai-bedrock@5.18.0
  - @memberjunction/ai-betty-bot@5.18.0
  - @memberjunction/ai-blackforestlabs@5.18.0
  - @memberjunction/ai-cerebras@5.18.0
  - @memberjunction/ai-cohere@5.18.0
  - @memberjunction/ai-elevenlabs@5.18.0
  - @memberjunction/ai-fireworks@5.18.0
  - @memberjunction/ai-gemini@5.18.0
  - @memberjunction/ai-groq@5.18.0
  - @memberjunction/ai-heygen@5.18.0
  - @memberjunction/ai-lmstudio@5.18.0
  - @memberjunction/ai-local-embeddings@5.18.0
  - @memberjunction/ai-minimax@5.18.0
  - @memberjunction/ai-mistral@5.18.0
  - @memberjunction/ai-ollama@5.18.0
  - @memberjunction/ai-openai@5.18.0
  - @memberjunction/ai-openrouter@5.18.0
  - @memberjunction/ai-recommendations-rex@5.18.0
  - @memberjunction/ai-vertex@5.18.0
  - @memberjunction/ai-zhipu@5.18.0
  - @memberjunction/ai-xai@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/doc-utils@5.18.0
  - @memberjunction/encryption@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/data-context-server@5.18.0
  - @memberjunction/scheduling-engine-base@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [4b6fd2a]
- Updated dependencies [9881045]
  - @memberjunction/core-entities-server@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/core-actions@5.17.0
  - @memberjunction/scheduling-engine@5.17.0
  - @memberjunction/ai-agent-manager@5.17.0
  - @memberjunction/ai-agents@5.17.0
  - @memberjunction/ai-engine-base@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/ai-recommendations-rex@5.17.0
  - @memberjunction/ai-vectors-pinecone@5.17.0
  - @memberjunction/ai-reranker@5.17.0
  - @memberjunction/actions-apollo@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/actions-bizapps-accounting@5.17.0
  - @memberjunction/actions-bizapps-crm@5.17.0
  - @memberjunction/actions-bizapps-formbuilders@5.17.0
  - @memberjunction/actions-bizapps-lms@5.17.0
  - @memberjunction/actions-bizapps-social@5.17.0
  - @memberjunction/actions@5.17.0
  - @memberjunction/doc-utils@5.17.0
  - @memberjunction/encryption@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/data-context-server@5.17.0
  - @memberjunction/scheduling-actions@5.17.0
  - @memberjunction/scheduling-engine-base@5.17.0
  - @memberjunction/templates@5.17.0
  - @memberjunction/testing-engine@5.17.0
  - @memberjunction/ai-provider-bundle@5.17.0
  - @memberjunction/ai-anthropic@5.17.0
  - @memberjunction/ai-azure@5.17.0
  - @memberjunction/ai-bedrock@5.17.0
  - @memberjunction/ai-betty-bot@5.17.0
  - @memberjunction/ai-blackforestlabs@5.17.0
  - @memberjunction/ai-cerebras@5.17.0
  - @memberjunction/ai-cohere@5.17.0
  - @memberjunction/ai-elevenlabs@5.17.0
  - @memberjunction/ai-fireworks@5.17.0
  - @memberjunction/ai-gemini@5.17.0
  - @memberjunction/ai-groq@5.17.0
  - @memberjunction/ai-heygen@5.17.0
  - @memberjunction/ai-lmstudio@5.17.0
  - @memberjunction/ai-local-embeddings@5.17.0
  - @memberjunction/ai-minimax@5.17.0
  - @memberjunction/ai-mistral@5.17.0
  - @memberjunction/ai-ollama@5.17.0
  - @memberjunction/ai-openai@5.17.0
  - @memberjunction/ai-openrouter@5.17.0
  - @memberjunction/ai-vertex@5.17.0
  - @memberjunction/ai-zhipu@5.17.0
  - @memberjunction/ai-xai@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ai-agent-manager@5.16.0
  - @memberjunction/ai-agents@5.16.0
  - @memberjunction/ai-engine-base@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/ai-recommendations-rex@5.16.0
  - @memberjunction/ai-vectors-pinecone@5.16.0
  - @memberjunction/ai-reranker@5.16.0
  - @memberjunction/actions-apollo@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/actions-bizapps-accounting@5.16.0
  - @memberjunction/actions-bizapps-crm@5.16.0
  - @memberjunction/actions-bizapps-formbuilders@5.16.0
  - @memberjunction/actions-bizapps-lms@5.16.0
  - @memberjunction/actions-bizapps-social@5.16.0
  - @memberjunction/core-actions@5.16.0
  - @memberjunction/actions@5.16.0
  - @memberjunction/doc-utils@5.16.0
  - @memberjunction/encryption@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/core-entities-server@5.16.0
  - @memberjunction/data-context-server@5.16.0
  - @memberjunction/scheduling-actions@5.16.0
  - @memberjunction/scheduling-engine-base@5.16.0
  - @memberjunction/scheduling-engine@5.16.0
  - @memberjunction/templates@5.16.0
  - @memberjunction/testing-engine@5.16.0
  - @memberjunction/ai-provider-bundle@5.16.0
  - @memberjunction/ai-anthropic@5.16.0
  - @memberjunction/ai-azure@5.16.0
  - @memberjunction/ai-bedrock@5.16.0
  - @memberjunction/ai-betty-bot@5.16.0
  - @memberjunction/ai-blackforestlabs@5.16.0
  - @memberjunction/ai-cerebras@5.16.0
  - @memberjunction/ai-cohere@5.16.0
  - @memberjunction/ai-elevenlabs@5.16.0
  - @memberjunction/ai-fireworks@5.16.0
  - @memberjunction/ai-gemini@5.16.0
  - @memberjunction/ai-groq@5.16.0
  - @memberjunction/ai-heygen@5.16.0
  - @memberjunction/ai-lmstudio@5.16.0
  - @memberjunction/ai-local-embeddings@5.16.0
  - @memberjunction/ai-minimax@5.16.0
  - @memberjunction/ai-mistral@5.16.0
  - @memberjunction/ai-ollama@5.16.0
  - @memberjunction/ai-openai@5.16.0
  - @memberjunction/ai-openrouter@5.16.0
  - @memberjunction/ai-vertex@5.16.0
  - @memberjunction/ai-zhipu@5.16.0
  - @memberjunction/ai-xai@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [95a7b8e]
- Updated dependencies [2488c5c]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/core-entities-server@5.15.0
  - @memberjunction/core-actions@5.15.0
  - @memberjunction/actions-bizapps-crm@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-anthropic@5.15.0
  - @memberjunction/ai-azure@5.15.0
  - @memberjunction/ai-bedrock@5.15.0
  - @memberjunction/ai-betty-bot@5.15.0
  - @memberjunction/ai-blackforestlabs@5.15.0
  - @memberjunction/ai-provider-bundle@5.15.0
  - @memberjunction/ai-cerebras@5.15.0
  - @memberjunction/ai-cohere@5.15.0
  - @memberjunction/ai-elevenlabs@5.15.0
  - @memberjunction/ai-fireworks@5.15.0
  - @memberjunction/ai-gemini@5.15.0
  - @memberjunction/ai-groq@5.15.0
  - @memberjunction/ai-heygen@5.15.0
  - @memberjunction/ai-lmstudio@5.15.0
  - @memberjunction/ai-local-embeddings@5.15.0
  - @memberjunction/ai-minimax@5.15.0
  - @memberjunction/ai-mistral@5.15.0
  - @memberjunction/ai-ollama@5.15.0
  - @memberjunction/ai-openai@5.15.0
  - @memberjunction/ai-openrouter@5.15.0
  - @memberjunction/ai-vectors-pinecone@5.15.0
  - @memberjunction/ai-vertex@5.15.0
  - @memberjunction/ai-zhipu@5.15.0
  - @memberjunction/ai-xai@5.15.0
  - @memberjunction/ai-agent-manager@5.15.0
  - @memberjunction/ai-agents@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/ai-recommendations-rex@5.15.0
  - @memberjunction/ai-reranker@5.15.0
  - @memberjunction/actions-apollo@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/actions-bizapps-accounting@5.15.0
  - @memberjunction/actions-bizapps-formbuilders@5.15.0
  - @memberjunction/actions-bizapps-lms@5.15.0
  - @memberjunction/actions-bizapps-social@5.15.0
  - @memberjunction/actions@5.15.0
  - @memberjunction/doc-utils@5.15.0
  - @memberjunction/encryption@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/data-context-server@5.15.0
  - @memberjunction/scheduling-actions@5.15.0
  - @memberjunction/scheduling-engine-base@5.15.0
  - @memberjunction/scheduling-engine@5.15.0
  - @memberjunction/templates@5.15.0
  - @memberjunction/testing-engine@5.15.0

## 5.14.0

### Patch Changes

- 69b5af4: Add TestQuerySQL resolver and client method for query execution testing, refactor CreateQueryResolver into QuerySystemUserResolver composing CodeGen-generated MJQuery\_ types, add lightweight query catalog for collision detection, unit tests for transitive template composition and ORDER BY stripping, and updated class registration manifests
- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/ai-openai@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/core-actions@5.14.0
  - @memberjunction/actions@5.14.0
  - @memberjunction/ai-agent-manager@5.14.0
  - @memberjunction/ai-agents@5.14.0
  - @memberjunction/ai-engine-base@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/ai-recommendations-rex@5.14.0
  - @memberjunction/ai-vectors-pinecone@5.14.0
  - @memberjunction/ai-reranker@5.14.0
  - @memberjunction/actions-apollo@5.14.0
  - @memberjunction/actions-bizapps-accounting@5.14.0
  - @memberjunction/actions-bizapps-crm@5.14.0
  - @memberjunction/actions-bizapps-formbuilders@5.14.0
  - @memberjunction/actions-bizapps-lms@5.14.0
  - @memberjunction/actions-bizapps-social@5.14.0
  - @memberjunction/doc-utils@5.14.0
  - @memberjunction/encryption@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/core-entities-server@5.14.0
  - @memberjunction/data-context-server@5.14.0
  - @memberjunction/scheduling-actions@5.14.0
  - @memberjunction/scheduling-engine-base@5.14.0
  - @memberjunction/scheduling-engine@5.14.0
  - @memberjunction/templates@5.14.0
  - @memberjunction/testing-engine@5.14.0
  - @memberjunction/ai-provider-bundle@5.14.0
  - @memberjunction/ai-minimax@5.14.0
  - @memberjunction/ai-openrouter@5.14.0
  - @memberjunction/ai-zhipu@5.14.0
  - @memberjunction/ai-xai@5.14.0
  - @memberjunction/ai-anthropic@5.14.0
  - @memberjunction/ai-azure@5.14.0
  - @memberjunction/ai-bedrock@5.14.0
  - @memberjunction/ai-betty-bot@5.14.0
  - @memberjunction/ai-blackforestlabs@5.14.0
  - @memberjunction/ai-cerebras@5.14.0
  - @memberjunction/ai-cohere@5.14.0
  - @memberjunction/ai-elevenlabs@5.14.0
  - @memberjunction/ai-fireworks@5.14.0
  - @memberjunction/ai-gemini@5.14.0
  - @memberjunction/ai-groq@5.14.0
  - @memberjunction/ai-heygen@5.14.0
  - @memberjunction/ai-lmstudio@5.14.0
  - @memberjunction/ai-local-embeddings@5.14.0
  - @memberjunction/ai-mistral@5.14.0
  - @memberjunction/ai-ollama@5.14.0
  - @memberjunction/ai-vertex@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/core-actions@5.13.0
  - @memberjunction/ai-agent-manager@5.13.0
  - @memberjunction/ai-agents@5.13.0
  - @memberjunction/ai-engine-base@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/ai-recommendations-rex@5.13.0
  - @memberjunction/ai-vectors-pinecone@5.13.0
  - @memberjunction/ai-reranker@5.13.0
  - @memberjunction/actions-apollo@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/actions-bizapps-accounting@5.13.0
  - @memberjunction/actions-bizapps-crm@5.13.0
  - @memberjunction/actions-bizapps-formbuilders@5.13.0
  - @memberjunction/actions-bizapps-lms@5.13.0
  - @memberjunction/actions-bizapps-social@5.13.0
  - @memberjunction/actions@5.13.0
  - @memberjunction/doc-utils@5.13.0
  - @memberjunction/encryption@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/core-entities-server@5.13.0
  - @memberjunction/data-context-server@5.13.0
  - @memberjunction/scheduling-actions@5.13.0
  - @memberjunction/scheduling-engine-base@5.13.0
  - @memberjunction/scheduling-engine@5.13.0
  - @memberjunction/templates@5.13.0
  - @memberjunction/testing-engine@5.13.0
  - @memberjunction/ai-anthropic@5.13.0
  - @memberjunction/ai-azure@5.13.0
  - @memberjunction/ai-bedrock@5.13.0
  - @memberjunction/ai-betty-bot@5.13.0
  - @memberjunction/ai-blackforestlabs@5.13.0
  - @memberjunction/ai-cerebras@5.13.0
  - @memberjunction/ai-cohere@5.13.0
  - @memberjunction/ai-elevenlabs@5.13.0
  - @memberjunction/ai-fireworks@5.13.0
  - @memberjunction/ai-gemini@5.13.0
  - @memberjunction/ai-groq@5.13.0
  - @memberjunction/ai-heygen@5.13.0
  - @memberjunction/ai-lmstudio@5.13.0
  - @memberjunction/ai-local-embeddings@5.13.0
  - @memberjunction/ai-minimax@5.13.0
  - @memberjunction/ai-mistral@5.13.0
  - @memberjunction/ai-ollama@5.13.0
  - @memberjunction/ai-openai@5.13.0
  - @memberjunction/ai-openrouter@5.13.0
  - @memberjunction/ai-vertex@5.13.0
  - @memberjunction/ai-zhipu@5.13.0
  - @memberjunction/ai-xai@5.13.0
  - @memberjunction/ai-provider-bundle@5.13.0

## 5.12.0

### Minor Changes

- 1e5d181: migration

### Patch Changes

- 7def002: Fix ExternalChangeDetection unquoted string IDs and log spam, add /healthcheck endpoint before auth middleware, return TechnicalDescription in CreateQuery/UpdateQuery mutations, and improve MJCLI config validation errors with env var hints
- Updated dependencies [05f19ff]
- Updated dependencies [c21c28c]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/core-actions@5.12.0
  - @memberjunction/core-entities-server@5.12.0
  - @memberjunction/ai-agents@5.12.0
  - @memberjunction/ai-azure@5.12.0
  - @memberjunction/ai-bedrock@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/scheduling-engine@5.12.0
  - @memberjunction/ai-agent-manager@5.12.0
  - @memberjunction/ai-engine-base@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/ai-recommendations-rex@5.12.0
  - @memberjunction/ai-vectors-pinecone@5.12.0
  - @memberjunction/ai-reranker@5.12.0
  - @memberjunction/actions-apollo@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/actions-bizapps-accounting@5.12.0
  - @memberjunction/actions-bizapps-crm@5.12.0
  - @memberjunction/actions-bizapps-formbuilders@5.12.0
  - @memberjunction/actions-bizapps-lms@5.12.0
  - @memberjunction/actions-bizapps-social@5.12.0
  - @memberjunction/actions@5.12.0
  - @memberjunction/doc-utils@5.12.0
  - @memberjunction/encryption@5.12.0
  - @memberjunction/data-context-server@5.12.0
  - @memberjunction/scheduling-actions@5.12.0
  - @memberjunction/scheduling-engine-base@5.12.0
  - @memberjunction/templates@5.12.0
  - @memberjunction/testing-engine@5.12.0
  - @memberjunction/ai-provider-bundle@5.12.0
  - @memberjunction/ai-anthropic@5.12.0
  - @memberjunction/ai-betty-bot@5.12.0
  - @memberjunction/ai-blackforestlabs@5.12.0
  - @memberjunction/ai-cerebras@5.12.0
  - @memberjunction/ai-cohere@5.12.0
  - @memberjunction/ai-elevenlabs@5.12.0
  - @memberjunction/ai-fireworks@5.12.0
  - @memberjunction/ai-gemini@5.12.0
  - @memberjunction/ai-groq@5.12.0
  - @memberjunction/ai-heygen@5.12.0
  - @memberjunction/ai-lmstudio@5.12.0
  - @memberjunction/ai-local-embeddings@5.12.0
  - @memberjunction/ai-minimax@5.12.0
  - @memberjunction/ai-mistral@5.12.0
  - @memberjunction/ai-ollama@5.12.0
  - @memberjunction/ai-openai@5.12.0
  - @memberjunction/ai-openrouter@5.12.0
  - @memberjunction/ai-vertex@5.12.0
  - @memberjunction/ai-zhipu@5.12.0
  - @memberjunction/ai-xai@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
- Updated dependencies [0dca9db]
  - @memberjunction/core@5.11.0
  - @memberjunction/ai-agents@5.11.0
  - @memberjunction/ai-agent-manager@5.11.0
  - @memberjunction/ai-engine-base@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/ai-recommendations-rex@5.11.0
  - @memberjunction/ai-vectors-pinecone@5.11.0
  - @memberjunction/ai-reranker@5.11.0
  - @memberjunction/actions-apollo@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/actions-bizapps-accounting@5.11.0
  - @memberjunction/actions-bizapps-crm@5.11.0
  - @memberjunction/actions-bizapps-formbuilders@5.11.0
  - @memberjunction/actions-bizapps-lms@5.11.0
  - @memberjunction/actions-bizapps-social@5.11.0
  - @memberjunction/core-actions@5.11.0
  - @memberjunction/actions@5.11.0
  - @memberjunction/doc-utils@5.11.0
  - @memberjunction/encryption@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/core-entities-server@5.11.0
  - @memberjunction/data-context-server@5.11.0
  - @memberjunction/scheduling-actions@5.11.0
  - @memberjunction/scheduling-engine-base@5.11.0
  - @memberjunction/scheduling-engine@5.11.0
  - @memberjunction/templates@5.11.0
  - @memberjunction/testing-engine@5.11.0
  - @memberjunction/ai-provider-bundle@5.11.0
  - @memberjunction/ai-anthropic@5.11.0
  - @memberjunction/ai-azure@5.11.0
  - @memberjunction/ai-bedrock@5.11.0
  - @memberjunction/ai-betty-bot@5.11.0
  - @memberjunction/ai-blackforestlabs@5.11.0
  - @memberjunction/ai-cerebras@5.11.0
  - @memberjunction/ai-cohere@5.11.0
  - @memberjunction/ai-elevenlabs@5.11.0
  - @memberjunction/ai-fireworks@5.11.0
  - @memberjunction/ai-gemini@5.11.0
  - @memberjunction/ai-groq@5.11.0
  - @memberjunction/ai-heygen@5.11.0
  - @memberjunction/ai-lmstudio@5.11.0
  - @memberjunction/ai-local-embeddings@5.11.0
  - @memberjunction/ai-minimax@5.11.0
  - @memberjunction/ai-mistral@5.11.0
  - @memberjunction/ai-ollama@5.11.0
  - @memberjunction/ai-openai@5.11.0
  - @memberjunction/ai-openrouter@5.11.0
  - @memberjunction/ai-vertex@5.11.0
  - @memberjunction/ai-zhipu@5.11.0
  - @memberjunction/ai-xai@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-agent-manager@5.10.1
- @memberjunction/ai-agents@5.10.1
- @memberjunction/ai-engine-base@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/ai-anthropic@5.10.1
- @memberjunction/ai-azure@5.10.1
- @memberjunction/ai-bedrock@5.10.1
- @memberjunction/ai-betty-bot@5.10.1
- @memberjunction/ai-blackforestlabs@5.10.1
- @memberjunction/ai-provider-bundle@5.10.1
- @memberjunction/ai-cerebras@5.10.1
- @memberjunction/ai-cohere@5.10.1
- @memberjunction/ai-elevenlabs@5.10.1
- @memberjunction/ai-fireworks@5.10.1
- @memberjunction/ai-gemini@5.10.1
- @memberjunction/ai-groq@5.10.1
- @memberjunction/ai-heygen@5.10.1
- @memberjunction/ai-lmstudio@5.10.1
- @memberjunction/ai-local-embeddings@5.10.1
- @memberjunction/ai-minimax@5.10.1
- @memberjunction/ai-mistral@5.10.1
- @memberjunction/ai-ollama@5.10.1
- @memberjunction/ai-openai@5.10.1
- @memberjunction/ai-openrouter@5.10.1
- @memberjunction/ai-recommendations-rex@5.10.1
- @memberjunction/ai-vectors-pinecone@5.10.1
- @memberjunction/ai-vertex@5.10.1
- @memberjunction/ai-zhipu@5.10.1
- @memberjunction/ai-xai@5.10.1
- @memberjunction/ai-reranker@5.10.1
- @memberjunction/actions-apollo@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/actions-bizapps-accounting@5.10.1
- @memberjunction/actions-bizapps-crm@5.10.1
- @memberjunction/actions-bizapps-formbuilders@5.10.1
- @memberjunction/actions-bizapps-lms@5.10.1
- @memberjunction/actions-bizapps-social@5.10.1
- @memberjunction/core-actions@5.10.1
- @memberjunction/actions@5.10.1
- @memberjunction/doc-utils@5.10.1
- @memberjunction/encryption@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/core-entities-server@5.10.1
- @memberjunction/data-context-server@5.10.1
- @memberjunction/scheduling-actions@5.10.1
- @memberjunction/scheduling-engine-base@5.10.1
- @memberjunction/scheduling-engine@5.10.1
- @memberjunction/templates@5.10.1
- @memberjunction/testing-engine@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ai-engine-base@5.10.0
  - @memberjunction/ai-agent-manager@5.10.0
  - @memberjunction/ai-agents@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/ai-recommendations-rex@5.10.0
  - @memberjunction/ai-vectors-pinecone@5.10.0
  - @memberjunction/ai-reranker@5.10.0
  - @memberjunction/actions-apollo@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/actions-bizapps-accounting@5.10.0
  - @memberjunction/actions-bizapps-crm@5.10.0
  - @memberjunction/actions-bizapps-formbuilders@5.10.0
  - @memberjunction/actions-bizapps-lms@5.10.0
  - @memberjunction/actions-bizapps-social@5.10.0
  - @memberjunction/core-actions@5.10.0
  - @memberjunction/actions@5.10.0
  - @memberjunction/doc-utils@5.10.0
  - @memberjunction/encryption@5.10.0
  - @memberjunction/core-entities-server@5.10.0
  - @memberjunction/data-context-server@5.10.0
  - @memberjunction/scheduling-actions@5.10.0
  - @memberjunction/scheduling-engine-base@5.10.0
  - @memberjunction/scheduling-engine@5.10.0
  - @memberjunction/templates@5.10.0
  - @memberjunction/testing-engine@5.10.0
  - @memberjunction/ai-provider-bundle@5.10.0
  - @memberjunction/ai-anthropic@5.10.0
  - @memberjunction/ai-azure@5.10.0
  - @memberjunction/ai-bedrock@5.10.0
  - @memberjunction/ai-betty-bot@5.10.0
  - @memberjunction/ai-blackforestlabs@5.10.0
  - @memberjunction/ai-cerebras@5.10.0
  - @memberjunction/ai-cohere@5.10.0
  - @memberjunction/ai-elevenlabs@5.10.0
  - @memberjunction/ai-fireworks@5.10.0
  - @memberjunction/ai-gemini@5.10.0
  - @memberjunction/ai-groq@5.10.0
  - @memberjunction/ai-heygen@5.10.0
  - @memberjunction/ai-lmstudio@5.10.0
  - @memberjunction/ai-local-embeddings@5.10.0
  - @memberjunction/ai-minimax@5.10.0
  - @memberjunction/ai-mistral@5.10.0
  - @memberjunction/ai-ollama@5.10.0
  - @memberjunction/ai-openai@5.10.0
  - @memberjunction/ai-openrouter@5.10.0
  - @memberjunction/ai-vertex@5.10.0
  - @memberjunction/ai-zhipu@5.10.0
  - @memberjunction/ai-xai@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-actions@5.9.0
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai-agent-manager@5.9.0
  - @memberjunction/ai-agents@5.9.0
  - @memberjunction/ai-engine-base@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/ai-recommendations-rex@5.9.0
  - @memberjunction/ai-reranker@5.9.0
  - @memberjunction/actions-apollo@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/actions-bizapps-accounting@5.9.0
  - @memberjunction/actions-bizapps-crm@5.9.0
  - @memberjunction/actions-bizapps-formbuilders@5.9.0
  - @memberjunction/actions-bizapps-lms@5.9.0
  - @memberjunction/actions-bizapps-social@5.9.0
  - @memberjunction/actions@5.9.0
  - @memberjunction/doc-utils@5.9.0
  - @memberjunction/encryption@5.9.0
  - @memberjunction/core-entities-server@5.9.0
  - @memberjunction/scheduling-actions@5.9.0
  - @memberjunction/scheduling-engine-base@5.9.0
  - @memberjunction/scheduling-engine@5.9.0
  - @memberjunction/templates@5.9.0
  - @memberjunction/testing-engine@5.9.0
  - @memberjunction/ai-anthropic@5.9.0
  - @memberjunction/ai-azure@5.9.0
  - @memberjunction/ai-bedrock@5.9.0
  - @memberjunction/ai-betty-bot@5.9.0
  - @memberjunction/ai-blackforestlabs@5.9.0
  - @memberjunction/ai-cerebras@5.9.0
  - @memberjunction/ai-cohere@5.9.0
  - @memberjunction/ai-elevenlabs@5.9.0
  - @memberjunction/ai-fireworks@5.9.0
  - @memberjunction/ai-gemini@5.9.0
  - @memberjunction/ai-groq@5.9.0
  - @memberjunction/ai-heygen@5.9.0
  - @memberjunction/ai-lmstudio@5.9.0
  - @memberjunction/ai-local-embeddings@5.9.0
  - @memberjunction/ai-minimax@5.9.0
  - @memberjunction/ai-mistral@5.9.0
  - @memberjunction/ai-ollama@5.9.0
  - @memberjunction/ai-openai@5.9.0
  - @memberjunction/ai-openrouter@5.9.0
  - @memberjunction/ai-vectors-pinecone@5.9.0
  - @memberjunction/ai-vertex@5.9.0
  - @memberjunction/ai-zhipu@5.9.0
  - @memberjunction/ai-xai@5.9.0
  - @memberjunction/data-context-server@5.9.0
  - @memberjunction/ai-provider-bundle@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [4b26456]
- Updated dependencies [0753249]
  - @memberjunction/actions-bizapps-lms@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/ai-agent-manager@5.8.0
  - @memberjunction/ai-agents@5.8.0
  - @memberjunction/ai-engine-base@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/ai-reranker@5.8.0
  - @memberjunction/actions-apollo@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/actions-bizapps-accounting@5.8.0
  - @memberjunction/actions-bizapps-crm@5.8.0
  - @memberjunction/actions-bizapps-formbuilders@5.8.0
  - @memberjunction/actions-bizapps-social@5.8.0
  - @memberjunction/core-actions@5.8.0
  - @memberjunction/actions@5.8.0
  - @memberjunction/doc-utils@5.8.0
  - @memberjunction/encryption@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/core-entities-server@5.8.0
  - @memberjunction/data-context-server@5.8.0
  - @memberjunction/scheduling-actions@5.8.0
  - @memberjunction/scheduling-engine-base@5.8.0
  - @memberjunction/scheduling-engine@5.8.0
  - @memberjunction/templates@5.8.0
  - @memberjunction/testing-engine@5.8.0
  - @memberjunction/ai-provider-bundle@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai-agents@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-engine-base@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/ai-reranker@5.7.0
  - @memberjunction/core-actions@5.7.0
  - @memberjunction/actions@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/core-entities-server@5.7.0
  - @memberjunction/templates@5.7.0
  - @memberjunction/testing-engine@5.7.0
  - @memberjunction/ai-agent-manager@5.7.0
  - @memberjunction/scheduling-engine@5.7.0
  - @memberjunction/actions-apollo@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/actions-bizapps-accounting@5.7.0
  - @memberjunction/actions-bizapps-crm@5.7.0
  - @memberjunction/actions-bizapps-formbuilders@5.7.0
  - @memberjunction/actions-bizapps-lms@5.7.0
  - @memberjunction/actions-bizapps-social@5.7.0
  - @memberjunction/doc-utils@5.7.0
  - @memberjunction/encryption@5.7.0
  - @memberjunction/data-context-server@5.7.0
  - @memberjunction/scheduling-actions@5.7.0
  - @memberjunction/scheduling-engine-base@5.7.0
  - @memberjunction/ai-provider-bundle@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [cf9ac82]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/core-actions@5.6.0
  - @memberjunction/ai-agent-manager@5.6.0
  - @memberjunction/ai-agents@5.6.0
  - @memberjunction/ai-engine-base@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/ai-reranker@5.6.0
  - @memberjunction/actions-apollo@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/actions-bizapps-accounting@5.6.0
  - @memberjunction/actions-bizapps-crm@5.6.0
  - @memberjunction/actions-bizapps-formbuilders@5.6.0
  - @memberjunction/actions-bizapps-lms@5.6.0
  - @memberjunction/actions-bizapps-social@5.6.0
  - @memberjunction/actions@5.6.0
  - @memberjunction/doc-utils@5.6.0
  - @memberjunction/encryption@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/core-entities-server@5.6.0
  - @memberjunction/data-context-server@5.6.0
  - @memberjunction/scheduling-actions@5.6.0
  - @memberjunction/scheduling-engine-base@5.6.0
  - @memberjunction/scheduling-engine@5.6.0
  - @memberjunction/templates@5.6.0
  - @memberjunction/testing-engine@5.6.0
  - @memberjunction/ai-provider-bundle@5.6.0

## 5.5.0

### Patch Changes

- a1648c5: Add MiniMax AI provider package, add MiniMax and Gemini 3.1 Pro models to AI model catalog, fix ng-conversations to prevent client from overwriting server-completed conversation details, and align metadata files with SQL logger output to prevent phantom mj-sync updates
- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [2973c64]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/ai-provider-bundle@5.5.0
  - @memberjunction/ai-agents@5.5.0
  - @memberjunction/ai-agent-manager@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/core-entities-server@5.5.0
  - @memberjunction/ai-engine-base@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/ai-reranker@5.5.0
  - @memberjunction/actions-apollo@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/actions-bizapps-accounting@5.5.0
  - @memberjunction/actions-bizapps-crm@5.5.0
  - @memberjunction/actions-bizapps-formbuilders@5.5.0
  - @memberjunction/actions-bizapps-lms@5.5.0
  - @memberjunction/actions-bizapps-social@5.5.0
  - @memberjunction/core-actions@5.5.0
  - @memberjunction/actions@5.5.0
  - @memberjunction/doc-utils@5.5.0
  - @memberjunction/encryption@5.5.0
  - @memberjunction/data-context-server@5.5.0
  - @memberjunction/scheduling-actions@5.5.0
  - @memberjunction/scheduling-engine-base@5.5.0
  - @memberjunction/scheduling-engine@5.5.0
  - @memberjunction/templates@5.5.0
  - @memberjunction/testing-engine@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai-agent-manager@5.4.1
- @memberjunction/ai-agents@5.4.1
- @memberjunction/ai-engine-base@5.4.1
- @memberjunction/ai-core-plus@5.4.1
- @memberjunction/ai-provider-bundle@5.4.1
- @memberjunction/ai-reranker@5.4.1
- @memberjunction/actions-apollo@5.4.1
- @memberjunction/actions-base@5.4.1
- @memberjunction/actions-bizapps-accounting@5.4.1
- @memberjunction/actions-bizapps-crm@5.4.1
- @memberjunction/actions-bizapps-formbuilders@5.4.1
- @memberjunction/actions-bizapps-lms@5.4.1
- @memberjunction/actions-bizapps-social@5.4.1
- @memberjunction/core-actions@5.4.1
- @memberjunction/actions@5.4.1
- @memberjunction/doc-utils@5.4.1
- @memberjunction/encryption@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/core-entities-server@5.4.1
- @memberjunction/data-context-server@5.4.1
- @memberjunction/scheduling-actions@5.4.1
- @memberjunction/scheduling-engine-base@5.4.1
- @memberjunction/scheduling-engine@5.4.1
- @memberjunction/templates@5.4.1
- @memberjunction/testing-engine@5.4.1

## 5.4.0

### Patch Changes

- c9a760c: no migration
- Updated dependencies [c9a760c]
- Updated dependencies [bc993b8]
- Updated dependencies [cde53a9]
- Updated dependencies [9604926]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ai-agents@5.4.0
  - @memberjunction/actions-bizapps-lms@5.4.0
  - @memberjunction/ai-agent-manager@5.4.0
  - @memberjunction/ai-engine-base@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/ai-reranker@5.4.0
  - @memberjunction/actions-apollo@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/actions-bizapps-accounting@5.4.0
  - @memberjunction/actions-bizapps-crm@5.4.0
  - @memberjunction/actions-bizapps-formbuilders@5.4.0
  - @memberjunction/actions-bizapps-social@5.4.0
  - @memberjunction/core-actions@5.4.0
  - @memberjunction/actions@5.4.0
  - @memberjunction/doc-utils@5.4.0
  - @memberjunction/encryption@5.4.0
  - @memberjunction/core-entities-server@5.4.0
  - @memberjunction/scheduling-actions@5.4.0
  - @memberjunction/scheduling-engine-base@5.4.0
  - @memberjunction/scheduling-engine@5.4.0
  - @memberjunction/templates@5.4.0
  - @memberjunction/testing-engine@5.4.0
  - @memberjunction/ai-provider-bundle@5.4.0
  - @memberjunction/data-context-server@5.4.0
  - @memberjunction/core@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-agent-manager@5.3.1
- @memberjunction/ai-agents@5.3.1
- @memberjunction/ai-engine-base@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/ai-provider-bundle@5.3.1
- @memberjunction/ai-reranker@5.3.1
- @memberjunction/actions-apollo@5.3.1
- @memberjunction/actions-base@5.3.1
- @memberjunction/actions-bizapps-accounting@5.3.1
- @memberjunction/actions-bizapps-crm@5.3.1
- @memberjunction/actions-bizapps-formbuilders@5.3.1
- @memberjunction/actions-bizapps-lms@5.3.1
- @memberjunction/actions-bizapps-social@5.3.1
- @memberjunction/core-actions@5.3.1
- @memberjunction/actions@5.3.1
- @memberjunction/doc-utils@5.3.1
- @memberjunction/encryption@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/core-entities-server@5.3.1
- @memberjunction/data-context-server@5.3.1
- @memberjunction/scheduling-actions@5.3.1
- @memberjunction/scheduling-engine-base@5.3.1
- @memberjunction/scheduling-engine@5.3.1
- @memberjunction/templates@5.3.1
- @memberjunction/testing-engine@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [ebf057a]
- Updated dependencies [1692c53]
  - @memberjunction/ai-agents@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ai-agent-manager@5.3.0
  - @memberjunction/core-actions@5.3.0
  - @memberjunction/scheduling-engine@5.3.0
  - @memberjunction/testing-engine@5.3.0
  - @memberjunction/ai-engine-base@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/ai-reranker@5.3.0
  - @memberjunction/actions-apollo@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/actions-bizapps-accounting@5.3.0
  - @memberjunction/actions-bizapps-crm@5.3.0
  - @memberjunction/actions-bizapps-formbuilders@5.3.0
  - @memberjunction/actions-bizapps-lms@5.3.0
  - @memberjunction/actions-bizapps-social@5.3.0
  - @memberjunction/actions@5.3.0
  - @memberjunction/doc-utils@5.3.0
  - @memberjunction/encryption@5.3.0
  - @memberjunction/core-entities-server@5.3.0
  - @memberjunction/scheduling-actions@5.3.0
  - @memberjunction/scheduling-engine-base@5.3.0
  - @memberjunction/templates@5.3.0
  - @memberjunction/ai-provider-bundle@5.3.0
  - @memberjunction/data-context-server@5.3.0
  - @memberjunction/core@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core-entities-server@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/doc-utils@5.2.0
  - @memberjunction/ai-agent-manager@5.2.0
  - @memberjunction/ai-agents@5.2.0
  - @memberjunction/ai-engine-base@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/ai-reranker@5.2.0
  - @memberjunction/actions-base@5.2.0
  - @memberjunction/core-actions@5.2.0
  - @memberjunction/scheduling-engine-base@5.2.0
  - @memberjunction/scheduling-engine@5.2.0
  - @memberjunction/templates@5.2.0
  - @memberjunction/actions-apollo@5.2.0
  - @memberjunction/actions-bizapps-accounting@5.2.0
  - @memberjunction/actions-bizapps-crm@5.2.0
  - @memberjunction/actions-bizapps-formbuilders@5.2.0
  - @memberjunction/actions-bizapps-lms@5.2.0
  - @memberjunction/actions-bizapps-social@5.2.0
  - @memberjunction/actions@5.2.0
  - @memberjunction/encryption@5.2.0
  - @memberjunction/scheduling-actions@5.2.0
  - @memberjunction/testing-engine@5.2.0
  - @memberjunction/data-context-server@5.2.0
  - @memberjunction/ai-provider-bundle@5.2.0

## 5.1.0

### Patch Changes

- f426d43: Fix CodeGen to apply excludeSchemas filter consistently across all generators (TypeScript, Angular, GraphQL), not just SQL generation. Also adds cleanup for orphaned Angular entity form directories when entities are renamed or deleted.
  - @memberjunction/ai-agent-manager@5.1.0
  - @memberjunction/ai-agents@5.1.0
  - @memberjunction/ai-engine-base@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/ai-reranker@5.1.0
  - @memberjunction/actions-apollo@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/actions-bizapps-accounting@5.1.0
  - @memberjunction/actions-bizapps-crm@5.1.0
  - @memberjunction/actions-bizapps-formbuilders@5.1.0
  - @memberjunction/actions-bizapps-lms@5.1.0
  - @memberjunction/actions-bizapps-social@5.1.0
  - @memberjunction/core-actions@5.1.0
  - @memberjunction/actions@5.1.0
  - @memberjunction/doc-utils@5.1.0
  - @memberjunction/encryption@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/core-entities-server@5.1.0
  - @memberjunction/data-context-server@5.1.0
  - @memberjunction/scheduling-actions@5.1.0
  - @memberjunction/scheduling-engine-base@5.1.0
  - @memberjunction/scheduling-engine@5.1.0
  - @memberjunction/templates@5.1.0
  - @memberjunction/testing-engine@5.1.0
  - @memberjunction/ai-provider-bundle@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- 737b56b: Add SimpleQueryFieldInfo for query field lineage tracking in InteractiveComponents, sync DeleteOptionsInput fields with server schema in GraphQLDataProvider, and flatten tsconfig files in distribution for cleaner package builds
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-agent-manager@5.0.0
  - @memberjunction/ai-agents@5.0.0
  - @memberjunction/ai-engine-base@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/ai-provider-bundle@5.0.0
  - @memberjunction/ai-reranker@5.0.0
  - @memberjunction/actions-apollo@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/actions-bizapps-accounting@5.0.0
  - @memberjunction/actions-bizapps-crm@5.0.0
  - @memberjunction/actions-bizapps-formbuilders@5.0.0
  - @memberjunction/actions-bizapps-lms@5.0.0
  - @memberjunction/actions-bizapps-social@5.0.0
  - @memberjunction/core-actions@5.0.0
  - @memberjunction/actions@5.0.0
  - @memberjunction/doc-utils@5.0.0
  - @memberjunction/encryption@5.0.0
  - @memberjunction/core-entities-server@5.0.0
  - @memberjunction/data-context-server@5.0.0
  - @memberjunction/scheduling-actions@5.0.0
  - @memberjunction/scheduling-engine-base@5.0.0
  - @memberjunction/scheduling-engine@5.0.0
  - @memberjunction/templates@5.0.0
  - @memberjunction/testing-engine@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
- Updated dependencies [3bab2cd]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-provider-bundle@4.4.0
  - @memberjunction/ai-agent-manager@4.4.0
  - @memberjunction/ai-agents@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/ai-reranker@4.4.0
  - @memberjunction/actions-apollo@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/actions-bizapps-accounting@4.4.0
  - @memberjunction/actions-bizapps-crm@4.4.0
  - @memberjunction/actions-bizapps-formbuilders@4.4.0
  - @memberjunction/actions-bizapps-lms@4.4.0
  - @memberjunction/actions-bizapps-social@4.4.0
  - @memberjunction/core-actions@4.4.0
  - @memberjunction/actions@4.4.0
  - @memberjunction/doc-utils@4.4.0
  - @memberjunction/encryption@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/core-entities-server@4.4.0
  - @memberjunction/data-context-server@4.4.0
  - @memberjunction/scheduling-actions@4.4.0
  - @memberjunction/scheduling-engine-base@4.4.0
  - @memberjunction/scheduling-engine@4.4.0
  - @memberjunction/templates@4.4.0
  - @memberjunction/testing-engine@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai-agent-manager@4.3.1
- @memberjunction/ai-agents@4.3.1
- @memberjunction/ai-engine-base@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/ai-provider-bundle@4.3.1
- @memberjunction/ai-reranker@4.3.1
- @memberjunction/actions-apollo@4.3.1
- @memberjunction/actions-base@4.3.1
- @memberjunction/actions-bizapps-accounting@4.3.1
- @memberjunction/actions-bizapps-crm@4.3.1
- @memberjunction/actions-bizapps-formbuilders@4.3.1
- @memberjunction/actions-bizapps-lms@4.3.1
- @memberjunction/actions-bizapps-social@4.3.1
- @memberjunction/core-actions@4.3.1
- @memberjunction/actions@4.3.1
- @memberjunction/doc-utils@4.3.1
- @memberjunction/encryption@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/core-entities-server@4.3.1
- @memberjunction/data-context-server@4.3.1
- @memberjunction/scheduling-actions@4.3.1
- @memberjunction/scheduling-engine-base@4.3.1
- @memberjunction/scheduling-engine@4.3.1
- @memberjunction/templates@4.3.1
- @memberjunction/testing-engine@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [6f4d33f]
- Updated dependencies [564e1af]
  - @memberjunction/ai-agents@4.3.0
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ai-agent-manager@4.3.0
  - @memberjunction/core-actions@4.3.0
  - @memberjunction/scheduling-engine@4.3.0
  - @memberjunction/testing-engine@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/ai-reranker@4.3.0
  - @memberjunction/actions-apollo@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/actions-bizapps-accounting@4.3.0
  - @memberjunction/actions-bizapps-crm@4.3.0
  - @memberjunction/actions-bizapps-formbuilders@4.3.0
  - @memberjunction/actions-bizapps-lms@4.3.0
  - @memberjunction/actions-bizapps-social@4.3.0
  - @memberjunction/actions@4.3.0
  - @memberjunction/doc-utils@4.3.0
  - @memberjunction/encryption@4.3.0
  - @memberjunction/core-entities-server@4.3.0
  - @memberjunction/data-context-server@4.3.0
  - @memberjunction/scheduling-actions@4.3.0
  - @memberjunction/scheduling-engine-base@4.3.0
  - @memberjunction/templates@4.3.0
  - @memberjunction/ai-provider-bundle@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-agent-manager@4.2.0
- @memberjunction/ai-agents@4.2.0
- @memberjunction/ai-engine-base@4.2.0
- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/ai-provider-bundle@4.2.0
- @memberjunction/ai-reranker@4.2.0
- @memberjunction/actions-apollo@4.2.0
- @memberjunction/actions-base@4.2.0
- @memberjunction/actions-bizapps-accounting@4.2.0
- @memberjunction/actions-bizapps-crm@4.2.0
- @memberjunction/actions-bizapps-formbuilders@4.2.0
- @memberjunction/actions-bizapps-lms@4.2.0
- @memberjunction/actions-bizapps-social@4.2.0
- @memberjunction/core-actions@4.2.0
- @memberjunction/actions@4.2.0
- @memberjunction/doc-utils@4.2.0
- @memberjunction/encryption@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/core-entities-server@4.2.0
- @memberjunction/data-context-server@4.2.0
- @memberjunction/scheduling-actions@4.2.0
- @memberjunction/scheduling-engine-base@4.2.0
- @memberjunction/scheduling-engine@4.2.0
- @memberjunction/templates@4.2.0
- @memberjunction/testing-engine@4.2.0

## 4.1.0

### Patch Changes

- 77839a9: Enable cascade deletes for AI Agent and Prompt entities, add cross-file dependency detection and --delete-db-only flag to MetadataSync for proper deletion ordering, fix CodeGen duplicate variable names for self-referential FKs, add requireConnectivity config to QueryGen, and add Gemini JSON parser support to DBAutoDoc.
- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/actions-bizapps-formbuilders@4.1.0
  - @memberjunction/core-entities-server@4.1.0
  - @memberjunction/core-actions@4.1.0
  - @memberjunction/data-context-server@4.1.0
  - @memberjunction/templates@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/scheduling-engine@4.1.0
  - @memberjunction/ai-agent-manager@4.1.0
  - @memberjunction/ai-agents@4.1.0
  - @memberjunction/ai-engine-base@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/ai-reranker@4.1.0
  - @memberjunction/actions-apollo@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/actions-bizapps-accounting@4.1.0
  - @memberjunction/actions-bizapps-crm@4.1.0
  - @memberjunction/actions-bizapps-lms@4.1.0
  - @memberjunction/actions-bizapps-social@4.1.0
  - @memberjunction/actions@4.1.0
  - @memberjunction/doc-utils@4.1.0
  - @memberjunction/encryption@4.1.0
  - @memberjunction/scheduling-actions@4.1.0
  - @memberjunction/scheduling-engine-base@4.1.0
  - @memberjunction/testing-engine@4.1.0
  - @memberjunction/ai-provider-bundle@4.1.0

## 4.0.0

### Major Changes

- 5f6306c: 4.0

### Patch Changes

- Updated dependencies [2f86270]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [58ec618]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/core-entities-server@4.0.0
  - @memberjunction/ai-agent-manager@4.0.0
  - @memberjunction/ai-agents@4.0.0
  - @memberjunction/ai-engine-base@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/ai-provider-bundle@4.0.0
  - @memberjunction/ai-reranker@4.0.0
  - @memberjunction/actions-apollo@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/actions-bizapps-accounting@4.0.0
  - @memberjunction/actions-bizapps-crm@4.0.0
  - @memberjunction/actions-bizapps-formbuilders@4.0.0
  - @memberjunction/actions-bizapps-lms@4.0.0
  - @memberjunction/actions-bizapps-social@4.0.0
  - @memberjunction/core-actions@4.0.0
  - @memberjunction/actions@4.0.0
  - @memberjunction/doc-utils@4.0.0
  - @memberjunction/encryption@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/data-context-server@4.0.0
  - @memberjunction/scheduling-actions@4.0.0
  - @memberjunction/scheduling-engine-base@4.0.0
  - @memberjunction/scheduling-engine@4.0.0
  - @memberjunction/templates@4.0.0
  - @memberjunction/testing-engine@4.0.0
