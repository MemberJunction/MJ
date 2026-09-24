---
"@memberjunction/sql-converter": patch
---

fix(sql-converter): convert mj-sync's create-or-update blocks to PL/pgSQL.

Since the 6.2 cycle `mj sync push` writes a record it may already hold as `IF NOT EXISTS (SELECT 1 FROM t WHERE [ID] = @v) BEGIN EXEC spCreate… END ELSE BEGIN EXEC spUpdate… END`. `ExecBlockRule` handled one EXEC per block, so it split the update into its own block and folded the guard into the preceding SET value, leaving raw T-SQL in the output — the 6.2.0-edge.0 Metadata_Sync counterparts did not apply on PostgreSQL. The rule now emits `IF NOT EXISTS (…) THEN PERFORM create ELSE PERFORM update END IF`, with each call keeping the typed-vs-JSONB shape check. A block that looks like an upsert but does not parse exactly still falls back to a visible `SKIPPED` comment.
