/* SQL generated to create new entity MJ: ML Findings */

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
         'f94bbbcc-7d94-403e-8050-223457a16395',
         'MJ: ML Findings',
         'ML Findings',
         'A dated, measured fact this organization has learned about itself — the durable residue of modeling. A model is perishable (retrained, replaced, retired); what it LEARNED is not, and belongs to the business rather than to the artifact that measured it. Findings are written when a model is promoted, from its measured importances and coefficients, and are SUPERSEDED rather than updated so the record shows a lever shifting over time instead of only its latest value. Story/StoryVector make them searchable by meaning exactly as MJ: ML Components are, so "what have we learned about lapsing?" is a vector query rather than a report someone has to write. EXAMPLE: "Committee membership is associated with 31% lower lapse risk" — EvidenceType Observed Association, Direction Decreases, Magnitude 0.31, measured out-of-sample on 2,180 members.',
         NULL,
         'MLFinding',
         'vwMLFindings',
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

/* SQL generated to add new entity MJ: ML Findings to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f94bbbcc-7d94-403e-8050-223457a16395', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Findings for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f94bbbcc-7d94-403e-8050-223457a16395', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Findings for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f94bbbcc-7d94-403e-8050-223457a16395', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Findings for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f94bbbcc-7d94-403e-8050-223457a16395', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLFinding */
ALTER TABLE [${flyway:defaultSchema}].[MLFinding] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLFinding */
UPDATE [${flyway:defaultSchema}].[MLFinding] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLFinding */
ALTER TABLE [${flyway:defaultSchema}].[MLFinding] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLFinding */
ALTER TABLE [${flyway:defaultSchema}].[MLFinding] ADD CONSTRAINT [DF___mj_MLFinding___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLFinding */
ALTER TABLE [${flyway:defaultSchema}].[MLFinding] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLFinding */
UPDATE [${flyway:defaultSchema}].[MLFinding] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLFinding */
ALTER TABLE [${flyway:defaultSchema}].[MLFinding] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLFinding */
ALTER TABLE [${flyway:defaultSchema}].[MLFinding] ADD CONSTRAINT [DF___mj_MLFinding___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 27 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'F94BBBCC-7D94-403E-8050-223457A16395'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bacb83b-889a-4a9c-9968-fd48ba4bd8c9' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'ID')) BEGIN
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
            '3bacb83b-889a-4a9c-9968-fd48ba4bd8c9',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            1,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cda01590-d65e-4462-921d-2b9fa09bb7f7' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'Name')) BEGIN
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
            'cda01590-d65e-4462-921d-2b9fa09bb7f7',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            2,
            'Name',
            'Name',
            'Short label naming the relationship, for lists and citations (e.g. "Committee membership and lapse risk"). The full claim lives in Statement.',
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
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1570870-b17c-4a63-b82a-51baa0764c6f' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'Statement')) BEGIN
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
            'c1570870-b17c-4a63-b82a-51baa0764c6f',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            3,
            'Statement',
            'Statement',
            'The claim in one plain sentence, written so it can be quoted verbatim into a board paper or an agent''s answer without further interpretation. Must carry its own hedging: an association says "is associated with", never "causes".',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '487d4ad9-82ab-4e21-8855-cba7548ab68d' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'MLModelID')) BEGIN
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
            '487d4ad9-82ab-4e21-8855-cba7548ab68d',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            4,
            'MLModelID',
            'ML Model ID',
            'The model whose promotion produced this measurement. NULL for a finding recorded independently of any model (an operator''s asserted domain fact, or one carried over from an external study).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'A3997636-011D-46E0-BC01-8B1E61E1087B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f840b607-e8ed-472a-b35f-db15f9a76703' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'ComponentID')) BEGIN
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
            'f840b607-e8ed-472a-b35f-db15f9a76703',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            5,
            'ComponentID',
            'Component ID',
            'The signal (MJ: ML Components row) this finding is about — the measure whose contribution was quantified. This is what lets a finding be re-tested later: the signal is executable, so the same measurement can be repeated on new data.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '9A497976-1AD3-4AE4-99F6-FC95406BA01E',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd4e0aa8-5c03-4193-81f5-316dd855a276' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'TargetVariable')) BEGIN
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
            'dd4e0aa8-5c03-4193-81f5-316dd855a276',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            6,
            'TargetVariable',
            'Target Variable',
            'What the finding is a claim ABOUT — the outcome the relationship was measured against (e.g. "Renewed", "Lapsed", "DonationAmount"). Denormalized from the model so a finding stays legible after the model is archived.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85d28480-013d-4d35-a809-c6d21250f7b8' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'EvidenceType')) BEGIN
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
            '85d28480-013d-4d35-a809-c6d21250f7b8',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            7,
            'EvidenceType',
            'Evidence Type',
            'THE EPISTEMIC STATUS, and the most important column here. Observed Association = the two move together in the data. Predictive Contribution = this input measurably improved out-of-sample prediction (a stronger statement about usefulness, still not about cause). Tested Intervention = something was deliberately changed and the effect measured — the only kind that supports "if we do X, Y follows". Descriptive = a stated property of the population, no relationship claimed. Asserted = a human recorded it without measurement here. An agent citing a finding must not flatten these into one voice, which is exactly what it will do if the distinction is not on the record.',
            'nvarchar',
            60,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5a5ed4a-a2b7-4474-aed9-67ad784f6f9c' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'Direction')) BEGIN
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
            'c5a5ed4a-a2b7-4474-aed9-67ad784f6f9c',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            8,
            'Direction',
            'Direction',
            'Which way the relationship runs with respect to TargetVariable: Increases, Decreases, Mixed (non-monotonic — more is better up to a point), None (measured and found not to matter, worth keeping so the next person does not re-test it), or Unknown.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Unknown',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1cff039a-a6bb-43f4-ad35-e7a74eeec8cf' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'Magnitude')) BEGIN
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
            '1cff039a-a6bb-43f4-ad35-e7a74eeec8cf',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            9,
            'Magnitude',
            'Magnitude',
            'How large the effect is, in the units named by MagnitudeUnit. NULL when the finding is directional only — an honest NULL beats a number nobody can interpret.',
            'decimal',
            9,
            18,
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd2929636-d21a-4289-94f0-208e54c72cdb' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'MagnitudeUnit')) BEGIN
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
            'd2929636-d21a-4289-94f0-208e54c72cdb',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            10,
            'MagnitudeUnit',
            'Magnitude Unit',
            'What Magnitude is measured in, so a number is never read in the wrong scale: "probability", "percent", "ratio", "odds ratio", "days", "importance share", or a domain unit. Required whenever Magnitude is present.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2657487d-d4ac-4d42-8232-225d780bfd0e' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'Confidence')) BEGIN
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
            '2657487d-d4ac-4d42-8232-225d780bfd0e',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            11,
            'Confidence',
            'Confidence',
            'How much weight to put on this finding — Low, Moderate or High — reflecting population size, out-of-sample performance and how directly the effect was measured. Deliberately coarse: a spurious decimal here would invite false precision about something that is a judgment.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf5873d0-f3b2-4ec5-9bfb-157569af30a4' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'MeasuredAt')) BEGIN
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
            'bf5873d0-f3b2-4ec5-9bfb-157569af30a4',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            12,
            'MeasuredAt',
            'Measured At',
            'When the measurement was taken. A finding without a date is not citable — the business changes, and a 2024 relationship is evidence about 2024. Ordering by this column over a chain of superseded findings is how a lever''s movement becomes visible.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cb2a1b2-9790-4f88-b0fc-a2e86bfdcf1f' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'PopulationSize')) BEGIN
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
            '0cb2a1b2-9790-4f88-b0fc-a2e86bfdcf1f',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            13,
            'PopulationSize',
            'Population Size',
            'How many records the measurement rested on. The difference between a finding worth acting on and one worth re-testing is usually this number.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ac6cd184-8053-432e-9800-5387d97074ba' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'HoldoutMetric')) BEGIN
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
            'ac6cd184-8053-432e-9800-5387d97074ba',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            14,
            'HoldoutMetric',
            'Holdout Metric',
            'Which out-of-sample metric backs this finding (e.g. "auc", "r2", "accuracy") — named rather than assumed, because the same number means different things across problem types.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ee02514-5a70-444d-8e88-c36a39b81e09' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'HoldoutMetricValue')) BEGIN
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
            '4ee02514-5a70-444d-8e88-c36a39b81e09',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            15,
            'HoldoutMetricValue',
            'Holdout Metric Value',
            'The value of HoldoutMetric on the LOCKED holdout — data the model never saw. This is what separates a finding from a story: the relationship held on records that played no part in discovering it.',
            'decimal',
            9,
            18,
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3ad601c-de6b-45b6-9582-632836f9446b' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'Evidence')) BEGIN
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
            'e3ad601c-de6b-45b6-9582-632836f9446b',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            16,
            'Evidence',
            'Evidence',
            'The numbers behind the claim, as JSON — importance share, coefficient, the holdout metric set, the assembly window, whatever the writer had. Kept so a skeptical reader can check the arithmetic rather than take the sentence on trust.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0d836e8e-7d33-440b-b292-4c00cb7d64d6' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'Story')) BEGIN
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
            '0d836e8e-7d33-440b-b292-4c00cb7d64d6',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            17,
            'Story',
            'Story',
            'The finding in business language — what it means and what someone might do about it — written at promotion time. This is the text that gets embedded, so it is what a meaning search actually matches against.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1092234-d736-4d07-81f5-fd12d6b88e09' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'StoryVector')) BEGIN
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
            'd1092234-d736-4d07-81f5-fd12d6b88e09',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            18,
            'StoryVector',
            'Story Vector',
            'Embedding vector of Story (JSON float array), for similarity search over what the organization has learned. Written by the entity server on save when Story changes, using the same local model that embeds component stories — a vector from a different model produces distances that look like numbers and mean nothing.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2fac95a-4466-4aa7-9695-879b18701198' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'StoryEmbeddingModelID')) BEGIN
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
            'f2fac95a-4466-4aa7-9695-879b18701198',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            19,
            'StoryEmbeddingModelID',
            'Story Embedding Model ID',
            'Which AI model produced StoryVector, so a later re-embedding can tell whether the corpus is still in one vector space.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7054fd85-7a2a-44ee-a39a-11e895fdd5b1' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'ContentHash')) BEGIN
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
            '7054fd85-7a2a-44ee-a39a-11e895fdd5b1',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            20,
            'ContentHash',
            'Content Hash',
            'Hash of the claim''s identity (signal + target + evidence type), so a retrain that re-measures the SAME relationship supersedes the prior finding instead of accumulating a near-duplicate beside it.',
            'nvarchar',
            128,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb1f23d8-9a85-40eb-8197-c332087012d8' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'SupersededByID')) BEGIN
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
            'bb1f23d8-9a85-40eb-8197-c332087012d8',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            21,
            'SupersededByID',
            'Superseded By ID',
            'The newer measurement of this same relationship. Set when a retrain re-measures it; the old row stays, dated, so the chain shows how the relationship moved rather than only where it ended up.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'F94BBBCC-7D94-403E-8050-223457A16395',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '868c11eb-4f82-43a8-bf19-778c86924fa3' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'Status')) BEGIN
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
            '868c11eb-4f82-43a8-bf19-778c86924fa3',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            22,
            'Status',
            'Status',
            'Active (the current measurement), Superseded (a newer one exists — kept for the historical chain), or Retracted (found to be wrong; kept deliberately, because a retracted finding someone already acted on is itself worth knowing about).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '028ba197-e50c-426d-87ac-f7434719fec4' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = '__mj_CreatedAt')) BEGIN
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
            '028ba197-e50c-426d-87ac-f7434719fec4',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            23,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aaf4e2c1-2d01-4e6e-a1c2-947cb6c8e4ec' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'aaf4e2c1-2d01-4e6e-a1c2-947cb6c8e4ec',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            24,
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
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '0463B053-77AB-4329-B372-D982A5810DBF'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bfaa4dde-3730-4901-a71b-b88a320aa8fb' OR (EntityID = '0463B053-77AB-4329-B372-D982A5810DBF' AND Name = 'Member')) BEGIN
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
            'bfaa4dde-3730-4901-a71b-b88a320aa8fb',
            '0463B053-77AB-4329-B372-D982A5810DBF', -- Entity: Activities
            8,
            'Member',
            'Member',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
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

/* SQL text to insert entity field value with ID 417857f3-282c-4085-bca7-b505819af14f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('417857f3-282c-4085-bca7-b505819af14f', '85D28480-013D-4D35-A809-C6D21250F7B8', 1, 'Asserted', 'Asserted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b90ab61f-b8c3-4049-a5a1-cb0f05ffaad1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b90ab61f-b8c3-4049-a5a1-cb0f05ffaad1', '85D28480-013D-4D35-A809-C6D21250F7B8', 2, 'Descriptive', 'Descriptive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e2f12a63-439b-4959-8fe5-14880ea4475d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e2f12a63-439b-4959-8fe5-14880ea4475d', '85D28480-013D-4D35-A809-C6D21250F7B8', 3, 'Observed Association', 'Observed Association', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0254e451-6bf6-429b-81f8-45d067ff5e1f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0254e451-6bf6-429b-81f8-45d067ff5e1f', '85D28480-013D-4D35-A809-C6D21250F7B8', 4, 'Predictive Contribution', 'Predictive Contribution', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 596e9ccf-c11d-41ac-b961-9c7f28ba8e6e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('596e9ccf-c11d-41ac-b961-9c7f28ba8e6e', '85D28480-013D-4D35-A809-C6D21250F7B8', 5, 'Tested Intervention', 'Tested Intervention', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 85D28480-013D-4D35-A809-C6D21250F7B8 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='85D28480-013D-4D35-A809-C6D21250F7B8';

/* SQL text to insert entity field value with ID 82610bd3-8d49-4aa5-bdea-ebdab80d91b0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('82610bd3-8d49-4aa5-bdea-ebdab80d91b0', 'C5A5ED4A-A2B7-4474-AED9-67AD784F6F9C', 1, 'Decreases', 'Decreases', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2569fb5c-c0d7-44e7-bac2-dc66f3d7dd55 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2569fb5c-c0d7-44e7-bac2-dc66f3d7dd55', 'C5A5ED4A-A2B7-4474-AED9-67AD784F6F9C', 2, 'Increases', 'Increases', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3c74ada6-b3cf-4741-849d-d0c5f22b4083 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3c74ada6-b3cf-4741-849d-d0c5f22b4083', 'C5A5ED4A-A2B7-4474-AED9-67AD784F6F9C', 3, 'Mixed', 'Mixed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5da21ecd-0c80-4873-bfa0-25b36d03b759 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5da21ecd-0c80-4873-bfa0-25b36d03b759', 'C5A5ED4A-A2B7-4474-AED9-67AD784F6F9C', 4, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ce8cc608-829e-4ff3-987a-31123b803d40 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ce8cc608-829e-4ff3-987a-31123b803d40', 'C5A5ED4A-A2B7-4474-AED9-67AD784F6F9C', 5, 'Unknown', 'Unknown', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C5A5ED4A-A2B7-4474-AED9-67AD784F6F9C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C5A5ED4A-A2B7-4474-AED9-67AD784F6F9C';

/* SQL text to insert entity field value with ID 9f243474-005a-4537-ab49-362d245f4f96 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9f243474-005a-4537-ab49-362d245f4f96', '2657487D-D4AC-4D42-8232-225D780BFD0E', 1, 'High', 'High', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 998901d8-2b96-4bf0-a6cf-0c278bf4f538 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('998901d8-2b96-4bf0-a6cf-0c278bf4f538', '2657487D-D4AC-4D42-8232-225D780BFD0E', 2, 'Low', 'Low', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7a53bac7-af09-4fe9-ba27-1f1899107742 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7a53bac7-af09-4fe9-ba27-1f1899107742', '2657487D-D4AC-4D42-8232-225D780BFD0E', 3, 'Moderate', 'Moderate', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2657487D-D4AC-4D42-8232-225D780BFD0E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2657487D-D4AC-4D42-8232-225D780BFD0E';

/* SQL text to insert entity field value with ID 87bdee73-0e98-4cec-a5a6-ba365416f290 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('87bdee73-0e98-4cec-a5a6-ba365416f290', '868C11EB-4F82-43A8-BF19-778C86924FA3', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7ee28d91-4bf4-496e-9dc6-d4e28afe385e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7ee28d91-4bf4-496e-9dc6-d4e28afe385e', '868C11EB-4F82-43A8-BF19-778C86924FA3', 2, 'Retracted', 'Retracted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 62d9239b-87c9-4016-a30b-693b7da99eac */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('62d9239b-87c9-4016-a30b-693b7da99eac', '868C11EB-4F82-43A8-BF19-778C86924FA3', 3, 'Superseded', 'Superseded', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 868C11EB-4F82-43A8-BF19-778C86924FA3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='868C11EB-4F82-43A8-BF19-778C86924FA3';


/* Create Entity Relationship: MJ: ML Findings -> MJ: ML Findings (One To Many via SupersededByID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5e494bd7-4b0c-4730-9124-9b3779c22f05'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5e494bd7-4b0c-4730-9124-9b3779c22f05', 'F94BBBCC-7D94-403E-8050-223457A16395', 'F94BBBCC-7D94-403E-8050-223457A16395', 'SupersededByID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Models -> MJ: ML Findings (One To Many via StoryEmbeddingModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b708aee5-4cdd-4d44-8e10-0a6075c7b8a8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b708aee5-4cdd-4d44-8e10-0a6075c7b8a8', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'F94BBBCC-7D94-403E-8050-223457A16395', 'StoryEmbeddingModelID', 'One To Many', 1, 1, 30, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Models -> MJ: ML Findings (One To Many via MLModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a293e721-af73-46e6-901f-f654f8eb2177'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a293e721-af73-46e6-901f-f654f8eb2177', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'F94BBBCC-7D94-403E-8050-223457A16395', 'MLModelID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Components -> MJ: ML Findings (One To Many via ComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2b8e4eac-c992-4135-b361-fe40b323326c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2b8e4eac-c992-4135-b361-fe40b323326c', '9A497976-1AD3-4AE4-99F6-FC95406BA01E', 'F94BBBCC-7D94-403E-8050-223457A16395', 'ComponentID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for Activity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MemberID in table Activity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Activity_MemberID' 
    AND object_id = OBJECT_ID('[demo].[Activity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Activity_MemberID ON [demo].[Activity] ([MemberID]);

/* Base View SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: vwActivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities
-----               SCHEMA:      demo
-----               BASE TABLE:  Activity
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[demo].[vwActivities]', 'V') IS NOT NULL
    DROP VIEW [demo].[vwActivities];
GO

CREATE VIEW [demo].[vwActivities]
AS
SELECT
    a.*,
    demoMember_MemberID.[FirstName] AS [Member]
FROM
    [demo].[Activity] AS a
INNER JOIN
    [demo].[Member] AS demoMember_MemberID
  ON
    [a].[MemberID] = demoMember_MemberID.[ID]
GO
GRANT SELECT ON [demo].[vwActivities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: Permissions for vwActivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [demo].[vwActivities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spCreateActivity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[demo].[spCreateActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spCreateActivity];
GO

CREATE PROCEDURE [demo].[spCreateActivity]
    @ID uniqueidentifier = NULL,
    @MemberID uniqueidentifier,
    @ActivityDate datetimeoffset,
    @ActivityType_Clear bit = 0,
    @ActivityType nvarchar(50) = NULL,
    @Amount_Clear bit = 0,
    @Amount decimal(18, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [demo].[Activity]
            (
                [ID],
                [MemberID],
                [ActivityDate],
                [ActivityType],
                [Amount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MemberID,
                @ActivityDate,
                CASE WHEN @ActivityType_Clear = 1 THEN NULL ELSE ISNULL(@ActivityType, NULL) END,
                CASE WHEN @Amount_Clear = 1 THEN NULL ELSE ISNULL(@Amount, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [demo].[Activity]
            (
                [MemberID],
                [ActivityDate],
                [ActivityType],
                [Amount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MemberID,
                @ActivityDate,
                CASE WHEN @ActivityType_Clear = 1 THEN NULL ELSE ISNULL(@ActivityType, NULL) END,
                CASE WHEN @Amount_Clear = 1 THEN NULL ELSE ISNULL(@Amount, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [demo].[vwActivities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [demo].[spCreateActivity] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities */

GRANT EXECUTE ON [demo].[spCreateActivity] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spUpdateActivity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[demo].[spUpdateActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spUpdateActivity];
GO

CREATE PROCEDURE [demo].[spUpdateActivity]
    @ID uniqueidentifier,
    @MemberID uniqueidentifier = NULL,
    @ActivityDate datetimeoffset = NULL,
    @ActivityType_Clear bit = 0,
    @ActivityType nvarchar(50) = NULL,
    @Amount_Clear bit = 0,
    @Amount decimal(18, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [demo].[Activity]
    SET
        [MemberID] = ISNULL(@MemberID, [MemberID]),
        [ActivityDate] = ISNULL(@ActivityDate, [ActivityDate]),
        [ActivityType] = CASE WHEN @ActivityType_Clear = 1 THEN NULL ELSE ISNULL(@ActivityType, [ActivityType]) END,
        [Amount] = CASE WHEN @Amount_Clear = 1 THEN NULL ELSE ISNULL(@Amount, [Amount]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [demo].[vwActivities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [demo].[vwActivities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [demo].[spUpdateActivity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Activity table
------------------------------------------------------------
IF OBJECT_ID('[demo].[trgUpdateActivity]', 'TR') IS NOT NULL
    DROP TRIGGER [demo].[trgUpdateActivity];
GO
CREATE TRIGGER [demo].trgUpdateActivity
ON [demo].[Activity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [demo].[Activity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [demo].[Activity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Activities */

GRANT EXECUTE ON [demo].[spUpdateActivity] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spDeleteActivity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[demo].[spDeleteActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [demo].[spDeleteActivity];
GO

CREATE PROCEDURE [demo].[spDeleteActivity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [demo].[Activity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [demo].[spDeleteActivity] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities */

GRANT EXECUTE ON [demo].[spDeleteActivity] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLFinding */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Findings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MLModelID in table MLFinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLFinding_MLModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLFinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLFinding_MLModelID ON [${flyway:defaultSchema}].[MLFinding] ([MLModelID]);

-- Index for foreign key ComponentID in table MLFinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLFinding_ComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLFinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLFinding_ComponentID ON [${flyway:defaultSchema}].[MLFinding] ([ComponentID]);

-- Index for foreign key StoryEmbeddingModelID in table MLFinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLFinding_StoryEmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLFinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLFinding_StoryEmbeddingModelID ON [${flyway:defaultSchema}].[MLFinding] ([StoryEmbeddingModelID]);

-- Index for foreign key SupersededByID in table MLFinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLFinding_SupersededByID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLFinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLFinding_SupersededByID ON [${flyway:defaultSchema}].[MLFinding] ([SupersededByID]);

/* SQL text to update entity field related entity name field map for entity field ID F840B607-E8ED-472A-B35F-DB15F9A76703 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F840B607-E8ED-472A-B35F-DB15F9A76703', @RelatedEntityNameFieldMap='Component';

/* SQL text to update entity field related entity name field map for entity field ID F2FAC95A-4466-4AA7-9695-879B18701198 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F2FAC95A-4466-4AA7-9695-879B18701198', @RelatedEntityNameFieldMap='StoryEmbeddingModel';

/* SQL text to update entity field related entity name field map for entity field ID BB1F23D8-9A85-40EB-8197-C332087012D8 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BB1F23D8-9A85-40EB-8197-C332087012D8', @RelatedEntityNameFieldMap='SupersededBy';

/* Base View SQL for MJ: ML Findings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Findings
-- Item: vwMLFindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Findings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLFinding
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLFindings]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLFindings];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLFindings]
AS
SELECT
    m.*,
    MJMLComponent_ComponentID.[Name] AS [Component],
    MJAIModel_StoryEmbeddingModelID.[Name] AS [StoryEmbeddingModel],
    MJMLFinding_SupersededByID.[Name] AS [SupersededBy]
FROM
    [${flyway:defaultSchema}].[MLFinding] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLComponent] AS MJMLComponent_ComponentID
  ON
    [m].[ComponentID] = MJMLComponent_ComponentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_StoryEmbeddingModelID
  ON
    [m].[StoryEmbeddingModelID] = MJAIModel_StoryEmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLFinding] AS MJMLFinding_SupersededByID
  ON
    [m].[SupersededByID] = MJMLFinding_SupersededByID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLFindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Findings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Findings
-- Item: Permissions for vwMLFindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLFindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Findings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Findings
-- Item: spCreateMLFinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLFinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLFinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLFinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLFinding]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Statement nvarchar(MAX),
    @MLModelID_Clear bit = 0,
    @MLModelID uniqueidentifier = NULL,
    @ComponentID_Clear bit = 0,
    @ComponentID uniqueidentifier = NULL,
    @TargetVariable_Clear bit = 0,
    @TargetVariable nvarchar(255) = NULL,
    @EvidenceType nvarchar(30),
    @Direction nvarchar(20) = NULL,
    @Magnitude_Clear bit = 0,
    @Magnitude decimal(18, 6) = NULL,
    @MagnitudeUnit_Clear bit = 0,
    @MagnitudeUnit nvarchar(50) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence nvarchar(20) = NULL,
    @MeasuredAt datetimeoffset,
    @PopulationSize_Clear bit = 0,
    @PopulationSize int = NULL,
    @HoldoutMetric_Clear bit = 0,
    @HoldoutMetric nvarchar(50) = NULL,
    @HoldoutMetricValue_Clear bit = 0,
    @HoldoutMetricValue decimal(18, 6) = NULL,
    @Evidence_Clear bit = 0,
    @Evidence nvarchar(MAX) = NULL,
    @Story_Clear bit = 0,
    @Story nvarchar(MAX) = NULL,
    @StoryVector_Clear bit = 0,
    @StoryVector nvarchar(MAX) = NULL,
    @StoryEmbeddingModelID_Clear bit = 0,
    @StoryEmbeddingModelID uniqueidentifier = NULL,
    @ContentHash_Clear bit = 0,
    @ContentHash nvarchar(64) = NULL,
    @SupersededByID_Clear bit = 0,
    @SupersededByID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLFinding]
            (
                [ID],
                [Name],
                [Statement],
                [MLModelID],
                [ComponentID],
                [TargetVariable],
                [EvidenceType],
                [Direction],
                [Magnitude],
                [MagnitudeUnit],
                [Confidence],
                [MeasuredAt],
                [PopulationSize],
                [HoldoutMetric],
                [HoldoutMetricValue],
                [Evidence],
                [Story],
                [StoryVector],
                [StoryEmbeddingModelID],
                [ContentHash],
                [SupersededByID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Statement,
                CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, NULL) END,
                CASE WHEN @ComponentID_Clear = 1 THEN NULL ELSE ISNULL(@ComponentID, NULL) END,
                CASE WHEN @TargetVariable_Clear = 1 THEN NULL ELSE ISNULL(@TargetVariable, NULL) END,
                @EvidenceType,
                ISNULL(@Direction, 'Unknown'),
                CASE WHEN @Magnitude_Clear = 1 THEN NULL ELSE ISNULL(@Magnitude, NULL) END,
                CASE WHEN @MagnitudeUnit_Clear = 1 THEN NULL ELSE ISNULL(@MagnitudeUnit, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                @MeasuredAt,
                CASE WHEN @PopulationSize_Clear = 1 THEN NULL ELSE ISNULL(@PopulationSize, NULL) END,
                CASE WHEN @HoldoutMetric_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetric, NULL) END,
                CASE WHEN @HoldoutMetricValue_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetricValue, NULL) END,
                CASE WHEN @Evidence_Clear = 1 THEN NULL ELSE ISNULL(@Evidence, NULL) END,
                CASE WHEN @Story_Clear = 1 THEN NULL ELSE ISNULL(@Story, NULL) END,
                CASE WHEN @StoryVector_Clear = 1 THEN NULL ELSE ISNULL(@StoryVector, NULL) END,
                CASE WHEN @StoryEmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@StoryEmbeddingModelID, NULL) END,
                CASE WHEN @ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@ContentHash, NULL) END,
                CASE WHEN @SupersededByID_Clear = 1 THEN NULL ELSE ISNULL(@SupersededByID, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLFinding]
            (
                [Name],
                [Statement],
                [MLModelID],
                [ComponentID],
                [TargetVariable],
                [EvidenceType],
                [Direction],
                [Magnitude],
                [MagnitudeUnit],
                [Confidence],
                [MeasuredAt],
                [PopulationSize],
                [HoldoutMetric],
                [HoldoutMetricValue],
                [Evidence],
                [Story],
                [StoryVector],
                [StoryEmbeddingModelID],
                [ContentHash],
                [SupersededByID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Statement,
                CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, NULL) END,
                CASE WHEN @ComponentID_Clear = 1 THEN NULL ELSE ISNULL(@ComponentID, NULL) END,
                CASE WHEN @TargetVariable_Clear = 1 THEN NULL ELSE ISNULL(@TargetVariable, NULL) END,
                @EvidenceType,
                ISNULL(@Direction, 'Unknown'),
                CASE WHEN @Magnitude_Clear = 1 THEN NULL ELSE ISNULL(@Magnitude, NULL) END,
                CASE WHEN @MagnitudeUnit_Clear = 1 THEN NULL ELSE ISNULL(@MagnitudeUnit, NULL) END,
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END,
                @MeasuredAt,
                CASE WHEN @PopulationSize_Clear = 1 THEN NULL ELSE ISNULL(@PopulationSize, NULL) END,
                CASE WHEN @HoldoutMetric_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetric, NULL) END,
                CASE WHEN @HoldoutMetricValue_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetricValue, NULL) END,
                CASE WHEN @Evidence_Clear = 1 THEN NULL ELSE ISNULL(@Evidence, NULL) END,
                CASE WHEN @Story_Clear = 1 THEN NULL ELSE ISNULL(@Story, NULL) END,
                CASE WHEN @StoryVector_Clear = 1 THEN NULL ELSE ISNULL(@StoryVector, NULL) END,
                CASE WHEN @StoryEmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@StoryEmbeddingModelID, NULL) END,
                CASE WHEN @ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@ContentHash, NULL) END,
                CASE WHEN @SupersededByID_Clear = 1 THEN NULL ELSE ISNULL(@SupersededByID, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLFindings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLFinding] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Findings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLFinding] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Findings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Findings
-- Item: spUpdateMLFinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLFinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLFinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLFinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLFinding]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Statement nvarchar(MAX) = NULL,
    @MLModelID_Clear bit = 0,
    @MLModelID uniqueidentifier = NULL,
    @ComponentID_Clear bit = 0,
    @ComponentID uniqueidentifier = NULL,
    @TargetVariable_Clear bit = 0,
    @TargetVariable nvarchar(255) = NULL,
    @EvidenceType nvarchar(30) = NULL,
    @Direction nvarchar(20) = NULL,
    @Magnitude_Clear bit = 0,
    @Magnitude decimal(18, 6) = NULL,
    @MagnitudeUnit_Clear bit = 0,
    @MagnitudeUnit nvarchar(50) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence nvarchar(20) = NULL,
    @MeasuredAt datetimeoffset = NULL,
    @PopulationSize_Clear bit = 0,
    @PopulationSize int = NULL,
    @HoldoutMetric_Clear bit = 0,
    @HoldoutMetric nvarchar(50) = NULL,
    @HoldoutMetricValue_Clear bit = 0,
    @HoldoutMetricValue decimal(18, 6) = NULL,
    @Evidence_Clear bit = 0,
    @Evidence nvarchar(MAX) = NULL,
    @Story_Clear bit = 0,
    @Story nvarchar(MAX) = NULL,
    @StoryVector_Clear bit = 0,
    @StoryVector nvarchar(MAX) = NULL,
    @StoryEmbeddingModelID_Clear bit = 0,
    @StoryEmbeddingModelID uniqueidentifier = NULL,
    @ContentHash_Clear bit = 0,
    @ContentHash nvarchar(64) = NULL,
    @SupersededByID_Clear bit = 0,
    @SupersededByID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLFinding]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Statement] = ISNULL(@Statement, [Statement]),
        [MLModelID] = CASE WHEN @MLModelID_Clear = 1 THEN NULL ELSE ISNULL(@MLModelID, [MLModelID]) END,
        [ComponentID] = CASE WHEN @ComponentID_Clear = 1 THEN NULL ELSE ISNULL(@ComponentID, [ComponentID]) END,
        [TargetVariable] = CASE WHEN @TargetVariable_Clear = 1 THEN NULL ELSE ISNULL(@TargetVariable, [TargetVariable]) END,
        [EvidenceType] = ISNULL(@EvidenceType, [EvidenceType]),
        [Direction] = ISNULL(@Direction, [Direction]),
        [Magnitude] = CASE WHEN @Magnitude_Clear = 1 THEN NULL ELSE ISNULL(@Magnitude, [Magnitude]) END,
        [MagnitudeUnit] = CASE WHEN @MagnitudeUnit_Clear = 1 THEN NULL ELSE ISNULL(@MagnitudeUnit, [MagnitudeUnit]) END,
        [Confidence] = CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, [Confidence]) END,
        [MeasuredAt] = ISNULL(@MeasuredAt, [MeasuredAt]),
        [PopulationSize] = CASE WHEN @PopulationSize_Clear = 1 THEN NULL ELSE ISNULL(@PopulationSize, [PopulationSize]) END,
        [HoldoutMetric] = CASE WHEN @HoldoutMetric_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetric, [HoldoutMetric]) END,
        [HoldoutMetricValue] = CASE WHEN @HoldoutMetricValue_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetricValue, [HoldoutMetricValue]) END,
        [Evidence] = CASE WHEN @Evidence_Clear = 1 THEN NULL ELSE ISNULL(@Evidence, [Evidence]) END,
        [Story] = CASE WHEN @Story_Clear = 1 THEN NULL ELSE ISNULL(@Story, [Story]) END,
        [StoryVector] = CASE WHEN @StoryVector_Clear = 1 THEN NULL ELSE ISNULL(@StoryVector, [StoryVector]) END,
        [StoryEmbeddingModelID] = CASE WHEN @StoryEmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@StoryEmbeddingModelID, [StoryEmbeddingModelID]) END,
        [ContentHash] = CASE WHEN @ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@ContentHash, [ContentHash]) END,
        [SupersededByID] = CASE WHEN @SupersededByID_Clear = 1 THEN NULL ELSE ISNULL(@SupersededByID, [SupersededByID]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLFindings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLFindings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLFinding] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLFinding table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLFinding]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLFinding];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLFinding
ON [${flyway:defaultSchema}].[MLFinding]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLFinding]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLFinding] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Findings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLFinding] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Findings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Findings
-- Item: spDeleteMLFinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLFinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLFinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLFinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLFinding]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLFinding]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLFinding] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Findings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLFinding] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 4 new entity field(s) */
UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'F94BBBCC-7D94-403E-8050-223457A16395'
         AND [Sequence] < 100000;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b5a8df2-efe6-4456-9041-1958e5ddea7e' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'Component')) BEGIN
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
            '9b5a8df2-efe6-4456-9041-1958e5ddea7e',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            25,
            'Component',
            'Component',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18db4ad4-e7b7-449e-a5d2-32a14d4c12e1' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'StoryEmbeddingModel')) BEGIN
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
            '18db4ad4-e7b7-449e-a5d2-32a14d4c12e1',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            26,
            'StoryEmbeddingModel',
            'Story Embedding Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'baae371b-6bd1-4f35-9d58-95997ddf00bc' OR (EntityID = 'F94BBBCC-7D94-403E-8050-223457A16395' AND Name = 'SupersededBy')) BEGIN
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
            'baae371b-6bd1-4f35-9d58-95997ddf00bc',
            'F94BBBCC-7D94-403E-8050-223457A16395', -- Entity: MJ: ML Findings
            27,
            'SupersededBy',
            'Superseded By',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BFAA4DDE-3730-4901-A71B-B88A320AA8FB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '95F387C2-D500-4622-830B-926C96A21E4F'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BFAA4DDE-3730-4901-A71B-B88A320AA8FB'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '95F387C2-D500-4622-830B-926C96A21E4F'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'BFAA4DDE-3730-4901-A71B-B88A320AA8FB'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = '0463B053-77AB-4329-B372-D982A5810DBF'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '85D28480-013D-4D35-A809-C6D21250F7B8'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C5A5ED4A-A2B7-4474-AED9-67AD784F6F9C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1CFF039A-A6BB-43F4-AD35-E7A74EEEC8CF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D2929636-D21A-4289-94F0-208E54C72CDB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2657487D-D4AC-4D42-8232-225D780BFD0E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BF5873D0-F3B2-4EC5-9BFB-157569AF30A4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '868C11EB-4F82-43A8-BF19-778C86924FA3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'CDA01590-D65E-4462-921D-2B9FA09BB7F7'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info Activities.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '81325CA2-9067-48AC-B09E-967E369AD14E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.MemberID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Member ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '39CB0860-8148-4F66-A495-114068485E83' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.ActivityDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A13438C-C65B-4F73-8CD3-9AE6178687AE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.ActivityType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '95F387C2-D500-4622-830B-926C96A21E4F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.Amount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1BCA670D-03F8-4730-8DD3-B446BE77129F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.Member 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Activity Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BFAA4DDE-3730-4901-A71B-B88A320AA8FB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '54D6E0AA-528C-4087-AB2E-FB7A75312D32' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Activities.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4491E6B9-0E0F-4422-B4F1-F40872E002BE' AND AutoUpdateCategory = 1;

/* Set categories for 27 fields */

-- UPDATE Entity Field Category Info MJ: ML Findings.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3BACB83B-889A-4A9C-9968-FD48BA4BD8C9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Finding Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CDA01590-D65E-4462-921D-2B9FA09BB7F7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.Statement 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Finding Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C1570870-B17C-4A63-B82A-51BAA0764C6F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.Story 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Finding Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D836E8E-7D33-440B-B292-4C00CB7D64D6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.EvidenceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Epistemic Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '85D28480-013D-4D35-A809-C6D21250F7B8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.Direction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Epistemic Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5A5ED4A-A2B7-4474-AED9-67AD784F6F9C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.Confidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Epistemic Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2657487D-D4AC-4D42-8232-225D780BFD0E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.Magnitude 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Measurement Data',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1CFF039A-A6BB-43F4-AD35-E7A74EEEC8CF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.MagnitudeUnit 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Measurement Data',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D2929636-D21A-4289-94F0-208E54C72CDB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.PopulationSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Measurement Data',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CB2A1B2-9790-4F88-B0FC-A2E86BFDCF1F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.MeasuredAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Measurement Data',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BF5873D0-F3B2-4EC5-9BFB-157569AF30A4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.HoldoutMetric 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC6CD184-8053-432E-9800-5387D97074BA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.HoldoutMetricValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4EE02514-5A70-444D-8E88-C36A39B81E09' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.Evidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'E3AD601C-DE6B-45B6-9582-632836F9446B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.MLModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'ML Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '487D4AD9-82AB-4E21-8855-CBA7548AB68D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.ComponentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F840B607-E8ED-472A-B35F-DB15F9A76703' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.TargetVariable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD4E0AA8-5C03-4193-81F5-316DD855A276' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.Component 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Component Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B5A8DF2-EFE6-4456-9041-1958E5DDEA7E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle Management',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '868C11EB-4F82-43A8-BF19-778C86924FA3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.SupersededByID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle Management',
   GeneratedFormSection = 'Category',
   DisplayName = 'Superseded By',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB1F23D8-9A85-40EB-8197-C332087012D8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.SupersededBy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle Management',
   GeneratedFormSection = 'Category',
   DisplayName = 'Superseded By Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BAAE371B-6BD1-4F35-9D58-95997DDF00BC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.ContentHash 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle Management',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7054FD85-7A2A-44EE-A39A-11E895FDD5B1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.StoryVector 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Searchability',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D1092234-D736-4D07-81F5-FD12D6B88E09' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.StoryEmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Searchability',
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F2FAC95A-4466-4AA7-9695-879B18701198' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.StoryEmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Searchability',
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '18DB4AD4-E7B7-449E-A5D2-32A14D4C12E1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '028BA197-E50C-426D-87AC-F7434719FEC4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: ML Findings.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AAF4E2C1-2D01-4E6E-A1C2-947CB6C8E4EC' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-brain */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-brain', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'F94BBBCC-7D94-403E-8050-223457A16395';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8b3a31c1-bbb3-474b-838b-e37d652ec8a1', 'F94BBBCC-7D94-403E-8050-223457A16395', 'FieldCategoryInfo', '{"Finding Overview":{"icon":"fa fa-align-left","description":"Primary descriptive information and business claims"},"Epistemic Status":{"icon":"fa fa-shield-alt","description":"Information regarding the scientific and logical status of the claim"},"Measurement Data":{"icon":"fa fa-chart-line","description":"Quantitative data and measurement context"},"Validation Metrics":{"icon":"fa fa-check-circle","description":"Out-of-sample performance validation data"},"Model Context":{"icon":"fa fa-database","description":"Information linking the finding to its source model and components"},"Lifecycle Management":{"icon":"fa fa-history","description":"Tracking the progression and supersession of findings over time"},"Searchability":{"icon":"fa fa-search","description":"Vector embeddings and search metadata"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('bad0aaf2-f567-461b-83b3-c214f8adf374', 'F94BBBCC-7D94-403E-8050-223457A16395', 'FieldCategoryIcons', '{"Finding Overview":"fa fa-align-left","Epistemic Status":"fa fa-shield-alt","Measurement Data":"fa fa-chart-line","Validation Metrics":"fa fa-check-circle","Model Context":"fa fa-database","Lifecycle Management":"fa fa-history","Searchability":"fa fa-search","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'F94BBBCC-7D94-403E-8050-223457A16395';

/* Generated Validation Functions for MJ: ML Findings */
-- CHECK constraint for MJ: ML Findings: Field: Evidence was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Evidence] IS NULL OR isjson([Evidence])=(1))', 'public ValidateEvidenceIsJson(result: ValidationResult) {
	if (this.Evidence !== null && this.Evidence !== undefined && this.Evidence.trim() !== "") {
		try {
			JSON.parse(this.Evidence);
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo(
				"Evidence",
				"The Evidence field must be a valid JSON string.",
				this.Evidence,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If evidence is provided, it must be a valid JSON-formatted string to ensure data integrity.', 'ValidateEvidenceIsJson', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'E3AD601C-DE6B-45B6-9582-632836F9446B');

            -- CHECK constraint for MJ: ML Findings: Field: PopulationSize was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([PopulationSize] IS NULL OR [PopulationSize]>(0))', 'public ValidatePopulationSizeGreaterThanZero(result: ValidationResult) {
	if (this.PopulationSize != null && this.PopulationSize <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"PopulationSize",
			"Population size must be greater than zero.",
			this.PopulationSize,
			ValidationErrorType.Failure
		));
	}
}', 'If a population size is specified, it must be a positive number greater than zero.', 'ValidatePopulationSizeGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0CB2A1B2-9790-4F88-B0FC-A2E86BFDCF1F');

