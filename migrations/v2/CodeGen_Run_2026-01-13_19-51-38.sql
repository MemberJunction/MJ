/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd5e73885-c7b2-4701-bf3a-7570c37ea0b3'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = 'ID')
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
            'd5e73885-c7b2-4701-bf3a-7570c37ea0b3',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100001,
            'ID',
            'ID',
            'Unique identifier for the playlist-song relationship.',
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
         WHERE ID = '7cbd2257-7663-4c58-815e-121b19cbf78a'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = 'PlaylistID')
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
            '7cbd2257-7663-4c58-815e-121b19cbf78a',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100002,
            'PlaylistID',
            'Playlist ID',
            'Playlist this song belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972',
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
         WHERE ID = '4dd2b79c-f1c8-4a47-a4fc-fcb342cf5c3a'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = 'SongID')
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
            '4dd2b79c-f1c8-4a47-a4fc-fcb342cf5c3a',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100003,
            'SongID',
            'Song ID',
            'Song included in the playlist.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '9D02B3A0-7E1C-44B7-A3B7-421DF70CA8DB',
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
         WHERE ID = 'fd199202-70d8-43e5-b2c4-51849e5e1454'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = 'SequenceNumber')
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
            'fd199202-70d8-43e5-b2c4-51849e5e1454',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100004,
            'SequenceNumber',
            'Sequence Number',
            'Order of the song in the playlist (starting from 1).',
            'int',
            4,
            10,
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
         WHERE ID = 'e3f4f1bd-d608-4260-a693-dc86126130cf'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = 'AddedFromWeb')
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
            'e3f4f1bd-d608-4260-a693-dc86126130cf',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100005,
            'AddedFromWeb',
            'Added From Web',
            'Whether this song was discovered via web search by an AI agent.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
         WHERE ID = '4d42718b-b3f6-4536-ba32-3a2222dbcee9'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = 'PopularityReason')
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
            '4d42718b-b3f6-4536-ba32-3a2222dbcee9',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100006,
            'PopularityReason',
            'Popularity Reason',
            'Reason why this song was included (e.g., "Currently #3 on Billboard Hot 100").',
            'nvarchar',
            1000,
            0,
            0,
            1,
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
         WHERE ID = '2f1c6747-47b4-42b9-8bd8-f2031ab0f7b3'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = '__mj_CreatedAt')
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
            '2f1c6747-47b4-42b9-8bd8-f2031ab0f7b3',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100007,
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
         WHERE ID = 'ac6490a9-1ee5-4f99-be43-c5060c4eb131'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = '__mj_UpdatedAt')
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
            'ac6490a9-1ee5-4f99-be43-c5060c4eb131',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100008,
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
         WHERE ID = '4c85f73c-3ec1-4400-b7a5-e542897bc868'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'ID')
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
            '4c85f73c-3ec1-4400-b7a5-e542897bc868',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100001,
            'ID',
            'ID',
            'Unique identifier for the playlist.',
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
         WHERE ID = 'f29995ab-e10a-4de3-aff1-714ce5d4e032'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'UserID')
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
            'f29995ab-e10a-4de3-aff1-714ce5d4e032',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100002,
            'UserID',
            'User ID',
            'User who owns this playlist.',
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
         WHERE ID = '1660c2a8-4e78-4369-b1cd-f5684b43b21f'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'Name')
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
            '1660c2a8-4e78-4369-b1cd-f5684b43b21f',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100003,
            'Name',
            'Name',
            'Display name for the playlist.',
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
            1,
            1,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3b143e25-480f-4216-9f0c-a4704f35160e'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'Description')
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
            '3b143e25-480f-4216-9f0c-a4704f35160e',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100004,
            'Description',
            'Description',
            'Optional description of the playlist theme or purpose.',
            'nvarchar',
            -1,
            0,
            0,
            1,
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
         WHERE ID = 'c5d5225f-0487-49b4-9cb7-4fa6a980ea90'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'Genre')
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
            'c5d5225f-0487-49b4-9cb7-4fa6a980ea90',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100005,
            'Genre',
            'Genre',
            'Primary genre of songs in this playlist.',
            'nvarchar',
            200,
            0,
            0,
            1,
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
         WHERE ID = '95c58fe0-65de-4fec-a683-1c404170f52c'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'CreatedByAI')
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
            '95c58fe0-65de-4fec-a683-1c404170f52c',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100006,
            'CreatedByAI',
            'Created By AI',
            'Indicates whether this playlist was created by an AI agent.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
         WHERE ID = '87c82da4-3ff0-48bd-b0f4-8fb2c6062f1c'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'AIGenerationNotes')
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
            '87c82da4-3ff0-48bd-b0f4-8fb2c6062f1c',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100007,
            'AIGenerationNotes',
            'AI Generation Notes',
            'Notes from the AI agent about how the playlist was curated.',
            'nvarchar',
            -1,
            0,
            0,
            1,
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
         WHERE ID = '4d7d7bb9-6a2f-4f5a-8065-0fd85099922d'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'IsPublic')
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
            '4d7d7bb9-6a2f-4f5a-8065-0fd85099922d',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100008,
            'IsPublic',
            'Is Public',
            'Whether this playlist is visible to other users.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
         WHERE ID = 'b8d93995-ba23-4bfa-b05e-37861bc57876'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'TotalDuration')
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
            'b8d93995-ba23-4bfa-b05e-37861bc57876',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100009,
            'TotalDuration',
            'Total Duration',
            'Total duration of all songs in the playlist (in seconds).',
            'int',
            4,
            10,
            0,
            1,
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
         WHERE ID = '2ce8c662-333c-4dc6-8ebb-dba8e92a08bc'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = '__mj_CreatedAt')
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
            '2ce8c662-333c-4dc6-8ebb-dba8e92a08bc',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100010,
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
         WHERE ID = 'c730345c-df05-4a37-b04a-b07b2239a514'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = '__mj_UpdatedAt')
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
            'c730345c-df05-4a37-b04a-b07b2239a514',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100011,
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd82e6f97-6b2b-4124-b99f-9710d28993b6'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d82e6f97-6b2b-4124-b99f-9710d28993b6', '9D02B3A0-7E1C-44B7-A3B7-421DF70CA8DB', '77CA76E4-008F-4A0B-8E91-C81BD719440F', 'SongID', 'One To Many', 1, 1, 'Playlist Songs', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a7e03416-4340-41dc-a917-bd2e73a4f7cc'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a7e03416-4340-41dc-a917-bd2e73a4f7cc', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', 'UserID', 'One To Many', 1, 1, 'Playlists', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '39f65af2-b67e-4aaa-9d6d-f38adf936c40'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('39f65af2-b67e-4aaa-9d6d-f38adf936c40', 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', '77CA76E4-008F-4A0B-8E91-C81BD719440F', 'PlaylistID', 'One To Many', 1, 1, 'Playlist Songs', 2);
   END
                              

/* Index for Foreign Keys for PlaylistSong */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PlaylistID in table PlaylistSong
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PlaylistSong_PlaylistID' 
    AND object_id = OBJECT_ID('[spotify].[PlaylistSong]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PlaylistSong_PlaylistID ON [spotify].[PlaylistSong] ([PlaylistID]);

-- Index for foreign key SongID in table PlaylistSong
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PlaylistSong_SongID' 
    AND object_id = OBJECT_ID('[spotify].[PlaylistSong]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PlaylistSong_SongID ON [spotify].[PlaylistSong] ([SongID]);

/* SQL text to update entity field related entity name field map for entity field ID 7CBD2257-7663-4C58-815E-121B19CBF78A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7CBD2257-7663-4C58-815E-121B19CBF78A',
         @RelatedEntityNameFieldMap='Playlist'

/* Index for Foreign Keys for Playlist */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Playlist
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Playlist_UserID' 
    AND object_id = OBJECT_ID('[spotify].[Playlist]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Playlist_UserID ON [spotify].[Playlist] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID F29995AB-E10A-4DE3-AFF1-714CE5D4E032 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F29995AB-E10A-4DE3-AFF1-714CE5D4E032',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 4DD2B79C-F1C8-4A47-A4FC-FCB342CF5C3A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4DD2B79C-F1C8-4A47-A4FC-FCB342CF5C3A',
         @RelatedEntityNameFieldMap='Song'

/* Base View SQL for Playlists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: vwPlaylists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Playlists
-----               SCHEMA:      spotify
-----               BASE TABLE:  Playlist
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[spotify].[vwPlaylists]', 'V') IS NOT NULL
    DROP VIEW [spotify].[vwPlaylists];
GO

CREATE VIEW [spotify].[vwPlaylists]
AS
SELECT
    p.*,
    User_UserID.[Name] AS [User]
FROM
    [spotify].[Playlist] AS p
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [p].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [spotify].[vwPlaylists] TO [cdp_UI], [cdp_Developer], [cdp_Integration], [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Playlists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: Permissions for vwPlaylists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [spotify].[vwPlaylists] TO [cdp_UI], [cdp_Developer], [cdp_Integration], [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Playlists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: spCreatePlaylist
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Playlist
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spCreatePlaylist]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spCreatePlaylist];
GO

CREATE PROCEDURE [spotify].[spCreatePlaylist]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Genre nvarchar(100),
    @CreatedByAI bit = NULL,
    @AIGenerationNotes nvarchar(MAX),
    @IsPublic bit = NULL,
    @TotalDuration int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [spotify].[Playlist]
            (
                [ID],
                [UserID],
                [Name],
                [Description],
                [Genre],
                [CreatedByAI],
                [AIGenerationNotes],
                [IsPublic],
                [TotalDuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @Name,
                @Description,
                @Genre,
                ISNULL(@CreatedByAI, 1),
                @AIGenerationNotes,
                ISNULL(@IsPublic, 0),
                @TotalDuration
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [spotify].[Playlist]
            (
                [UserID],
                [Name],
                [Description],
                [Genre],
                [CreatedByAI],
                [AIGenerationNotes],
                [IsPublic],
                [TotalDuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @Name,
                @Description,
                @Genre,
                ISNULL(@CreatedByAI, 1),
                @AIGenerationNotes,
                ISNULL(@IsPublic, 0),
                @TotalDuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [spotify].[vwPlaylists] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [spotify].[spCreatePlaylist] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Playlists */

GRANT EXECUTE ON [spotify].[spCreatePlaylist] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Playlists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: spUpdatePlaylist
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Playlist
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spUpdatePlaylist]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spUpdatePlaylist];
GO

CREATE PROCEDURE [spotify].[spUpdatePlaylist]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Genre nvarchar(100),
    @CreatedByAI bit,
    @AIGenerationNotes nvarchar(MAX),
    @IsPublic bit,
    @TotalDuration int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [spotify].[Playlist]
    SET
        [UserID] = @UserID,
        [Name] = @Name,
        [Description] = @Description,
        [Genre] = @Genre,
        [CreatedByAI] = @CreatedByAI,
        [AIGenerationNotes] = @AIGenerationNotes,
        [IsPublic] = @IsPublic,
        [TotalDuration] = @TotalDuration
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [spotify].[vwPlaylists] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [spotify].[vwPlaylists]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [spotify].[spUpdatePlaylist] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Playlist table
------------------------------------------------------------
IF OBJECT_ID('[spotify].[trgUpdatePlaylist]', 'TR') IS NOT NULL
    DROP TRIGGER [spotify].[trgUpdatePlaylist];
GO
CREATE TRIGGER [spotify].trgUpdatePlaylist
ON [spotify].[Playlist]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [spotify].[Playlist]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [spotify].[Playlist] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Playlists */

GRANT EXECUTE ON [spotify].[spUpdatePlaylist] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Playlists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlists
-- Item: spDeletePlaylist
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Playlist
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spDeletePlaylist]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spDeletePlaylist];
GO

CREATE PROCEDURE [spotify].[spDeletePlaylist]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [spotify].[Playlist]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [spotify].[spDeletePlaylist] TO [cdp_Integration], [cdp_Integration]
    

/* spDelete Permissions for Playlists */

GRANT EXECUTE ON [spotify].[spDeletePlaylist] TO [cdp_Integration], [cdp_Integration]



/* Base View SQL for Playlist Songs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: vwPlaylistSongs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Playlist Songs
-----               SCHEMA:      spotify
-----               BASE TABLE:  PlaylistSong
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[spotify].[vwPlaylistSongs]', 'V') IS NOT NULL
    DROP VIEW [spotify].[vwPlaylistSongs];
GO

CREATE VIEW [spotify].[vwPlaylistSongs]
AS
SELECT
    p.*,
    Playlist_PlaylistID.[Name] AS [Playlist],
    Song_SongID.[Name] AS [Song]
FROM
    [spotify].[PlaylistSong] AS p
INNER JOIN
    [spotify].[Playlist] AS Playlist_PlaylistID
  ON
    [p].[PlaylistID] = Playlist_PlaylistID.[ID]
INNER JOIN
    [spotify].[Song] AS Song_SongID
  ON
    [p].[SongID] = Song_SongID.[ID]
GO
GRANT SELECT ON [spotify].[vwPlaylistSongs] TO [cdp_UI], [cdp_Developer], [cdp_Integration], [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Playlist Songs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: Permissions for vwPlaylistSongs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [spotify].[vwPlaylistSongs] TO [cdp_UI], [cdp_Developer], [cdp_Integration], [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Playlist Songs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: spCreatePlaylistSong
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PlaylistSong
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spCreatePlaylistSong]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spCreatePlaylistSong];
GO

CREATE PROCEDURE [spotify].[spCreatePlaylistSong]
    @ID uniqueidentifier = NULL,
    @PlaylistID uniqueidentifier,
    @SongID uniqueidentifier,
    @SequenceNumber int,
    @AddedFromWeb bit = NULL,
    @PopularityReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [spotify].[PlaylistSong]
            (
                [ID],
                [PlaylistID],
                [SongID],
                [SequenceNumber],
                [AddedFromWeb],
                [PopularityReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PlaylistID,
                @SongID,
                @SequenceNumber,
                ISNULL(@AddedFromWeb, 0),
                @PopularityReason
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [spotify].[PlaylistSong]
            (
                [PlaylistID],
                [SongID],
                [SequenceNumber],
                [AddedFromWeb],
                [PopularityReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PlaylistID,
                @SongID,
                @SequenceNumber,
                ISNULL(@AddedFromWeb, 0),
                @PopularityReason
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [spotify].[vwPlaylistSongs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [spotify].[spCreatePlaylistSong] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Playlist Songs */

GRANT EXECUTE ON [spotify].[spCreatePlaylistSong] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Playlist Songs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: spUpdatePlaylistSong
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PlaylistSong
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spUpdatePlaylistSong]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spUpdatePlaylistSong];
GO

CREATE PROCEDURE [spotify].[spUpdatePlaylistSong]
    @ID uniqueidentifier,
    @PlaylistID uniqueidentifier,
    @SongID uniqueidentifier,
    @SequenceNumber int,
    @AddedFromWeb bit,
    @PopularityReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [spotify].[PlaylistSong]
    SET
        [PlaylistID] = @PlaylistID,
        [SongID] = @SongID,
        [SequenceNumber] = @SequenceNumber,
        [AddedFromWeb] = @AddedFromWeb,
        [PopularityReason] = @PopularityReason
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [spotify].[vwPlaylistSongs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [spotify].[vwPlaylistSongs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [spotify].[spUpdatePlaylistSong] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PlaylistSong table
------------------------------------------------------------
IF OBJECT_ID('[spotify].[trgUpdatePlaylistSong]', 'TR') IS NOT NULL
    DROP TRIGGER [spotify].[trgUpdatePlaylistSong];
GO
CREATE TRIGGER [spotify].trgUpdatePlaylistSong
ON [spotify].[PlaylistSong]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [spotify].[PlaylistSong]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [spotify].[PlaylistSong] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Playlist Songs */

GRANT EXECUTE ON [spotify].[spUpdatePlaylistSong] TO [cdp_Developer], [cdp_Integration], [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Playlist Songs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Playlist Songs
-- Item: spDeletePlaylistSong
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PlaylistSong
------------------------------------------------------------
IF OBJECT_ID('[spotify].[spDeletePlaylistSong]', 'P') IS NOT NULL
    DROP PROCEDURE [spotify].[spDeletePlaylistSong];
GO

CREATE PROCEDURE [spotify].[spDeletePlaylistSong]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [spotify].[PlaylistSong]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [spotify].[spDeletePlaylistSong] TO [cdp_Integration], [cdp_Integration]
    

/* spDelete Permissions for Playlist Songs */

GRANT EXECUTE ON [spotify].[spDeletePlaylistSong] TO [cdp_Integration], [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0152847a-d0f9-4634-bf20-0c8ca31a96f2'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = 'Playlist')
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
            '0152847a-d0f9-4634-bf20-0c8ca31a96f2',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100017,
            'Playlist',
            'Playlist',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = '0342538e-6eff-4115-a2d8-3a42ad861c73'  OR 
               (EntityID = '77CA76E4-008F-4A0B-8E91-C81BD719440F' AND Name = 'Song')
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
            '0342538e-6eff-4115-a2d8-3a42ad861c73',
            '77CA76E4-008F-4A0B-8E91-C81BD719440F', -- Entity: Playlist Songs
            100018,
            'Song',
            'Song',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = '8b354e07-e905-4904-8b48-a9a4989ca51a'  OR 
               (EntityID = 'FC3C971D-9FD7-40C8-A428-C8E66A5BB972' AND Name = 'User')
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
            '8b354e07-e905-4904-8b48-a9a4989ca51a',
            'FC3C971D-9FD7-40C8-A428-C8E66A5BB972', -- Entity: Playlists
            100023,
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

