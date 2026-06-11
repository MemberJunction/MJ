-- Integration deploy hardening — let connector metadata `mj sync push` land without losing info,
-- so this gap cannot recur for any connector.
--
-- Surfaced building the Path LMS connector: Integration.Description was NVARCHAR(255), so a real
-- connector description (366 chars) is rejected by the entity-length validation and truncated/lost.
-- Descriptions are informational, never keys; IntegrationObject.Description and
-- IntegrationObjectField.Description are already NVARCHAR(MAX). Bring the Integration row in line so
-- authored descriptions deploy intact. CodeGen regenerates the EntityField max-length from this
-- column so the validation ceiling follows automatically.
--
-- (MetadataSource is intentionally NOT touched here: the column already carries a default; the
--  fresh-DB NULL-insert failure is the stale baseline sproc passing an explicit NULL, which the
--  codegen pass in the standard migrate -> push -> codegen sequence regenerates.)

ALTER TABLE ${flyway:defaultSchema}.Integration ALTER COLUMN Description NVARCHAR(MAX) NULL;
