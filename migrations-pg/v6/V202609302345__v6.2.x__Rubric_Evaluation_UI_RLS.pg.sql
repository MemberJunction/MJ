-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609302345__v6.2.x__Rubric_Evaluation_UI_RLS.sql
-- Hand-ported. The SQL Server source is a data migration built from batch-scoped DECLAREs, which
-- the AST transpiler does not emit, and it has no CodeGen section.
--
-- UI reads and updates of rubric evaluations stay with the evaluator, unless the user holds the
-- Administer Rubric Evaluations authorization. Two row-level security filters are added, then the
-- UI role's grants on MJ: Rubric Evaluations and MJ: Rubric Evaluation Scores gain Create and
-- Update and carry the filters on Read and Update. Delete stays off.
--
-- FilterText is written in PostgreSQL form (quoted identifiers, TRUE, a literal __mj schema)
-- rather than the source's T-SQL. PostgreSQLDataProvider rewrites [brackets] and coerces
-- `= 1` / `= 0` only for the entity's OWN boolean fields, so the source's
-- `[auth].[IsActive] = 1` (a column on Authorization) would reach PostgreSQL as
-- boolean = integer and fail every UI read of these entities.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = '4D421671-D531-4208-8068-2FC92685305A') THEN
    INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "Description", "FilterText") VALUES (
      '4D421671-D531-4208-8068-2FC92685305A',
      'UI: Own Rubric Evaluations',
      'Narrows MJ: Rubric Evaluations to rows whose EvaluatorUserID is the current user, plus holders of the Administer Rubric Evaluations authorization. Attached to the UI role read and update grants.',
      $flt$("EvaluatorUserID" = '{{UserID}}' OR EXISTS (
        SELECT 1
        FROM __mj."AuthorizationRole" AS "ar"
        INNER JOIN __mj."UserRole" AS "ur"
            ON "ur"."RoleID" = "ar"."RoleID"
        INNER JOIN __mj."Authorization" AS "auth"
            ON "auth"."ID" = "ar"."AuthorizationID"
        WHERE "ur"."UserID" = '{{UserID}}'
          AND "auth"."Name" = 'Administer Rubric Evaluations'
          AND "auth"."IsActive" = TRUE
          AND "ar"."Type" = 'Allow'
          AND NOT EXISTS (
              SELECT 1
              FROM __mj."AuthorizationRole" AS "denied"
              INNER JOIN __mj."UserRole" AS "deniedUserRole"
                  ON "deniedUserRole"."RoleID" = "denied"."RoleID"
              WHERE "deniedUserRole"."UserID" = '{{UserID}}'
                AND "denied"."AuthorizationID" = "auth"."ID"
                AND "denied"."Type" = 'Deny'
          )
    ))$flt$
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = '60178540-5C41-4FBA-AE05-3B454FBB9FB2') THEN
    INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "Description", "FilterText") VALUES (
      '60178540-5C41-4FBA-AE05-3B454FBB9FB2',
      'UI: Own Rubric Evaluation Scores',
      'Narrows MJ: Rubric Evaluation Scores to scores on an evaluation whose EvaluatorUserID is the current user, plus holders of the Administer Rubric Evaluations authorization. The score table has no evaluator column, so the predicate reads the parent evaluation.',
      $flt$("EvaluationID" IN (SELECT "ev"."ID" FROM __mj."RubricEvaluation" AS "ev" WHERE "ev"."EvaluatorUserID" = '{{UserID}}') OR EXISTS (
        SELECT 1
        FROM __mj."AuthorizationRole" AS "ar"
        INNER JOIN __mj."UserRole" AS "ur"
            ON "ur"."RoleID" = "ar"."RoleID"
        INNER JOIN __mj."Authorization" AS "auth"
            ON "auth"."ID" = "ar"."AuthorizationID"
        WHERE "ur"."UserID" = '{{UserID}}'
          AND "auth"."Name" = 'Administer Rubric Evaluations'
          AND "auth"."IsActive" = TRUE
          AND "ar"."Type" = 'Allow'
          AND NOT EXISTS (
              SELECT 1
              FROM __mj."AuthorizationRole" AS "denied"
              INNER JOIN __mj."UserRole" AS "deniedUserRole"
                  ON "deniedUserRole"."RoleID" = "denied"."RoleID"
              WHERE "deniedUserRole"."UserID" = '{{UserID}}'
                AND "denied"."AuthorizationID" = "auth"."ID"
                AND "denied"."Type" = 'Deny'
          )
    ))$flt$
    );
  END IF;
END $$;

-- UI role (E0AFCCEC-6A37-EF11-86D4-000D3A4E707E) grants, matched on entity + role because
-- V202609302342 inserted them without an ID and the generated ID differs per database.
UPDATE __mj."EntityPermission"
   SET "CanCreate" = TRUE,
       "CanUpdate" = TRUE,
       "ReadRLSFilterID" = '4D421671-D531-4208-8068-2FC92685305A',
       "UpdateRLSFilterID" = '4D421671-D531-4208-8068-2FC92685305A',
       "__mj_UpdatedAt" = NOW()
 WHERE "EntityID" = '7FAA091D-C1A3-48A7-82D2-3D17729470F9'
   AND "RoleID" = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
   AND "Type" = 'Allow';

UPDATE __mj."EntityPermission"
   SET "CanCreate" = TRUE,
       "CanUpdate" = TRUE,
       "ReadRLSFilterID" = '60178540-5C41-4FBA-AE05-3B454FBB9FB2',
       "UpdateRLSFilterID" = '60178540-5C41-4FBA-AE05-3B454FBB9FB2',
       "__mj_UpdatedAt" = NOW()
 WHERE "EntityID" = '122ED707-2BC0-42E8-B25F-6BDDE7164962'
   AND "RoleID" = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
   AND "Type" = 'Allow';
