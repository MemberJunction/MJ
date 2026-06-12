---
"@memberjunction/mcp-mj-test-runner": minor
---

v2 connector-builder architecture (empirical refactor): new T12_IdempotencyReplay tier (two-pass
volatile-field fixture replay proving record-identity stability — the GZ #22 class), engine-cache
seeding in the offline child runner (metadata-driven connectors now exercise their real
discovery/fetch paths in replay tiers), and connector metadata-file resolution for the seeding path.
