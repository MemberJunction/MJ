-- ==============================================================================================
-- V202609092100 — backfill the per-connection catalog from the shared one
-- ==============================================================================================
--
-- Ticket MJC-264. Runs after V202609091900 has created CompanyIntegrationObject (CIO) and
-- CompanyIntegrationObjectField (CIOF). This is the CUTOVER: it gives every existing connection
-- its own copy of the shared catalog so that, from this migration forward, nothing has to read
-- IntegrationObject / IntegrationObjectField at runtime.
--
-- WHY SET-BASED SQL AND NOT A SCRIPT. Doing this through BaseEntity.Save() is roughly nine
-- serialized round trips per row, and this fans out across EVERY connection in the workspace —
-- objects times fields times connections. INSERT..SELECT is the only shape that finishes.
--
-- WHY ${mjSchema} AND NOT THE FLYWAY DEFAULT-SCHEMA PLACEHOLDER. This migration is applied under
-- `--schema mjc_integration_catalog` so it keeps its own flyway history. Under that flag the
-- flyway built-in resolves to the HISTORY schema, not the core schema — so it must not appear in
-- this file at all, not even in a comment, because placeholders are substituted in comments too.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. It does not modify, delete or renumber anything in the
-- shared catalog. IntegrationObject and IntegrationObjectField are read here and nowhere written.
--
-- IDEMPOTENT. Every INSERT is guarded by NOT EXISTS on the table's own unique key
-- — (CompanyIntegrationID, Name) for CIO, (CompanyIntegrationObjectID, Name) for CIOF — rather
-- than by MERGE. A guard states the intent in the same words in both dialects, and it COMPLETES a
-- partially applied run instead of refusing it, which is what you want after a connection timed
-- out halfway through.
--
-- NEVER INSERTS __mj_CreatedAt / __mj_UpdatedAt. Both have defaults and MemberJunction owns them.
-- ID is omitted for the same reason: the table default (newsequentialid()) mints it.
-- ==============================================================================================


-- ==============================================================================================
-- 1. Objects — one CIO per (connection, shared IntegrationObject of that connection's integration)
-- ==============================================================================================
--
-- FANS OUT TO EVERY CompanyIntegration, INCLUDING IsActive = 0. A paused connection must survive
-- the cutover. If it were skipped it would silently own no catalog at all, and the moment someone
-- resumed it the fail-loud check would refuse it — a connection that worked yesterday breaking
-- because it happened to be paused during a migration.
--
-- STATUS FILTER: an ALLOW-LIST of Active and Disabled, not a deny-list of Deprecated. Disabled
-- objects belong in the catalog — catalog MEMBERSHIP and sync SELECTION are separate axes now,
-- and that separation is the entire reason these tables exist. Deprecated is the connector saying
-- the object is gone; copying one would resurrect it per connection with nothing left to clear it
-- out. Written as an allow-list because that also excludes any status value added to the shared
-- catalog after this migration, which is the safe default for a cutover nobody will revisit.
--
-- CONFIRMED against the v5.51.0 baseline, both dialects: CK_IntegrationObject_Status and
-- CK_IntegrationObjectField_Status permit exactly Active, Deprecated and Disabled. So this
-- allow-list is COMPLETE — there is no fourth value and no 'Inactive', and nothing can be silently
-- skipped by it.
--
-- Status is copied VERBATIM below and is NOT the selection axis. See the IsSelected note.
--
-- PROVENANCE IS LOSSY HERE, HONESTLY SO. The shared rows carry one MetadataSource for the whole
-- row; they do not record which individual attribute came from a connector manifest and which
-- from a discovery run. The bootstrap therefore cannot reconstruct per-attribute provenance and
-- does not pretend to: MetadataSource = 'Discovered' becomes 'Sampled', everything else becomes
-- 'Declared'. ProvenanceDetail — the per-attribute merge log — is NULL because no such log was
-- ever written for these rows. The first real discovery on each connection replaces both.
--
-- FirstSeenAt = LastSeenAt = the source row's __mj_CreatedAt: the earliest defensible evidence
-- that this connection's connector exposed the object. LastSampledAt is NULL because the backfill
-- did not sample anything, and "never sampled" is exactly what distinguishes a declared width
-- from an observed one.
WITH selected_object AS (
    -- One row per (connection, lowercased external object name) — GROUP BY is load-bearing, not
    -- tidiness: a LEFT JOIN to an ungrouped map table would MULTIPLY the CIO rows for any
    -- connection holding two maps that differ only by case, and the unique key would then abort
    -- the whole migration. MIN() picks the earliest map as the selection timestamp.
    SELECT em.[CompanyIntegrationID]        AS connection_id,
           LOWER(em.[ExternalObjectName])   AS object_name,
           MIN(em.[__mj_CreatedAt])         AS selected_at
    FROM [${mjSchema}].[CompanyIntegrationEntityMap] em
    WHERE em.[Status] = 'Active'
      AND em.[SyncEnabled] = 1
    GROUP BY em.[CompanyIntegrationID], LOWER(em.[ExternalObjectName])
)
INSERT INTO [${mjSchema}].[CompanyIntegrationObject] (
    [IntegrationID], [Name], [DisplayName], [Description], [Category], [APIPath],
    [ResponseDataKey], [DefaultPageSize], [SupportsPagination], [PaginationType],
    [SupportsIncrementalSync], [SupportsWrite], [DefaultQueryParams], [Configuration],
    [Sequence], [Status], [WriteAPIPath], [WriteMethod], [DeleteMethod], [IsCustom],
    [CreateAPIPath], [CreateMethod], [CreateBodyShape], [CreateBodyKey], [CreateIDLocation],
    [UpdateAPIPath], [UpdateMethod], [UpdateBodyShape], [UpdateBodyKey], [UpdateIDLocation],
    [DeleteAPIPath], [DeleteIDLocation], [IncrementalWatermarkField], [MetadataSource],
    [SupportsCreate], [SupportsUpdate], [SupportsDelete], [SyncStrategy],
    [ContentHashApplicable], [StableOrderingKey], [CompanyIntegrationID], [IntegrationObjectID],
    [Provenance], [ProvenanceDetail], [IsSelected], [SelectedAt], [FirstSeenAt], [LastSeenAt],
    [LastSampledAt])
SELECT
    -- The 40 shared columns, copied VERBATIM. Nothing is recomputed or normalised: the cutover
    -- must be a pure copy, or a connection's behaviour changes on the day of the migration and
    -- nobody can tell the backfill's edits apart from a real regression.
    io.[IntegrationID], io.[Name], io.[DisplayName], io.[Description], io.[Category],
    io.[APIPath], io.[ResponseDataKey], io.[DefaultPageSize], io.[SupportsPagination],
    io.[PaginationType], io.[SupportsIncrementalSync], io.[SupportsWrite],
    io.[DefaultQueryParams], io.[Configuration], io.[Sequence], io.[Status], io.[WriteAPIPath],
    io.[WriteMethod], io.[DeleteMethod], io.[IsCustom], io.[CreateAPIPath], io.[CreateMethod],
    io.[CreateBodyShape], io.[CreateBodyKey], io.[CreateIDLocation], io.[UpdateAPIPath],
    io.[UpdateMethod], io.[UpdateBodyShape], io.[UpdateBodyKey], io.[UpdateIDLocation],
    io.[DeleteAPIPath], io.[DeleteIDLocation], io.[IncrementalWatermarkField],
    io.[MetadataSource], io.[SupportsCreate], io.[SupportsUpdate], io.[SupportsDelete],
    io.[SyncStrategy], io.[ContentHashApplicable], io.[StableOrderingKey],
    ci.[ID],                                                        -- CompanyIntegrationID
    io.[ID],                                                        -- IntegrationObjectID: the provenance link back to the row this was derived from
    CASE WHEN io.[MetadataSource] = 'Discovered'
         THEN 'Sampled' ELSE 'Declared' END,                        -- Provenance (lossy — see the note above)
    CAST(NULL AS NVARCHAR(MAX)),                                    -- ProvenanceDetail: no merge log was ever recorded for a shared row
    CASE WHEN so.selected_at IS NOT NULL
         THEN 1 ELSE 0 END,                                         -- IsSelected: comes from the MAPS, never from Status
    so.selected_at,                                                 -- SelectedAt: when the map that selects it was created
    io.[__mj_CreatedAt],                                            -- FirstSeenAt
    io.[__mj_CreatedAt],                                            -- LastSeenAt
    CAST(NULL AS DATETIMEOFFSET(7))                                 -- LastSampledAt: the backfill sampled nothing
FROM [${mjSchema}].[CompanyIntegration] ci
INNER JOIN [${mjSchema}].[IntegrationObject] io
        ON io.[IntegrationID] = ci.[IntegrationID]
LEFT JOIN selected_object so
       ON so.connection_id = ci.[ID]
    -- CASE-INSENSITIVE on purpose. The database collation happens to be case-insensitive today,
    -- but LOWER() on both sides states the intent instead of inheriting it: an entity map's
    -- ExternalObjectName is typed by a human or lifted from an API response, and it matches the
    -- catalog object by name, not by id. A case mismatch would silently deselect an object the
    -- customer is actively syncing.
      AND so.object_name   = LOWER(io.[Name])
WHERE io.[Status] IN ('Active', 'Disabled')
  AND NOT EXISTS (
        SELECT 1 FROM [${mjSchema}].[CompanyIntegrationObject] existing
        WHERE existing.[CompanyIntegrationID] = ci.[ID]
          AND existing.[Name] = io.[Name]);
GO
--
-- CONFIRMED against the baseline: CK_*_MetadataSource permits exactly Declared, Discovered and
-- Custom. So "everything else" is Declared OR Custom, and a Custom row — one a customer added by
-- hand — is recorded here as 'Declared'. That is deliberate: the per-connection Provenance domain
-- is Declared/Endpoint/Sampled and has no slot for it, and of the three, 'Declared' is the only one
-- that is true of a curated definition. It is not a sampled shape and it did not come from an
-- endpoint.


-- ==============================================================================================
-- 2. Fields — one CIOF per IntegrationObjectField of each object copied above
-- ==============================================================================================
--
-- Driven from CIO, not from IntegrationObject, so it inherits the connection fan-out and the
-- object status filter for free and cannot disagree with step 1 about which objects exist.
--
-- IsSelected for a field is an ACTIVE FIELD MAP under an ACTIVE, SYNC-ENABLED ENTITY MAP,
-- matched on SourceFieldName case-insensitively. A field map hanging off a disabled entity map
-- selects nothing, because the object it belongs to is not being synced at all.
--
-- RelatedCompanyIntegrationObjectID is left NULL here and resolved in step 3. It cannot be
-- resolved in this statement without depending on the row ordering of an INSERT that is still
-- running, and keeping it separate means a re-run repairs a half-resolved table.
WITH selected_field AS (
    -- Same GROUP BY reason as step 1: this MUST be one row per (connection, object, field) or the
    -- LEFT JOIN below multiplies field rows and the unique key aborts the migration.
    SELECT em.[CompanyIntegrationID]        AS connection_id,
           LOWER(em.[ExternalObjectName])   AS object_name,
           LOWER(fm.[SourceFieldName])      AS field_name,
           MIN(fm.[__mj_CreatedAt])         AS selected_at
    FROM [${mjSchema}].[CompanyIntegrationFieldMap] fm
    INNER JOIN [${mjSchema}].[CompanyIntegrationEntityMap] em
            ON em.[ID] = fm.[EntityMapID]
    WHERE fm.[Status] = 'Active'
      AND em.[Status] = 'Active'
      AND em.[SyncEnabled] = 1
    GROUP BY em.[CompanyIntegrationID], LOWER(em.[ExternalObjectName]), LOWER(fm.[SourceFieldName])
)
INSERT INTO [${mjSchema}].[CompanyIntegrationObjectField] (
    [Name], [DisplayName], [Description], [Category], [Type], [Length], [Precision], [Scale],
    [AllowsNull], [DefaultValue], [IsPrimaryKey], [IsUniqueKey], [IsReadOnly], [IsRequired],
    [RelatedIntegrationObjectFieldName], [Sequence], [Configuration], [Status], [IsCustom],
    [MetadataSource], [CompanyIntegrationObjectID], [RelatedCompanyIntegrationObjectID],
    [IntegrationObjectFieldID], [ObservedMaxLength], [Provenance], [ProvenanceDetail],
    [IsSelected], [SelectedAt], [FirstSeenAt], [LastSeenAt], [LastSampledAt])
SELECT
    -- The 20 shared columns, copied VERBATIM. IntegrationObjectID and RelatedIntegrationObjectID
    -- are absent by design: on this table they are VIEW ALIASES over the per-connection ids, which
    -- is what lets the connector repository keep reading the old names and get per-connection
    -- values back.
    iof.[Name], iof.[DisplayName], iof.[Description], iof.[Category], iof.[Type], iof.[Length],
    iof.[Precision], iof.[Scale], iof.[AllowsNull], iof.[DefaultValue], iof.[IsPrimaryKey],
    iof.[IsUniqueKey], iof.[IsReadOnly], iof.[IsRequired],
    iof.[RelatedIntegrationObjectFieldName], iof.[Sequence], iof.[Configuration], iof.[Status],
    iof.[IsCustom], iof.[MetadataSource],
    cio.[ID],                                                       -- CompanyIntegrationObjectID
    CAST(NULL AS UNIQUEIDENTIFIER),                                 -- RelatedCompanyIntegrationObjectID: resolved in step 3
    iof.[ID],                                                       -- IntegrationObjectFieldID: the provenance link
    CAST(NULL AS INT),                                              -- ObservedMaxLength: nothing was sampled, so there is no observed width
    CASE WHEN iof.[MetadataSource] = 'Discovered'
         THEN 'Sampled' ELSE 'Declared' END,                        -- Provenance (lossy — see step 1)
    CAST(NULL AS NVARCHAR(MAX)),                                    -- ProvenanceDetail
    CASE WHEN sf.selected_at IS NOT NULL
         THEN 1 ELSE 0 END,                                         -- IsSelected: from the field MAPS, never from Status
    sf.selected_at,                                                 -- SelectedAt
    iof.[__mj_CreatedAt],                                           -- FirstSeenAt
    iof.[__mj_CreatedAt],                                           -- LastSeenAt
    CAST(NULL AS DATETIMEOFFSET(7))                                 -- LastSampledAt
FROM [${mjSchema}].[CompanyIntegrationObject] cio
INNER JOIN [${mjSchema}].[IntegrationObjectField] iof
        ON iof.[IntegrationObjectID] = cio.[IntegrationObjectID]
LEFT JOIN selected_field sf
       ON sf.connection_id = cio.[CompanyIntegrationID]
      AND sf.object_name   = LOWER(cio.[Name])
      AND sf.field_name    = LOWER(iof.[Name])
WHERE cio.[IntegrationObjectID] IS NOT NULL   -- only rows this backfill derived from a shared object have fields to copy
  AND iof.[Status] IN ('Active', 'Disabled')
  AND NOT EXISTS (
        SELECT 1 FROM [${mjSchema}].[CompanyIntegrationObjectField] existing
        WHERE existing.[CompanyIntegrationObjectID] = cio.[ID]
          AND existing.[Name] = iof.[Name]);
GO


-- ==============================================================================================
-- 3. Dependency edges — repoint every RelatedIntegrationObjectID at THIS connection's copy
-- ==============================================================================================
--
-- THE SILENT-FAILURE STATEMENT. The source field's RelatedIntegrationObjectID names a row in the
-- SHARED IntegrationObject table. Copying that id straight across would store, in a column whose
-- foreign key points at CompanyIntegrationObject, an id that exists only in a different table —
-- so every dependency edge the sync walks would resolve to nothing, with no error anywhere. The
-- id must be translated to the copy of that same object belonging to the SAME connection.
--
-- The join is unique by construction: this backfill inserts at most one CIO per
-- (CompanyIntegrationID, IntegrationObjectID), because the shared catalog holds at most one
-- IntegrationObject per (IntegrationID, Name) and the guard in step 1 is keyed on that Name.
--
-- A field whose related object was Deprecated (and so was not copied) matches nothing and keeps
-- NULL. That is correct: this connection has no such object, and a dangling edge would be worse.
--
-- Idempotent: only NULL edges on rows carrying a provenance link are touched, so a re-run repairs
-- what a half-finished run left behind and changes nothing else.
UPDATE ciof
   SET ciof.[RelatedCompanyIntegrationObjectID] = related_cio.[ID]
  FROM [${mjSchema}].[CompanyIntegrationObjectField] ciof
 INNER JOIN [${mjSchema}].[IntegrationObjectField] iof
         ON iof.[ID] = ciof.[IntegrationObjectFieldID]
 INNER JOIN [${mjSchema}].[CompanyIntegrationObject] owner_cio
         ON owner_cio.[ID] = ciof.[CompanyIntegrationObjectID]
 INNER JOIN [${mjSchema}].[CompanyIntegrationObject] related_cio
         ON related_cio.[CompanyIntegrationID] = owner_cio.[CompanyIntegrationID]
        AND related_cio.[IntegrationObjectID]  = iof.[RelatedIntegrationObjectID]
 WHERE iof.[RelatedIntegrationObjectID] IS NOT NULL
   AND ciof.[RelatedCompanyIntegrationObjectID] IS NULL;
GO
