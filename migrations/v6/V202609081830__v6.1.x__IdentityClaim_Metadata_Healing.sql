/* ============================================================================
   IdentityClaim — CodeGen metadata healing
   v6.1.x

   Supplies the CodeGen-owned artifact that no committed migration ever wrote
   for the IdentityClaim entity, introduced by
   V202608202300__v6.1.x__Identity_Claims_Infrastructure.sql:

     1. The four IDX_AUTO_MJ_FKEY_* foreign-key indexes.

   SCOPE NARROWED — the value list now belongs to next's migration
   ---------------------------------------------------------------
   This migration also seeded the EntityFieldValue rows behind
   CK_IdentityClaim_Status and set ValueListType='List'. That half was removed
   when `next` shipped V202609091200__v6.1.x__IdentityClaim_Metadata_Tail.sql,
   which supplies the same four values (plus the entity relationships and name
   field maps this migration never covered) as the canonical CodeGen tail.

   Leaving both in place did not conflict — it silently DUPLICATED. The two
   guard on different things: this migration keyed IF NOT EXISTS on
   (EntityFieldID, Value), next's keys on the row ID, and the two sets of IDs
   were generated independently. This migration sorts first, so on a database
   built from migrations next's guard never matched its own rows and inserted a
   second copy of all four. EntityFieldValue's only key is PK(ID), so nothing
   errors — the value list simply comes back doubled, and CodeGen's generated
   union and every dropdown with it. Another defect visible only on a
   from-scratch build.

   The index half stays here: next's tail writes EntityRelationship rows, not
   the IDX_AUTO_MJ_FKEY indexes MC4 asserts, so the two are complementary.

   WHY THIS IS A HAND-WRITTEN MIGRATION AND NOT A CODEGEN RUN
   ----------------------------------------------------------
   The indexes are normally emitted in a migration's CodeGen tail. They were
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

   Contents are byte-for-byte the shape `mj codegen` emits for this case (see
   V202608042204's tail for the index pattern), so a future CodeGen run is a
   no-op against them rather than a competing rewrite.

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
