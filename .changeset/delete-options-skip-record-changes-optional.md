---
"@memberjunction/server": patch
---

`DeleteOptionsInput.SkipRecordChanges` is optional on the wire again, defaulting to `false`. It arrived in 6.1.0 as `Boolean!`, so every 5.51.x client that spells out `options___` on a delete failed schema validation after upgrading (`Field "DeleteOptionsInput.SkipRecordChanges" of required type "Boolean!" was not provided`). The server already forces the flag to `false` for any wire caller, so absent and `false` mean the same thing.
