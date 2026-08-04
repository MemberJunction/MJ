-- ============================================================================
-- Normalize EntityField.CodeType to the canonical casing allowed by
-- CK_EntityField_CodeType ('Other','JavaScript','CSS','HTML','SQL','TypeScript').
--
-- SQL Server's default case-insensitive collation accepts mis-cased values
-- (e.g. 'Typescript'), so they slip past the CHECK and are carried into the
-- generated baselines. PostgreSQL's CHECK is case-sensitive and rejects them on
-- ANY update of the row, which breaks `mj codegen` on a fresh PostgreSQL
-- install with: new row for relation "EntityField" violates check constraint
-- "CK_EntityField_CodeType". Correcting the canonical (SQL Server) data here
-- keeps future baseline regenerations clean on both platforms.
--
-- The COLLATE ... BIN2 guard restricts each UPDATE to rows whose casing is
-- actually wrong, so correctly-cased rows are left untouched (no spurious
-- __mj_UpdatedAt churn or record-change rows).
-- ============================================================================
UPDATE ${flyway:defaultSchema}.EntityField SET CodeType = 'TypeScript'
  WHERE CodeType = 'TypeScript' AND CodeType COLLATE Latin1_General_BIN2 <> 'TypeScript';
UPDATE ${flyway:defaultSchema}.EntityField SET CodeType = 'JavaScript'
  WHERE CodeType = 'JavaScript' AND CodeType COLLATE Latin1_General_BIN2 <> 'JavaScript';
UPDATE ${flyway:defaultSchema}.EntityField SET CodeType = 'HTML'
  WHERE CodeType = 'HTML' AND CodeType COLLATE Latin1_General_BIN2 <> 'HTML';
UPDATE ${flyway:defaultSchema}.EntityField SET CodeType = 'CSS'
  WHERE CodeType = 'CSS' AND CodeType COLLATE Latin1_General_BIN2 <> 'CSS';
UPDATE ${flyway:defaultSchema}.EntityField SET CodeType = 'SQL'
  WHERE CodeType = 'SQL' AND CodeType COLLATE Latin1_General_BIN2 <> 'SQL';
UPDATE ${flyway:defaultSchema}.EntityField SET CodeType = 'Other'
  WHERE CodeType = 'Other' AND CodeType COLLATE Latin1_General_BIN2 <> 'Other';
