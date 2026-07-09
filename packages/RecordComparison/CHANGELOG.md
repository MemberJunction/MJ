# @memberjunction/record-comparison

## 5.45.1

### Patch Changes

- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0

## 5.44.0

### Minor Changes

- 6f74b17: Add an LLM/agentic reasoning pass on top of the embedding/vector duplicate-detection pipeline — "vectors filter, reasoning validates". A small/fast LLM judges high-probability vector candidates (Merge / NotDuplicate / Uncertain) to shrink the human-review set, strengthening or weakening the vector score rather than replacing it. Adds a dual-provider reasoning seam (Prompt/Agent), per-entity gating (EnableLLMReasoning, ReasoningThreshold, AutomationLevel), per-candidate verdict/audit columns, the new @memberjunction/record-comparison engine + resolver/client, and an in-place reasoning UI in the duplicates dashboard. Fully back-compat: EnableLLMReasoning defaults to 0, leaving the vector-only path byte-for-byte unchanged.

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
