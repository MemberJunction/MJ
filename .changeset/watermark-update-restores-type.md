---
"@memberjunction/integration-engine": patch
---

A completed sync's watermark is stored as a Timestamp again, not left typed as a Cursor.

The watermark row is shared with the keyset resume position, which flips `WatermarkType` to
`'Cursor'` mid-run. Creating a watermark stamps `'Timestamp'`, but updating one set only the value
and `LastSyncAt` — so an entity map that saved a keyset cursor mid-run and then completed cleanly
was left holding a timestamp value still typed as a cursor. `Load`'s consumers read the type to
decide what the value means, so the next run could hand that timestamp back to the connector as a
seek key.

`UpdateExistingWatermark` now restores `WatermarkType='Timestamp'`, matching what creation already
did. `RestoreValue` stays type-preserving on purpose: it undoes a mid-run durability floor, it does
not declare a run complete.
