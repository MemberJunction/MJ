-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611161546__v6.3.x__List_Source_Fingerprint_And_Refresh_Routine.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."Query"
ADD COLUMN "DefinitionFingerprint" VARCHAR(100) NULL /* ===================================================================================== */ /* Lists: refresh from a saved query, source fingerprints, and an auto-refresh routine */ /* Query.DefinitionFingerprint and UserView.DefinitionFingerprint hold the hash of each */ /* source's current definition, stamped on every save by the entity's server subclass. */ /* A list stores the fingerprint it was linked against (List.SourceFingerprint). Before a */ /* refresh, the two are compared. On a mismatch, nothing is applied and the owner is asked */ /* to review the change. */ /* A list can now be linked to a saved query (SourceQueryID, with its parameter values and */ /* the result column that holds the entity's primary key) as well as to a view, never both. */ /* When the owner ticks Refresh automatically (List.AutoRefresh), the list's server subclass */ /* creates a User Routine that runs "Refresh List From Source" and stores it in */ /* List.RefreshRoutineID. */ /* ===================================================================================== */;

ALTER TABLE __mj."UserView"
ADD COLUMN "DefinitionFingerprint" VARCHAR(100) NULL;

ALTER TABLE __mj."List"
  ADD COLUMN "SourceQueryID" UUID NULL,
  ADD COLUMN "SourceQueryParameters" TEXT NULL,
  ADD COLUMN "SourceQueryKeyField" VARCHAR(255) NULL,
  ADD COLUMN "SourceFingerprint" VARCHAR(100) NULL,
  ADD COLUMN "AutoRefresh" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "RefreshRoutineID" UUID NULL;

ALTER TABLE __mj."List"
  ADD CONSTRAINT "FK_List_SourceQuery" FOREIGN KEY ("SourceQueryID") REFERENCES __mj."Query" (
    "ID"
  )
 /* Foreign keys and the one-source rule, in a separate batch so they can see the new columns. */;

ALTER TABLE __mj."List"
  ADD CONSTRAINT "FK_List_RefreshRoutine" FOREIGN KEY ("RefreshRoutineID") REFERENCES __mj."UserRoutine" (
    "ID"
  );

ALTER TABLE __mj."List"
  ADD CONSTRAINT "CK_List_SingleSource" CHECK ("SourceViewID" IS NULL OR "SourceQueryID" IS NULL);

COMMENT ON COLUMN __mj."Query"."DefinitionFingerprint" IS 'Hash of this query''s current definition: its SQL, template flag, external source, dialect SQL and parameter contract. Stamped on every save. A list linked to this query compares it with List.SourceFingerprint before each refresh. NULL until the query is next saved or checked.';

COMMENT ON COLUMN __mj."UserView"."DefinitionFingerprint" IS 'Hash of this view''s current definition: its entity, filters and alternate base view. Stamped on every save. A list linked to this view compares it with List.SourceFingerprint before each refresh. NULL until the view is next saved or checked.';

COMMENT ON COLUMN __mj."List"."SourceQueryID" IS 'Optional ID of the saved query this list is refreshed from. A list has at most one source: this or SourceViewID.';

COMMENT ON COLUMN __mj."List"."SourceQueryParameters" IS 'JSON object of the parameter values the source query runs with, keyed by parameter name. NULL when the query takes no parameters.';

COMMENT ON COLUMN __mj."List"."SourceQueryKeyField" IS 'Name of the source query''s result column that holds the primary key of the list''s entity. Required when SourceQueryID is set.';

COMMENT ON COLUMN __mj."List"."SourceFingerprint" IS 'Definition fingerprint of the source query or view at the time the list was linked, or when the owner last approved a change to the source. A refresh compares it with the source''s current DefinitionFingerprint and stops when they differ. NULL until the next successful refresh fills it.';

COMMENT ON COLUMN __mj."List"."AutoRefresh" IS 'When 1, the list refreshes from its source on a schedule through the User Routine in RefreshRoutineID. When 0 (default), it refreshes only when someone runs a refresh.';

COMMENT ON COLUMN __mj."List"."RefreshRoutineID" IS 'The User Routine that refreshes this list on a schedule. Created when AutoRefresh is first turned on, and disabled (not deleted) when it is turned off, so its run history stays.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a9062f72-7c0c-4c1a-9d80-de1e3bd7c905' OR ("EntityID" = 'E4238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'DefinitionFingerprint')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a9062f72-7c0c-4c1a-9d80-de1e3bd7c905', 'E4238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: User Views */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E4238F34-2837-EF11-86D4-6045BDEE16E6'), 'DefinitionFingerprint', 'Definition Fingerprint', 'Hash of this view''s current definition: its entity, filters and alternate base view. Stamped on every save. A list linked to this view compares it with List.SourceFingerprint before each refresh. NULL until the view is next saved or checked.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'daf4ae68-84d8-40cc-9cf9-92bf0b02091b' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SourceQueryID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('daf4ae68-84d8-40cc-9cf9-92bf0b02091b', 'EE238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Lists */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'), 'SourceQueryID', 'Source Query ID', 'Optional ID of the saved query this list is refreshed from. A list has at most one source: this or SourceViewID.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c5bd134f-1dee-476c-aa1d-1909f5e2b0e1' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SourceQueryParameters')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c5bd134f-1dee-476c-aa1d-1909f5e2b0e1', 'EE238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Lists */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'), 'SourceQueryParameters', 'Source Query Parameters', 'JSON object of the parameter values the source query runs with, keyed by parameter name. NULL when the query takes no parameters.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3d493e7a-9714-4410-b994-ecafda3a63fa' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SourceQueryKeyField')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3d493e7a-9714-4410-b994-ecafda3a63fa', 'EE238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Lists */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'), 'SourceQueryKeyField', 'Source Query Key Field', 'Name of the source query''s result column that holds the primary key of the list''s entity. Required when SourceQueryID is set.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5d9e2ef4-7f87-4b5c-b994-8ce16245f821' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SourceFingerprint')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5d9e2ef4-7f87-4b5c-b994-8ce16245f821', 'EE238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Lists */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'), 'SourceFingerprint', 'Source Fingerprint', 'Definition fingerprint of the source query or view at the time the list was linked, or when the owner last approved a change to the source. A refresh compares it with the source''s current DefinitionFingerprint and stops when they differ. NULL until the next successful refresh fills it.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1bc9d307-dd54-440f-98b4-0b8e12e47f6c' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AutoRefresh')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1bc9d307-dd54-440f-98b4-0b8e12e47f6c', 'EE238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Lists */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'), 'AutoRefresh', 'Auto Refresh', 'When 1, the list refreshes from its source on a schedule through the User Routine in RefreshRoutineID. When 0 (default), it refreshes only when someone runs a refresh.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '399f145c-b667-4a95-8275-2fdbd5a395e1' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RefreshRoutineID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('399f145c-b667-4a95-8275-2fdbd5a395e1', 'EE238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Lists */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'), 'RefreshRoutineID', 'Refresh Routine ID', 'The User Routine that refreshes this list on a schedule. Created when AutoRefresh is first turned on, and disabled (not deleted) when it is turned off, so its run history stays.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dccf5d20-df77-447e-aabf-b52299952815' OR ("EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'DefinitionFingerprint')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dccf5d20-df77-447e-aabf-b52299952815', '1B248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Queries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6'), 'DefinitionFingerprint', 'Definition Fingerprint', 'Hash of this query''s current definition: its SQL, template flag, external source, dialect SQL and parameter contract. Stamped on every save. A list linked to this query compares it with List.SourceFingerprint before each refresh. NULL until the query is next saved or checked.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '92e1cbbd-c328-412e-9ec9-1230716d7d2f' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "RelatedEntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityJoinField" = 'RefreshRoutineID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('92e1cbbd-c328-412e-9ec9-1230716d7d2f', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'RefreshRoutineID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '308ceb82-76be-4db5-84cd-d87408c8b8c1' OR ("EntityID" = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityJoinField" = 'SourceQueryID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('308ceb82-76be-4db5-84cd-d87408c8b8c1', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'SourceQueryID', 'One To Many', TRUE, TRUE, 10, NOW(), NOW());
  END IF;
END $$;

/* Update attributes on "MJ: Conversations" from additionalSchemaInfo */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW(), "SubtypeSelector" = '{"Path": "TypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "TypeID.DriverClass", "BaseClass": "ConversationTypeDriver"}}'
WHERE
  "ID" = '13248F34-2837-EF11-86D4-6045BDEE16E6';
/* Update attributes on "MJ: Comments" from additionalSchemaInfo */
UPDATE __mj."Entity" SET "__mj_UpdatedAt" = NOW(), "SubtypeSelector" = '{"Path": "CommentTypeID.ExtensionEntity", "UseForLoadedRecords": true, "AutoEnsureOnSave": true, "Driver": {"Path": "CommentTypeID.DriverClass", "BaseClass": "CommentTypeDriver"}, "UIDriver": {"Path": "CommentTypeID.UIDriverClass"}}'
WHERE
  "ID" = 'B46E1990-487D-45D6-B91E-A77D58ED0229';
/* SQL text to update entity field related entity name field map for entity field ID DAF4AE68-84D8-40CC-9CF9-92BF0B02091B */ /* SQL text to update entity field related entity name field map for entity field ID 399F145C-B667-4A95-8275-2FDBD5A395E1 */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '095d630b-6c43-4819-9227-b2159eca6144' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SourceQuery')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('095d630b-6c43-4819-9227-b2159eca6144', 'EE238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Lists */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'), 'SourceQuery', 'Source Query', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b97bd11f-34ae-4abc-889d-d8a8f1033090' OR ("EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RefreshRoutine')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b97bd11f-34ae-4abc-889d-d8a8f1033090', 'EE238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Lists */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'EE238F34-2837-EF11-86D4-6045BDEE16E6'), 'RefreshRoutine', 'Refresh Routine', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1BC9D307-DD54-440F-98B4-0B8E12E47F6C'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 8 fields */
/* UPDATE Entity Field Category Info MJ: Lists.SourceQueryID */
UPDATE __mj."EntityField" SET "Category" = 'Refresh Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Source Query'
WHERE
  "ID" = 'DAF4AE68-84D8-40CC-9CF9-92BF0B02091B';
/* UPDATE Entity Field Category Info MJ: Lists.SourceQueryParameters */
UPDATE __mj."EntityField" SET "Category" = 'Refresh Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'C5BD134F-1DEE-476C-AA1D-1909F5E2B0E1';
/* UPDATE Entity Field Category Info MJ: Lists.SourceQueryKeyField */
UPDATE __mj."EntityField" SET "Category" = 'Refresh Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3D493E7A-9714-4410-B994-ECAFDA3A63FA';
/* UPDATE Entity Field Category Info MJ: Lists.SourceFingerprint */
UPDATE __mj."EntityField" SET "Category" = 'Refresh Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5D9E2EF4-7F87-4B5C-B994-8CE16245F821';
/* UPDATE Entity Field Category Info MJ: Lists.AutoRefresh */
UPDATE __mj."EntityField" SET "Category" = 'Refresh Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1BC9D307-DD54-440F-98B4-0B8E12E47F6C';
/* UPDATE Entity Field Category Info MJ: Lists.RefreshRoutineID */
UPDATE __mj."EntityField" SET "Category" = 'Refresh Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Refresh Routine'
WHERE
  "ID" = '399F145C-B667-4A95-8275-2FDBD5A395E1';
/* UPDATE Entity Field Category Info MJ: Lists.SourceQuery */
UPDATE __mj."EntityField" SET "Category" = 'Refresh Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Source Query Name'
WHERE
  "ID" = '095D630B-6C43-4819-9227-B2159ECA6144';
/* UPDATE Entity Field Category Info MJ: Lists.RefreshRoutine */
UPDATE __mj."EntityField" SET "Category" = 'Refresh Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Refresh Routine Name'
WHERE
  "ID" = 'B97BD11F-34AE-4ABC-889D-D8A8F1033090';

/* Set categories for 10 fields */
/* UPDATE Entity Field Category Info MJ: Queries.EmbeddingVectorBinary */
UPDATE __mj."EntityField" SET "Category" = 'AI & Embeddings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B88EF2F6-711F-4081-9EBC-3562BE686115';
/* UPDATE Entity Field Category Info MJ: Queries.ApprovalComments */
UPDATE __mj."EntityField" SET "Category" = 'Performance & Quality', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1A797FF0-7480-4713-A3C5-C12A4BAFDD78';
/* UPDATE Entity Field Category Info MJ: Queries.ApprovedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Performance & Quality', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BEAD11E7-68D4-47F8-9A22-B014DD027E9F';
/* UPDATE Entity Field Category Info MJ: Queries.ApprovedAt */
UPDATE __mj."EntityField" SET "Category" = 'Performance & Quality', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '95F734C1-874E-47FE-B9A1-6659945529E9';
/* UPDATE Entity Field Category Info MJ: Queries.ApprovedFingerprint */
UPDATE __mj."EntityField" SET "Category" = 'Performance & Quality', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E18565D4-0E4D-4B49-BCF5-6F2F01251113';
/* UPDATE Entity Field Category Info MJ: Queries.ExtractedSQLHash */
UPDATE __mj."EntityField" SET "Category" = 'Query Definition', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C7BB26CF-5A35-41CD-949D-7A119B8FDBC2';
/* UPDATE Entity Field Category Info MJ: Queries.ExtractionStatus */
UPDATE __mj."EntityField" SET "Category" = 'Query Definition', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A97BB493-7B84-482A-97F0-F1ADFB743FDA';
/* UPDATE Entity Field Category Info MJ: Queries.ExtractionMessage */
UPDATE __mj."EntityField" SET "Category" = 'Query Definition', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '58647807-90B8-4E45-B2C2-61496F73BE71';
/* UPDATE Entity Field Category Info MJ: Queries.DefinitionFingerprint */
UPDATE __mj."EntityField" SET "Category" = 'Query Definition', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'DCCF5D20-DF77-447E-AABF-B52299952815';
/* UPDATE Entity Field Category Info MJ: Queries.ApprovedByUser */
UPDATE __mj."EntityField" SET "Category" = 'Performance & Quality', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B3C32071-A960-4106-9967-0CF7C027D692';

/* Set categories for 8 fields */
/* UPDATE Entity Field Category Info MJ: User Views.ViewTypeID */
UPDATE __mj."EntityField" SET "Category" = 'Display Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2C22A535-A97A-4490-9A56-660A29D31890';
/* UPDATE Entity Field Category Info MJ: User Views.Properties */
UPDATE __mj."EntityField" SET "Category" = 'View Definition & Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '51D42EDA-32A8-4AC6-A745-2BB16CC4DD41';
/* UPDATE Entity Field Category Info MJ: User Views.ApprovalStatus */
UPDATE __mj."EntityField" SET "Category" = 'Approval & Governance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CD52C98A-3AAD-40E7-BCB3-5347C8B4CFC9';
/* UPDATE Entity Field Category Info MJ: User Views.ApprovalComments */
UPDATE __mj."EntityField" SET "Category" = 'Approval & Governance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6EC8D697-BA09-4785-8DFE-67FE0CAB84FA';
/* UPDATE Entity Field Category Info MJ: User Views.ApprovedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Approval & Governance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C9F01B34-7AA8-4769-B86F-5213A812D9CB';
/* UPDATE Entity Field Category Info MJ: User Views.ApprovedAt */
UPDATE __mj."EntityField" SET "Category" = 'Approval & Governance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3F1AAEFC-0F15-4017-9A21-682075967B18';
/* UPDATE Entity Field Category Info MJ: User Views.ApprovedFingerprint */
UPDATE __mj."EntityField" SET "Category" = 'Approval & Governance', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'DC9C05E1-2E62-417A-AF5F-778D81694F90';
/* UPDATE Entity Field Category Info MJ: User Views.DefinitionFingerprint */
UPDATE __mj."EntityField" SET "Category" = 'View Definition & Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A9062F72-7C0C-4C1A-9D80-DE1E3BD7C905';

/* Update FieldCategoryInfo setting for entity */
UPDATE __mj."EntitySetting" SET "Value" = '{
  "Approval & Governance": {
    "description": "View approval status, reviewer comments, and security fingerprints.",
    "icon": "fa fa-check-circle"
  },
  "Display Settings": {
    "description": "Configuration for view display modes such as grid, cards, timeline, and chart",
    "icon": "fa fa-eye"
  },
  "Entity Context": {
    "description": "",
    "icon": "fa fa-database"
  },
  "Filtering & Smart Search": {
    "description": "",
    "icon": "fa fa-search"
  },
  "System Metadata": {
    "description": "",
    "icon": "fa fa-cog"
  },
  "User & Ownership": {
    "description": "",
    "icon": "fa fa-user"
  },
  "View Definition & Settings": {
    "description": "",
    "icon": "fa fa-sliders-h"
  }
}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'E4238F34-2837-EF11-86D4-6045BDEE16E6'
  AND "Name" = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */
UPDATE __mj."EntitySetting" SET "Value" = '{
  "Approval & Governance": "fa fa-check-circle",
  "Display Settings": "fa fa-eye",
  "Entity Context": "fa fa-database",
  "Filtering & Smart Search": "fa fa-search",
  "System Metadata": "fa fa-cog",
  "User & Ownership": "fa fa-user",
  "View Definition & Settings": "fa fa-sliders-h"
}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'E4238F34-2837-EF11-86D4-6045BDEE16E6'
  AND "Name" = 'FieldCategoryIcons';

-- ===================== HAND-FINISHED (v6.3.0-edge.1 release build) =====================
-- vwUserViews: carry the new UserView.DefinitionFingerprint column.
--
-- MJ: User Views has an app-owned base view (BaseViewGenerated = false), so CodeGen does not
-- regenerate it. SQL Server picks the column up through `uv.*` with
-- EXEC sp_refreshview 'vwUserViews' (twice in its CodeGen section); the converter drops
-- sp_refreshview without reporting it (#6538). Without this block the PG view lacks the column and
-- R__RefreshMetadata prunes the new MJ: User Views.DefinitionFingerprint EntityField row.
-- PostgreSQL froze the column list at creation (V202610231210), so the view is re-created with the
-- same column list plus DefinitionFingerprint appended at the end: CREATE OR REPLACE may only append
-- columns, and appending keeps every dependent and grant in place.
CREATE OR REPLACE VIEW __mj."vwUserViews" AS
SELECT uv."ID",
    uv."UserID",
    uv."EntityID",
    uv."Name",
    uv."Description",
    uv."CategoryID",
    uv."IsShared",
    uv."IsDefault",
    uv."GridState",
    uv."FilterState",
    uv."CustomFilterState",
    uv."SmartFilterEnabled",
    uv."SmartFilterPrompt",
    uv."SmartFilterWhereClause",
    uv."SmartFilterExplanation",
    uv."WhereClause",
    uv."CustomWhereClause",
    uv."SortState",
    uv."__mj_CreatedAt",
    uv."__mj_UpdatedAt",
    uv."Thumbnail",
    uv."CardState",
    uv."DisplayState",
    u."Name" AS "UserName",
    u."FirstLast" AS "UserFirstLast",
    u."Email" AS "UserEmail",
    u."Type" AS "UserType",
    e."Name" AS "Entity",
    e."BaseView" AS "EntityBaseView",
    uv."ViewTypeID",
    uv."Properties",
    uv."ApprovalStatus",
    uv."ApprovalComments",
    uv."ApprovedByUserID",
    uv."ApprovedAt",
    uv."ApprovedFingerprint",
    uv."DefinitionFingerprint"
FROM __mj."UserView" uv
JOIN __mj."vwUsers" u ON uv."UserID" = u."ID"
JOIN __mj."Entity" e ON uv."EntityID" = e."ID";

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Lists
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'List'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EntityID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_list_entity_id"
            ON "__mj"."List" ("EntityID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'List'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'UserID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_list_user_id"
            ON "__mj"."List" ("UserID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'List'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'CategoryID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_list_category_id"
            ON "__mj"."List" ("CategoryID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'List'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'CompanyIntegrationID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_list_company_integration_id"
            ON "__mj"."List" ("CompanyIntegrationID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'List'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'SourceViewID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_list_source_view_id"
            ON "__mj"."List" ("SourceViewID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'List'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'LastRefreshedByUserID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_list_last_refreshed_by_user_id"
            ON "__mj"."List" ("LastRefreshedByUserID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'List'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'SourceQueryID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_list_source_query_id"
            ON "__mj"."List" ("SourceQueryID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'List'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'RefreshRoutineID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_list_refresh_routine_id"
            ON "__mj"."List" ("RefreshRoutineID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Lists
-- Item: vwLists
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Lists
-----               SCHEMA:      __mj
-----               BASE TABLE:  List
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwLists"
AS
SELECT
    l.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJUser_UserID."Name" AS "User",
    MJListCategory_CategoryID."Name" AS "Category",
    MJCompanyIntegration_CompanyIntegrationID."Name" AS "CompanyIntegration",
    MJUserView_SourceViewID."Name" AS "SourceView",
    MJUser_LastRefreshedByUserID."Name" AS "LastRefreshedByUser",
    MJQuery_SourceQueryID."Name" AS "SourceQuery",
    MJUserRoutine_RefreshRoutineID."Name" AS "RefreshRoutine"
FROM
    "__mj"."List" AS l
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "l"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "l"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."ListCategory" AS MJListCategory_CategoryID
  ON
    "l"."CategoryID" = MJListCategory_CategoryID."ID"
LEFT OUTER JOIN
    "__mj"."CompanyIntegration" AS MJCompanyIntegration_CompanyIntegrationID
  ON
    "l"."CompanyIntegrationID" = MJCompanyIntegration_CompanyIntegrationID."ID"
LEFT OUTER JOIN
    "__mj"."UserView" AS MJUserView_SourceViewID
  ON
    "l"."SourceViewID" = MJUserView_SourceViewID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_LastRefreshedByUserID
  ON
    "l"."LastRefreshedByUserID" = MJUser_LastRefreshedByUserID."ID"
LEFT OUTER JOIN
    "__mj"."Query" AS MJQuery_SourceQueryID
  ON
    "l"."SourceQueryID" = MJQuery_SourceQueryID."ID"
LEFT OUTER JOIN
    "__mj"."UserRoutine" AS MJUserRoutine_RefreshRoutineID
  ON
    "l"."RefreshRoutineID" = MJUserRoutine_RefreshRoutineID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwLists'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwLists'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwLists" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwLists" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwLists" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwLists" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Lists
-- Item: spCreateList
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR List
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateList'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateList"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_externalsystemrecordid_clear boolean DEFAULT false,
    p_externalsystemrecordid varchar(100) DEFAULT NULL,
    p_companyintegrationid_clear boolean DEFAULT false,
    p_companyintegrationid UUID DEFAULT NULL,
    p_sourceviewid_clear boolean DEFAULT false,
    p_sourceviewid UUID DEFAULT NULL,
    p_sourcefiltersnapshot_clear boolean DEFAULT false,
    p_sourcefiltersnapshot TEXT DEFAULT NULL,
    p_lastrefreshedat_clear boolean DEFAULT false,
    p_lastrefreshedat TIMESTAMPTZ DEFAULT NULL,
    p_lastrefreshedbyuserid_clear boolean DEFAULT false,
    p_lastrefreshedbyuserid UUID DEFAULT NULL,
    p_refreshmode varchar(20) DEFAULT NULL,
    p_usesnapshot BOOLEAN DEFAULT NULL,
    p_sourcequeryid_clear boolean DEFAULT false,
    p_sourcequeryid UUID DEFAULT NULL,
    p_sourcequeryparameters_clear boolean DEFAULT false,
    p_sourcequeryparameters TEXT DEFAULT NULL,
    p_sourcequerykeyfield_clear boolean DEFAULT false,
    p_sourcequerykeyfield varchar(255) DEFAULT NULL,
    p_sourcefingerprint_clear boolean DEFAULT false,
    p_sourcefingerprint varchar(100) DEFAULT NULL,
    p_autorefresh BOOLEAN DEFAULT NULL,
    p_refreshroutineid_clear boolean DEFAULT false,
    p_refreshroutineid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwLists" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."List"
        (
            "ID",
            "Name",
                "Description",
                "EntityID",
                "UserID",
                "CategoryID",
                "ExternalSystemRecordID",
                "CompanyIntegrationID",
                "SourceViewID",
                "SourceFilterSnapshot",
                "LastRefreshedAt",
                "LastRefreshedByUserID",
                "RefreshMode",
                "UseSnapshot",
                "SourceQueryID",
                "SourceQueryParameters",
                "SourceQueryKeyField",
                "SourceFingerprint",
                "AutoRefresh",
                "RefreshRoutineID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_entityid,
                p_userid,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                CASE WHEN p_externalsystemrecordid_clear = true THEN NULL ELSE COALESCE(p_externalsystemrecordid, NULL) END,
                CASE WHEN p_companyintegrationid_clear = true THEN NULL ELSE COALESCE(p_companyintegrationid, NULL) END,
                CASE WHEN p_sourceviewid_clear = true THEN NULL ELSE COALESCE(p_sourceviewid, NULL) END,
                CASE WHEN p_sourcefiltersnapshot_clear = true THEN NULL ELSE COALESCE(p_sourcefiltersnapshot, NULL) END,
                CASE WHEN p_lastrefreshedat_clear = true THEN NULL ELSE COALESCE(p_lastrefreshedat, NULL) END,
                CASE WHEN p_lastrefreshedbyuserid_clear = true THEN NULL ELSE COALESCE(p_lastrefreshedbyuserid, NULL) END,
                COALESCE(p_refreshmode, 'Additive'),
                COALESCE(p_usesnapshot, FALSE),
                CASE WHEN p_sourcequeryid_clear = true THEN NULL ELSE COALESCE(p_sourcequeryid, NULL) END,
                CASE WHEN p_sourcequeryparameters_clear = true THEN NULL ELSE COALESCE(p_sourcequeryparameters, NULL) END,
                CASE WHEN p_sourcequerykeyfield_clear = true THEN NULL ELSE COALESCE(p_sourcequerykeyfield, NULL) END,
                CASE WHEN p_sourcefingerprint_clear = true THEN NULL ELSE COALESCE(p_sourcefingerprint, NULL) END,
                COALESCE(p_autorefresh, FALSE),
                CASE WHEN p_refreshroutineid_clear = true THEN NULL ELSE COALESCE(p_refreshroutineid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwLists"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateList" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateList" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateList" TO "cdp_UI";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Lists
-- Item: spUpdateList
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR List
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateList'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateList"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_externalsystemrecordid_clear boolean DEFAULT false,
    p_externalsystemrecordid varchar(100) DEFAULT NULL,
    p_companyintegrationid_clear boolean DEFAULT false,
    p_companyintegrationid UUID DEFAULT NULL,
    p_sourceviewid_clear boolean DEFAULT false,
    p_sourceviewid UUID DEFAULT NULL,
    p_sourcefiltersnapshot_clear boolean DEFAULT false,
    p_sourcefiltersnapshot TEXT DEFAULT NULL,
    p_lastrefreshedat_clear boolean DEFAULT false,
    p_lastrefreshedat TIMESTAMPTZ DEFAULT NULL,
    p_lastrefreshedbyuserid_clear boolean DEFAULT false,
    p_lastrefreshedbyuserid UUID DEFAULT NULL,
    p_refreshmode varchar(20) DEFAULT NULL,
    p_usesnapshot BOOLEAN DEFAULT NULL,
    p_sourcequeryid_clear boolean DEFAULT false,
    p_sourcequeryid UUID DEFAULT NULL,
    p_sourcequeryparameters_clear boolean DEFAULT false,
    p_sourcequeryparameters TEXT DEFAULT NULL,
    p_sourcequerykeyfield_clear boolean DEFAULT false,
    p_sourcequerykeyfield varchar(255) DEFAULT NULL,
    p_sourcefingerprint_clear boolean DEFAULT false,
    p_sourcefingerprint varchar(100) DEFAULT NULL,
    p_autorefresh BOOLEAN DEFAULT NULL,
    p_refreshroutineid_clear boolean DEFAULT false,
    p_refreshroutineid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwLists" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."List"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "ExternalSystemRecordID" = CASE WHEN p_externalsystemrecordid_clear = true THEN NULL ELSE COALESCE(p_externalsystemrecordid, "ExternalSystemRecordID") END,
        "CompanyIntegrationID" = CASE WHEN p_companyintegrationid_clear = true THEN NULL ELSE COALESCE(p_companyintegrationid, "CompanyIntegrationID") END,
        "SourceViewID" = CASE WHEN p_sourceviewid_clear = true THEN NULL ELSE COALESCE(p_sourceviewid, "SourceViewID") END,
        "SourceFilterSnapshot" = CASE WHEN p_sourcefiltersnapshot_clear = true THEN NULL ELSE COALESCE(p_sourcefiltersnapshot, "SourceFilterSnapshot") END,
        "LastRefreshedAt" = CASE WHEN p_lastrefreshedat_clear = true THEN NULL ELSE COALESCE(p_lastrefreshedat, "LastRefreshedAt") END,
        "LastRefreshedByUserID" = CASE WHEN p_lastrefreshedbyuserid_clear = true THEN NULL ELSE COALESCE(p_lastrefreshedbyuserid, "LastRefreshedByUserID") END,
        "RefreshMode" = COALESCE(p_refreshmode, "RefreshMode"),
        "UseSnapshot" = COALESCE(p_usesnapshot, "UseSnapshot"),
        "SourceQueryID" = CASE WHEN p_sourcequeryid_clear = true THEN NULL ELSE COALESCE(p_sourcequeryid, "SourceQueryID") END,
        "SourceQueryParameters" = CASE WHEN p_sourcequeryparameters_clear = true THEN NULL ELSE COALESCE(p_sourcequeryparameters, "SourceQueryParameters") END,
        "SourceQueryKeyField" = CASE WHEN p_sourcequerykeyfield_clear = true THEN NULL ELSE COALESCE(p_sourcequerykeyfield, "SourceQueryKeyField") END,
        "SourceFingerprint" = CASE WHEN p_sourcefingerprint_clear = true THEN NULL ELSE COALESCE(p_sourcefingerprint, "SourceFingerprint") END,
        "AutoRefresh" = COALESCE(p_autorefresh, "AutoRefresh"),
        "RefreshRoutineID" = CASE WHEN p_refreshroutineid_clear = true THEN NULL ELSE COALESCE(p_refreshroutineid, "RefreshRoutineID") END,
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwLists"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateList" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateList" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateList" TO "cdp_UI";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the List table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_list"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_list" ON "__mj"."List";

CREATE TRIGGER "trg_update_list"
BEFORE UPDATE ON "__mj"."List"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_list"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Lists
-- Item: spDeleteList
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR List
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteList'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteList"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."List"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteList" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteList" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteList" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Views
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'UserView'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'UserID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_view_user_id"
            ON "__mj"."UserView" ("UserID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'UserView'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EntityID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_view_entity_id"
            ON "__mj"."UserView" ("EntityID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'UserView'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'CategoryID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_view_category_id"
            ON "__mj"."UserView" ("CategoryID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'UserView'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ViewTypeID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_view_view_type_id"
            ON "__mj"."UserView" ("ViewTypeID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'UserView'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ApprovedByUserID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_view_approved_by_user_id"
            ON "__mj"."UserView" ("ApprovedByUserID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Views
-- Item: Permissions for vwUserViews
-- ============================================================
GRANT SELECT ON "__mj"."vwUserViews" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwUserViews" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwUserViews" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Views
-- Item: spCreateUserView
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR UserView
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateUserView'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateUserView"(
    p_id UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_isshared BOOLEAN DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_gridstate_clear boolean DEFAULT false,
    p_gridstate TEXT DEFAULT NULL,
    p_filterstate_clear boolean DEFAULT false,
    p_filterstate TEXT DEFAULT NULL,
    p_customfilterstate BOOLEAN DEFAULT NULL,
    p_smartfilterenabled BOOLEAN DEFAULT NULL,
    p_smartfilterprompt_clear boolean DEFAULT false,
    p_smartfilterprompt TEXT DEFAULT NULL,
    p_smartfilterwhereclause_clear boolean DEFAULT false,
    p_smartfilterwhereclause TEXT DEFAULT NULL,
    p_smartfilterexplanation_clear boolean DEFAULT false,
    p_smartfilterexplanation TEXT DEFAULT NULL,
    p_whereclause_clear boolean DEFAULT false,
    p_whereclause TEXT DEFAULT NULL,
    p_customwhereclause BOOLEAN DEFAULT NULL,
    p_sortstate_clear boolean DEFAULT false,
    p_sortstate TEXT DEFAULT NULL,
    p_thumbnail_clear boolean DEFAULT false,
    p_thumbnail TEXT DEFAULT NULL,
    p_cardstate_clear boolean DEFAULT false,
    p_cardstate TEXT DEFAULT NULL,
    p_displaystate_clear boolean DEFAULT false,
    p_displaystate TEXT DEFAULT NULL,
    p_viewtypeid_clear boolean DEFAULT false,
    p_viewtypeid UUID DEFAULT NULL,
    p_properties_clear boolean DEFAULT false,
    p_properties TEXT DEFAULT NULL,
    p_approvalstatus varchar(20) DEFAULT NULL,
    p_approvalcomments_clear boolean DEFAULT false,
    p_approvalcomments TEXT DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_approvedat_clear boolean DEFAULT false,
    p_approvedat TIMESTAMPTZ DEFAULT NULL,
    p_approvedfingerprint_clear boolean DEFAULT false,
    p_approvedfingerprint varchar(100) DEFAULT NULL,
    p_definitionfingerprint_clear boolean DEFAULT false,
    p_definitionfingerprint varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwUserViews" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."UserView"
        (
            "ID",
            "UserID",
                "EntityID",
                "Name",
                "Description",
                "CategoryID",
                "IsShared",
                "IsDefault",
                "GridState",
                "FilterState",
                "CustomFilterState",
                "SmartFilterEnabled",
                "SmartFilterPrompt",
                "SmartFilterWhereClause",
                "SmartFilterExplanation",
                "WhereClause",
                "CustomWhereClause",
                "SortState",
                "Thumbnail",
                "CardState",
                "DisplayState",
                "ViewTypeID",
                "Properties",
                "ApprovalStatus",
                "ApprovalComments",
                "ApprovedByUserID",
                "ApprovedAt",
                "ApprovedFingerprint",
                "DefinitionFingerprint"
        )
    VALUES
        (
            v_new_id,
            p_userid,
                p_entityid,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                COALESCE(p_isshared, FALSE),
                COALESCE(p_isdefault, FALSE),
                CASE WHEN p_gridstate_clear = true THEN NULL ELSE COALESCE(p_gridstate, NULL) END,
                CASE WHEN p_filterstate_clear = true THEN NULL ELSE COALESCE(p_filterstate, NULL) END,
                COALESCE(p_customfilterstate, FALSE),
                COALESCE(p_smartfilterenabled, FALSE),
                CASE WHEN p_smartfilterprompt_clear = true THEN NULL ELSE COALESCE(p_smartfilterprompt, NULL) END,
                CASE WHEN p_smartfilterwhereclause_clear = true THEN NULL ELSE COALESCE(p_smartfilterwhereclause, NULL) END,
                CASE WHEN p_smartfilterexplanation_clear = true THEN NULL ELSE COALESCE(p_smartfilterexplanation, NULL) END,
                CASE WHEN p_whereclause_clear = true THEN NULL ELSE COALESCE(p_whereclause, NULL) END,
                COALESCE(p_customwhereclause, FALSE),
                CASE WHEN p_sortstate_clear = true THEN NULL ELSE COALESCE(p_sortstate, NULL) END,
                CASE WHEN p_thumbnail_clear = true THEN NULL ELSE COALESCE(p_thumbnail, NULL) END,
                CASE WHEN p_cardstate_clear = true THEN NULL ELSE COALESCE(p_cardstate, NULL) END,
                CASE WHEN p_displaystate_clear = true THEN NULL ELSE COALESCE(p_displaystate, NULL) END,
                CASE WHEN p_viewtypeid_clear = true THEN NULL ELSE COALESCE(p_viewtypeid, NULL) END,
                CASE WHEN p_properties_clear = true THEN NULL ELSE COALESCE(p_properties, NULL) END,
                COALESCE(p_approvalstatus, 'Pending'),
                CASE WHEN p_approvalcomments_clear = true THEN NULL ELSE COALESCE(p_approvalcomments, NULL) END,
                CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, NULL) END,
                CASE WHEN p_approvedat_clear = true THEN NULL ELSE COALESCE(p_approvedat, NULL) END,
                CASE WHEN p_approvedfingerprint_clear = true THEN NULL ELSE COALESCE(p_approvedfingerprint, NULL) END,
                CASE WHEN p_definitionfingerprint_clear = true THEN NULL ELSE COALESCE(p_definitionfingerprint, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwUserViews"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserView" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserView" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserView" TO "cdp_UI";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Views
-- Item: spUpdateUserView
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR UserView
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateUserView'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateUserView"(
    p_id UUID,
    p_userid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_isshared BOOLEAN DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_gridstate_clear boolean DEFAULT false,
    p_gridstate TEXT DEFAULT NULL,
    p_filterstate_clear boolean DEFAULT false,
    p_filterstate TEXT DEFAULT NULL,
    p_customfilterstate BOOLEAN DEFAULT NULL,
    p_smartfilterenabled BOOLEAN DEFAULT NULL,
    p_smartfilterprompt_clear boolean DEFAULT false,
    p_smartfilterprompt TEXT DEFAULT NULL,
    p_smartfilterwhereclause_clear boolean DEFAULT false,
    p_smartfilterwhereclause TEXT DEFAULT NULL,
    p_smartfilterexplanation_clear boolean DEFAULT false,
    p_smartfilterexplanation TEXT DEFAULT NULL,
    p_whereclause_clear boolean DEFAULT false,
    p_whereclause TEXT DEFAULT NULL,
    p_customwhereclause BOOLEAN DEFAULT NULL,
    p_sortstate_clear boolean DEFAULT false,
    p_sortstate TEXT DEFAULT NULL,
    p_thumbnail_clear boolean DEFAULT false,
    p_thumbnail TEXT DEFAULT NULL,
    p_cardstate_clear boolean DEFAULT false,
    p_cardstate TEXT DEFAULT NULL,
    p_displaystate_clear boolean DEFAULT false,
    p_displaystate TEXT DEFAULT NULL,
    p_viewtypeid_clear boolean DEFAULT false,
    p_viewtypeid UUID DEFAULT NULL,
    p_properties_clear boolean DEFAULT false,
    p_properties TEXT DEFAULT NULL,
    p_approvalstatus varchar(20) DEFAULT NULL,
    p_approvalcomments_clear boolean DEFAULT false,
    p_approvalcomments TEXT DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_approvedat_clear boolean DEFAULT false,
    p_approvedat TIMESTAMPTZ DEFAULT NULL,
    p_approvedfingerprint_clear boolean DEFAULT false,
    p_approvedfingerprint varchar(100) DEFAULT NULL,
    p_definitionfingerprint_clear boolean DEFAULT false,
    p_definitionfingerprint varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwUserViews" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."UserView"
    SET
        "UserID" = COALESCE(p_userid, "UserID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "IsShared" = COALESCE(p_isshared, "IsShared"),
        "IsDefault" = COALESCE(p_isdefault, "IsDefault"),
        "GridState" = CASE WHEN p_gridstate_clear = true THEN NULL ELSE COALESCE(p_gridstate, "GridState") END,
        "FilterState" = CASE WHEN p_filterstate_clear = true THEN NULL ELSE COALESCE(p_filterstate, "FilterState") END,
        "CustomFilterState" = COALESCE(p_customfilterstate, "CustomFilterState"),
        "SmartFilterEnabled" = COALESCE(p_smartfilterenabled, "SmartFilterEnabled"),
        "SmartFilterPrompt" = CASE WHEN p_smartfilterprompt_clear = true THEN NULL ELSE COALESCE(p_smartfilterprompt, "SmartFilterPrompt") END,
        "SmartFilterWhereClause" = CASE WHEN p_smartfilterwhereclause_clear = true THEN NULL ELSE COALESCE(p_smartfilterwhereclause, "SmartFilterWhereClause") END,
        "SmartFilterExplanation" = CASE WHEN p_smartfilterexplanation_clear = true THEN NULL ELSE COALESCE(p_smartfilterexplanation, "SmartFilterExplanation") END,
        "WhereClause" = CASE WHEN p_whereclause_clear = true THEN NULL ELSE COALESCE(p_whereclause, "WhereClause") END,
        "CustomWhereClause" = COALESCE(p_customwhereclause, "CustomWhereClause"),
        "SortState" = CASE WHEN p_sortstate_clear = true THEN NULL ELSE COALESCE(p_sortstate, "SortState") END,
        "Thumbnail" = CASE WHEN p_thumbnail_clear = true THEN NULL ELSE COALESCE(p_thumbnail, "Thumbnail") END,
        "CardState" = CASE WHEN p_cardstate_clear = true THEN NULL ELSE COALESCE(p_cardstate, "CardState") END,
        "DisplayState" = CASE WHEN p_displaystate_clear = true THEN NULL ELSE COALESCE(p_displaystate, "DisplayState") END,
        "ViewTypeID" = CASE WHEN p_viewtypeid_clear = true THEN NULL ELSE COALESCE(p_viewtypeid, "ViewTypeID") END,
        "Properties" = CASE WHEN p_properties_clear = true THEN NULL ELSE COALESCE(p_properties, "Properties") END,
        "ApprovalStatus" = COALESCE(p_approvalstatus, "ApprovalStatus"),
        "ApprovalComments" = CASE WHEN p_approvalcomments_clear = true THEN NULL ELSE COALESCE(p_approvalcomments, "ApprovalComments") END,
        "ApprovedByUserID" = CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, "ApprovedByUserID") END,
        "ApprovedAt" = CASE WHEN p_approvedat_clear = true THEN NULL ELSE COALESCE(p_approvedat, "ApprovedAt") END,
        "ApprovedFingerprint" = CASE WHEN p_approvedfingerprint_clear = true THEN NULL ELSE COALESCE(p_approvedfingerprint, "ApprovedFingerprint") END,
        "DefinitionFingerprint" = CASE WHEN p_definitionfingerprint_clear = true THEN NULL ELSE COALESCE(p_definitionfingerprint, "DefinitionFingerprint") END,
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwUserViews"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserView" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserView" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserView" TO "cdp_UI";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserView table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_user_view"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_user_view" ON "__mj"."UserView";

CREATE TRIGGER "trg_update_user_view"
BEFORE UPDATE ON "__mj"."UserView"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_user_view"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Views
-- Item: spDeleteUserView
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR UserView
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteUserView'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteUserView"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."UserView"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteUserView" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteUserView" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteUserView" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'Query'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'CategoryID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_category_id"
            ON "__mj"."Query" ("CategoryID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'Query'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EmbeddingModelID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_embedding_model_id"
            ON "__mj"."Query" ("EmbeddingModelID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'Query'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'SQLDialectID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_sql_dialect_id"
            ON "__mj"."Query" ("SQLDialectID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'Query'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ExternalDataSourceID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_external_data_source_id"
            ON "__mj"."Query" ("ExternalDataSourceID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'Query'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'ApprovedByUserID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_approved_by_user_id"
            ON "__mj"."Query" ("ApprovedByUserID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: vwQueries
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Queries
-----               SCHEMA:      __mj
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwQueries"
AS
SELECT
    q.*,
    MJQueryCategory_CategoryID."Name" AS "Category",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJSQLDialect_SQLDialectID."Name" AS "SQLDialect",
    MJExternalDataSource_ExternalDataSourceID."Name" AS "ExternalDataSource",
    MJUser_ApprovedByUserID."Name" AS "ApprovedByUser"
FROM
    "__mj"."Query" AS q
LEFT OUTER JOIN
    "__mj"."QueryCategory" AS MJQueryCategory_CategoryID
  ON
    "q"."CategoryID" = MJQueryCategory_CategoryID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "q"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    "__mj"."SQLDialect" AS MJSQLDialect_SQLDialectID
  ON
    "q"."SQLDialectID" = MJSQLDialect_SQLDialectID."ID"
LEFT OUTER JOIN
    "__mj"."ExternalDataSource" AS MJExternalDataSource_ExternalDataSourceID
  ON
    "q"."ExternalDataSourceID" = MJExternalDataSource_ExternalDataSourceID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_ApprovedByUserID
  ON
    "q"."ApprovedByUserID" = MJUser_ApprovedByUserID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwQueries'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwQueries'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwQueries" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwQueries" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spCreateQuery
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateQuery"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_userquestion_clear boolean DEFAULT false,
    p_userquestion TEXT DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sql_clear boolean DEFAULT false,
    p_sql TEXT DEFAULT NULL,
    p_technicaldescription_clear boolean DEFAULT false,
    p_technicaldescription TEXT DEFAULT NULL,
    p_originalsql_clear boolean DEFAULT false,
    p_originalsql TEXT DEFAULT NULL,
    p_feedback_clear boolean DEFAULT false,
    p_feedback TEXT DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_qualityrank_clear boolean DEFAULT false,
    p_qualityrank int DEFAULT NULL,
    p_executioncostrank_clear boolean DEFAULT false,
    p_executioncostrank int DEFAULT NULL,
    p_usestemplate_clear boolean DEFAULT false,
    p_usestemplate BOOLEAN DEFAULT NULL,
    p_auditqueryruns BOOLEAN DEFAULT NULL,
    p_cacheenabled BOOLEAN DEFAULT NULL,
    p_cachettlminutes_clear boolean DEFAULT false,
    p_cachettlminutes int DEFAULT NULL,
    p_cachemaxsize_clear boolean DEFAULT false,
    p_cachemaxsize int DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_cachevalidationsql_clear boolean DEFAULT false,
    p_cachevalidationsql TEXT DEFAULT NULL,
    p_sqldialectid UUID DEFAULT NULL,
    p_reusable BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_ismaterialized BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL,
    p_approvalcomments_clear boolean DEFAULT false,
    p_approvalcomments TEXT DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_approvedat_clear boolean DEFAULT false,
    p_approvedat TIMESTAMPTZ DEFAULT NULL,
    p_approvedfingerprint_clear boolean DEFAULT false,
    p_approvedfingerprint varchar(100) DEFAULT NULL,
    p_extractedsqlhash_clear boolean DEFAULT false,
    p_extractedsqlhash varchar(64) DEFAULT NULL,
    p_extractionstatus_clear boolean DEFAULT false,
    p_extractionstatus varchar(20) DEFAULT NULL,
    p_extractionmessage_clear boolean DEFAULT false,
    p_extractionmessage TEXT DEFAULT NULL,
    p_definitionfingerprint_clear boolean DEFAULT false,
    p_definitionfingerprint varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueries" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Query"
        (
            "ID",
            "Name",
                "CategoryID",
                "UserQuestion",
                "Description",
                "SQL",
                "TechnicalDescription",
                "OriginalSQL",
                "Feedback",
                "Status",
                "QualityRank",
                "ExecutionCostRank",
                "UsesTemplate",
                "AuditQueryRuns",
                "CacheEnabled",
                "CacheTTLMinutes",
                "CacheMaxSize",
                "EmbeddingVector",
                "EmbeddingModelID",
                "CacheValidationSQL",
                "SQLDialectID",
                "Reusable",
                "ExternalDataSourceID",
                "IsMaterialized",
                "Configuration",
                "EmbeddingVectorBinary",
                "ApprovalComments",
                "ApprovedByUserID",
                "ApprovedAt",
                "ApprovedFingerprint",
                "ExtractedSQLHash",
                "ExtractionStatus",
                "ExtractionMessage",
                "DefinitionFingerprint"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                CASE WHEN p_userquestion_clear = true THEN NULL ELSE COALESCE(p_userquestion, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_sql_clear = true THEN NULL ELSE COALESCE(p_sql, NULL) END,
                CASE WHEN p_technicaldescription_clear = true THEN NULL ELSE COALESCE(p_technicaldescription, NULL) END,
                CASE WHEN p_originalsql_clear = true THEN NULL ELSE COALESCE(p_originalsql, NULL) END,
                CASE WHEN p_feedback_clear = true THEN NULL ELSE COALESCE(p_feedback, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_qualityrank_clear = true THEN NULL ELSE COALESCE(p_qualityrank, 0) END,
                CASE WHEN p_executioncostrank_clear = true THEN NULL ELSE COALESCE(p_executioncostrank, NULL) END,
                CASE WHEN p_usestemplate_clear = true THEN NULL ELSE COALESCE(p_usestemplate, FALSE) END,
                COALESCE(p_auditqueryruns, FALSE),
                COALESCE(p_cacheenabled, FALSE),
                CASE WHEN p_cachettlminutes_clear = true THEN NULL ELSE COALESCE(p_cachettlminutes, NULL) END,
                CASE WHEN p_cachemaxsize_clear = true THEN NULL ELSE COALESCE(p_cachemaxsize, NULL) END,
                CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, NULL) END,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_cachevalidationsql_clear = true THEN NULL ELSE COALESCE(p_cachevalidationsql, NULL) END,
                CASE WHEN p_sqldialectid = '00000000-0000-0000-0000-000000000000'::UUID THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE COALESCE(p_sqldialectid, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                COALESCE(p_reusable, FALSE),
                CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, NULL) END,
                COALESCE(p_ismaterialized, FALSE),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, NULL) END,
                CASE WHEN p_approvalcomments_clear = true THEN NULL ELSE COALESCE(p_approvalcomments, NULL) END,
                CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, NULL) END,
                CASE WHEN p_approvedat_clear = true THEN NULL ELSE COALESCE(p_approvedat, NULL) END,
                CASE WHEN p_approvedfingerprint_clear = true THEN NULL ELSE COALESCE(p_approvedfingerprint, NULL) END,
                CASE WHEN p_extractedsqlhash_clear = true THEN NULL ELSE COALESCE(p_extractedsqlhash, NULL) END,
                CASE WHEN p_extractionstatus_clear = true THEN NULL ELSE COALESCE(p_extractionstatus, NULL) END,
                CASE WHEN p_extractionmessage_clear = true THEN NULL ELSE COALESCE(p_extractionmessage, NULL) END,
                CASE WHEN p_definitionfingerprint_clear = true THEN NULL ELSE COALESCE(p_definitionfingerprint, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwQueries"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQuery" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spUpdateQuery
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateQuery"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_userquestion_clear boolean DEFAULT false,
    p_userquestion TEXT DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sql_clear boolean DEFAULT false,
    p_sql TEXT DEFAULT NULL,
    p_technicaldescription_clear boolean DEFAULT false,
    p_technicaldescription TEXT DEFAULT NULL,
    p_originalsql_clear boolean DEFAULT false,
    p_originalsql TEXT DEFAULT NULL,
    p_feedback_clear boolean DEFAULT false,
    p_feedback TEXT DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_qualityrank_clear boolean DEFAULT false,
    p_qualityrank int DEFAULT NULL,
    p_executioncostrank_clear boolean DEFAULT false,
    p_executioncostrank int DEFAULT NULL,
    p_usestemplate_clear boolean DEFAULT false,
    p_usestemplate BOOLEAN DEFAULT NULL,
    p_auditqueryruns BOOLEAN DEFAULT NULL,
    p_cacheenabled BOOLEAN DEFAULT NULL,
    p_cachettlminutes_clear boolean DEFAULT false,
    p_cachettlminutes int DEFAULT NULL,
    p_cachemaxsize_clear boolean DEFAULT false,
    p_cachemaxsize int DEFAULT NULL,
    p_embeddingvector_clear boolean DEFAULT false,
    p_embeddingvector TEXT DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_cachevalidationsql_clear boolean DEFAULT false,
    p_cachevalidationsql TEXT DEFAULT NULL,
    p_sqldialectid UUID DEFAULT NULL,
    p_reusable BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_ismaterialized BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_embeddingvectorbinary_clear boolean DEFAULT false,
    p_embeddingvectorbinary BYTEA DEFAULT NULL,
    p_approvalcomments_clear boolean DEFAULT false,
    p_approvalcomments TEXT DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_approvedat_clear boolean DEFAULT false,
    p_approvedat TIMESTAMPTZ DEFAULT NULL,
    p_approvedfingerprint_clear boolean DEFAULT false,
    p_approvedfingerprint varchar(100) DEFAULT NULL,
    p_extractedsqlhash_clear boolean DEFAULT false,
    p_extractedsqlhash varchar(64) DEFAULT NULL,
    p_extractionstatus_clear boolean DEFAULT false,
    p_extractionstatus varchar(20) DEFAULT NULL,
    p_extractionmessage_clear boolean DEFAULT false,
    p_extractionmessage TEXT DEFAULT NULL,
    p_definitionfingerprint_clear boolean DEFAULT false,
    p_definitionfingerprint varchar(100) DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueries" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Query"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "UserQuestion" = CASE WHEN p_userquestion_clear = true THEN NULL ELSE COALESCE(p_userquestion, "UserQuestion") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "SQL" = CASE WHEN p_sql_clear = true THEN NULL ELSE COALESCE(p_sql, "SQL") END,
        "TechnicalDescription" = CASE WHEN p_technicaldescription_clear = true THEN NULL ELSE COALESCE(p_technicaldescription, "TechnicalDescription") END,
        "OriginalSQL" = CASE WHEN p_originalsql_clear = true THEN NULL ELSE COALESCE(p_originalsql, "OriginalSQL") END,
        "Feedback" = CASE WHEN p_feedback_clear = true THEN NULL ELSE COALESCE(p_feedback, "Feedback") END,
        "Status" = COALESCE(p_status, "Status"),
        "QualityRank" = CASE WHEN p_qualityrank_clear = true THEN NULL ELSE COALESCE(p_qualityrank, "QualityRank") END,
        "ExecutionCostRank" = CASE WHEN p_executioncostrank_clear = true THEN NULL ELSE COALESCE(p_executioncostrank, "ExecutionCostRank") END,
        "UsesTemplate" = CASE WHEN p_usestemplate_clear = true THEN NULL ELSE COALESCE(p_usestemplate, "UsesTemplate") END,
        "AuditQueryRuns" = COALESCE(p_auditqueryruns, "AuditQueryRuns"),
        "CacheEnabled" = COALESCE(p_cacheenabled, "CacheEnabled"),
        "CacheTTLMinutes" = CASE WHEN p_cachettlminutes_clear = true THEN NULL ELSE COALESCE(p_cachettlminutes, "CacheTTLMinutes") END,
        "CacheMaxSize" = CASE WHEN p_cachemaxsize_clear = true THEN NULL ELSE COALESCE(p_cachemaxsize, "CacheMaxSize") END,
        "EmbeddingVector" = CASE WHEN p_embeddingvector_clear = true THEN NULL ELSE COALESCE(p_embeddingvector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "CacheValidationSQL" = CASE WHEN p_cachevalidationsql_clear = true THEN NULL ELSE COALESCE(p_cachevalidationsql, "CacheValidationSQL") END,
        "SQLDialectID" = COALESCE(p_sqldialectid, "SQLDialectID"),
        "Reusable" = COALESCE(p_reusable, "Reusable"),
        "ExternalDataSourceID" = CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, "ExternalDataSourceID") END,
        "IsMaterialized" = COALESCE(p_ismaterialized, "IsMaterialized"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "EmbeddingVectorBinary" = CASE WHEN p_embeddingvectorbinary_clear = true THEN NULL ELSE COALESCE(p_embeddingvectorbinary, "EmbeddingVectorBinary") END,
        "ApprovalComments" = CASE WHEN p_approvalcomments_clear = true THEN NULL ELSE COALESCE(p_approvalcomments, "ApprovalComments") END,
        "ApprovedByUserID" = CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, "ApprovedByUserID") END,
        "ApprovedAt" = CASE WHEN p_approvedat_clear = true THEN NULL ELSE COALESCE(p_approvedat, "ApprovedAt") END,
        "ApprovedFingerprint" = CASE WHEN p_approvedfingerprint_clear = true THEN NULL ELSE COALESCE(p_approvedfingerprint, "ApprovedFingerprint") END,
        "ExtractedSQLHash" = CASE WHEN p_extractedsqlhash_clear = true THEN NULL ELSE COALESCE(p_extractedsqlhash, "ExtractedSQLHash") END,
        "ExtractionStatus" = CASE WHEN p_extractionstatus_clear = true THEN NULL ELSE COALESCE(p_extractionstatus, "ExtractionStatus") END,
        "ExtractionMessage" = CASE WHEN p_extractionmessage_clear = true THEN NULL ELSE COALESCE(p_extractionmessage, "ExtractionMessage") END,
        "DefinitionFingerprint" = CASE WHEN p_definitionfingerprint_clear = true THEN NULL ELSE COALESCE(p_definitionfingerprint, "DefinitionFingerprint") END,
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwQueries"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQuery" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_query"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_query" ON "__mj"."Query";

CREATE TRIGGER "trg_update_query"
BEFORE UPDATE ON "__mj"."Query"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_query"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queries
-- Item: spDeleteQuery
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Query
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteQuery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteQuery"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Data Context Items.QueryID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DataContextItem"
        WHERE "QueryID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DataContextItem"
        SET "QueryID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Lists.SourceQueryID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."List"
        WHERE "SourceQueryID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."List"
        SET "SourceQueryID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Materialized Result Queries records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."MaterializedResultQuery"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteMaterializedResultQuery"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryDependency"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Dependencies records via DependsOnQueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryDependency"
        WHERE "DependsOnQueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryDependency"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Entities records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryEntity"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryEntity"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Fields records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryField"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryField"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Parameters records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryParameter"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryParameter"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query Permissions records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QueryPermission"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQueryPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Query SQLs records via QueryID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."QuerySQL"
        WHERE "QueryID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteQuerySQL"(v_rec."ID");
    END LOOP;

    
    DELETE FROM "__mj"."Query"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQuery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQuery" TO "cdp_Integration";

-- ===================== HAND-FINISHED (v6.3.0-edge.1 release build) =====================
-- RelatedEntityNameFieldMap for the new foreign keys. The SQL Server CodeGen section sets these with
-- EXEC spUpdateEntityFieldRelatedEntityNameFieldMap; the split converter drops those EXECs (silently
-- inside a metadata batch, or as "unhandled" elsewhere), and the bake does not carry them either, so
-- a PG database built by mj migrate would leave the map NULL. On PostgreSQL the routine is a
-- FUNCTION, so the calls are PERFORM with named arguments (same form as V202609091200).

/* related entity name field map for entity field DAF4AE68-84D8-40CC-9CF9-92BF0B02091B */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'DAF4AE68-84D8-40CC-9CF9-92BF0B02091B'::uuid,
    p_relatedentitynamefieldmap := 'SourceQuery'
  );
END $$;

/* related entity name field map for entity field 399F145C-B667-4A95-8275-2FDBD5A395E1 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '399F145C-B667-4A95-8275-2FDBD5A395E1'::uuid,
    p_relatedentitynamefieldmap := 'RefreshRoutine'
  );
END $$;

