/* ============================================================================
   IdentityClaim — CodeGen metadata healing
   v6.1.x

   Supplies two CodeGen-owned artifacts that no committed migration ever wrote
   for the IdentityClaim entity, introduced by
   V202608202300__v6.1.x__Identity_Claims_Infrastructure.sql:

     1. The four IDX_AUTO_MJ_FKEY_* foreign-key indexes.
     2. The EntityFieldValue rows behind CK_IdentityClaim_Status, plus the
        ValueListType='List' flag that makes them a value list rather than
        four inert rows.

   WHY THIS IS A HAND-WRITTEN MIGRATION AND NOT A CODEGEN RUN
   ----------------------------------------------------------
   Both artifacts are normally emitted in a migration's CodeGen tail. They were
   missing from that one, and nothing since has supplied them, so they exist on
   every developer database (where `mj codegen` creates them locally on the next
   run) and on NO database built purely from committed migrations.

   That asymmetry is exactly why this survived: the integration tier builds its
   database from migrations plus `mj sync push`, with no live CodeGen, and the
   two checks that would have caught it — MC3 (value-list CHECK constraints
   match their EntityFieldValue rows) and MC4 (every FK column has its
   IDX_AUTO_MJ_FKEY index) — were skipping-as-pass because `ctx.Pool` was never
   published to the check context. That skip is fixed on this branch, the checks
   now run for the first time, and this migration is what they found.

   Contents are byte-for-byte the shape `mj codegen` emits for these two cases
   (see V202608042204's tail for the index pattern and V202608042200's for the
   ValueListType update), so a future CodeGen run is a no-op against them rather
   than a competing rewrite.

   PostgreSQL counterpart is NOT hand-authored — conversion is deterministic
   transpilation run by the build engineer at release time.
   ============================================================================ */


-- ============================================================================
-- 1. Foreign-key indexes
--    IdentityClaim has four FK columns (ClaimTypeID, EntityID, ClaimedByUserID,
--    MagicLinkInviteID). CodeGen indexes every field carrying a RelatedEntity,
--    which is what MC4 asserts.
-- ============================================================================

-- Index for foreign key ClaimTypeID in table IdentityClaim
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IdentityClaim_ClaimTypeID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IdentityClaim]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IdentityClaim_ClaimTypeID ON [${flyway:defaultSchema}].[IdentityClaim] ([ClaimTypeID]);

-- Index for foreign key EntityID in table IdentityClaim
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IdentityClaim_EntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IdentityClaim]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IdentityClaim_EntityID ON [${flyway:defaultSchema}].[IdentityClaim] ([EntityID]);

-- Index for foreign key ClaimedByUserID in table IdentityClaim
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IdentityClaim_ClaimedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IdentityClaim]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IdentityClaim_ClaimedByUserID ON [${flyway:defaultSchema}].[IdentityClaim] ([ClaimedByUserID]);

-- Index for foreign key MagicLinkInviteID in table IdentityClaim
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IdentityClaim_MagicLinkInviteID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IdentityClaim]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IdentityClaim_MagicLinkInviteID ON [${flyway:defaultSchema}].[IdentityClaim] ([MagicLinkInviteID]);
GO


-- ============================================================================
-- 2. IdentityClaim.Status value list
--    CK_IdentityClaim_Status permits N'Pending', N'Claimed', N'Expired',
--    N'Revoked'. EntityField F925BD99-4B5A-48A4-878A-385E8F2D87E7 is
--    IdentityClaim.Status (seeded by V202608202300).
--
--    Sequence is ALPHABETICAL, not the CHECK constraint's own order, because
--    that is what CodeGen produces — verified against AIVendorType.Status,
--    whose CHECK reads (Active, Inactive, Deprecated, Preview) while its stored
--    rows and generated union both read Active, Deprecated, Inactive, Preview.
--    Matching that keeps a future CodeGen run a no-op here. MC3 compares the two
--    sets order-insensitively, so ordering is about stability, not the check.
--
--    Guarded on the EntityField still existing: CodeGen retires EntityField rows
--    whose column leaves the base view, and a value-list insert against a
--    retired field would fail the whole migration on a database where that had
--    already happened.
-- ============================================================================

IF EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7')
BEGIN
    /* SQL text to update ValueListType for entity field ID F925BD99-4B5A-48A4-878A-385E8F2D87E7 */
    UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F925BD99-4B5A-48A4-878A-385E8F2D87E7';

    /* SQL text to insert entity field value with ID a8f64737-c447-4aa7-bd4c-4b1c9783c101 */
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7' AND [Value] = 'Pending')
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                               ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                            VALUES
                                               ('a8f64737-c447-4aa7-bd4c-4b1c9783c101', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

    /* SQL text to insert entity field value with ID 930b9a8d-47ad-453f-8a33-379eb4048c40 */
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7' AND [Value] = 'Claimed')
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                               ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                            VALUES
                                               ('930b9a8d-47ad-453f-8a33-379eb4048c40', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 1, 'Claimed', 'Claimed', GETUTCDATE(), GETUTCDATE());

    /* SQL text to insert entity field value with ID 465067c6-772b-4dfb-a05e-204c451ae16e */
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7' AND [Value] = 'Expired')
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                               ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                            VALUES
                                               ('465067c6-772b-4dfb-a05e-204c451ae16e', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

    /* SQL text to insert entity field value with ID 3a477609-4f5a-4a82-ac32-e8a99f1238cb */
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7' AND [Value] = 'Revoked')
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                               ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                            VALUES
                                               ('3a477609-4f5a-4a82-ac32-e8a99f1238cb', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 4, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());
END
GO
