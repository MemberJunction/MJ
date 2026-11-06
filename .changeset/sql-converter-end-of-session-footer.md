---
"@memberjunction/sql-converter": patch
---

Legacy `mj migrate convert` no longer drops nearly all of a Metadata_Sync whose last save is followed by the session footer. A create-or-update block now converts when comments trail its closing `END`; a guarded block that cannot convert is skipped instead of emitted as raw T-SQL; the `IF EXISTS` pre-flight removal reads its condition to the matching paren, so it can't run across statements; and a skipped EXEC block counts as a conversion gap, so the run reports it.
