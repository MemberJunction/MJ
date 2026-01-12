
-- Schema for Lists Feature

-- 1. Create ListShare table
CREATE TABLE [${flyway:defaultSchema}].[ListShare] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ListID] UNIQUEIDENTIFIER NOT NULL,
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [Role] NVARCHAR(50) NOT NULL CHECK (Role IN ('Editor', 'Viewer')),
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active', 'Pending')),
    CONSTRAINT [PK_ListShares] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_ListShares_List] FOREIGN KEY ([ListID]) REFERENCES [${flyway:defaultSchema}].[List] ([ID]) ON DELETE CASCADE,
    CONSTRAINT [FK_ListShares_User] FOREIGN KEY ([UserID]) REFERENCES [${flyway:defaultSchema}].[User] ([ID]),
    CONSTRAINT [UK_ListShares_List_User] UNIQUE ([ListID], [UserID])
)
GO

-- 2. Create ListInvitation table
CREATE TABLE [${flyway:defaultSchema}].[ListInvitation] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ListID] UNIQUEIDENTIFIER NOT NULL,
    [Email] NVARCHAR(255) NOT NULL,
    [Role] NVARCHAR(50) NOT NULL CHECK (Role IN ('Editor', 'Viewer')),
    [Token] NVARCHAR(100) NOT NULL,
    [ExpiresAt] DATETIME NOT NULL,
    [CreatedByUserID] UNIQUEIDENTIFIER NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'Accepted', 'Expired', 'Revoked')),
    CONSTRAINT [PK_ListInvitations] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_ListInvitations_List] FOREIGN KEY ([ListID]) REFERENCES [${flyway:defaultSchema}].[List] ([ID]) ON DELETE CASCADE,
    CONSTRAINT [FK_ListInvitations_User] FOREIGN KEY ([CreatedByUserID]) REFERENCES [${flyway:defaultSchema}].[User] ([ID])
)
GO

-- Add extended properties for ListShare
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Manages user access and permissions for shared lists.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListShare';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the share record.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListShare', @level2type = N'COLUMN', @level2name = N'ID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The list being shared.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListShare', @level2type = N'COLUMN', @level2name = N'ListID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The user receiving access to the list.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListShare', @level2type = N'COLUMN', @level2name = N'UserID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The permission level granted (Editor or Viewer).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListShare', @level2type = N'COLUMN', @level2name = N'Role';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current status of the share (Active or Pending).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListShare', @level2type = N'COLUMN', @level2name = N'Status';
GO

-- Add extended properties for ListInvitation
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Tracks pending invitations for users to access lists, including external users via email.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListInvitation';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the invitation.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListInvitation', @level2type = N'COLUMN', @level2name = N'ID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The list the user is being invited to.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListInvitation', @level2type = N'COLUMN', @level2name = N'ListID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Email address of the invitee.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListInvitation', @level2type = N'COLUMN', @level2name = N'Email';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The role to be assigned upon acceptance (Editor or Viewer).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListInvitation', @level2type = N'COLUMN', @level2name = N'Role';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Security token for validating the invitation.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListInvitation', @level2type = N'COLUMN', @level2name = N'Token';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the invitation expires.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListInvitation', @level2type = N'COLUMN', @level2name = N'ExpiresAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The user who created the invitation.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListInvitation', @level2type = N'COLUMN', @level2name = N'CreatedByUserID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Status of the invitation (Pending, Accepted, Expired, Revoked).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ListInvitation', @level2type = N'COLUMN', @level2name = N'Status';
GO
















































-- CODE GEN RUN 
/* SQL generated to create new entity MJ: List Shares */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '406ba963-d9a0-4093-af02-59835bfe1fff',
         'MJ: List Shares',
         'List Shares',
         NULL,
         NULL,
         'ListShare',
         'vwListShares',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: List Shares to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '406ba963-d9a0-4093-af02-59835bfe1fff', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: List Shares for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('406ba963-d9a0-4093-af02-59835bfe1fff', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: List Shares for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('406ba963-d9a0-4093-af02-59835bfe1fff', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: List Shares for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('406ba963-d9a0-4093-af02-59835bfe1fff', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: List Invitations */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '634cf15f-b2fb-4d33-897d-8a5f501f9efc',
         'MJ: List Invitations',
         'List Invitations',
         NULL,
         NULL,
         'ListInvitation',
         'vwListInvitations',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: List Invitations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '634cf15f-b2fb-4d33-897d-8a5f501f9efc', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: List Invitations for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('634cf15f-b2fb-4d33-897d-8a5f501f9efc', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: List Invitations for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('634cf15f-b2fb-4d33-897d-8a5f501f9efc', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: List Invitations for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('634cf15f-b2fb-4d33-897d-8a5f501f9efc', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ListShare */
ALTER TABLE [${flyway:defaultSchema}].[ListShare] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ListShare */
ALTER TABLE [${flyway:defaultSchema}].[ListShare] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ListInvitation */
ALTER TABLE [${flyway:defaultSchema}].[ListInvitation] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ListInvitation */
ALTER TABLE [${flyway:defaultSchema}].[ListInvitation] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6eee4f9b-5d46-4a36-8e74-1346cbcf14e5'  OR 
               (EntityID = '406BA963-D9A0-4093-AF02-59835BFE1FFF' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6eee4f9b-5d46-4a36-8e74-1346cbcf14e5',
            '406BA963-D9A0-4093-AF02-59835BFE1FFF', -- Entity: MJ: List Shares
            100001,
            'ID',
            'ID',
            'Unique identifier for the share record.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cf992d41-95be-422b-a33c-2318c03da7b0'  OR 
               (EntityID = '406BA963-D9A0-4093-AF02-59835BFE1FFF' AND Name = 'ListID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cf992d41-95be-422b-a33c-2318c03da7b0',
            '406BA963-D9A0-4093-AF02-59835BFE1FFF', -- Entity: MJ: List Shares
            100002,
            'ListID',
            'List ID',
            'The list being shared.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'EE238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '46aa6694-fe51-4050-9a6b-55b0f605bb5a'  OR 
               (EntityID = '406BA963-D9A0-4093-AF02-59835BFE1FFF' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '46aa6694-fe51-4050-9a6b-55b0f605bb5a',
            '406BA963-D9A0-4093-AF02-59835BFE1FFF', -- Entity: MJ: List Shares
            100003,
            'UserID',
            'User ID',
            'The user receiving access to the list.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1c503097-52af-41c4-a8b3-65e2b3e5b3ad'  OR 
               (EntityID = '406BA963-D9A0-4093-AF02-59835BFE1FFF' AND Name = 'Role')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1c503097-52af-41c4-a8b3-65e2b3e5b3ad',
            '406BA963-D9A0-4093-AF02-59835BFE1FFF', -- Entity: MJ: List Shares
            100004,
            'Role',
            'Role',
            'The permission level granted (Editor or Viewer).',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '85821cf9-cf43-46c0-9003-6f9c03835737'  OR 
               (EntityID = '406BA963-D9A0-4093-AF02-59835BFE1FFF' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '85821cf9-cf43-46c0-9003-6f9c03835737',
            '406BA963-D9A0-4093-AF02-59835BFE1FFF', -- Entity: MJ: List Shares
            100005,
            'Status',
            'Status',
            'Current status of the share (Active or Pending).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bb76591e-27be-4339-8b39-92f90a80d1c2'  OR 
               (EntityID = '406BA963-D9A0-4093-AF02-59835BFE1FFF' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bb76591e-27be-4339-8b39-92f90a80d1c2',
            '406BA963-D9A0-4093-AF02-59835BFE1FFF', -- Entity: MJ: List Shares
            100006,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'dc8d88a1-239b-41f6-a4de-0fc57d5bd574'  OR 
               (EntityID = '406BA963-D9A0-4093-AF02-59835BFE1FFF' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dc8d88a1-239b-41f6-a4de-0fc57d5bd574',
            '406BA963-D9A0-4093-AF02-59835BFE1FFF', -- Entity: MJ: List Shares
            100007,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b37aade5-6823-4547-8c80-5e9f8d794978'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b37aade5-6823-4547-8c80-5e9f8d794978',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100001,
            'ID',
            'ID',
            'Unique identifier for the invitation.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '35748ff3-2b46-4305-b9ef-eb28915e13e4'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = 'ListID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '35748ff3-2b46-4305-b9ef-eb28915e13e4',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100002,
            'ListID',
            'List ID',
            'The list the user is being invited to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'EE238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e41f83e9-8eca-4483-be65-fcc8990f2325'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = 'Email')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e41f83e9-8eca-4483-be65-fcc8990f2325',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100003,
            'Email',
            'Email',
            'Email address of the invitee.',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f11b70c9-485b-4e18-9e38-e4be52b29459'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = 'Role')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f11b70c9-485b-4e18-9e38-e4be52b29459',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100004,
            'Role',
            'Role',
            'The role to be assigned upon acceptance (Editor or Viewer).',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '45d663c7-305a-4465-b94f-f90029058162'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = 'Token')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '45d663c7-305a-4465-b94f-f90029058162',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100005,
            'Token',
            'Token',
            'Security token for validating the invitation.',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1306c4c0-b074-4e92-a526-615d518c3693'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = 'ExpiresAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1306c4c0-b074-4e92-a526-615d518c3693',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100006,
            'ExpiresAt',
            'Expires At',
            'When the invitation expires.',
            'datetime',
            8,
            23,
            3,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '76bab98e-e2be-4fba-91af-dad1de98f7fa'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = 'CreatedByUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '76bab98e-e2be-4fba-91af-dad1de98f7fa',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100007,
            'CreatedByUserID',
            'Created By User ID',
            'The user who created the invitation.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6f38f2f7-b6a4-4338-ae37-9398dd383d64'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6f38f2f7-b6a4-4338-ae37-9398dd383d64',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100008,
            'Status',
            'Status',
            'Status of the invitation (Pending, Accepted, Expired, Revoked).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '14cd029e-327d-4bfb-be4a-abbc95b65810'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '14cd029e-327d-4bfb-be4a-abbc95b65810',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100009,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2e0f3925-53be-4a19-bed8-cc22246ca9f0'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2e0f3925-53be-4a19-bed8-cc22246ca9f0',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100010,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert entity field value with ID 4dd2e159-b44a-49bc-8d01-e06729d7ae5f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4dd2e159-b44a-49bc-8d01-e06729d7ae5f', '1C503097-52AF-41C4-A8B3-65E2B3E5B3AD', 1, 'Editor', 'Editor')

/* SQL text to insert entity field value with ID c483ac18-0188-4d0c-ad65-7c026bb74c9a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c483ac18-0188-4d0c-ad65-7c026bb74c9a', '1C503097-52AF-41C4-A8B3-65E2B3E5B3AD', 2, 'Viewer', 'Viewer')

/* SQL text to update ValueListType for entity field ID 1C503097-52AF-41C4-A8B3-65E2B3E5B3AD */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1C503097-52AF-41C4-A8B3-65E2B3E5B3AD'

/* SQL text to insert entity field value with ID 84cafa8a-34d0-494c-840d-a664b8922b17 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('84cafa8a-34d0-494c-840d-a664b8922b17', '85821CF9-CF43-46C0-9003-6F9C03835737', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 040e0b6e-ca66-41ba-93bb-8e0a7f9b66b7 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('040e0b6e-ca66-41ba-93bb-8e0a7f9b66b7', '85821CF9-CF43-46C0-9003-6F9C03835737', 2, 'Pending', 'Pending')

/* SQL text to update ValueListType for entity field ID 85821CF9-CF43-46C0-9003-6F9C03835737 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='85821CF9-CF43-46C0-9003-6F9C03835737'

/* SQL text to insert entity field value with ID 30b31c81-52d9-45fa-a589-c5685ab5d1d1 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('30b31c81-52d9-45fa-a589-c5685ab5d1d1', 'F11B70C9-485B-4E18-9E38-E4BE52B29459', 1, 'Editor', 'Editor')

/* SQL text to insert entity field value with ID 7afa2822-c80f-4476-bd58-1ddf6498295b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7afa2822-c80f-4476-bd58-1ddf6498295b', 'F11B70C9-485B-4E18-9E38-E4BE52B29459', 2, 'Viewer', 'Viewer')

/* SQL text to update ValueListType for entity field ID F11B70C9-485B-4E18-9E38-E4BE52B29459 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F11B70C9-485B-4E18-9E38-E4BE52B29459'

/* SQL text to insert entity field value with ID d6822bdc-4d73-46d8-9759-b0f3a12c1557 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d6822bdc-4d73-46d8-9759-b0f3a12c1557', '6F38F2F7-B6A4-4338-AE37-9398DD383D64', 1, 'Accepted', 'Accepted')

/* SQL text to insert entity field value with ID bec61ef7-e77f-4652-9852-4b67887c7a45 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('bec61ef7-e77f-4652-9852-4b67887c7a45', '6F38F2F7-B6A4-4338-AE37-9398DD383D64', 2, 'Expired', 'Expired')

/* SQL text to insert entity field value with ID 7ab4830e-8358-44ce-9f63-a1f3e730a7a1 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7ab4830e-8358-44ce-9f63-a1f3e730a7a1', '6F38F2F7-B6A4-4338-AE37-9398DD383D64', 3, 'Pending', 'Pending')

/* SQL text to insert entity field value with ID 8aae4828-0042-4969-98d6-243372e7fa10 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8aae4828-0042-4969-98d6-243372e7fa10', '6F38F2F7-B6A4-4338-AE37-9398DD383D64', 4, 'Revoked', 'Revoked')

/* SQL text to update ValueListType for entity field ID 6F38F2F7-B6A4-4338-AE37-9398DD383D64 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='6F38F2F7-B6A4-4338-AE37-9398DD383D64'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '3444dc9a-3050-4cb0-8dc3-e8f0d74ad9fe'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('3444dc9a-3050-4cb0-8dc3-e8f0d74ad9fe', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', 'CreatedByUserID', 'One To Many', 1, 1, 'MJ: List Invitations', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c1352102-7691-4c0e-8e75-4d18c7eb9eea'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c1352102-7691-4c0e-8e75-4d18c7eb9eea', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '406BA963-D9A0-4093-AF02-59835BFE1FFF', 'UserID', 'One To Many', 1, 1, 'MJ: List Shares', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '782ced60-efde-473e-ae2c-4c465b15511c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('782ced60-efde-473e-ae2c-4c465b15511c', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', '406BA963-D9A0-4093-AF02-59835BFE1FFF', 'ListID', 'One To Many', 1, 1, 'MJ: List Shares', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '097c8298-24b2-4d90-be8b-9adae673add3'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('097c8298-24b2-4d90-be8b-9adae673add3', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', 'ListID', 'One To Many', 1, 1, 'MJ: List Invitations', 2);
   END
                              

/* Index for Foreign Keys for ListInvitation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Invitations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ListID in table ListInvitation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ListInvitation_ListID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ListInvitation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ListInvitation_ListID ON [${flyway:defaultSchema}].[ListInvitation] ([ListID]);

-- Index for foreign key CreatedByUserID in table ListInvitation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ListInvitation_CreatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ListInvitation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ListInvitation_CreatedByUserID ON [${flyway:defaultSchema}].[ListInvitation] ([CreatedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 35748FF3-2B46-4305-B9EF-EB28915E13E4 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='35748FF3-2B46-4305-B9EF-EB28915E13E4',
         @RelatedEntityNameFieldMap='List'

/* SQL text to update entity field related entity name field map for entity field ID 76BAB98E-E2BE-4FBA-91AF-DAD1DE98F7FA */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='76BAB98E-E2BE-4FBA-91AF-DAD1DE98F7FA',
         @RelatedEntityNameFieldMap='CreatedByUser'

/* Base View SQL for MJ: List Invitations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Invitations
-- Item: vwListInvitations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: List Invitations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ListInvitation
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwListInvitations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwListInvitations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwListInvitations]
AS
SELECT
    l.*,
    List_ListID.[Name] AS [List],
    User_CreatedByUserID.[Name] AS [CreatedByUser]
FROM
    [${flyway:defaultSchema}].[ListInvitation] AS l
INNER JOIN
    [${flyway:defaultSchema}].[List] AS List_ListID
  ON
    [l].[ListID] = List_ListID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_CreatedByUserID
  ON
    [l].[CreatedByUserID] = User_CreatedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwListInvitations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: List Invitations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Invitations
-- Item: Permissions for vwListInvitations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwListInvitations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: List Invitations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Invitations
-- Item: spCreateListInvitation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ListInvitation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateListInvitation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateListInvitation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateListInvitation]
    @ID uniqueidentifier = NULL,
    @ListID uniqueidentifier,
    @Email nvarchar(255),
    @Role nvarchar(50),
    @Token nvarchar(100),
    @ExpiresAt datetime,
    @CreatedByUserID uniqueidentifier,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ListInvitation]
            (
                [ID],
                [ListID],
                [Email],
                [Role],
                [Token],
                [ExpiresAt],
                [CreatedByUserID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ListID,
                @Email,
                @Role,
                @Token,
                @ExpiresAt,
                @CreatedByUserID,
                ISNULL(@Status, 'Pending')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ListInvitation]
            (
                [ListID],
                [Email],
                [Role],
                [Token],
                [ExpiresAt],
                [CreatedByUserID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ListID,
                @Email,
                @Role,
                @Token,
                @ExpiresAt,
                @CreatedByUserID,
                ISNULL(@Status, 'Pending')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwListInvitations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListInvitation] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: List Invitations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListInvitation] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: List Invitations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Invitations
-- Item: spUpdateListInvitation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ListInvitation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateListInvitation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateListInvitation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateListInvitation]
    @ID uniqueidentifier,
    @ListID uniqueidentifier,
    @Email nvarchar(255),
    @Role nvarchar(50),
    @Token nvarchar(100),
    @ExpiresAt datetime,
    @CreatedByUserID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListInvitation]
    SET
        [ListID] = @ListID,
        [Email] = @Email,
        [Role] = @Role,
        [Token] = @Token,
        [ExpiresAt] = @ExpiresAt,
        [CreatedByUserID] = @CreatedByUserID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwListInvitations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwListInvitations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListInvitation] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ListInvitation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateListInvitation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateListInvitation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateListInvitation
ON [${flyway:defaultSchema}].[ListInvitation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListInvitation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ListInvitation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: List Invitations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListInvitation] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: List Invitations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Invitations
-- Item: spDeleteListInvitation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ListInvitation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteListInvitation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteListInvitation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteListInvitation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ListInvitation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListInvitation] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: List Invitations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListInvitation] TO [cdp_Integration]



/* Index for Foreign Keys for ListShare */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Shares
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ListID in table ListShare
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ListShare_ListID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ListShare]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ListShare_ListID ON [${flyway:defaultSchema}].[ListShare] ([ListID]);

-- Index for foreign key UserID in table ListShare
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ListShare_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ListShare]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ListShare_UserID ON [${flyway:defaultSchema}].[ListShare] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID CF992D41-95BE-422B-A33C-2318C03DA7B0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CF992D41-95BE-422B-A33C-2318C03DA7B0',
         @RelatedEntityNameFieldMap='List'

/* SQL text to update entity field related entity name field map for entity field ID 46AA6694-FE51-4050-9A6B-55B0F605BB5A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='46AA6694-FE51-4050-9A6B-55B0F605BB5A',
         @RelatedEntityNameFieldMap='User'

/* Base View SQL for MJ: List Shares */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Shares
-- Item: vwListShares
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: List Shares
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ListShare
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwListShares]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwListShares];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwListShares]
AS
SELECT
    l.*,
    List_ListID.[Name] AS [List],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[ListShare] AS l
INNER JOIN
    [${flyway:defaultSchema}].[List] AS List_ListID
  ON
    [l].[ListID] = List_ListID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [l].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwListShares] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: List Shares */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Shares
-- Item: Permissions for vwListShares
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwListShares] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: List Shares */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Shares
-- Item: spCreateListShare
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ListShare
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateListShare]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateListShare];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateListShare]
    @ID uniqueidentifier = NULL,
    @ListID uniqueidentifier,
    @UserID uniqueidentifier,
    @Role nvarchar(50),
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ListShare]
            (
                [ID],
                [ListID],
                [UserID],
                [Role],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ListID,
                @UserID,
                @Role,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ListShare]
            (
                [ListID],
                [UserID],
                [Role],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ListID,
                @UserID,
                @Role,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwListShares] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListShare] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: List Shares */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListShare] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: List Shares */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Shares
-- Item: spUpdateListShare
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ListShare
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateListShare]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateListShare];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateListShare]
    @ID uniqueidentifier,
    @ListID uniqueidentifier,
    @UserID uniqueidentifier,
    @Role nvarchar(50),
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListShare]
    SET
        [ListID] = @ListID,
        [UserID] = @UserID,
        [Role] = @Role,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwListShares] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwListShares]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListShare] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ListShare table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateListShare]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateListShare];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateListShare
ON [${flyway:defaultSchema}].[ListShare]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListShare]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ListShare] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: List Shares */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListShare] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: List Shares */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Shares
-- Item: spDeleteListShare
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ListShare
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteListShare]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteListShare];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteListShare]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ListShare]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListShare] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: List Shares */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListShare] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'eae5e17d-e469-4ead-9ee7-2b0c6cada493'  OR 
               (EntityID = '406BA963-D9A0-4093-AF02-59835BFE1FFF' AND Name = 'List')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'eae5e17d-e469-4ead-9ee7-2b0c6cada493',
            '406BA963-D9A0-4093-AF02-59835BFE1FFF', -- Entity: MJ: List Shares
            100015,
            'List',
            'List',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd664a59d-62b8-4edb-9a1d-943b1f293b80'  OR 
               (EntityID = '406BA963-D9A0-4093-AF02-59835BFE1FFF' AND Name = 'User')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd664a59d-62b8-4edb-9a1d-943b1f293b80',
            '406BA963-D9A0-4093-AF02-59835BFE1FFF', -- Entity: MJ: List Shares
            100016,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '18979939-e8a8-4849-8c9b-cdc3fbeb5ab4'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = 'List')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '18979939-e8a8-4849-8c9b-cdc3fbeb5ab4',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100021,
            'List',
            'List',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '794cec9c-8622-42d7-9cb5-f0b567d871b8'  OR 
               (EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC' AND Name = 'CreatedByUser')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '794cec9c-8622-42d7-9cb5-f0b567d871b8',
            '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', -- Entity: MJ: List Invitations
            100022,
            'CreatedByUser',
            'Created By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E41F83E9-8ECA-4483-BE65-FCC8990F2325'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E41F83E9-8ECA-4483-BE65-FCC8990F2325'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F11B70C9-485B-4E18-9E38-E4BE52B29459'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1306C4C0-B074-4E92-A526-615D518C3693'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6F38F2F7-B6A4-4338-AE37-9398DD383D64'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '18979939-E8A8-4849-8C9B-CDC3FBEB5AB4'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E41F83E9-8ECA-4483-BE65-FCC8990F2325'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '18979939-E8A8-4849-8C9B-CDC3FBEB5AB4'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '794CEC9C-8622-42D7-9CB5-F0B567D871B8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'D664A59D-62B8-4EDB-9A1D-943B1F293B80'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1C503097-52AF-41C4-A8B3-65E2B3E5B3AD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '85821CF9-CF43-46C0-9003-6F9C03835737'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EAE5E17D-E469-4EAD-9EE7-2B0C6CADA493'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D664A59D-62B8-4EDB-9A1D-943B1F293B80'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1C503097-52AF-41C4-A8B3-65E2B3E5B3AD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '85821CF9-CF43-46C0-9003-6F9C03835737'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EAE5E17D-E469-4EAD-9EE7-2B0C6CADA493'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D664A59D-62B8-4EDB-9A1D-943B1F293B80'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6EEE4F9B-5D46-4A36-8E74-1346CBCF14E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BB76591E-27BE-4339-8B39-92F90A80D1C2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DC8D88A1-239B-41F6-A4DE-0FC57D5BD574'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Share Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'List',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CF992D41-95BE-422B-A33C-2318C03DA7B0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Share Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '46AA6694-FE51-4050-9A6B-55B0F605BB5A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Share Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C503097-52AF-41C4-A8B3-65E2B3E5B3AD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Share Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '85821CF9-CF43-46C0-9003-6F9C03835737'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Share Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'List Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EAE5E17D-E469-4EAD-9EE7-2B0C6CADA493'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Share Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D664A59D-62B8-4EDB-9A1D-943B1F293B80'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-share-alt */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-share-alt',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '406BA963-D9A0-4093-AF02-59835BFE1FFF'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('31e16d89-4882-448d-899d-c62d19d39082', '406BA963-D9A0-4093-AF02-59835BFE1FFF', 'FieldCategoryInfo', '{"Share Details":{"icon":"fa fa-share-alt","description":"Permissions and identifiers for a shared list, including role, status, and display names of the list and user"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields such as primary key and timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b7f5d7ef-c077-49ca-ad7e-a0282ec9f120', '406BA963-D9A0-4093-AF02-59835BFE1FFF', 'FieldCategoryIcons', '{"Share Details":"fa fa-share-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '406BA963-D9A0-4093-AF02-59835BFE1FFF'
         

/* Set categories for 12 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invitation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'List',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '35748FF3-2B46-4305-B9EF-EB28915E13E4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invitation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'List Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '18979939-E8A8-4849-8C9B-CDC3FBEB5AB4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invitation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Address',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = 'E41F83E9-8ECA-4483-BE65-FCC8990F2325'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invitation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F11B70C9-485B-4E18-9E38-E4BE52B29459'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invitation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F38F2F7-B6A4-4338-AE37-9398DD383D64'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invitation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expires At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1306C4C0-B074-4E92-A526-615D518C3693'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Invitation Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Token',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '45D663C7-305A-4465-B94F-F90029058162'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B37AADE5-6823-4547-8C80-5E9F8D794978'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '76BAB98E-E2BE-4FBA-91AF-DAD1DE98F7FA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '794CEC9C-8622-42D7-9CB5-F0B567D871B8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '14CD029E-327D-4BFB-BE4A-ABBC95B65810'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2E0F3925-53BE-4A19-BED8-CC22246CA9F0'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-user-plus */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-user-plus',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('1ddc3ac5-f1bc-477e-80b7-13bbb15c4912', '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', 'FieldCategoryInfo', '{"Invitation Details":{"icon":"fa fa-envelope-open","description":"Core invitation information such as target list, invitee email, role, status, expiration, and security token"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields including identifiers, creator info, and timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7b1ae924-143f-4273-97bc-7c0ef955d51b', '634CF15F-B2FB-4D33-897D-8A5F501F9EFC', 'FieldCategoryIcons', '{"Invitation Details":"fa fa-envelope-open","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '634CF15F-B2FB-4D33-897D-8A5F501F9EFC'
         

