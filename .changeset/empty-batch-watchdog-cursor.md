---
"@memberjunction/integration-engine": patch
---

The empty-batch watchdog now counts only empties at an UNMOVING position. A per-item fan-out connector legitimately returns long runs of empty batches while its cursor walks forward over sparse data; warning on those trained operators to dismiss the exact message a real stuck cursor would wear. The streak now requires the position tuple (watermark, afterKey, page, offset, cursor) to be unchanged across the empties — a stuck cursor, by definition, leaves the position where it was.
