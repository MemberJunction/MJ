/* ============================================================================
   IdentityClaim — EntityRelationship metadata healing
   v6.1.x

   Supplies the four EntityRelationship rows that no committed migration ever
   wrote for the IdentityClaim entity, introduced by
   V202608202300__v6.1.x__Identity_Claims_Infrastructure.sql:

     MJ: Entities             -> MJ: Identity Claims  (via EntityID)
     MJ: Users                -> MJ: Identity Claims  (via ClaimedByUserID)
     MJ: Identity Claim Types -> MJ: Identity Claims  (via ClaimTypeID)
     MJ: Magic Link Invites   -> MJ: Identity Claims  (via MagicLinkInviteID)

   WHY THIS IS A HAND-WRITTEN MIGRATION AND NOT A CODEGEN RUN
   ----------------------------------------------------------
   These rows are normally emitted in a migration's CodeGen tail. They were
   missing from that one, so they exist on every developer database (where
   `mj codegen` creates them locally on the next run) and on NO database built
   purely from committed migrations.

   That asymmetry is why the CodeGen drift gate is red on `next`: against a
   clean database it re-emits exactly these four inserts, which the gate then
   reports as uncommitted output. See issue #4323.

   RELATIONSHIP TO THE SIBLING HEALING MIGRATION
   ---------------------------------------------
   V202609081830__v6.1.x__IdentityClaim_Metadata_Healing.sql (on the
   field-level-security branch, #3367) supplies the OTHER half of the same gap:
   the four IDX_AUTO_MJ_FKEY_* indexes and the EntityFieldValue rows behind
   CK_IdentityClaim_Status. It does not cover EntityRelationship, which is why
   that branch still emits a CodeGen_Run migration. The two are disjoint and
   both are needed; neither supersedes the other.

   IDEMPOTENCY
   -----------
   Guarded on the NATURAL key (EntityID + RelatedEntityID + RelatedEntityJoinField)
   rather than on the primary key, following the pattern in the sibling migration.
   Every developer database already has these rows under locally-generated IDs, so
   an ID-keyed guard would insert duplicates there.

   Sequence carries the LITERAL CodeGen emits, deliberately. The apply-time
   MAX(Sequence)+1 expression that `migrations/CLAUDE.md` mandates for EntityField
   does NOT transfer to EntityRelationship: that rule exists because a repeatable
   script renumbers EntityField sequences and a literal collides on
   UQ_EntityField_EntityID_Sequence. EntityRelationship has no such unique
   constraint and no renumbering script. It does, however, determine the ORDER of
   related-entity tabs in the generated form components — so MAX+1 assigns a
   different number than CodeGen would (110 rather than 105 for MJ: Users on a
   clean database), which relocates the Identity Claims tab and reintroduces the
   very drift this migration exists to remove. Verified empirically both ways.
   ============================================================================ */

DECLARE @IdentityClaimsEntityID UNIQUEIDENTIFIER = '58C8C895-E3AA-48C2-BA68-808337235873';

/* MJ: Entities -> MJ: Identity Claims (One To Many via EntityID) */
IF NOT EXISTS (
    SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship]
    WHERE [EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6'
      AND [RelatedEntityID] = @IdentityClaimsEntityID
      AND [RelatedEntityJoinField] = 'EntityID'
)
    INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
        ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES
        ('aaac1d32-48e3-4841-b548-3c2bfb07e748', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', @IdentityClaimsEntityID, 'EntityID', 'One To Many', 1, 1,
         78,
         GETUTCDATE(), GETUTCDATE());

/* MJ: Users -> MJ: Identity Claims (One To Many via ClaimedByUserID) */
IF NOT EXISTS (
    SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship]
    WHERE [EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6'
      AND [RelatedEntityID] = @IdentityClaimsEntityID
      AND [RelatedEntityJoinField] = 'ClaimedByUserID'
)
    INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
        ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES
        ('77a9c59d-457c-44ea-b782-40e2a7e53216', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', @IdentityClaimsEntityID, 'ClaimedByUserID', 'One To Many', 1, 1,
         105,
         GETUTCDATE(), GETUTCDATE());

/* MJ: Identity Claim Types -> MJ: Identity Claims (One To Many via ClaimTypeID) */
IF NOT EXISTS (
    SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship]
    WHERE [EntityID] = '38D9DE43-C0C2-45DA-81BB-A815B30F86FB'
      AND [RelatedEntityID] = @IdentityClaimsEntityID
      AND [RelatedEntityJoinField] = 'ClaimTypeID'
)
    INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
        ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES
        ('1c1f629c-800c-47ff-9ec3-166d0ced7835', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', @IdentityClaimsEntityID, 'ClaimTypeID', 'One To Many', 1, 1,
         1,
         GETUTCDATE(), GETUTCDATE());

/* MJ: Magic Link Invites -> MJ: Identity Claims (One To Many via MagicLinkInviteID) */
IF NOT EXISTS (
    SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship]
    WHERE [EntityID] = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A'
      AND [RelatedEntityID] = @IdentityClaimsEntityID
      AND [RelatedEntityJoinField] = 'MagicLinkInviteID'
)
    INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
        ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES
        ('4bf2b009-557d-49a5-b2b1-623d57d8e58f', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', @IdentityClaimsEntityID, 'MagicLinkInviteID', 'One To Many', 1, 1,
         6,
         GETUTCDATE(), GETUTCDATE());


/* ----------------------------------------------------------------------------
   The other half of the same gap: the EntityFieldValue rows behind
   CK_IdentityClaim_Status and the ValueListType flag that makes them a value
   list. #3367 carries an equivalent block in
   V202609081830__v6.1.x__IdentityClaim_Metadata_Healing.sql; `next` needs it
   independently and cannot wait on that PR. Both are guarded on the natural key
   (EntityFieldID + Value), so whichever applies first wins and the other is a
   no-op — they cannot double-insert.
   ---------------------------------------------------------------------------- */

DECLARE @StatusFieldID UNIQUEIDENTIFIER = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] = @StatusFieldID AND [Value] = 'Claimed')
    INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES ('30826223-bea0-48f3-b349-a2ed2e87048b', @StatusFieldID, 1, 'Claimed', 'Claimed', GETUTCDATE(), GETUTCDATE());

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] = @StatusFieldID AND [Value] = 'Expired')
    INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES ('5b980399-46d4-458d-b1cf-35e6ef56b2db', @StatusFieldID, 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] = @StatusFieldID AND [Value] = 'Pending')
    INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES ('103fc4fd-d6c5-4ec7-9399-07446400fb69', @StatusFieldID, 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] = @StatusFieldID AND [Value] = 'Revoked')
    INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES ('f7e989d9-c0b5-4000-b362-e98372c5ff5a', @StatusFieldID, 4, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType = 'List' WHERE ID = @StatusFieldID AND ISNULL(ValueListType, '') <> 'List';


/* ----------------------------------------------------------------------------
   Third artifact of the same gap: the RelatedEntityNameFieldMap for the three
   IdentityClaim foreign-key fields. CodeGen sets these through a stored
   procedure rather than a direct UPDATE, and the proc is idempotent, so these
   need no guard.
   ---------------------------------------------------------------------------- */

EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='505DF1FB-2C77-40CD-80D6-6AFDAF64840F', @RelatedEntityNameFieldMap='ClaimType';
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='23CE09B7-480A-4A7B-8167-C6883F5657C3', @RelatedEntityNameFieldMap='Entity';
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FF9B7A6A-B843-4738-BD9C-4A4375C419D5', @RelatedEntityNameFieldMap='ClaimedByUser';
