/* SQL generated to create new entity Playlists */

      INSERT INTO [__mj].Entity (
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
         'fc3c971d-9fd7-40c8-a428-c8e66a5bb972',
         'Playlists',
         NULL,
         NULL,
         NULL,
         'Playlist',
         'vwPlaylists',
         'spotify',
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
   

/* SQL generated to add new entity Playlists to application ID: '9520B90D-5FEC-4FA9-B910-A784A3DE17D8' */
INSERT INTO __mj.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('9520B90D-5FEC-4FA9-B910-A784A3DE17D8', 'fc3c971d-9fd7-40c8-a428-c8e66a5bb972', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = '9520B90D-5FEC-4FA9-B910-A784A3DE17D8'))

/* SQL generated to add new permission for entity Playlists for role UI */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fc3c971d-9fd7-40c8-a428-c8e66a5bb972', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Playlists for role Developer */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fc3c971d-9fd7-40c8-a428-c8e66a5bb972', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Playlists for role Integration */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fc3c971d-9fd7-40c8-a428-c8e66a5bb972', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Playlist Songs */

      INSERT INTO [__mj].Entity (
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
         '77ca76e4-008f-4a0b-8e91-c81bd719440f',
         'Playlist Songs',
         NULL,
         NULL,
         NULL,
         'PlaylistSong',
         'vwPlaylistSongs',
         'spotify',
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
   

/* SQL generated to add new entity Playlist Songs to application ID: '9520B90D-5FEC-4FA9-B910-A784A3DE17D8' */
INSERT INTO __mj.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('9520B90D-5FEC-4FA9-B910-A784A3DE17D8', '77ca76e4-008f-4a0b-8e91-c81bd719440f', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = '9520B90D-5FEC-4FA9-B910-A784A3DE17D8'))

/* SQL generated to add new permission for entity Playlist Songs for role UI */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('77ca76e4-008f-4a0b-8e91-c81bd719440f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Playlist Songs for role Developer */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('77ca76e4-008f-4a0b-8e91-c81bd719440f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Playlist Songs for role Integration */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('77ca76e4-008f-4a0b-8e91-c81bd719440f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity spotify.PlaylistSong */
ALTER TABLE [spotify].[PlaylistSong] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity spotify.PlaylistSong */
ALTER TABLE [spotify].[PlaylistSong] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity spotify.Playlist */
ALTER TABLE [spotify].[Playlist] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity spotify.Playlist */
ALTER TABLE [spotify].[Playlist] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

