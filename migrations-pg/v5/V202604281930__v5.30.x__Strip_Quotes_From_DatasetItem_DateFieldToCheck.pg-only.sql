-- Strip embedded double-quotes from DatasetItem.DateFieldToCheck values.
--
-- Background: The PG baseline (B202602151200) seeds 35 DatasetItem rows with
-- `DateFieldToCheck = '"__mj_UpdatedAt"'` — i.e. the column name is wrapped in
-- double-quotes inside the string literal. This came from the SQL Server side's
-- `'[__mj_UpdatedAt]'` (bracket-quoted) values: when the SQL Server → PG
-- converter translated brackets to double-quotes, it didn't distinguish DDL/DML
-- identifiers from string-literal data values, so it transformed the embedded
-- value too.
--
-- Symptom at runtime: GetDatasetStatusByName builds a status query as
--   `MAX(${provider.QuoteIdentifier(dateFieldToCheck)})`
-- which on PG becomes `MAX("\"__mj_UpdatedAt\"")` — i.e. PG sees `MAX(""...")`,
-- where `""` is interpreted as a zero-length delimited identifier. PG errors:
--   `zero-length delimited identifier at or near """"`
-- This errors every dataset status check, which fires on cache validation paths
-- including BaseEntity.Save event invalidation. Currently affects mj sync push.
--
-- Long-term fix: the SQLConverter should leave string-literal values alone when
-- transforming bracket→double-quote (only convert identifiers in DDL/DML
-- contexts). For now this migration repairs the existing rows.
--
-- Post-baseline migrations (e.g. V202603221948 for v5.15) already insert the
-- unquoted form, so this migration only needs to clean up baseline rows.

UPDATE __mj."DatasetItem"
SET "DateFieldToCheck" = REPLACE("DateFieldToCheck", '"', '')
WHERE "DateFieldToCheck" LIKE '%"%';
