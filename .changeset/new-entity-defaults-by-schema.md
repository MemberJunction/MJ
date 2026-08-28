---
'@memberjunction/codegen-lib': patch
---

Per-schema creation-time entity flags: `newEntityDefaults.DefaultsBySchema` lets a schema override `TrackRecordChanges`, `SupportsGeoCoding`, and `AutoUpdateSupportsGeoCoding` on the Entity row CodeGen creates (matching AllowCachingBySchema's rules: case-insensitive, `${mj_core_schema}` placeholder). `SupportsGeoCoding` / `AutoUpdateSupportsGeoCoding` are also accepted as global creation defaults. Unset flags are omitted from the INSERT so the database default applies — existing configurations produce byte-for-byte the same SQL. The intended use is integration mirror schemas: entities receiving high-volume synced data should not pay per-record side trips (record-change rows, geocoding lookups) on every write, and creation-time `AutoUpdateSupportsGeoCoding=false` permanently shields them from the geo auto-detect pass, which honors the flag as a lock.
