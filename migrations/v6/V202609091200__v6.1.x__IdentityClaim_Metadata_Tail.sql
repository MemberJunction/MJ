-- =============================================================================
-- Identity Claims metadata tail: EntityFieldValue, ValueListType, relationships, field name mappings
-- =============================================================================
--
-- V202608202300 created MJ: Identity Claims and IdentityClaimType schema objects,
-- but omitted the CodeGen metadata tail for Status value list entries, the four
-- foreign key relationships, and related entity name field maps. Every clean-database
-- CodeGen run emitted these as drift.
-- =============================================================================

/* SQL text to insert entity field value with ID 13c6f030-eb13-4292-bc90-86ee7c0c574a */
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [ID] = '13c6f030-eb13-4292-bc90-86ee7c0c574a')
BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
      ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
   VALUES
      ('13c6f030-eb13-4292-bc90-86ee7c0c574a', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 1, 'Claimed', 'Claimed', GETUTCDATE(), GETUTCDATE());
END
GO

/* SQL text to insert entity field value with ID 5c3f70bc-3be1-4407-9502-7367ebf8e033 */
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [ID] = '5c3f70bc-3be1-4407-9502-7367ebf8e033')
BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
      ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
   VALUES
      ('5c3f70bc-3be1-4407-9502-7367ebf8e033', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());
END
GO

/* SQL text to insert entity field value with ID 60bd4443-6f13-4113-8695-6ab7bb0a5e86 */
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [ID] = '60bd4443-6f13-4113-8695-6ab7bb0a5e86')
BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
      ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
   VALUES
      ('60bd4443-6f13-4113-8695-6ab7bb0a5e86', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());
END
GO

/* SQL text to insert entity field value with ID d055221f-7370-4cb5-8d81-285dbf5d4605 */
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [ID] = 'd055221f-7370-4cb5-8d81-285dbf5d4605')
BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
      ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
   VALUES
      ('d055221f-7370-4cb5-8d81-285dbf5d4605', 'F925BD99-4B5A-48A4-878A-385E8F2D87E7', 4, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());
END
GO

/* SQL text to update ValueListType for entity field ID F925BD99-4B5A-48A4-878A-385E8F2D87E7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F925BD99-4B5A-48A4-878A-385E8F2D87E7';
GO

/* Create Entity Relationship: MJ: Entities -> MJ: Identity Claims (One To Many via EntityID) */
IF NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dd73e538-5890-4ab3-a0b3-4fce34002a9c'
)
BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
   VALUES ('dd73e538-5890-4ab3-a0b3-4fce34002a9c', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '58C8C895-E3AA-48C2-BA68-808337235873', 'EntityID', 'One To Many', 1, 1, 78, GETUTCDATE(), GETUTCDATE());
END
GO

/* Create Entity Relationship: MJ: Users -> MJ: Identity Claims (One To Many via ClaimedByUserID) */
IF NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5cae8afe-d085-4484-a398-1a578fadb13a'
)
BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
   VALUES ('5cae8afe-d085-4484-a398-1a578fadb13a', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '58C8C895-E3AA-48C2-BA68-808337235873', 'ClaimedByUserID', 'One To Many', 1, 1, 105, GETUTCDATE(), GETUTCDATE());
END
GO

/* Create Entity Relationship: MJ: Identity Claim Types -> MJ: Identity Claims (One To Many via ClaimTypeID) */
IF NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '35846e5b-e9fb-49c7-bef4-0f1f6ed50266'
)
BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
   VALUES ('35846e5b-e9fb-49c7-bef4-0f1f6ed50266', '38D9DE43-C0C2-45DA-81BB-A815B30F86FB', '58C8C895-E3AA-48C2-BA68-808337235873', 'ClaimTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE());
END
GO

/* Create Entity Relationship: MJ: Magic Link Invites -> MJ: Identity Claims (One To Many via MagicLinkInviteID) */
IF NOT EXISTS (
   SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '60d6c822-ee90-4e82-a201-0da1b7508edf'
)
BEGIN
   INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
   VALUES ('60d6c822-ee90-4e82-a201-0da1b7508edf', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', '58C8C895-E3AA-48C2-BA68-808337235873', 'MagicLinkInviteID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE());
END
GO

/* SQL text to update entity field related entity name field map for entity field ID 505DF1FB-2C77-40CD-80D6-6AFDAF64840F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='505DF1FB-2C77-40CD-80D6-6AFDAF64840F', @RelatedEntityNameFieldMap='ClaimType';
GO

/* SQL text to update entity field related entity name field map for entity field ID 23CE09B7-480A-4A7B-8167-C6883F5657C3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='23CE09B7-480A-4A7B-8167-C6883F5657C3', @RelatedEntityNameFieldMap='Entity';
GO

/* SQL text to update entity field related entity name field map for entity field ID FF9B7A6A-B843-4738-BD9C-4A4375C419D5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FF9B7A6A-B843-4738-BD9C-4A4375C419D5', @RelatedEntityNameFieldMap='ClaimedByUser';
GO
