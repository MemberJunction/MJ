-- ============================================================================
-- Normalize EntityField.CodeType to the canonical casing allowed by
-- CK_EntityField_CodeType ('Other','JavaScript','CSS','HTML','SQL','TypeScript').
--
-- SQL Server's default case-insensitive collation accepts mis-cased values
-- (e.g. 'Typescript'), so they slip past the CHECK and are carried into the
-- generated baselines. PostgreSQL's CHECK is case-sensitive and rejects them on
-- ANY update of the row, which breaks `mj codegen` on a fresh PostgreSQL
-- install with: new row for relation "EntityField" violates check constraint
-- "CK_EntityField_CodeType". This normalizes any case-variant to canonical so
-- subsequent codegen UPDATEs of those EntityField rows pass the constraint.
--
-- Mirrors the one-off normalization in
-- V202605040300__v5.33.x__Unblock_PostgreSQL_End_To_End.pg-only.sql, re-applied
-- because the v5.38 baseline reintroduced the SQL Server-cased value.
-- ============================================================================
UPDATE ${flyway:defaultSchema}."EntityField" SET "CodeType" = 'TypeScript'
  WHERE LOWER("CodeType") = 'typescript' AND "CodeType" <> 'TypeScript';
UPDATE ${flyway:defaultSchema}."EntityField" SET "CodeType" = 'JavaScript'
  WHERE LOWER("CodeType") = 'javascript' AND "CodeType" <> 'JavaScript';
UPDATE ${flyway:defaultSchema}."EntityField" SET "CodeType" = 'HTML'
  WHERE LOWER("CodeType") = 'html' AND "CodeType" <> 'HTML';
UPDATE ${flyway:defaultSchema}."EntityField" SET "CodeType" = 'CSS'
  WHERE LOWER("CodeType") = 'css' AND "CodeType" <> 'CSS';
UPDATE ${flyway:defaultSchema}."EntityField" SET "CodeType" = 'SQL'
  WHERE LOWER("CodeType") = 'sql' AND "CodeType" <> 'SQL';
UPDATE ${flyway:defaultSchema}."EntityField" SET "CodeType" = 'Other'
  WHERE LOWER("CodeType") = 'other' AND "CodeType" <> 'Other';
