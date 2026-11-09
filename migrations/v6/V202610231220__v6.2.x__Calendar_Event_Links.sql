-- ============================================================================
-- Calendars in Communication (plan: plans/bound-data-access-and-calendars.md, A18)
-- ============================================================================
-- CalendarEventLink ties any record to an event in one external calendar
-- (Outlook through MS Graph, Google Calendar), so an app needs no calendar
-- column on its own tables. The provider's event ID is per mailbox; the
-- iCalendar UID is the same in every attendee's calendar, so it is what
-- another app matches on.
--
-- CalendarSyncState holds one sync cursor per calendar (a Graph delta link or a
-- Google sync token). Both providers issue cursors per calendar, not per event,
-- so the cursor does not live on the link.
--
-- Additive only. CodeGen owns the entities, views, procedures and generated
-- classes. PostgreSQL counterpart is produced by the release build.
-- ============================================================================

CREATE TABLE [${flyway:defaultSchema}].[CalendarEventLink] (
    [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_CalendarEventLink_ID] DEFAULT NEWSEQUENTIALID(),
    [CommunicationProviderID] UNIQUEIDENTIFIER NOT NULL,
    [AccountIdentifier] NVARCHAR(255) NOT NULL,
    [CalendarID] NVARCHAR(500) NULL,
    [ExternalEventID] NVARCHAR(500) NOT NULL,
    [ExternalSeriesID] NVARCHAR(500) NULL,
    [ICalUID] NVARCHAR(1000) NULL,
    [EntityID] UNIQUEIDENTIFIER NOT NULL,
    [RecordID] NVARCHAR(450) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_CalendarEventLink_Status] DEFAULT N'Active',
    [LastSyncedAt] DATETIMEOFFSET NULL,
    CONSTRAINT [PK_CalendarEventLink] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_CalendarEventLink_CommunicationProvider] FOREIGN KEY ([CommunicationProviderID]) REFERENCES [${flyway:defaultSchema}].[CommunicationProvider]([ID]),
    CONSTRAINT [FK_CalendarEventLink_Entity] FOREIGN KEY ([EntityID]) REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [CK_CalendarEventLink_Status] CHECK ([Status] IN (N'Active', N'Cancelled'))
);
GO

CREATE TABLE [${flyway:defaultSchema}].[CalendarSyncState] (
    [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_CalendarSyncState_ID] DEFAULT NEWSEQUENTIALID(),
    [CommunicationProviderID] UNIQUEIDENTIFIER NOT NULL,
    [AccountIdentifier] NVARCHAR(255) NOT NULL,
    [CalendarID] NVARCHAR(500) NULL,
    [SyncToken] NVARCHAR(MAX) NULL,
    [LastSyncedAt] DATETIMEOFFSET NULL,
    CONSTRAINT [PK_CalendarSyncState] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_CalendarSyncState_CommunicationProvider] FOREIGN KEY ([CommunicationProviderID]) REFERENCES [${flyway:defaultSchema}].[CommunicationProvider]([ID]),
    -- One cursor per calendar: two syncs of the same calendar racing must not create two rows.
    CONSTRAINT [UQ_CalendarSyncState_Calendar] UNIQUE ([CommunicationProviderID], [AccountIdentifier], [CalendarID])
);
GO

-- ---------------------------------------------------------------------------
-- Descriptions
-- ---------------------------------------------------------------------------

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Ties a record to an event in an external calendar (MS Graph, Google Calendar), so any record can be linked to an event without a calendar column on its own table.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarEventLink';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The calendar account the event lives in: a mailbox address for MS Graph, the account for Google. Later syncs and changes go to the same account.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarEventLink', @level2type = N'COLUMN', @level2name = N'AccountIdentifier';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The calendar within the account. Null means the account''s default calendar.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarEventLink', @level2type = N'COLUMN', @level2name = N'CalendarID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The provider''s ID for the event in this account. It differs between attendees'' calendars; match across calendars on ICalUID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarEventLink', @level2type = N'COLUMN', @level2name = N'ExternalEventID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The provider''s ID for the recurring series this event belongs to, when it is an occurrence or exception of one.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarEventLink', @level2type = N'COLUMN', @level2name = N'ExternalSeriesID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The event''s iCalendar UID (Graph iCalUId, Google iCalUID). The same in every attendee''s calendar, so other apps match an imported event to this link by it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarEventLink', @level2type = N'COLUMN', @level2name = N'ICalUID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The entity of the linked record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarEventLink', @level2type = N'COLUMN', @level2name = N'EntityID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The linked record''s primary key, in the compact URL-segment form (a bare value for a single-column key).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarEventLink', @level2type = N'COLUMN', @level2name = N'RecordID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Active, or Cancelled once the event is cancelled, in the calendar or through MemberJunction.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarEventLink', @level2type = N'COLUMN', @level2name = N'Status';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When a change to this event was last read from or written to the calendar.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarEventLink', @level2type = N'COLUMN', @level2name = N'LastSyncedAt';
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One sync cursor per external calendar, so an incremental sync reads only what changed since the last one.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarSyncState';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The calendar account: a mailbox address for MS Graph, the account for Google.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarSyncState', @level2type = N'COLUMN', @level2name = N'AccountIdentifier';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The calendar within the account. Null means the account''s default calendar.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarSyncState', @level2type = N'COLUMN', @level2name = N'CalendarID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The provider''s cursor for the next incremental sync: a Graph delta link or a Google sync token. Null until the first sync.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarSyncState', @level2type = N'COLUMN', @level2name = N'SyncToken';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When this calendar was last synced.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'CalendarSyncState', @level2type = N'COLUMN', @level2name = N'LastSyncedAt';
GO























































/* ============================================================================
   EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.

   It holds the Entity and EntityField rows for MJ: Calendar Event Links and
   MJ: Calendar Sync States, their timestamp columns, value lists, foreign-key
   indexes, base views, spCreate / spUpdate / spDelete procedures, update
   triggers, entity permissions, application entities and grants.

   DO NOT EDIT BY HAND. If the DDL above changes, re-run CodeGen and replace
   this entire generated section.
   ============================================================================ */

/* SQL generated to create new entity MJ: Calendar Event Links */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'bd4b67c8-001b-4cd3-af76-29f56b9f28b9',
         'MJ: Calendar Event Links',
         'Calendar Event Links',
         'Ties a record to an event in an external calendar (MS Graph, Google Calendar), so any record can be linked to an event without a calendar column on its own table.',
         NULL,
         'CalendarEventLink',
         'vwCalendarEventLinks',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Calendar Event Links to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'bd4b67c8-001b-4cd3-af76-29f56b9f28b9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Calendar Event Links for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Calendar Event Links for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Calendar Event Links for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('bd4b67c8-001b-4cd3-af76-29f56b9f28b9' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Calendar Sync States */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '4b414728-c375-4cb4-987d-1b6a440fd239',
         'MJ: Calendar Sync States',
         'Calendar Sync States',
         'One sync cursor per external calendar, so an incremental sync reads only what changed since the last one.',
         NULL,
         'CalendarSyncState',
         'vwCalendarSyncStates',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Calendar Sync States to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4b414728-c375-4cb4-987d-1b6a440fd239', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Calendar Sync States for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Calendar Sync States for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Calendar Sync States for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4b414728-c375-4cb4-987d-1b6a440fd239' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CalendarSyncState */
ALTER TABLE [${flyway:defaultSchema}].[CalendarSyncState] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CalendarSyncState */
UPDATE [${flyway:defaultSchema}].[CalendarSyncState] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CalendarSyncState */
ALTER TABLE [${flyway:defaultSchema}].[CalendarSyncState] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CalendarSyncState */
ALTER TABLE [${flyway:defaultSchema}].[CalendarSyncState] ADD CONSTRAINT [DF___mj_CalendarSyncState___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CalendarSyncState */
ALTER TABLE [${flyway:defaultSchema}].[CalendarSyncState] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CalendarSyncState */
UPDATE [${flyway:defaultSchema}].[CalendarSyncState] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CalendarSyncState */
ALTER TABLE [${flyway:defaultSchema}].[CalendarSyncState] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CalendarSyncState */
ALTER TABLE [${flyway:defaultSchema}].[CalendarSyncState] ADD CONSTRAINT [DF___mj_CalendarSyncState___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CalendarEventLink */
ALTER TABLE [${flyway:defaultSchema}].[CalendarEventLink] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CalendarEventLink */
UPDATE [${flyway:defaultSchema}].[CalendarEventLink] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CalendarEventLink */
ALTER TABLE [${flyway:defaultSchema}].[CalendarEventLink] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CalendarEventLink */
ALTER TABLE [${flyway:defaultSchema}].[CalendarEventLink] ADD CONSTRAINT [DF___mj_CalendarEventLink___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CalendarEventLink */
ALTER TABLE [${flyway:defaultSchema}].[CalendarEventLink] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CalendarEventLink */
UPDATE [${flyway:defaultSchema}].[CalendarEventLink] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CalendarEventLink */
ALTER TABLE [${flyway:defaultSchema}].[CalendarEventLink] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CalendarEventLink */
ALTER TABLE [${flyway:defaultSchema}].[CalendarEventLink] ADD CONSTRAINT [DF___mj_CalendarEventLink___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 21 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d8098f4-1b36-4d5d-9696-a8c80d4a5ec1' OR (EntityID = '4B414728-C375-4CB4-987D-1B6A440FD239' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2d8098f4-1b36-4d5d-9696-a8c80d4a5ec1',
            '4B414728-C375-4CB4-987D-1B6A440FD239', -- Entity: MJ: Calendar Sync States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4B414728-C375-4CB4-987D-1B6A440FD239'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '59798844-986f-4d66-86c0-209d1fbe0b03' OR (EntityID = '4B414728-C375-4CB4-987D-1B6A440FD239' AND Name = 'CommunicationProviderID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '59798844-986f-4d66-86c0-209d1fbe0b03',
            '4B414728-C375-4CB4-987D-1B6A440FD239', -- Entity: MJ: Calendar Sync States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4B414728-C375-4CB4-987D-1B6A440FD239'),
            'CommunicationProviderID',
            'Communication Provider ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '43248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a717a8d3-2df6-4f4e-bc57-9038a241ccd4' OR (EntityID = '4B414728-C375-4CB4-987D-1B6A440FD239' AND Name = 'AccountIdentifier')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a717a8d3-2df6-4f4e-bc57-9038a241ccd4',
            '4B414728-C375-4CB4-987D-1B6A440FD239', -- Entity: MJ: Calendar Sync States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4B414728-C375-4CB4-987D-1B6A440FD239'),
            'AccountIdentifier',
            'Account Identifier',
            'The calendar account: a mailbox address for MS Graph, the account for Google.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e076a5b1-a440-4e75-b540-73ba54eae106' OR (EntityID = '4B414728-C375-4CB4-987D-1B6A440FD239' AND Name = 'CalendarID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e076a5b1-a440-4e75-b540-73ba54eae106',
            '4B414728-C375-4CB4-987D-1B6A440FD239', -- Entity: MJ: Calendar Sync States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4B414728-C375-4CB4-987D-1B6A440FD239'),
            'CalendarID',
            'Calendar ID',
            'The calendar within the account. Null means the account''s default calendar.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1fa9467c-804d-4ecd-832d-fa54e9a57625' OR (EntityID = '4B414728-C375-4CB4-987D-1B6A440FD239' AND Name = 'SyncToken')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1fa9467c-804d-4ecd-832d-fa54e9a57625',
            '4B414728-C375-4CB4-987D-1B6A440FD239', -- Entity: MJ: Calendar Sync States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4B414728-C375-4CB4-987D-1B6A440FD239'),
            'SyncToken',
            'Sync Token',
            'The provider''s cursor for the next incremental sync: a Graph delta link or a Google sync token. Null until the first sync.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8399b914-7dc5-47a8-942b-726b09744fd4' OR (EntityID = '4B414728-C375-4CB4-987D-1B6A440FD239' AND Name = 'LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8399b914-7dc5-47a8-942b-726b09744fd4',
            '4B414728-C375-4CB4-987D-1B6A440FD239', -- Entity: MJ: Calendar Sync States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4B414728-C375-4CB4-987D-1B6A440FD239'),
            'LastSyncedAt',
            'Last Synced At',
            'When this calendar was last synced.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96e27352-008a-4cb6-946d-becc6ce900ba' OR (EntityID = '4B414728-C375-4CB4-987D-1B6A440FD239' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '96e27352-008a-4cb6-946d-becc6ce900ba',
            '4B414728-C375-4CB4-987D-1B6A440FD239', -- Entity: MJ: Calendar Sync States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4B414728-C375-4CB4-987D-1B6A440FD239'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9196cfac-7cba-4474-85bb-9a685b23feae' OR (EntityID = '4B414728-C375-4CB4-987D-1B6A440FD239' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9196cfac-7cba-4474-85bb-9a685b23feae',
            '4B414728-C375-4CB4-987D-1B6A440FD239', -- Entity: MJ: Calendar Sync States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4B414728-C375-4CB4-987D-1B6A440FD239'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd752fc0e-9358-4d9d-876c-1cde14c0c609' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd752fc0e-9358-4d9d-876c-1cde14c0c609',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b9d4f74-59ab-474b-8994-d1914aca3269' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'CommunicationProviderID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6b9d4f74-59ab-474b-8994-d1914aca3269',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'CommunicationProviderID',
            'Communication Provider ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '43248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd91c61bf-50e9-42fa-bde2-df2b2ec64da3' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'AccountIdentifier')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd91c61bf-50e9-42fa-bde2-df2b2ec64da3',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'AccountIdentifier',
            'Account Identifier',
            'The calendar account the event lives in: a mailbox address for MS Graph, the account for Google. Later syncs and changes go to the same account.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ab26805-577c-4379-9de1-bbf9e3ee41df' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'CalendarID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8ab26805-577c-4379-9de1-bbf9e3ee41df',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'CalendarID',
            'Calendar ID',
            'The calendar within the account. Null means the account''s default calendar.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96c68d32-f638-48c6-9795-c8d1ce40cdb0' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'ExternalEventID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '96c68d32-f638-48c6-9795-c8d1ce40cdb0',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'ExternalEventID',
            'External Event ID',
            'The provider''s ID for the event in this account. It differs between attendees'' calendars; match across calendars on ICalUID.',
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6aaf851-0c4f-404d-b9bb-527078f71f21' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'ExternalSeriesID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a6aaf851-0c4f-404d-b9bb-527078f71f21',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'ExternalSeriesID',
            'External Series ID',
            'The provider''s ID for the recurring series this event belongs to, when it is an occurrence or exception of one.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc3dbd3e-db48-4d6b-8ade-829ec3d288d3' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'ICalUID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bc3dbd3e-db48-4d6b-8ade-829ec3d288d3',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'ICalUID',
            'I Cal UID',
            'The event''s iCalendar UID (Graph iCalUId, Google iCalUID). The same in every attendee''s calendar, so other apps match an imported event to this link by it.',
            'nvarchar',
            2000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2a7150bb-fb99-4a8d-ae7d-8ef317a41953' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2a7150bb-fb99-4a8d-ae7d-8ef317a41953',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'EntityID',
            'Entity ID',
            'The entity of the linked record.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3628115-c987-45d2-96fa-d482c85c1879' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'RecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b3628115-c987-45d2-96fa-d482c85c1879',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'RecordID',
            'Record ID',
            'The linked record''s primary key, in the compact URL-segment form (a bare value for a single-column key).',
            'nvarchar',
            900,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9fac1feb-d5ec-497d-9f3f-24c6147cb148' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9fac1feb-d5ec-497d-9f3f-24c6147cb148',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'Status',
            'Status',
            'Active, or Cancelled once the event is cancelled, in the calendar or through MemberJunction.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd96f403-d05c-4c4d-b24f-2a425dbacf3d' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dd96f403-d05c-4c4d-b24f-2a425dbacf3d',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'LastSyncedAt',
            'Last Synced At',
            'When a change to this event was last read from or written to the calendar.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4950ff63-fcbb-4aa6-8684-efd491c7f6a3' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4950ff63-fcbb-4aa6-8684-efd491c7f6a3',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '28232699-5752-419f-8dea-e4b527810adb' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '28232699-5752-419f-8dea-e4b527810adb',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID 5b787265-f0da-4d1c-8b15-66afd975dac4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5b787265-f0da-4d1c-8b15-66afd975dac4', '9FAC1FEB-D5EC-497D-9F3F-24C6147CB148', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9644d709-7e89-4a6e-8f6e-8b9f23051fef */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9644d709-7e89-4a6e-8f6e-8b9f23051fef', '9FAC1FEB-D5EC-497D-9F3F-24C6147CB148', 2, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 9FAC1FEB-D5EC-497D-9F3F-24C6147CB148 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='9FAC1FEB-D5EC-497D-9F3F-24C6147CB148';

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */

         UPDATE [${flyway:defaultSchema}].[Entity]
         SET [AllowUserSearchAPI] = 0
         WHERE [ID] IN (
            SELECT e.[ID]
            FROM [${flyway:defaultSchema}].[Entity] e
            WHERE e.[AllowUserSearchAPI] = 1
              AND e.[AutoUpdateAllowUserSearchAPI] = 1
              AND e.[VirtualEntity] = 0
              AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
              AND e.[SchemaName] NOT IN ('sys','staging')
              AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
         );


/* Create Entity Relationship: MJ: Entities -> MJ: Calendar Event Links (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8e3987cb-f354-4804-ae9f-5a8b7c8287c8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8e3987cb-f354-4804-ae9f-5a8b7c8287c8', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', 'EntityID', 'One To Many', 1, 1, 88, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Communication Providers -> MJ: Calendar Sync States (One To Many via CommunicationProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '82bc6220-cef0-4acd-af81-2cec55fc9b5d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('82bc6220-cef0-4acd-af81-2cec55fc9b5d', '43248F34-2837-EF11-86D4-6045BDEE16E6', '4B414728-C375-4CB4-987D-1B6A440FD239', 'CommunicationProviderID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Communication Providers -> MJ: Calendar Event Links (One To Many via CommunicationProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '841ae652-0c62-48a2-91b1-64fa900ac561'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('841ae652-0c62-48a2-91b1-64fa900ac561', '43248F34-2837-EF11-86D4-6045BDEE16E6', 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', 'CommunicationProviderID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for CalendarEventLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Event Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CommunicationProviderID in table CalendarEventLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CalendarEventLink_CommunicationProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CalendarEventLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CalendarEventLink_CommunicationProviderID ON [${flyway:defaultSchema}].[CalendarEventLink] ([CommunicationProviderID]);

-- Index for foreign key EntityID in table CalendarEventLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CalendarEventLink_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CalendarEventLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CalendarEventLink_EntityID ON [${flyway:defaultSchema}].[CalendarEventLink] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 6B9D4F74-59AB-474B-8994-D1914ACA3269 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6B9D4F74-59AB-474B-8994-D1914ACA3269', @RelatedEntityNameFieldMap='CommunicationProvider';

/* Index for Foreign Keys for CalendarSyncState */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Sync States
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CommunicationProviderID in table CalendarSyncState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CalendarSyncState_CommunicationProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CalendarSyncState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CalendarSyncState_CommunicationProviderID ON [${flyway:defaultSchema}].[CalendarSyncState] ([CommunicationProviderID]);

/* SQL text to update entity field related entity name field map for entity field ID 59798844-986F-4D66-86C0-209D1FBE0B03 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='59798844-986F-4D66-86C0-209D1FBE0B03', @RelatedEntityNameFieldMap='CommunicationProvider';

/* Base View SQL for MJ: Calendar Sync States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Sync States
-- Item: vwCalendarSyncStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Calendar Sync States
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CalendarSyncState
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCalendarSyncStates]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCalendarSyncStates];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCalendarSyncStates]
AS
SELECT
    c.*,
    MJCommunicationProvider_CommunicationProviderID.[Name] AS [CommunicationProvider]
FROM
    [${flyway:defaultSchema}].[CalendarSyncState] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CommunicationProvider] AS MJCommunicationProvider_CommunicationProviderID
  ON
    [c].[CommunicationProviderID] = MJCommunicationProvider_CommunicationProviderID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCalendarSyncStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Calendar Sync States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Sync States
-- Item: Permissions for vwCalendarSyncStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCalendarSyncStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Calendar Sync States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Sync States
-- Item: spCreateCalendarSyncState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CalendarSyncState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCalendarSyncState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCalendarSyncState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCalendarSyncState]
    @ID uniqueidentifier = NULL,
    @CommunicationProviderID uniqueidentifier,
    @AccountIdentifier nvarchar(255),
    @CalendarID_Clear bit = 0,
    @CalendarID nvarchar(500) = NULL,
    @SyncToken_Clear bit = 0,
    @SyncToken nvarchar(MAX) = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CalendarSyncState]
            (
                [ID],
                [CommunicationProviderID],
                [AccountIdentifier],
                [CalendarID],
                [SyncToken],
                [LastSyncedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CommunicationProviderID,
                @AccountIdentifier,
                CASE WHEN @CalendarID_Clear = 1 THEN NULL ELSE ISNULL(@CalendarID, NULL) END,
                CASE WHEN @SyncToken_Clear = 1 THEN NULL ELSE ISNULL(@SyncToken, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CalendarSyncState]
            (
                [CommunicationProviderID],
                [AccountIdentifier],
                [CalendarID],
                [SyncToken],
                [LastSyncedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CommunicationProviderID,
                @AccountIdentifier,
                CASE WHEN @CalendarID_Clear = 1 THEN NULL ELSE ISNULL(@CalendarID, NULL) END,
                CASE WHEN @SyncToken_Clear = 1 THEN NULL ELSE ISNULL(@SyncToken, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCalendarSyncStates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCalendarSyncState] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Calendar Sync States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCalendarSyncState] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Calendar Sync States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Sync States
-- Item: spUpdateCalendarSyncState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CalendarSyncState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCalendarSyncState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCalendarSyncState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCalendarSyncState]
    @ID uniqueidentifier,
    @CommunicationProviderID uniqueidentifier = NULL,
    @AccountIdentifier nvarchar(255) = NULL,
    @CalendarID_Clear bit = 0,
    @CalendarID nvarchar(500) = NULL,
    @SyncToken_Clear bit = 0,
    @SyncToken nvarchar(MAX) = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CalendarSyncState]
    SET
        [CommunicationProviderID] = ISNULL(@CommunicationProviderID, [CommunicationProviderID]),
        [AccountIdentifier] = ISNULL(@AccountIdentifier, [AccountIdentifier]),
        [CalendarID] = CASE WHEN @CalendarID_Clear = 1 THEN NULL ELSE ISNULL(@CalendarID, [CalendarID]) END,
        [SyncToken] = CASE WHEN @SyncToken_Clear = 1 THEN NULL ELSE ISNULL(@SyncToken, [SyncToken]) END,
        [LastSyncedAt] = CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, [LastSyncedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCalendarSyncStates] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCalendarSyncStates]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCalendarSyncState] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CalendarSyncState table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCalendarSyncState]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCalendarSyncState];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCalendarSyncState
ON [${flyway:defaultSchema}].[CalendarSyncState]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CalendarSyncState]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CalendarSyncState] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Calendar Sync States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCalendarSyncState] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Calendar Sync States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Sync States
-- Item: spDeleteCalendarSyncState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CalendarSyncState
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCalendarSyncState]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCalendarSyncState];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCalendarSyncState]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CalendarSyncState]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCalendarSyncState] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Calendar Sync States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCalendarSyncState] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 2A7150BB-FB99-4A8D-AE7D-8EF317A41953 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2A7150BB-FB99-4A8D-AE7D-8EF317A41953', @RelatedEntityNameFieldMap='Entity';

/* Base View SQL for MJ: Calendar Event Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Event Links
-- Item: vwCalendarEventLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Calendar Event Links
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CalendarEventLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCalendarEventLinks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCalendarEventLinks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCalendarEventLinks]
AS
SELECT
    c.*,
    MJCommunicationProvider_CommunicationProviderID.[Name] AS [CommunicationProvider],
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[CalendarEventLink] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CommunicationProvider] AS MJCommunicationProvider_CommunicationProviderID
  ON
    [c].[CommunicationProviderID] = MJCommunicationProvider_CommunicationProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [c].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCalendarEventLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Calendar Event Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Event Links
-- Item: Permissions for vwCalendarEventLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCalendarEventLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Calendar Event Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Event Links
-- Item: spCreateCalendarEventLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CalendarEventLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCalendarEventLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCalendarEventLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCalendarEventLink]
    @ID uniqueidentifier = NULL,
    @CommunicationProviderID uniqueidentifier,
    @AccountIdentifier nvarchar(255),
    @CalendarID_Clear bit = 0,
    @CalendarID nvarchar(500) = NULL,
    @ExternalEventID nvarchar(500),
    @ExternalSeriesID_Clear bit = 0,
    @ExternalSeriesID nvarchar(500) = NULL,
    @ICalUID_Clear bit = 0,
    @ICalUID nvarchar(1000) = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Status nvarchar(20) = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CalendarEventLink]
            (
                [ID],
                [CommunicationProviderID],
                [AccountIdentifier],
                [CalendarID],
                [ExternalEventID],
                [ExternalSeriesID],
                [ICalUID],
                [EntityID],
                [RecordID],
                [Status],
                [LastSyncedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CommunicationProviderID,
                @AccountIdentifier,
                CASE WHEN @CalendarID_Clear = 1 THEN NULL ELSE ISNULL(@CalendarID, NULL) END,
                @ExternalEventID,
                CASE WHEN @ExternalSeriesID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSeriesID, NULL) END,
                CASE WHEN @ICalUID_Clear = 1 THEN NULL ELSE ISNULL(@ICalUID, NULL) END,
                @EntityID,
                @RecordID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CalendarEventLink]
            (
                [CommunicationProviderID],
                [AccountIdentifier],
                [CalendarID],
                [ExternalEventID],
                [ExternalSeriesID],
                [ICalUID],
                [EntityID],
                [RecordID],
                [Status],
                [LastSyncedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CommunicationProviderID,
                @AccountIdentifier,
                CASE WHEN @CalendarID_Clear = 1 THEN NULL ELSE ISNULL(@CalendarID, NULL) END,
                @ExternalEventID,
                CASE WHEN @ExternalSeriesID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSeriesID, NULL) END,
                CASE WHEN @ICalUID_Clear = 1 THEN NULL ELSE ISNULL(@ICalUID, NULL) END,
                @EntityID,
                @RecordID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCalendarEventLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCalendarEventLink] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Calendar Event Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCalendarEventLink] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Calendar Event Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Event Links
-- Item: spUpdateCalendarEventLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CalendarEventLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCalendarEventLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCalendarEventLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCalendarEventLink]
    @ID uniqueidentifier,
    @CommunicationProviderID uniqueidentifier = NULL,
    @AccountIdentifier nvarchar(255) = NULL,
    @CalendarID_Clear bit = 0,
    @CalendarID nvarchar(500) = NULL,
    @ExternalEventID nvarchar(500) = NULL,
    @ExternalSeriesID_Clear bit = 0,
    @ExternalSeriesID nvarchar(500) = NULL,
    @ICalUID_Clear bit = 0,
    @ICalUID nvarchar(1000) = NULL,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(450) = NULL,
    @Status nvarchar(20) = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CalendarEventLink]
    SET
        [CommunicationProviderID] = ISNULL(@CommunicationProviderID, [CommunicationProviderID]),
        [AccountIdentifier] = ISNULL(@AccountIdentifier, [AccountIdentifier]),
        [CalendarID] = CASE WHEN @CalendarID_Clear = 1 THEN NULL ELSE ISNULL(@CalendarID, [CalendarID]) END,
        [ExternalEventID] = ISNULL(@ExternalEventID, [ExternalEventID]),
        [ExternalSeriesID] = CASE WHEN @ExternalSeriesID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSeriesID, [ExternalSeriesID]) END,
        [ICalUID] = CASE WHEN @ICalUID_Clear = 1 THEN NULL ELSE ISNULL(@ICalUID, [ICalUID]) END,
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [Status] = ISNULL(@Status, [Status]),
        [LastSyncedAt] = CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, [LastSyncedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCalendarEventLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCalendarEventLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCalendarEventLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CalendarEventLink table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCalendarEventLink]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCalendarEventLink];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCalendarEventLink
ON [${flyway:defaultSchema}].[CalendarEventLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CalendarEventLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CalendarEventLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Calendar Event Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCalendarEventLink] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Calendar Event Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Calendar Event Links
-- Item: spDeleteCalendarEventLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CalendarEventLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCalendarEventLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCalendarEventLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCalendarEventLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CalendarEventLink]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCalendarEventLink] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Calendar Event Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCalendarEventLink] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c23fab56-bc38-4457-b851-14906e156e11' OR (EntityID = '4B414728-C375-4CB4-987D-1B6A440FD239' AND Name = 'CommunicationProvider')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c23fab56-bc38-4457-b851-14906e156e11',
            '4B414728-C375-4CB4-987D-1B6A440FD239', -- Entity: MJ: Calendar Sync States
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4B414728-C375-4CB4-987D-1B6A440FD239'),
            'CommunicationProvider',
            'Communication Provider',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e646f61-86fa-4175-ba64-d8a33693116a' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'CommunicationProvider')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0e646f61-86fa-4175-ba64-d8a33693116a',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'CommunicationProvider',
            'Communication Provider',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bcdc3528-74bc-4906-a8aa-798500d72e68' OR (EntityID = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bcdc3528-74bc-4906-a8aa-798500d72e68',
            'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9', -- Entity: MJ: Calendar Event Links
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BD4B67C8-001B-4CD3-AF76-29F56B9F28B9'),
            'Entity',
            'Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

