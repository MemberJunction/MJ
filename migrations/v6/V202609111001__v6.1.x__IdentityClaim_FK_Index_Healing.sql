/* ============================================================================
   IdentityClaim — CodeGen metadata healing
   v6.1.x

   Supplies the four IDX_AUTO_MJ_FKEY_* foreign-key indexes that no committed
   migration ever wrote for the IdentityClaim entity, introduced by
   V202608202300__v6.1.x__Identity_Claims_Infrastructure.sql.

   It originally also supplied the EntityFieldValue rows behind
   CK_IdentityClaim_Status and their ValueListType='List' flag. Those now come
   from V202609091200__v6.1.x__IdentityClaim_Metadata_Tail.sql on `next`, and
   supplying them twice duplicates the DATA — see the note at the foot of this
   file.

   WHY THIS IS A HAND-WRITTEN MIGRATION AND NOT A CODEGEN RUN
   ----------------------------------------------------------
   These indexes are normally emitted in a migration's CodeGen tail. They were
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
-- The IdentityClaim.Status value list is NO LONGER SUPPLIED HERE.
--
-- V202609091200__v6.1.x__IdentityClaim_Metadata_Tail.sql on `next` supplies the
-- same four EntityFieldValue rows plus the ValueListType='List' flag. Keeping a
-- second copy here does not merely duplicate work — it duplicates DATA. That
-- migration guards its inserts on PRIMARY KEY, and the ids it checks are its
-- own, so it does not see the rows this migration used to insert under
-- different ids. Both sets land.
--
-- That is not theoretical: it is what the CodeGen drift gate caught on this
-- branch, as a generated Zod union carrying every value twice —
--   Status: z.union([z.literal('Claimed'), z.literal('Claimed'), ...])
--
-- This file now supplies ONLY the four foreign-key indexes, which nothing else
-- provides. See #4329 for the guard defect and its clean-up for databases that
-- already ran both.
-- ============================================================================
