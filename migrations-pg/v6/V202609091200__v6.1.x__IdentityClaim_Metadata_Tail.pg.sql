-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609091200__v6.1.x__IdentityClaim_Metadata_Tail.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityFieldValue" WHERE "ID" = '13c6f030-eb13-4292-bc90-86ee7c0c574a') THEN
    INSERT INTO __mj."EntityFieldValue" ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('13c6f030-eb13-4292-bc90-86ee7c0c574a', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 1, 'Claimed', 'Claimed', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityFieldValue" WHERE "ID" = '5c3f70bc-3be1-4407-9502-7367ebf8e033') THEN
    INSERT INTO __mj."EntityFieldValue" ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5c3f70bc-3be1-4407-9502-7367ebf8e033', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 2, 'Expired', 'Expired', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityFieldValue" WHERE "ID" = '60bd4443-6f13-4113-8695-6ab7bb0a5e86') THEN
    INSERT INTO __mj."EntityFieldValue" ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('60bd4443-6f13-4113-8695-6ab7bb0a5e86', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 3, 'Pending', 'Pending', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityFieldValue" WHERE "ID" = 'd055221f-7370-4cb5-8d81-285dbf5d4605') THEN
    INSERT INTO __mj."EntityFieldValue" ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d055221f-7370-4cb5-8d81-285dbf5d4605', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 4, 'Revoked', 'Revoked', NOW(), NOW());
  END IF;
END $$;

/* SQL text to update ValueListType for entity field ID F925BD99-4B5A-48A4-878A-385E8F2D87E7 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'dd73e538-5890-4ab3-a0b3-4fce34002a9c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dd73e538-5890-4ab3-a0b3-4fce34002a9c', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '58C8C895-E3AA-48C2-BA68-808337235873', 'EntityID', 'One To Many', TRUE, TRUE, 78, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5cae8afe-d085-4484-a398-1a578fadb13a') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5cae8afe-d085-4484-a398-1a578fadb13a', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '58C8C895-E3AA-48C2-BA68-808337235873', 'ClaimedByUserID', 'One To Many', TRUE, TRUE, 105, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '35846e5b-e9fb-49c7-bef4-0f1f6ed50266') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('35846e5b-e9fb-49c7-bef4-0f1f6ed50266', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', '58C8C895-E3AA-48C2-BA68-808337235873', 'ClaimTypeID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '60d6c822-ee90-4e82-a201-0da1b7508edf') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('60d6c822-ee90-4e82-a201-0da1b7508edf', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', '58C8C895-E3AA-48C2-BA68-808337235873', 'MagicLinkInviteID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
  END IF;
END $$;

-- ============================================================================
-- HAND-PORTED — the 3 statements the AST transpiler reported as unhandled.
--
-- Source (SQL Server, lines 96-104):
--   EXEC __mj.spUpdateEntityFieldRelatedEntityNameFieldMap
--        @EntityFieldID='…', @RelatedEntityNameFieldMap='…';
--
-- On PostgreSQL this CodeGen-owned routine is a FUNCTION, not a procedure —
--   __mj.spUpdateEntityFieldRelatedEntityNameFieldMap(
--        p_entityfieldid uuid, p_relatedentitynamefieldmap character varying)
-- verified against pg_proc on a migrated database — so the call is PERFORM with
-- named arguments rather than EXEC with @-parameters. Order and values are
-- preserved exactly; these are the last three statements of the source.
-- ============================================================================

/* related entity name field map for entity field 505DF1FB-2C77-40CD-80D6-6AFDAF64840F */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '505DF1FB-2C77-40CD-80D6-6AFDAF64840F'::uuid,
    p_relatedentitynamefieldmap := 'ClaimType'
  );
END $$;

/* related entity name field map for entity field 23CE09B7-480A-4A7B-8167-C6883F5657C3 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '23CE09B7-480A-4A7B-8167-C6883F5657C3'::uuid,
    p_relatedentitynamefieldmap := 'Entity'
  );
END $$;

/* related entity name field map for entity field FF9B7A6A-B843-4738-BD9C-4A4375C419D5 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'FF9B7A6A-B843-4738-BD9C-4A4375C419D5'::uuid,
    p_relatedentitynamefieldmap := 'ClaimedByUser'
  );
END $$;
