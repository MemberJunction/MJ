/* SQL generated to create new entity MJ: ML Port Types */

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
         'cde4269b-4592-40f0-97c1-ba3918c7bde7',
         'MJ: ML Port Types',
         'ML Port Types',
         'The curated vocabulary of typed data-product kinds that flow between ML components. A component''s ports reference these types, and composition (wiring one component''s output into another''s input) is legal ONLY when the port types match or a declared MLPortAdapter bridges them — the enforcement that makes agent/user-designed model architectures sensible by construction. EXAMPLES: "features:tabular", "score", "probability", "latent-state", "embedding", "cluster-id", "survival-curve", "forecast-series", "transition-matrix", "attributions".',
         NULL,
         'MLPortType',
         'vwMLPortTypes',
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

/* SQL generated to add new entity MJ: ML Port Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'cde4269b-4592-40f0-97c1-ba3918c7bde7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Port Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cde4269b-4592-40f0-97c1-ba3918c7bde7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Port Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cde4269b-4592-40f0-97c1-ba3918c7bde7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Port Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('cde4269b-4592-40f0-97c1-ba3918c7bde7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: ML Components */

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
         '33447b99-6716-4b9b-96c3-2a6b24b1fd3c',
         'MJ: ML Components',
         'ML Components',
         'THE uniform registry of typed ML components — the heart of the Model Component Framework. Models, preprocessing techniques, calibrators, port adapters, fillable templates (Bagging/Boosting/Stacking/Calibrator-wrap with typed holes), composite model DAGs, data sources, explainers, and transformations are ALL rows here, differing only by Kind. Every component declares typed input/output ports (MLComponentPort); templates declare typed holes (MLComponentSlot); composition legality is computed from port compatibility — a component''s membership affordances ("what larger structure can this belong to") are NEVER stored, always derived. Trained instances live in MLModel (linked back via MLModel.ComponentID) and are themselves reusable apply-frozen inside new composites.',
         NULL,
         'MLComponent',
         'vwMLComponents',
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

/* SQL generated to add new entity MJ: ML Components to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '33447b99-6716-4b9b-96c3-2a6b24b1fd3c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Components for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('33447b99-6716-4b9b-96c3-2a6b24b1fd3c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Components for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('33447b99-6716-4b9b-96c3-2a6b24b1fd3c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Components for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('33447b99-6716-4b9b-96c3-2a6b24b1fd3c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: ML Component Ports */

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
         'd92b09e5-e5bc-498f-bde3-273328ed5044',
         'MJ: ML Component Ports',
         'ML Component Ports',
         'A typed input or output declared by an ML component — the component''s composition contract. Real rows (not JSON) so agents and queries can ask "which components emit an embedding?" directly, and so a component''s membership affordances ("which template slots can I fill?") are computable from port compatibility alone. EXAMPLE: HMM declares Output port "states" of type latent-state; XGBoost declares Input port "X" of type features:tabular and Output port "score" of type score.',
         NULL,
         'MLComponentPort',
         'vwMLComponentPorts',
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

/* SQL generated to add new entity MJ: ML Component Ports to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd92b09e5-e5bc-498f-bde3-273328ed5044', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Component Ports for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d92b09e5-e5bc-498f-bde3-273328ed5044', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Component Ports for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d92b09e5-e5bc-498f-bde3-273328ed5044', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Component Ports for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d92b09e5-e5bc-498f-bde3-273328ed5044', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: ML Component Slots */

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
         '737a5e52-3eaa-4972-96f4-2097c8c5e7fe',
         'MJ: ML Component Slots',
         'ML Component Slots',
         'A typed HOLE on a fillable Template component — the higher-order composition contract. A slot names what a filling component must emit (RequiredPortTypeID) and how many fillers it takes (MinCount..MaxCount, NULL MaxCount = unbounded). Filling every slot of a template yields a concrete Composite, which is itself pluggable — recursion for free. EXAMPLES: Bagging declares slot "BaseLearner" (requires score, 1..N); Stacking declares "Learners" (score, 2..N) and "MetaLearner" (score, exactly 1); the Uplift template declares two slots requiring PROBABILITY (not score) — the port type itself enforces the calibration dependency.',
         NULL,
         'MLComponentSlot',
         'vwMLComponentSlots',
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

/* SQL generated to add new entity MJ: ML Component Slots to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '737a5e52-3eaa-4972-96f4-2097c8c5e7fe', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Component Slots for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('737a5e52-3eaa-4972-96f4-2097c8c5e7fe', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Component Slots for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('737a5e52-3eaa-4972-96f4-2097c8c5e7fe', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Component Slots for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('737a5e52-3eaa-4972-96f4-2097c8c5e7fe', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: ML Port Adapters */

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
         '4f296017-6f36-4e2e-90dd-7c058f7d1236',
         'MJ: ML Port Adapters',
         'ML Port Adapters',
         'A declared, named coercion from one port type to another, making otherwise-mismatched wirings legal EXPLICITLY (never implicitly). Adapters are what let cross-family chains compose: cluster-id one-hot-encoded into tabular features, a latent state sequence reduced to a per-record state feature, a probability passed through as a numeric feature. Lossy adapters are flagged so UIs can warn.',
         NULL,
         'MLPortAdapter',
         'vwMLPortAdapters',
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

/* SQL generated to add new entity MJ: ML Port Adapters to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4f296017-6f36-4e2e-90dd-7c058f7d1236', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Port Adapters for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4f296017-6f36-4e2e-90dd-7c058f7d1236', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Port Adapters for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4f296017-6f36-4e2e-90dd-7c058f7d1236', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Port Adapters for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4f296017-6f36-4e2e-90dd-7c058f7d1236', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: ML Composite Memberships */

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
         'efb163b4-b1f3-49d3-9bb1-e0ecb91c18d5',
         'MJ: ML Composite Memberships',
         'ML Composite Memberships',
         'Queryable projection of a Composite component''s child references. The authoritative wiring lives in MLComponent.GraphSpec (validated JSON); these rows are maintained on save purely so SQL lineage queries ("which composites use this component?") and FK integrity to children exist. Never edited directly.',
         NULL,
         'MLCompositeMembership',
         'vwMLCompositeMemberships',
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

/* SQL generated to add new entity MJ: ML Composite Memberships to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'efb163b4-b1f3-49d3-9bb1-e0ecb91c18d5', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Composite Memberships for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('efb163b4-b1f3-49d3-9bb1-e0ecb91c18d5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Composite Memberships for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('efb163b4-b1f3-49d3-9bb1-e0ecb91c18d5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: ML Composite Memberships for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('efb163b4-b1f3-49d3-9bb1-e0ecb91c18d5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponentSlot */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentSlot] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponentSlot */
UPDATE [${flyway:defaultSchema}].[MLComponentSlot] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponentSlot */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentSlot] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponentSlot */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentSlot] ADD CONSTRAINT [DF___mj_MLComponentSlot___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponentSlot */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentSlot] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponentSlot */
UPDATE [${flyway:defaultSchema}].[MLComponentSlot] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponentSlot */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentSlot] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponentSlot */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentSlot] ADD CONSTRAINT [DF___mj_MLComponentSlot___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponentPort */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentPort] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponentPort */
UPDATE [${flyway:defaultSchema}].[MLComponentPort] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponentPort */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentPort] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponentPort */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentPort] ADD CONSTRAINT [DF___mj_MLComponentPort___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponentPort */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentPort] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponentPort */
UPDATE [${flyway:defaultSchema}].[MLComponentPort] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponentPort */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentPort] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponentPort */
ALTER TABLE [${flyway:defaultSchema}].[MLComponentPort] ADD CONSTRAINT [DF___mj_MLComponentPort___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponent */
ALTER TABLE [${flyway:defaultSchema}].[MLComponent] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponent */
UPDATE [${flyway:defaultSchema}].[MLComponent] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponent */
ALTER TABLE [${flyway:defaultSchema}].[MLComponent] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLComponent */
ALTER TABLE [${flyway:defaultSchema}].[MLComponent] ADD CONSTRAINT [DF___mj_MLComponent___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponent */
ALTER TABLE [${flyway:defaultSchema}].[MLComponent] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponent */
UPDATE [${flyway:defaultSchema}].[MLComponent] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponent */
ALTER TABLE [${flyway:defaultSchema}].[MLComponent] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLComponent */
ALTER TABLE [${flyway:defaultSchema}].[MLComponent] ADD CONSTRAINT [DF___mj_MLComponent___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPortAdapter */
ALTER TABLE [${flyway:defaultSchema}].[MLPortAdapter] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPortAdapter */
UPDATE [${flyway:defaultSchema}].[MLPortAdapter] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPortAdapter */
ALTER TABLE [${flyway:defaultSchema}].[MLPortAdapter] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPortAdapter */
ALTER TABLE [${flyway:defaultSchema}].[MLPortAdapter] ADD CONSTRAINT [DF___mj_MLPortAdapter___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPortAdapter */
ALTER TABLE [${flyway:defaultSchema}].[MLPortAdapter] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPortAdapter */
UPDATE [${flyway:defaultSchema}].[MLPortAdapter] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPortAdapter */
ALTER TABLE [${flyway:defaultSchema}].[MLPortAdapter] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPortAdapter */
ALTER TABLE [${flyway:defaultSchema}].[MLPortAdapter] ADD CONSTRAINT [DF___mj_MLPortAdapter___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPortType */
ALTER TABLE [${flyway:defaultSchema}].[MLPortType] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPortType */
UPDATE [${flyway:defaultSchema}].[MLPortType] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPortType */
ALTER TABLE [${flyway:defaultSchema}].[MLPortType] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLPortType */
ALTER TABLE [${flyway:defaultSchema}].[MLPortType] ADD CONSTRAINT [DF___mj_MLPortType___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPortType */
ALTER TABLE [${flyway:defaultSchema}].[MLPortType] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPortType */
UPDATE [${flyway:defaultSchema}].[MLPortType] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPortType */
ALTER TABLE [${flyway:defaultSchema}].[MLPortType] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLPortType */
ALTER TABLE [${flyway:defaultSchema}].[MLPortType] ADD CONSTRAINT [DF___mj_MLPortType___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLCompositeMembership */
ALTER TABLE [${flyway:defaultSchema}].[MLCompositeMembership] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLCompositeMembership */
UPDATE [${flyway:defaultSchema}].[MLCompositeMembership] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLCompositeMembership */
ALTER TABLE [${flyway:defaultSchema}].[MLCompositeMembership] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MLCompositeMembership */
ALTER TABLE [${flyway:defaultSchema}].[MLCompositeMembership] ADD CONSTRAINT [DF___mj_MLCompositeMembership___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLCompositeMembership */
ALTER TABLE [${flyway:defaultSchema}].[MLCompositeMembership] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLCompositeMembership */
UPDATE [${flyway:defaultSchema}].[MLCompositeMembership] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLCompositeMembership */
ALTER TABLE [${flyway:defaultSchema}].[MLCompositeMembership] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MLCompositeMembership */
ALTER TABLE [${flyway:defaultSchema}].[MLCompositeMembership] ADD CONSTRAINT [DF___mj_MLCompositeMembership___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9710c0ef-de30-4635-aabf-d4b9852373c3' OR (EntityID = '737A5E52-3EAA-4972-96F4-2097C8C5E7FE' AND Name = 'ID')) BEGIN
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
            '9710c0ef-de30-4635-aabf-d4b9852373c3',
            '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', -- Entity: MJ: ML Component Slots
            100001,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bec7ddfb-a561-4d4f-a777-b5c2bf431d71' OR (EntityID = '737A5E52-3EAA-4972-96F4-2097C8C5E7FE' AND Name = 'ComponentID')) BEGIN
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
            'bec7ddfb-a561-4d4f-a777-b5c2bf431d71',
            '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', -- Entity: MJ: ML Component Slots
            100002,
            'ComponentID',
            'Component ID',
            'Foreign key to the Template component declaring this hole',
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
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '574de804-dd87-41e6-ac67-66c52bf4f158' OR (EntityID = '737A5E52-3EAA-4972-96F4-2097C8C5E7FE' AND Name = 'Name')) BEGIN
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
            '574de804-dd87-41e6-ac67-66c52bf4f158',
            '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', -- Entity: MJ: ML Component Slots
            100003,
            'Name',
            'Name',
            'Name of the slot within its template (e.g., "BaseLearner", "MetaLearner", "TreatedModel"), unique per template',
            'nvarchar',
            200,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd84be8b-f3fe-4c9a-b820-407266c79368' OR (EntityID = '737A5E52-3EAA-4972-96F4-2097C8C5E7FE' AND Name = 'Description')) BEGIN
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
            'fd84be8b-f3fe-4c9a-b820-407266c79368',
            '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', -- Entity: MJ: ML Component Slots
            100004,
            'Description',
            'Description',
            'What this slot is for and any filling guidance beyond the port-type requirement',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea0ddf40-1685-4b4f-a743-4e4ee69b74b2' OR (EntityID = '737A5E52-3EAA-4972-96F4-2097C8C5E7FE' AND Name = 'RequiredPortTypeID')) BEGIN
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
            'ea0ddf40-1685-4b4f-a743-4e4ee69b74b2',
            '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', -- Entity: MJ: ML Component Slots
            100005,
            'RequiredPortTypeID',
            'Required Port Type ID',
            'Foreign key to the port type a filling component must EMIT for the fill to be legal — the typed contract that keeps agent-built architectures sensible',
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
            'CDE4269B-4592-40F0-97C1-BA3918C7BDE7',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ad8ef25-45b2-475a-a5f0-258baf06e809' OR (EntityID = '737A5E52-3EAA-4972-96F4-2097C8C5E7FE' AND Name = 'MinCount')) BEGIN
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
            '9ad8ef25-45b2-475a-a5f0-258baf06e809',
            '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', -- Entity: MJ: ML Component Slots
            100006,
            'MinCount',
            'Min Count',
            'Minimum number of components that must fill this slot',
            'int',
            4,
            10,
            0,
            0,
            '(1)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ada8d80-b134-4d63-99d1-ecea9641f768' OR (EntityID = '737A5E52-3EAA-4972-96F4-2097C8C5E7FE' AND Name = 'MaxCount')) BEGIN
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
            '0ada8d80-b134-4d63-99d1-ecea9641f768',
            '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', -- Entity: MJ: ML Component Slots
            100007,
            'MaxCount',
            'Max Count',
            'Maximum number of components that may fill this slot; NULL means unbounded',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd583029c-5d04-4a96-8713-6b18c7778a06' OR (EntityID = '737A5E52-3EAA-4972-96F4-2097C8C5E7FE' AND Name = '__mj_CreatedAt')) BEGIN
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
            'd583029c-5d04-4a96-8713-6b18c7778a06',
            '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', -- Entity: MJ: ML Component Slots
            100008,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '99191d7c-16b3-41da-8bfd-1ea3f6dea547' OR (EntityID = '737A5E52-3EAA-4972-96F4-2097C8C5E7FE' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '99191d7c-16b3-41da-8bfd-1ea3f6dea547',
            '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', -- Entity: MJ: ML Component Slots
            100009,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8a2455d-dca0-49a4-b79c-f0c0f306a696' OR (EntityID = 'D92B09E5-E5BC-498F-BDE3-273328ED5044' AND Name = 'ID')) BEGIN
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
            'b8a2455d-dca0-49a4-b79c-f0c0f306a696',
            'D92B09E5-E5BC-498F-BDE3-273328ED5044', -- Entity: MJ: ML Component Ports
            100001,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22f3704e-5769-4826-89dc-847e6bc88cb4' OR (EntityID = 'D92B09E5-E5BC-498F-BDE3-273328ED5044' AND Name = 'ComponentID')) BEGIN
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
            '22f3704e-5769-4826-89dc-847e6bc88cb4',
            'D92B09E5-E5BC-498F-BDE3-273328ED5044', -- Entity: MJ: ML Component Ports
            100002,
            'ComponentID',
            'Component ID',
            'Foreign key to the component declaring this port',
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
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f17e667-e6f2-4b29-b6e8-938c9bb52431' OR (EntityID = 'D92B09E5-E5BC-498F-BDE3-273328ED5044' AND Name = 'PortTypeID')) BEGIN
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
            '6f17e667-e6f2-4b29-b6e8-938c9bb52431',
            'D92B09E5-E5BC-498F-BDE3-273328ED5044', -- Entity: MJ: ML Component Ports
            100003,
            'PortTypeID',
            'Port Type ID',
            'Foreign key to the port type (the typed kind of data flowing through this port)',
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
            'CDE4269B-4592-40F0-97C1-BA3918C7BDE7',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30e95f1c-b6e9-47b9-bf66-3e9083cf3078' OR (EntityID = 'D92B09E5-E5BC-498F-BDE3-273328ED5044' AND Name = 'Direction')) BEGIN
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
            '30e95f1c-b6e9-47b9-bf66-3e9083cf3078',
            'D92B09E5-E5BC-498F-BDE3-273328ED5044', -- Entity: MJ: ML Component Ports
            100004,
            'Direction',
            'Direction',
            'Whether this port consumes (Input) or produces (Output)',
            'nvarchar',
            20,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '606d0c6a-8aad-4b6b-ac41-5db3cbbba6c1' OR (EntityID = 'D92B09E5-E5BC-498F-BDE3-273328ED5044' AND Name = 'Name')) BEGIN
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
            '606d0c6a-8aad-4b6b-ac41-5db3cbbba6c1',
            'D92B09E5-E5BC-498F-BDE3-273328ED5044', -- Entity: MJ: ML Component Ports
            100005,
            'Name',
            'Name',
            'Local name of the port on this component (e.g., "X", "y", "states", "curve"), unique per component+direction',
            'nvarchar',
            200,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9379c8d9-ba45-4a56-a318-f3b56e485e2b' OR (EntityID = 'D92B09E5-E5BC-498F-BDE3-273328ED5044' AND Name = 'IsRequired')) BEGIN
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
            '9379c8d9-ba45-4a56-a318-f3b56e485e2b',
            'D92B09E5-E5BC-498F-BDE3-273328ED5044', -- Entity: MJ: ML Component Ports
            100006,
            'IsRequired',
            'Is Required',
            'When 1 (inputs), the port must be bound for the component to run; optional inputs (e.g., sample weights) are 0. Informational for outputs',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22adcf29-cec1-4770-aa98-045862f6418f' OR (EntityID = 'D92B09E5-E5BC-498F-BDE3-273328ED5044' AND Name = 'Ordinal')) BEGIN
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
            '22adcf29-cec1-4770-aa98-045862f6418f',
            'D92B09E5-E5BC-498F-BDE3-273328ED5044', -- Entity: MJ: ML Component Ports
            100007,
            'Ordinal',
            'Ordinal',
            'Display/processing order of the port within its component+direction group',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b64d59b-f432-4920-9377-55100cbd83cf' OR (EntityID = 'D92B09E5-E5BC-498F-BDE3-273328ED5044' AND Name = '__mj_CreatedAt')) BEGIN
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
            '6b64d59b-f432-4920-9377-55100cbd83cf',
            'D92B09E5-E5BC-498F-BDE3-273328ED5044', -- Entity: MJ: ML Component Ports
            100008,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d76bb33-226d-496d-b352-83d2f63842dc' OR (EntityID = 'D92B09E5-E5BC-498F-BDE3-273328ED5044' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4d76bb33-226d-496d-b352-83d2f63842dc',
            'D92B09E5-E5BC-498F-BDE3-273328ED5044', -- Entity: MJ: ML Component Ports
            100009,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80530622-19c1-44fd-801b-faf65809cc29' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'ID')) BEGIN
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
            '80530622-19c1-44fd-801b-faf65809cc29',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100001,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3534efef-ce7b-456c-9ba1-db86b1f7021c' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'Name')) BEGIN
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
            '3534efef-ce7b-456c-9ba1-db86b1f7021c',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100002,
            'Name',
            'Name',
            'Unique display name of the component (e.g., "XGBoost", "Yeo-Johnson Transform", "Isotonic Calibrator", "Bagging", "Cluster-Then-Classify")',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58190b64-a76c-4d12-9280-808f1770487c' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'Description')) BEGIN
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
            '58190b64-a76c-4d12-9280-808f1770487c',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100003,
            'Description',
            'Description',
            'What the component is and when to use it, readable by agents and business users',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dec992df-e0c6-4ac9-aa61-64a3c437dda4' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'Kind')) BEGIN
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
            'dec992df-e0c6-4ac9-aa61-64a3c437dda4',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100004,
            'Kind',
            'Kind',
            'What kind of component this is: Model (trainable estimator), Preprocessing (impute/scale/encode techniques), Calibration (score-to-probability), Adapter (port-type coercion), Template (fillable higher-order structure with typed holes), Composite (a concrete wired DAG of other components), Source (data producer: entity/query/feature-pipeline binding), Explainer (model+data to attributions), or Transformation (feature construction: lags, RFM, seasonality decomposition)',
            'nvarchar',
            40,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a00ab69-4db5-4d01-8aae-cfca14b6499a' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'AlgorithmID')) BEGIN
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
            '5a00ab69-4db5-4d01-8aae-cfca14b6499a',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100005,
            'AlgorithmID',
            'Algorithm ID',
            'For driver-backed base models only: foreign key to the MLAlgorithm row carrying the Python-sidecar driver key. The ONLY linkage between the new component registry and the legacy algorithm catalog (additive-wrap design)',
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
            '26642380-432D-4527-85DD-FE7A96E57549',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c751323-cf7e-4e46-beb8-b0a841baca05' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'Task')) BEGIN
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
            '0c751323-cf7e-4e46-beb8-b0a841baca05',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100006,
            'Task',
            'Task',
            'Taxonomy axis — the task family this component addresses (models primarily; NULL for kinds where task does not apply). One of the 10-value Task union mirrored by TypeScript ALL_TASKS and the sidecar Pydantic Literal',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09bd4027-e1cf-4ccd-995e-26bbec65cec6' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'LearningType')) BEGIN
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
            '09bd4027-e1cf-4ccd-995e-26bbec65cec6',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100007,
            'LearningType',
            'Learning Type',
            'Taxonomy axis — Supervised, Unsupervised, or Temporal (sequence/series models whose supervision comes from time structure)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc3b1345-6da4-4916-959e-9f94f1b0ab2c' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'Parametric')) BEGIN
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
            'cc3b1345-6da4-4916-959e-9f94f1b0ab2c',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100008,
            'Parametric',
            'Parametric',
            'Taxonomy axis — whether the model is parametric (Yes), nonparametric (No), or semiparametric (Semi, e.g., Cox proportional hazards)',
            'nvarchar',
            20,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d1ffa3b-265f-4f8d-936b-243d1427ee21' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'EnsembleType')) BEGIN
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
            '9d1ffa3b-265f-4f8d-936b-243d1427ee21',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100009,
            'EnsembleType',
            'Ensemble Type',
            'Taxonomy axis — composition technique of the estimator itself: None (not an estimator), Single, Bagging, Boosting, or Stacking',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4849cad5-f332-41e1-a5b7-c045888aae8e' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'InterpretabilityClass')) BEGIN
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
            '4849cad5-f332-41e1-a5b7-c045888aae8e',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100010,
            'InterpretabilityClass',
            'Interpretability Class',
            'Taxonomy axis — how the fitted component explains itself: Coefficients (inspectable weights with signs/CIs), Rules (tree/rule paths), ImportanceOnly (feature importances but no per-prediction logic), or BlackBox',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '598123f9-2398-4f0e-aa44-818d0abada28' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'DataShape')) BEGIN
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
            '598123f9-2398-4f0e-aa44-818d0abada28',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100011,
            'DataShape',
            'Data Shape',
            'Taxonomy axis — the data shape the component consumes: Tabular, Sequence (time-indexed), EventLog (transaction streams), InteractionMatrix (user x item), or Any',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7bdb95a-7679-4dd7-b0be-47f2bb455a2a' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'HyperparameterSchema')) BEGIN
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
            'a7bdb95a-7679-4dd7-b0be-47f2bb455a2a',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100012,
            'HyperparameterSchema',
            'Hyperparameter Schema',
            'JSON Schema describing the component''s tunable hyperparameters (drives UI forms, validation, and search priors)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8868e81c-1959-42ef-a2ba-66b69ef961ed' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'DefaultHyperparameters')) BEGIN
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
            '8868e81c-1959-42ef-a2ba-66b69ef961ed',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100013,
            'DefaultHyperparameters',
            'Default Hyperparameters',
            'JSON object of default hyperparameter values applied when not overridden',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a2607d8-bf2e-46e8-abda-0a1dbcc58f0e' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'GraphSpec')) BEGIN
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
            '7a2607d8-bf2e-46e8-abda-0a1dbcc58f0e',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100014,
            'GraphSpec',
            'Graph Spec',
            'For Composite and Template kinds: the Zod-validated JSON graph specification — nodes (component references or slot placeholders), typed edges (with adapters), and the exposed terminal output. The authoritative wiring; MLCompositeMembership rows are the queryable projection of it',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08c62033-3a8f-437e-a38c-a3dc6290feb8' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'SupportsFeatureImportance')) BEGIN
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
            '08c62033-3a8f-437e-a38c-a3dc6290feb8',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100015,
            'SupportsFeatureImportance',
            'Supports Feature Importance',
            'When 1, the fitted component produces per-feature importance scores used for explainability and the leakage dominance guard',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34d31715-149a-4376-9521-b55a4a52ec8a' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'Source')) BEGIN
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
            '34d31715-149a-4376-9521-b55a4a52ec8a',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100016,
            'Source',
            'Source',
            'Who authored this component: System (shipped), User, or Agent. Agent/User-authored components carrying new driver code are trust-gated via CodeApprovalStatus',
            'nvarchar',
            40,
            0,
            0,
            0,
            'System',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f719849d-fe00-4e93-8e9a-e078be26e2e7' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'CodeApprovalStatus')) BEGIN
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
            'f719849d-fe00-4e93-8e9a-e078be26e2e7',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100017,
            'CodeApprovalStatus',
            'Code Approval Status',
            'Trust gate for components carrying executable driver code (mirrors the Remote Operations AI-generation precedent): Pending (never runnable), Approved, or Rejected. Shipped System components default to Approved; composites of already-approved parts need no code review (promotion gates still apply)',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Approved',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8c5983fa-cc5d-4a04-bead-847cb183c0bc' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'ApprovedByUserID')) BEGIN
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
            '8c5983fa-cc5d-4a04-bead-847cb183c0bc',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100018,
            'ApprovedByUserID',
            'Approved By User ID',
            'The user who approved this component''s code (Approver role), when CodeApprovalStatus is Approved and the component required review',
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
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bdfa7cf2-73ac-4cfd-9fce-829c1ad60d9e' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'Status')) BEGIN
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
            'bdfa7cf2-73ac-4cfd-9fce-829c1ad60d9e',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100019,
            'Status',
            'Status',
            'Lifecycle status: Planned (cataloged, no runnable driver yet — the sidecar /health endpoint reports which components are actually runnable), Active, or Deprecated',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6231cdb-9cef-45f6-a3e4-54005dde06f0' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = '__mj_CreatedAt')) BEGIN
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
            'd6231cdb-9cef-45f6-a3e4-54005dde06f0',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100020,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '98830450-582f-4cb2-9b3a-196ed0331054' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '98830450-582f-4cb2-9b3a-196ed0331054',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100021,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b1b7185-a824-423a-a972-ff27dc18f676' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = 'ID')) BEGIN
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
            '0b1b7185-a824-423a-a972-ff27dc18f676',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
            100001,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74f789a4-c1fd-477e-87d4-8bd904a86520' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = 'Name')) BEGIN
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
            '74f789a4-c1fd-477e-87d4-8bd904a86520',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
            100002,
            'Name',
            'Name',
            'Display name of the adapter (e.g., "Cluster ID One-Hot", "State Sequence Last-State")',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea272b1f-075f-456f-bc83-f17e2efc6e00' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = 'FromPortTypeID')) BEGIN
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
            'ea272b1f-075f-456f-bc83-f17e2efc6e00',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
            100003,
            'FromPortTypeID',
            'From Port Type ID',
            'Foreign key to the port type this adapter consumes',
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
            'CDE4269B-4592-40F0-97C1-BA3918C7BDE7',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7cac86e9-5b0a-4d72-a5ea-c86d2c676258' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = 'ToPortTypeID')) BEGIN
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
            '7cac86e9-5b0a-4d72-a5ea-c86d2c676258',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
            100004,
            'ToPortTypeID',
            'To Port Type ID',
            'Foreign key to the port type this adapter produces',
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
            'CDE4269B-4592-40F0-97C1-BA3918C7BDE7',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9750d5e7-d804-49d3-856b-d42a15907e57' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = 'Strategy')) BEGIN
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
            '9750d5e7-d804-49d3-856b-d42a15907e57',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
            100005,
            'Strategy',
            'Strategy',
            'The coercion technique (e.g., "onehot", "identity", "argmax", "last-state", "threshold")',
            'nvarchar',
            100,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4a54051-2ace-4331-910c-6744bc630a98' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = 'ImplementationKey')) BEGIN
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
            'a4a54051-2ace-4331-910c-6744bc630a98',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
            100006,
            'ImplementationKey',
            'Implementation Key',
            'Key of the runtime implementation that executes this adapter in the composition engine',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1142fd94-24bb-4bf5-9bc9-142b12443b3a' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = 'IsLossy')) BEGIN
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
            '1142fd94-24bb-4bf5-9bc9-142b12443b3a',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
            100007,
            'IsLossy',
            'Is Lossy',
            'When 1, the coercion discards information (e.g., argmax over soft assignments) — surfaced as a warning in composition UIs',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a260033-81df-4b17-baf3-e6d0c9cb9aac' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = 'Status')) BEGIN
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
            '1a260033-81df-4b17-baf3-e6d0c9cb9aac',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
            100008,
            'Status',
            'Status',
            'Lifecycle status: Active or Deprecated',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4bcbd964-73fc-4a89-b5ee-034d8e2d89a8' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = '__mj_CreatedAt')) BEGIN
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
            '4bcbd964-73fc-4a89-b5ee-034d8e2d89a8',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '36fdfdfa-7e02-4513-adba-47fa44828876' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '36fdfdfa-7e02-4513-adba-47fa44828876',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8bd868ae-1a73-466d-a97b-36be0c4731d1' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ComponentID')) BEGIN
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
            '8bd868ae-1a73-466d-a97b-36be0c4731d1',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            100046,
            'ComponentID',
            'Component ID',
            'Optional foreign key to the ML Component definition this trained model is an instance of. Trained instances are themselves reusable components: a composite graph may reference a published MLModel apply-frozen (never re-fit) — the organization''s accumulating library of trained capabilities',
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
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb6e44d6-4e0c-4f33-9d14-f050640290ec' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Kind')) BEGIN
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
            'bb6e44d6-4e0c-4f33-9d14-f050640290ec',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            100047,
            'Kind',
            'Kind',
            'What this trained model row is: Standard (a plain single-estimator model), Composite (the parent of a trained DAG — its artifact is the CompositeManifest referencing child models), or CompositeChild (a child fitted inside a composite training run; filtered out of leaderboards and catalogs by default)',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Standard',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6eb92257-0c99-40f3-9abf-8ce4700cbdb0' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'ParentModelID')) BEGIN
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
            '6eb92257-0c99-40f3-9abf-8ce4700cbdb0',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            100048,
            'ParentModelID',
            'Parent Model ID',
            'For CompositeChild rows: the Composite parent model this child was fitted under (composite training lineage)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e905ae3-bc13-4c5c-9e41-ecc0c11a0153' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Task')) BEGIN
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
            '5e905ae3-bc13-4c5c-9e41-ecc0c11a0153',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            100049,
            'Task',
            'Task',
            'The task family of this trained model, from the 10-value Task union (supersedes the binary ProblemType for new-framework models; ProblemType retained for backward compatibility)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5999f7b6-24f5-4871-96f6-67cf5502052c' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'ComponentID')) BEGIN
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
            '5999f7b6-24f5-4871-96f6-67cf5502052c',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
            100038,
            'ComponentID',
            'Component ID',
            'Optional foreign key to the ML Component this pipeline trains (the component-framework path). NULL pipelines resolve through the legacy AlgorithmID path; when set, the component''s ports/graph govern assembly and execution',
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
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '202161a0-f1a6-4641-8373-e6006f848e51' OR (EntityID = 'CDE4269B-4592-40F0-97C1-BA3918C7BDE7' AND Name = 'ID')) BEGIN
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
            '202161a0-f1a6-4641-8373-e6006f848e51',
            'CDE4269B-4592-40F0-97C1-BA3918C7BDE7', -- Entity: MJ: ML Port Types
            100001,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26cc0a96-2280-4d5e-8119-ce1e3df06cca' OR (EntityID = 'CDE4269B-4592-40F0-97C1-BA3918C7BDE7' AND Name = 'Name')) BEGIN
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
            '26cc0a96-2280-4d5e-8119-ce1e3df06cca',
            'CDE4269B-4592-40F0-97C1-BA3918C7BDE7', -- Entity: MJ: ML Port Types
            100002,
            'Name',
            'Name',
            'Unique name of the port type, conventionally lowercase-hyphenated and named for the DATA SHAPE it carries, never for an algorithm (e.g., "transition-matrix", not "markov-output")',
            'nvarchar',
            200,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd56f47ea-c3b5-4272-a88c-79e98fc6aa73' OR (EntityID = 'CDE4269B-4592-40F0-97C1-BA3918C7BDE7' AND Name = 'Description')) BEGIN
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
            'd56f47ea-c3b5-4272-a88c-79e98fc6aa73',
            'CDE4269B-4592-40F0-97C1-BA3918C7BDE7', -- Entity: MJ: ML Port Types
            100003,
            'Description',
            'Description',
            'What this port type carries and when to use it, readable by agents choosing wirings',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd62dea72-b628-4adc-9e88-6453926f6f2e' OR (EntityID = 'CDE4269B-4592-40F0-97C1-BA3918C7BDE7' AND Name = 'ShapeSpec')) BEGIN
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
            'd62dea72-b628-4adc-9e88-6453926f6f2e',
            'CDE4269B-4592-40F0-97C1-BA3918C7BDE7', -- Entity: MJ: ML Port Types
            100004,
            'ShapeSpec',
            'Shape Spec',
            'Optional JSON schema fragment describing the concrete wire shape of values of this type (e.g., for survival-curve: { times: number[], survival: number[] })',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c2b9b99-cfb9-4e18-9ef6-c6a52a6afd8b' OR (EntityID = 'CDE4269B-4592-40F0-97C1-BA3918C7BDE7' AND Name = 'Status')) BEGIN
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
            '3c2b9b99-cfb9-4e18-9ef6-c6a52a6afd8b',
            'CDE4269B-4592-40F0-97C1-BA3918C7BDE7', -- Entity: MJ: ML Port Types
            100005,
            'Status',
            'Status',
            'Lifecycle status: Active (usable in ports/adapters) or Deprecated',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6660151-f1b1-4ce0-80ff-7c698814e7ca' OR (EntityID = 'CDE4269B-4592-40F0-97C1-BA3918C7BDE7' AND Name = '__mj_CreatedAt')) BEGIN
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
            'd6660151-f1b1-4ce0-80ff-7c698814e7ca',
            'CDE4269B-4592-40F0-97C1-BA3918C7BDE7', -- Entity: MJ: ML Port Types
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26d28aad-ae05-4cc0-8535-353c1ff75096' OR (EntityID = 'CDE4269B-4592-40F0-97C1-BA3918C7BDE7' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '26d28aad-ae05-4cc0-8535-353c1ff75096',
            'CDE4269B-4592-40F0-97C1-BA3918C7BDE7', -- Entity: MJ: ML Port Types
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f59f1fe8-b1ca-4976-b197-d2cb8fd141da' OR (EntityID = 'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5' AND Name = 'ID')) BEGIN
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
            'f59f1fe8-b1ca-4976-b197-d2cb8fd141da',
            'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5', -- Entity: MJ: ML Composite Memberships
            100001,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '347f1da2-b2cd-449b-8160-6fe60473851a' OR (EntityID = 'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5' AND Name = 'CompositeComponentID')) BEGIN
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
            '347f1da2-b2cd-449b-8160-6fe60473851a',
            'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5', -- Entity: MJ: ML Composite Memberships
            100002,
            'CompositeComponentID',
            'Composite Component ID',
            'Foreign key to the Composite (or filled Template) component',
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
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9c13ed72-edf9-49c2-90a5-7cc7fbacb519' OR (EntityID = 'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5' AND Name = 'ChildComponentID')) BEGIN
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
            '9c13ed72-edf9-49c2-90a5-7cc7fbacb519',
            'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5', -- Entity: MJ: ML Composite Memberships
            100003,
            'ChildComponentID',
            'Child Component ID',
            'Foreign key to a child component referenced by the composite''s graph',
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
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a27c284-c125-4a6c-8f4c-7fbecbc08fd2' OR (EntityID = 'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5' AND Name = 'Role')) BEGIN
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
            '4a27c284-c125-4a6c-8f4c-7fbecbc08fd2',
            'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5', -- Entity: MJ: ML Composite Memberships
            100004,
            'Role',
            'Role',
            'Optional role of the child within the composite (the slot or node key it fills, e.g., "BaseLearner", "clusterer")',
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5598c9bc-b4eb-42af-84a7-7e7297467138' OR (EntityID = 'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5' AND Name = '__mj_CreatedAt')) BEGIN
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
            '5598c9bc-b4eb-42af-84a7-7e7297467138',
            'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5', -- Entity: MJ: ML Composite Memberships
            100005,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd836779f-2b25-4d06-be97-fc1cf3fd9568' OR (EntityID = 'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'd836779f-2b25-4d06-be97-fc1cf3fd9568',
            'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5', -- Entity: MJ: ML Composite Memberships
            100006,
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

/* SQL text to insert entity field value with ID 088ad46f-1051-4e1d-b94e-8c0d5827ebbc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('088ad46f-1051-4e1d-b94e-8c0d5827ebbc', '3C2B9B99-CFB9-4E18-9EF6-C6A52A6AFD8B', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID eb7febb7-5715-48e2-ad31-d9db4bdf46e4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eb7febb7-5715-48e2-ad31-d9db4bdf46e4', '3C2B9B99-CFB9-4E18-9EF6-C6A52A6AFD8B', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3C2B9B99-CFB9-4E18-9EF6-C6A52A6AFD8B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3C2B9B99-CFB9-4E18-9EF6-C6A52A6AFD8B';

/* SQL text to insert entity field value with ID 9bc8ca9d-d72d-41da-9841-a79d6bc176a5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9bc8ca9d-d72d-41da-9841-a79d6bc176a5', 'DEC992DF-E0C6-4AC9-AA61-64A3C437DDA4', 1, 'Adapter', 'Adapter', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 84cdda1b-4c7f-43d6-815b-4989032b3dc9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('84cdda1b-4c7f-43d6-815b-4989032b3dc9', 'DEC992DF-E0C6-4AC9-AA61-64A3C437DDA4', 2, 'Calibration', 'Calibration', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9b780d1f-007e-438e-983d-2ff1717a61c3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9b780d1f-007e-438e-983d-2ff1717a61c3', 'DEC992DF-E0C6-4AC9-AA61-64A3C437DDA4', 3, 'Composite', 'Composite', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c5d0e2b3-7e6a-4dc4-a885-b8264fbf2ffa */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c5d0e2b3-7e6a-4dc4-a885-b8264fbf2ffa', 'DEC992DF-E0C6-4AC9-AA61-64A3C437DDA4', 4, 'Explainer', 'Explainer', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3d62fe7c-f9ee-4dba-acf1-4c6153ce5454 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3d62fe7c-f9ee-4dba-acf1-4c6153ce5454', 'DEC992DF-E0C6-4AC9-AA61-64A3C437DDA4', 5, 'Model', 'Model', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 384d97f6-d456-4472-92cf-8fb7b19d2f8d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('384d97f6-d456-4472-92cf-8fb7b19d2f8d', 'DEC992DF-E0C6-4AC9-AA61-64A3C437DDA4', 6, 'Preprocessing', 'Preprocessing', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 46423ccd-f438-485c-9cbe-a05f43359b91 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('46423ccd-f438-485c-9cbe-a05f43359b91', 'DEC992DF-E0C6-4AC9-AA61-64A3C437DDA4', 7, 'Source', 'Source', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4e85b9b3-8288-4937-aaf2-bd96c78c13da */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4e85b9b3-8288-4937-aaf2-bd96c78c13da', 'DEC992DF-E0C6-4AC9-AA61-64A3C437DDA4', 8, 'Template', 'Template', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 76a9df4e-e4d5-49f9-8724-bab10d3d58b0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('76a9df4e-e4d5-49f9-8724-bab10d3d58b0', 'DEC992DF-E0C6-4AC9-AA61-64A3C437DDA4', 9, 'Transformation', 'Transformation', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID DEC992DF-E0C6-4AC9-AA61-64A3C437DDA4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='DEC992DF-E0C6-4AC9-AA61-64A3C437DDA4';

/* SQL text to insert entity field value with ID 7739ee40-bb70-4139-8d47-03c08959e2ef */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7739ee40-bb70-4139-8d47-03c08959e2ef', '0C751323-CF7E-4E46-BEB8-B0A841BACA05', 1, 'anomaly', 'anomaly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c69b692a-3882-41f1-9508-18fce6863b4b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c69b692a-3882-41f1-9508-18fce6863b4b', '0C751323-CF7E-4E46-BEB8-B0A841BACA05', 2, 'classification', 'classification', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d3cf5d77-a014-409a-a58e-b721cb080325 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d3cf5d77-a014-409a-a58e-b721cb080325', '0C751323-CF7E-4E46-BEB8-B0A841BACA05', 3, 'clustering', 'clustering', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ef7bd579-fd13-4193-bf7f-2a0bcd0d5f6f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ef7bd579-fd13-4193-bf7f-2a0bcd0d5f6f', '0C751323-CF7E-4E46-BEB8-B0A841BACA05', 4, 'dim-reduction', 'dim-reduction', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5d7f28cd-9728-4d7e-9b17-21836792110d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5d7f28cd-9728-4d7e-9b17-21836792110d', '0C751323-CF7E-4E46-BEB8-B0A841BACA05', 5, 'forecasting', 'forecasting', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c652f96c-c114-46a1-bbc1-96c9066df780 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c652f96c-c114-46a1-bbc1-96c9066df780', '0C751323-CF7E-4E46-BEB8-B0A841BACA05', 6, 'pattern-mining', 'pattern-mining', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ed6c37cb-78c9-487e-966d-d211972d7f29 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ed6c37cb-78c9-487e-966d-d211972d7f29', '0C751323-CF7E-4E46-BEB8-B0A841BACA05', 7, 'recommendation', 'recommendation', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fa04d0be-23ff-441b-bdd0-db21f0ad6ea0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fa04d0be-23ff-441b-bdd0-db21f0ad6ea0', '0C751323-CF7E-4E46-BEB8-B0A841BACA05', 8, 'regression', 'regression', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID eb4e7d31-376a-4220-a878-0c5597f29627 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eb4e7d31-376a-4220-a878-0c5597f29627', '0C751323-CF7E-4E46-BEB8-B0A841BACA05', 9, 'sequence-state', 'sequence-state', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 81a858ef-92b9-4837-a099-b1f8cebc11ec */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('81a858ef-92b9-4837-a099-b1f8cebc11ec', '0C751323-CF7E-4E46-BEB8-B0A841BACA05', 10, 'survival', 'survival', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0C751323-CF7E-4E46-BEB8-B0A841BACA05 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0C751323-CF7E-4E46-BEB8-B0A841BACA05';

/* SQL text to insert entity field value with ID de2740e4-a4af-42b3-80ac-142873d8f511 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('de2740e4-a4af-42b3-80ac-142873d8f511', '09BD4027-E1CF-4CCD-995E-26BBEC65CEC6', 1, 'Supervised', 'Supervised', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8ba99918-5c3d-40bd-93fb-e7f35d2ef984 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8ba99918-5c3d-40bd-93fb-e7f35d2ef984', '09BD4027-E1CF-4CCD-995E-26BBEC65CEC6', 2, 'Temporal', 'Temporal', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 51f01e36-d3ab-4c06-9a8c-2cf2eb7cab10 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('51f01e36-d3ab-4c06-9a8c-2cf2eb7cab10', '09BD4027-E1CF-4CCD-995E-26BBEC65CEC6', 3, 'Unsupervised', 'Unsupervised', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 09BD4027-E1CF-4CCD-995E-26BBEC65CEC6 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='09BD4027-E1CF-4CCD-995E-26BBEC65CEC6';

/* SQL text to insert entity field value with ID 5f3e15d2-4bb8-4d0e-b3b8-e4abbac80989 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5f3e15d2-4bb8-4d0e-b3b8-e4abbac80989', 'CC3B1345-6DA4-4916-959E-9F94F1B0AB2C', 1, 'No', 'No', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fc84d2b3-a930-4614-899f-fe0f692f53e0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fc84d2b3-a930-4614-899f-fe0f692f53e0', 'CC3B1345-6DA4-4916-959E-9F94F1B0AB2C', 2, 'Semi', 'Semi', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c7535ef0-6fd4-47b5-9c29-abdf9e248119 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c7535ef0-6fd4-47b5-9c29-abdf9e248119', 'CC3B1345-6DA4-4916-959E-9F94F1B0AB2C', 3, 'Yes', 'Yes', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CC3B1345-6DA4-4916-959E-9F94F1B0AB2C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CC3B1345-6DA4-4916-959E-9F94F1B0AB2C';

/* SQL text to insert entity field value with ID 47430e90-a4c9-4a4a-b9bb-1bafc7ebdd3f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('47430e90-a4c9-4a4a-b9bb-1bafc7ebdd3f', '9D1FFA3B-265F-4F8D-936B-243D1427EE21', 1, 'Bagging', 'Bagging', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9392ac0e-1395-4c92-b64e-f7b53b44e5c8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9392ac0e-1395-4c92-b64e-f7b53b44e5c8', '9D1FFA3B-265F-4F8D-936B-243D1427EE21', 2, 'Boosting', 'Boosting', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e52091c0-41c8-4be1-b266-db78cb31a6e5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e52091c0-41c8-4be1-b266-db78cb31a6e5', '9D1FFA3B-265F-4F8D-936B-243D1427EE21', 3, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a1c74a2e-a934-440a-8a7c-0de4d3b2c91a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a1c74a2e-a934-440a-8a7c-0de4d3b2c91a', '9D1FFA3B-265F-4F8D-936B-243D1427EE21', 4, 'Single', 'Single', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 81e14ab9-3245-41e1-9dc4-250f4d3c7f45 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('81e14ab9-3245-41e1-9dc4-250f4d3c7f45', '9D1FFA3B-265F-4F8D-936B-243D1427EE21', 5, 'Stacking', 'Stacking', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 9D1FFA3B-265F-4F8D-936B-243D1427EE21 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='9D1FFA3B-265F-4F8D-936B-243D1427EE21';

/* SQL text to insert entity field value with ID 6f97e484-bd23-4776-bbd7-af365612ef04 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6f97e484-bd23-4776-bbd7-af365612ef04', '4849CAD5-F332-41E1-A5B7-C045888AAE8E', 1, 'BlackBox', 'BlackBox', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID afa992d9-845e-4f79-a19b-513ceefb5fb8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('afa992d9-845e-4f79-a19b-513ceefb5fb8', '4849CAD5-F332-41E1-A5B7-C045888AAE8E', 2, 'Coefficients', 'Coefficients', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d6b36fa9-0bd3-4e51-a1d3-995fbac00999 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d6b36fa9-0bd3-4e51-a1d3-995fbac00999', '4849CAD5-F332-41E1-A5B7-C045888AAE8E', 3, 'ImportanceOnly', 'ImportanceOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 12af3d57-c64a-473f-9a4f-2b29fe2b7506 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('12af3d57-c64a-473f-9a4f-2b29fe2b7506', '4849CAD5-F332-41E1-A5B7-C045888AAE8E', 4, 'Rules', 'Rules', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 4849CAD5-F332-41E1-A5B7-C045888AAE8E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='4849CAD5-F332-41E1-A5B7-C045888AAE8E';

/* SQL text to insert entity field value with ID 911d3f15-4a45-4164-a42e-e06f31c4eba9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('911d3f15-4a45-4164-a42e-e06f31c4eba9', '598123F9-2398-4F0E-AA44-818D0ABADA28', 1, 'Any', 'Any', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 65a13cf7-8a04-4e4b-9b2c-0050b6c5e1a6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('65a13cf7-8a04-4e4b-9b2c-0050b6c5e1a6', '598123F9-2398-4F0E-AA44-818D0ABADA28', 2, 'EventLog', 'EventLog', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d66f98e0-1e25-4054-b692-c6ed30cd38ce */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d66f98e0-1e25-4054-b692-c6ed30cd38ce', '598123F9-2398-4F0E-AA44-818D0ABADA28', 3, 'InteractionMatrix', 'InteractionMatrix', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f2c8eae2-fe37-4648-811d-d05f5a699cd8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f2c8eae2-fe37-4648-811d-d05f5a699cd8', '598123F9-2398-4F0E-AA44-818D0ABADA28', 4, 'Sequence', 'Sequence', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 82b4c86f-7df5-4904-86f6-e991e04c48a0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('82b4c86f-7df5-4904-86f6-e991e04c48a0', '598123F9-2398-4F0E-AA44-818D0ABADA28', 5, 'Tabular', 'Tabular', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 598123F9-2398-4F0E-AA44-818D0ABADA28 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='598123F9-2398-4F0E-AA44-818D0ABADA28';

/* SQL text to insert entity field value with ID 2eedea22-4c7f-41b3-afd9-4ef65f757ad2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2eedea22-4c7f-41b3-afd9-4ef65f757ad2', '34D31715-149A-4376-9521-B55A4A52EC8A', 1, 'Agent', 'Agent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bbc697c0-91e8-4543-88de-7f0fa07d659a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bbc697c0-91e8-4543-88de-7f0fa07d659a', '34D31715-149A-4376-9521-B55A4A52EC8A', 2, 'System', 'System', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9f75b2f9-3bf8-46ac-a518-d82694312527 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9f75b2f9-3bf8-46ac-a518-d82694312527', '34D31715-149A-4376-9521-B55A4A52EC8A', 3, 'User', 'User', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 34D31715-149A-4376-9521-B55A4A52EC8A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='34D31715-149A-4376-9521-B55A4A52EC8A';

/* SQL text to insert entity field value with ID f2b4c3ff-aabd-45ae-9994-78b975837991 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f2b4c3ff-aabd-45ae-9994-78b975837991', 'F719849D-FE00-4E93-8E9A-E078BE26E2E7', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d1be206e-65b1-4810-afa2-2c042b0497f3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d1be206e-65b1-4810-afa2-2c042b0497f3', 'F719849D-FE00-4E93-8E9A-E078BE26E2E7', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a9893208-c1e7-42e9-b2c9-cdd499d96731 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a9893208-c1e7-42e9-b2c9-cdd499d96731', 'F719849D-FE00-4E93-8E9A-E078BE26E2E7', 3, 'Rejected', 'Rejected', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F719849D-FE00-4E93-8E9A-E078BE26E2E7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F719849D-FE00-4E93-8E9A-E078BE26E2E7';

/* SQL text to insert entity field value with ID b6fc7188-7778-4337-8474-ab396ba63a20 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b6fc7188-7778-4337-8474-ab396ba63a20', 'BDFA7CF2-73AC-4CFD-9FCE-829C1AD60D9E', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9795a055-d815-4184-bd5c-f8c67ca920e5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9795a055-d815-4184-bd5c-f8c67ca920e5', 'BDFA7CF2-73AC-4CFD-9FCE-829C1AD60D9E', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 49422fc0-a37f-4866-abe7-dd0e18a4f857 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('49422fc0-a37f-4866-abe7-dd0e18a4f857', 'BDFA7CF2-73AC-4CFD-9FCE-829C1AD60D9E', 3, 'Planned', 'Planned', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BDFA7CF2-73AC-4CFD-9FCE-829C1AD60D9E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BDFA7CF2-73AC-4CFD-9FCE-829C1AD60D9E';

/* SQL text to insert entity field value with ID 766f4499-46bb-42c2-9c95-4b1b054f49e7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('766f4499-46bb-42c2-9c95-4b1b054f49e7', '30E95F1C-B6E9-47B9-BF66-3E9083CF3078', 1, 'Input', 'Input', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fc5a58e3-fd5c-411c-9a8c-6d455c73c31d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fc5a58e3-fd5c-411c-9a8c-6d455c73c31d', '30E95F1C-B6E9-47B9-BF66-3E9083CF3078', 2, 'Output', 'Output', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 30E95F1C-B6E9-47B9-BF66-3E9083CF3078 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='30E95F1C-B6E9-47B9-BF66-3E9083CF3078';

/* SQL text to insert entity field value with ID ef2aae02-ff51-4386-a80b-24db1750749c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ef2aae02-ff51-4386-a80b-24db1750749c', '1A260033-81DF-4B17-BAF3-E6D0C9CB9AAC', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3ba4ef42-9be2-4ab4-af9e-28b4e04d6d05 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3ba4ef42-9be2-4ab4-af9e-28b4e04d6d05', '1A260033-81DF-4B17-BAF3-E6D0C9CB9AAC', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1A260033-81DF-4B17-BAF3-E6D0C9CB9AAC */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1A260033-81DF-4B17-BAF3-E6D0C9CB9AAC';

/* SQL text to insert entity field value with ID a68b50c3-5aac-4614-8a17-8715197e3a2f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a68b50c3-5aac-4614-8a17-8715197e3a2f', 'E245EF88-64A1-4F22-A954-EC44A431CE3E', 1, 'anomaly', 'anomaly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ce7b42ff-af02-46f3-902c-4169f8ee7bef */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ce7b42ff-af02-46f3-902c-4169f8ee7bef', 'E245EF88-64A1-4F22-A954-EC44A431CE3E', 3, 'clustering', 'clustering', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2c10d487-dd58-42d4-b586-da44c140d322 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2c10d487-dd58-42d4-b586-da44c140d322', 'E245EF88-64A1-4F22-A954-EC44A431CE3E', 4, 'dim-reduction', 'dim-reduction', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c2ed493a-b178-4a91-ba74-427eb0a2452d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c2ed493a-b178-4a91-ba74-427eb0a2452d', 'E245EF88-64A1-4F22-A954-EC44A431CE3E', 5, 'forecasting', 'forecasting', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 69c02eb5-adc6-456e-8251-c21d02e77a59 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('69c02eb5-adc6-456e-8251-c21d02e77a59', 'E245EF88-64A1-4F22-A954-EC44A431CE3E', 6, 'pattern-mining', 'pattern-mining', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 44d1e156-ab37-4da1-bd55-f187af9f2c2a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('44d1e156-ab37-4da1-bd55-f187af9f2c2a', 'E245EF88-64A1-4F22-A954-EC44A431CE3E', 7, 'recommendation', 'recommendation', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3991d175-5a45-421f-a0c7-772a9924f603 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3991d175-5a45-421f-a0c7-772a9924f603', 'E245EF88-64A1-4F22-A954-EC44A431CE3E', 9, 'sequence-state', 'sequence-state', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4af7a2bc-7526-4ef8-9fad-52d8de5bbe72 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4af7a2bc-7526-4ef8-9fad-52d8de5bbe72', 'E245EF88-64A1-4F22-A954-EC44A431CE3E', 10, 'survival', 'survival', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='CBC185FF-72D0-4BF1-BD4F-C0F9BA28E2E7';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=8 WHERE ID='5E1182D7-9450-4107-A24D-327E6B455317';

/* SQL text to insert entity field value with ID be8d7482-3b77-432e-b799-9013298c2bc9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('be8d7482-3b77-432e-b799-9013298c2bc9', 'BB6E44D6-4E0C-4F33-9D14-F050640290EC', 1, 'Composite', 'Composite', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID edf6bf55-4bd4-4216-80fa-e8b076fbe444 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('edf6bf55-4bd4-4216-80fa-e8b076fbe444', 'BB6E44D6-4E0C-4F33-9D14-F050640290EC', 2, 'CompositeChild', 'CompositeChild', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d08b7d54-26ca-486e-abdb-633ce40de78e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d08b7d54-26ca-486e-abdb-633ce40de78e', 'BB6E44D6-4E0C-4F33-9D14-F050640290EC', 3, 'Standard', 'Standard', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BB6E44D6-4E0C-4F33-9D14-F050640290EC */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BB6E44D6-4E0C-4F33-9D14-F050640290EC';

/* SQL text to insert entity field value with ID 6a6502ff-9ac8-42f3-9e32-16e8588a2baf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6a6502ff-9ac8-42f3-9e32-16e8588a2baf', '5E905AE3-BC13-4C5C-9E41-ECC0C11A0153', 1, 'anomaly', 'anomaly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ad7dd4f1-8169-4be6-8a32-58cba0adf666 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ad7dd4f1-8169-4be6-8a32-58cba0adf666', '5E905AE3-BC13-4C5C-9E41-ECC0C11A0153', 2, 'classification', 'classification', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 23409d4e-f855-478a-b32e-1968e6229634 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('23409d4e-f855-478a-b32e-1968e6229634', '5E905AE3-BC13-4C5C-9E41-ECC0C11A0153', 3, 'clustering', 'clustering', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 27371db4-41cb-451e-9071-9d83696816e3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('27371db4-41cb-451e-9071-9d83696816e3', '5E905AE3-BC13-4C5C-9E41-ECC0C11A0153', 4, 'dim-reduction', 'dim-reduction', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ab330fab-251d-4126-816f-6f12c73f2cd5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ab330fab-251d-4126-816f-6f12c73f2cd5', '5E905AE3-BC13-4C5C-9E41-ECC0C11A0153', 5, 'forecasting', 'forecasting', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2d17b675-bf40-43b7-bca0-de8e5e323060 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2d17b675-bf40-43b7-bca0-de8e5e323060', '5E905AE3-BC13-4C5C-9E41-ECC0C11A0153', 6, 'pattern-mining', 'pattern-mining', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e77b2e69-7f2c-481f-9b50-80b6baee69bc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e77b2e69-7f2c-481f-9b50-80b6baee69bc', '5E905AE3-BC13-4C5C-9E41-ECC0C11A0153', 7, 'recommendation', 'recommendation', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e2e2b7f0-9eca-4b2d-9376-ebffa1a8f1a4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e2e2b7f0-9eca-4b2d-9376-ebffa1a8f1a4', '5E905AE3-BC13-4C5C-9E41-ECC0C11A0153', 8, 'regression', 'regression', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 37e3ba3c-f504-4ee1-97d3-228863f8015d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('37e3ba3c-f504-4ee1-97d3-228863f8015d', '5E905AE3-BC13-4C5C-9E41-ECC0C11A0153', 9, 'sequence-state', 'sequence-state', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 812e4cae-084b-40d6-b8e8-fae8e7ff4267 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('812e4cae-084b-40d6-b8e8-fae8e7ff4267', '5E905AE3-BC13-4C5C-9E41-ECC0C11A0153', 10, 'survival', 'survival', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5E905AE3-BC13-4C5C-9E41-ECC0C11A0153 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5E905AE3-BC13-4C5C-9E41-ECC0C11A0153';

/* SQL text to insert entity field value with ID e64b08a1-7a2c-4d72-bada-809cf75f5845 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e64b08a1-7a2c-4d72-bada-809cf75f5845', '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0', 1, 'anomaly', 'anomaly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 32c1971a-556f-4c14-8d20-35fb8244d75c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('32c1971a-556f-4c14-8d20-35fb8244d75c', '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0', 3, 'clustering', 'clustering', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e0bbfbee-fc4c-40e2-a065-d1e069834030 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e0bbfbee-fc4c-40e2-a065-d1e069834030', '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0', 4, 'dim-reduction', 'dim-reduction', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7c45a72a-6b7a-4d73-a6df-60d950c524e0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7c45a72a-6b7a-4d73-a6df-60d950c524e0', '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0', 5, 'forecasting', 'forecasting', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ab9779af-498e-4984-bbe9-098a42c5f5b2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ab9779af-498e-4984-bbe9-098a42c5f5b2', '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0', 6, 'pattern-mining', 'pattern-mining', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 95344eb2-318d-4834-a53d-5d8f23e013dc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('95344eb2-318d-4834-a53d-5d8f23e013dc', '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0', 7, 'recommendation', 'recommendation', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d5b3e126-ed5f-4996-b144-c34ccb5d7d73 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d5b3e126-ed5f-4996-b144-c34ccb5d7d73', '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0', 9, 'sequence-state', 'sequence-state', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9a200cce-73cc-4ae9-8723-55fb337c973b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9a200cce-73cc-4ae9-8723-55fb337c973b', '0CB9357A-8739-4CB4-80EB-1DD0C0A0D9A0', 10, 'survival', 'survival', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='3617BF1D-ED43-4F64-A2A9-34E582BE9BA3';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=8 WHERE ID='ED520962-2B56-4CB0-8426-71850F01C597';

/* SQL text to insert entity field value with ID 3591a96c-c6ca-4e7f-ab8f-4717e54d0df9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3591a96c-c6ca-4e7f-ab8f-4717e54d0df9', 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4', 1, 'anomaly', 'anomaly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3989b7a9-1ade-448e-a02b-b389a7e5bbfa */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3989b7a9-1ade-448e-a02b-b389a7e5bbfa', 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4', 4, 'clustering', 'clustering', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cc03ae24-5972-4ec0-bd15-8c28d5092b44 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cc03ae24-5972-4ec0-bd15-8c28d5092b44', 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4', 5, 'dim-reduction', 'dim-reduction', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID aec03971-35ea-4269-bbb3-56ebe3cbba93 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('aec03971-35ea-4269-bbb3-56ebe3cbba93', 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4', 6, 'forecasting', 'forecasting', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ae23a468-030a-47e9-869d-4562a61ef07a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ae23a468-030a-47e9-869d-4562a61ef07a', 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4', 7, 'pattern-mining', 'pattern-mining', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 81f9deb0-e8e6-4572-9de5-e5bce34447a5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('81f9deb0-e8e6-4572-9de5-e5bce34447a5', 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4', 8, 'recommendation', 'recommendation', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID da12385b-7ad4-4798-b6a1-a3ee9a304613 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('da12385b-7ad4-4798-b6a1-a3ee9a304613', 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4', 10, 'sequence-state', 'sequence-state', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e5543828-fc84-47e1-b7b5-483a46b7676d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e5543828-fc84-47e1-b7b5-483a46b7676d', 'CBD833AA-1C97-45E6-ADC6-5101D31AF5A4', 11, 'survival', 'survival', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='D914382B-D575-41C9-B79E-1315EFA7EE60';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='BEF0FCC5-82A9-4365-9977-01FD1A8B315F';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=9 WHERE ID='695663A3-5B03-42B4-9A90-39BC4F470BE9';


/* Create Entity Relationship: MJ: ML Components -> MJ: ML Composite Memberships (One To Many via ChildComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8772b283-f187-4f54-a90c-35278352db81'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8772b283-f187-4f54-a90c-35278352db81', '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', 'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5', 'ChildComponentID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Components -> MJ: ML Composite Memberships (One To Many via CompositeComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '82f1e286-e2c8-4b00-baf2-801614f7b886'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('82f1e286-e2c8-4b00-baf2-801614f7b886', '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', 'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5', 'CompositeComponentID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Components -> MJ: ML Component Slots (One To Many via ComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ee0b3fb5-fd52-4263-a30d-ab3f307f2342'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ee0b3fb5-fd52-4263-a30d-ab3f307f2342', '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', 'ComponentID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Components -> MJ: ML Component Ports (One To Many via ComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a0553347-62cb-4765-a258-ed67dd6ea3f6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a0553347-62cb-4765-a258-ed67dd6ea3f6', '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', 'D92B09E5-E5BC-498F-BDE3-273328ED5044', 'ComponentID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Components -> MJ: ML Models (One To Many via ComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd7043a68-3e09-4bc7-b595-e94c06588be3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d7043a68-3e09-4bc7-b595-e94c06588be3', '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'ComponentID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Components -> MJ: ML Training Pipelines (One To Many via ComponentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c8febef5-b19b-41c3-b89b-83ee052a173c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c8febef5-b19b-41c3-b89b-83ee052a173c', '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', '703FD109-331B-438D-902B-8E4A93C3F6AA', 'ComponentID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: ML Components (One To Many via ApprovedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd3131266-42f2-4ab8-961d-6f5cd7faf26c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d3131266-42f2-4ab8-961d-6f5cd7faf26c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', 'ApprovedByUserID', 'One To Many', 1, 1, 110, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Models -> MJ: ML Models (One To Many via ParentModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3ae68327-403f-4e30-a344-38a9e0c55a5d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3ae68327-403f-4e30-a344-38a9e0c55a5d', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'A3997636-011D-46E0-BC01-8B1E61E1087B', 'ParentModelID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Port Types -> MJ: ML Component Slots (One To Many via RequiredPortTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1f6716f9-3fc8-4818-839a-163e33329827'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1f6716f9-3fc8-4818-839a-163e33329827', 'CDE4269B-4592-40F0-97C1-BA3918C7BDE7', '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', 'RequiredPortTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Port Types -> MJ: ML Component Ports (One To Many via PortTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '83959f80-baff-48b6-af16-cfb4b1d3a09e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('83959f80-baff-48b6-af16-cfb4b1d3a09e', 'CDE4269B-4592-40F0-97C1-BA3918C7BDE7', 'D92B09E5-E5BC-498F-BDE3-273328ED5044', 'PortTypeID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Port Types -> MJ: ML Port Adapters (One To Many via ToPortTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4c015e65-3f42-4c39-959f-8b621553d7dc'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4c015e65-3f42-4c39-959f-8b621553d7dc', 'CDE4269B-4592-40F0-97C1-BA3918C7BDE7', '4F296017-6F36-4E2E-90DD-7C058F7D1236', 'ToPortTypeID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: ML Port Types -> MJ: ML Port Adapters (One To Many via FromPortTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '90a48835-f5fb-4dab-b2c4-b35c5fb71209'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('90a48835-f5fb-4dab-b2c4-b35c5fb71209', 'CDE4269B-4592-40F0-97C1-BA3918C7BDE7', '4F296017-6F36-4E2E-90DD-7C058F7D1236', 'FromPortTypeID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: ML Algorithms -> MJ: ML Components (One To Many via AlgorithmID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9f1d2133-ec0e-4555-9ee9-1bd9895defc1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9f1d2133-ec0e-4555-9ee9-1bd9895defc1', '26642380-432D-4527-85DD-FE7A96E57549', '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', 'AlgorithmID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for MLComponentPort */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Ports
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ComponentID in table MLComponentPort
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLComponentPort_ComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLComponentPort]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLComponentPort_ComponentID ON [${flyway:defaultSchema}].[MLComponentPort] ([ComponentID]);

-- Index for foreign key PortTypeID in table MLComponentPort
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLComponentPort_PortTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLComponentPort]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLComponentPort_PortTypeID ON [${flyway:defaultSchema}].[MLComponentPort] ([PortTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 22F3704E-5769-4826-89DC-847E6BC88CB4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='22F3704E-5769-4826-89DC-847E6BC88CB4', @RelatedEntityNameFieldMap='Component';

/* SQL text to update entity field related entity name field map for entity field ID 6F17E667-E6F2-4B29-B6E8-938C9BB52431 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6F17E667-E6F2-4B29-B6E8-938C9BB52431', @RelatedEntityNameFieldMap='PortType';

/* Base View SQL for MJ: ML Component Ports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Ports
-- Item: vwMLComponentPorts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Component Ports
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLComponentPort
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLComponentPorts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLComponentPorts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLComponentPorts]
AS
SELECT
    m.*,
    MJMLComponent_ComponentID.[Name] AS [Component],
    MJMLPortType_PortTypeID.[Name] AS [PortType]
FROM
    [${flyway:defaultSchema}].[MLComponentPort] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLComponent] AS MJMLComponent_ComponentID
  ON
    [m].[ComponentID] = MJMLComponent_ComponentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLPortType] AS MJMLPortType_PortTypeID
  ON
    [m].[PortTypeID] = MJMLPortType_PortTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLComponentPorts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Component Ports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Ports
-- Item: Permissions for vwMLComponentPorts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLComponentPorts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Component Ports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Ports
-- Item: spCreateMLComponentPort
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLComponentPort
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLComponentPort]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLComponentPort];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLComponentPort]
    @ID uniqueidentifier = NULL,
    @ComponentID uniqueidentifier,
    @PortTypeID uniqueidentifier,
    @Direction nvarchar(10),
    @Name nvarchar(100),
    @IsRequired bit = NULL,
    @Ordinal int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLComponentPort]
            (
                [ID],
                [ComponentID],
                [PortTypeID],
                [Direction],
                [Name],
                [IsRequired],
                [Ordinal]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ComponentID,
                @PortTypeID,
                @Direction,
                @Name,
                ISNULL(@IsRequired, 1),
                ISNULL(@Ordinal, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLComponentPort]
            (
                [ComponentID],
                [PortTypeID],
                [Direction],
                [Name],
                [IsRequired],
                [Ordinal]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ComponentID,
                @PortTypeID,
                @Direction,
                @Name,
                ISNULL(@IsRequired, 1),
                ISNULL(@Ordinal, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLComponentPorts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLComponentPort] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Component Ports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLComponentPort] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Component Ports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Ports
-- Item: spUpdateMLComponentPort
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLComponentPort
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLComponentPort]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLComponentPort];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLComponentPort]
    @ID uniqueidentifier,
    @ComponentID uniqueidentifier = NULL,
    @PortTypeID uniqueidentifier = NULL,
    @Direction nvarchar(10) = NULL,
    @Name nvarchar(100) = NULL,
    @IsRequired bit = NULL,
    @Ordinal int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLComponentPort]
    SET
        [ComponentID] = ISNULL(@ComponentID, [ComponentID]),
        [PortTypeID] = ISNULL(@PortTypeID, [PortTypeID]),
        [Direction] = ISNULL(@Direction, [Direction]),
        [Name] = ISNULL(@Name, [Name]),
        [IsRequired] = ISNULL(@IsRequired, [IsRequired]),
        [Ordinal] = ISNULL(@Ordinal, [Ordinal])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLComponentPorts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLComponentPorts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLComponentPort] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLComponentPort table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLComponentPort]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLComponentPort];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLComponentPort
ON [${flyway:defaultSchema}].[MLComponentPort]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLComponentPort]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLComponentPort] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Component Ports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLComponentPort] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Component Ports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Ports
-- Item: spDeleteMLComponentPort
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLComponentPort
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLComponentPort]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLComponentPort];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLComponentPort]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLComponentPort]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLComponentPort] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Component Ports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLComponentPort] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLComponentSlot */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Slots
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ComponentID in table MLComponentSlot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLComponentSlot_ComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLComponentSlot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLComponentSlot_ComponentID ON [${flyway:defaultSchema}].[MLComponentSlot] ([ComponentID]);

-- Index for foreign key RequiredPortTypeID in table MLComponentSlot
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLComponentSlot_RequiredPortTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLComponentSlot]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLComponentSlot_RequiredPortTypeID ON [${flyway:defaultSchema}].[MLComponentSlot] ([RequiredPortTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID BEC7DDFB-A561-4D4F-A777-B5C2BF431D71 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BEC7DDFB-A561-4D4F-A777-B5C2BF431D71', @RelatedEntityNameFieldMap='Component';

/* Index for Foreign Keys for MLComponent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Components
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AlgorithmID in table MLComponent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLComponent_AlgorithmID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLComponent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLComponent_AlgorithmID ON [${flyway:defaultSchema}].[MLComponent] ([AlgorithmID]);

-- Index for foreign key ApprovedByUserID in table MLComponent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLComponent_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLComponent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLComponent_ApprovedByUserID ON [${flyway:defaultSchema}].[MLComponent] ([ApprovedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 5A00AB69-4DB5-4D01-8AAE-CFCA14B6499A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5A00AB69-4DB5-4D01-8AAE-CFCA14B6499A', @RelatedEntityNameFieldMap='Algorithm';

/* Index for Foreign Keys for MLCompositeMembership */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Composite Memberships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompositeComponentID in table MLCompositeMembership
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLCompositeMembership_CompositeComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLCompositeMembership]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLCompositeMembership_CompositeComponentID ON [${flyway:defaultSchema}].[MLCompositeMembership] ([CompositeComponentID]);

-- Index for foreign key ChildComponentID in table MLCompositeMembership
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLCompositeMembership_ChildComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLCompositeMembership]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLCompositeMembership_ChildComponentID ON [${flyway:defaultSchema}].[MLCompositeMembership] ([ChildComponentID]);

/* SQL text to update entity field related entity name field map for entity field ID 347F1DA2-B2CD-449B-8160-6FE60473851A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='347F1DA2-B2CD-449B-8160-6FE60473851A', @RelatedEntityNameFieldMap='CompositeComponent';

/* Index for Foreign Keys for MLModel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PipelineID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_PipelineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_PipelineID ON [${flyway:defaultSchema}].[MLModel] ([PipelineID]);

-- Index for foreign key AlgorithmID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_AlgorithmID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_AlgorithmID ON [${flyway:defaultSchema}].[MLModel] ([AlgorithmID]);

-- Index for foreign key ArtifactFileID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_ArtifactFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_ArtifactFileID ON [${flyway:defaultSchema}].[MLModel] ([ArtifactFileID]);

-- Index for foreign key ComponentID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_ComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_ComponentID ON [${flyway:defaultSchema}].[MLModel] ([ComponentID]);

-- Index for foreign key ParentModelID in table MLModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLModel_ParentModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLModel_ParentModelID ON [${flyway:defaultSchema}].[MLModel] ([ParentModelID]);

/* SQL text to update entity field related entity name field map for entity field ID 8BD868AE-1A73-466D-A97B-36BE0C4731D1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8BD868AE-1A73-466D-A97B-36BE0C4731D1', @RelatedEntityNameFieldMap='Component';

/* SQL text to update entity field related entity name field map for entity field ID 8C5983FA-CC5D-4A04-BEAD-847CB183C0BC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8C5983FA-CC5D-4A04-BEAD-847CB183C0BC', @RelatedEntityNameFieldMap='ApprovedByUser';

/* Root ID Function SQL for MJ: ML Models.ParentModelID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: fnMLModelParentModelID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [MLModel].[ParentModelID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnMLModelParentModelID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnMLModelParentModelID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnMLModelParentModelID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentModelID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[MLModel]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentModelID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[MLModel] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentModelID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentModelID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: vwMLModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Models
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLModels]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLModels];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLModels]
AS
SELECT
    m.*,
    MJMLTrainingPipeline_PipelineID.[Name] AS [Pipeline],
    MJMLAlgorithm_AlgorithmID.[Name] AS [Algorithm],
    MJFile_ArtifactFileID.[Name] AS [ArtifactFile],
    MJMLComponent_ComponentID.[Name] AS [Component],
    root_ParentModelID.RootID AS [RootParentModelID]
FROM
    [${flyway:defaultSchema}].[MLModel] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS MJMLTrainingPipeline_PipelineID
  ON
    [m].[PipelineID] = MJMLTrainingPipeline_PipelineID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_ArtifactFileID
  ON
    [m].[ArtifactFileID] = MJFile_ArtifactFileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLComponent] AS MJMLComponent_ComponentID
  ON
    [m].[ComponentID] = MJMLComponent_ComponentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnMLModelParentModelID_GetRootID]([m].[ID], [m].[ParentModelID]) AS root_ParentModelID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: Permissions for vwMLModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: spCreateMLModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLModel]
    @ID uniqueidentifier = NULL,
    @PipelineID uniqueidentifier,
    @Version int = NULL,
    @AlgorithmID uniqueidentifier,
    @ArtifactFileID_Clear bit = 0,
    @ArtifactFileID uniqueidentifier = NULL,
    @FittedPreprocessing_Clear bit = 0,
    @FittedPreprocessing nvarchar(MAX) = NULL,
    @FeatureSchema nvarchar(MAX),
    @TargetVariable nvarchar(500),
    @ProblemType nvarchar(20),
    @Metrics_Clear bit = 0,
    @Metrics nvarchar(MAX) = NULL,
    @HoldoutMetrics_Clear bit = 0,
    @HoldoutMetrics nvarchar(MAX) = NULL,
    @FeatureImportance_Clear bit = 0,
    @FeatureImportance nvarchar(MAX) = NULL,
    @Lineage_Clear bit = 0,
    @Lineage nvarchar(MAX) = NULL,
    @TrainedAt_Clear bit = 0,
    @TrainedAt datetimeoffset = NULL,
    @TrainingDurationSec_Clear bit = 0,
    @TrainingDurationSec int = NULL,
    @TrainingRowCount_Clear bit = 0,
    @TrainingRowCount int = NULL,
    @Status nvarchar(20) = NULL,
    @ComponentID_Clear bit = 0,
    @ComponentID uniqueidentifier = NULL,
    @Kind nvarchar(20) = NULL,
    @ParentModelID_Clear bit = 0,
    @ParentModelID uniqueidentifier = NULL,
    @Task_Clear bit = 0,
    @Task nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLModel]
            (
                [ID],
                [PipelineID],
                [Version],
                [AlgorithmID],
                [ArtifactFileID],
                [FittedPreprocessing],
                [FeatureSchema],
                [TargetVariable],
                [ProblemType],
                [Metrics],
                [HoldoutMetrics],
                [FeatureImportance],
                [Lineage],
                [TrainedAt],
                [TrainingDurationSec],
                [TrainingRowCount],
                [Status],
                [ComponentID],
                [Kind],
                [ParentModelID],
                [Task]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PipelineID,
                ISNULL(@Version, 1),
                @AlgorithmID,
                CASE WHEN @ArtifactFileID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactFileID, NULL) END,
                CASE WHEN @FittedPreprocessing_Clear = 1 THEN NULL ELSE ISNULL(@FittedPreprocessing, NULL) END,
                @FeatureSchema,
                @TargetVariable,
                @ProblemType,
                CASE WHEN @Metrics_Clear = 1 THEN NULL ELSE ISNULL(@Metrics, NULL) END,
                CASE WHEN @HoldoutMetrics_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetrics, NULL) END,
                CASE WHEN @FeatureImportance_Clear = 1 THEN NULL ELSE ISNULL(@FeatureImportance, NULL) END,
                CASE WHEN @Lineage_Clear = 1 THEN NULL ELSE ISNULL(@Lineage, NULL) END,
                CASE WHEN @TrainedAt_Clear = 1 THEN NULL ELSE ISNULL(@TrainedAt, NULL) END,
                CASE WHEN @TrainingDurationSec_Clear = 1 THEN NULL ELSE ISNULL(@TrainingDurationSec, NULL) END,
                CASE WHEN @TrainingRowCount_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRowCount, NULL) END,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @ComponentID_Clear = 1 THEN NULL ELSE ISNULL(@ComponentID, NULL) END,
                ISNULL(@Kind, 'Standard'),
                CASE WHEN @ParentModelID_Clear = 1 THEN NULL ELSE ISNULL(@ParentModelID, NULL) END,
                CASE WHEN @Task_Clear = 1 THEN NULL ELSE ISNULL(@Task, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLModel]
            (
                [PipelineID],
                [Version],
                [AlgorithmID],
                [ArtifactFileID],
                [FittedPreprocessing],
                [FeatureSchema],
                [TargetVariable],
                [ProblemType],
                [Metrics],
                [HoldoutMetrics],
                [FeatureImportance],
                [Lineage],
                [TrainedAt],
                [TrainingDurationSec],
                [TrainingRowCount],
                [Status],
                [ComponentID],
                [Kind],
                [ParentModelID],
                [Task]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PipelineID,
                ISNULL(@Version, 1),
                @AlgorithmID,
                CASE WHEN @ArtifactFileID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactFileID, NULL) END,
                CASE WHEN @FittedPreprocessing_Clear = 1 THEN NULL ELSE ISNULL(@FittedPreprocessing, NULL) END,
                @FeatureSchema,
                @TargetVariable,
                @ProblemType,
                CASE WHEN @Metrics_Clear = 1 THEN NULL ELSE ISNULL(@Metrics, NULL) END,
                CASE WHEN @HoldoutMetrics_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetrics, NULL) END,
                CASE WHEN @FeatureImportance_Clear = 1 THEN NULL ELSE ISNULL(@FeatureImportance, NULL) END,
                CASE WHEN @Lineage_Clear = 1 THEN NULL ELSE ISNULL(@Lineage, NULL) END,
                CASE WHEN @TrainedAt_Clear = 1 THEN NULL ELSE ISNULL(@TrainedAt, NULL) END,
                CASE WHEN @TrainingDurationSec_Clear = 1 THEN NULL ELSE ISNULL(@TrainingDurationSec, NULL) END,
                CASE WHEN @TrainingRowCount_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRowCount, NULL) END,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @ComponentID_Clear = 1 THEN NULL ELSE ISNULL(@ComponentID, NULL) END,
                ISNULL(@Kind, 'Standard'),
                CASE WHEN @ParentModelID_Clear = 1 THEN NULL ELSE ISNULL(@ParentModelID, NULL) END,
                CASE WHEN @Task_Clear = 1 THEN NULL ELSE ISNULL(@Task, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModel] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLModel] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: spUpdateMLModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLModel]
    @ID uniqueidentifier,
    @PipelineID uniqueidentifier = NULL,
    @Version int = NULL,
    @AlgorithmID uniqueidentifier = NULL,
    @ArtifactFileID_Clear bit = 0,
    @ArtifactFileID uniqueidentifier = NULL,
    @FittedPreprocessing_Clear bit = 0,
    @FittedPreprocessing nvarchar(MAX) = NULL,
    @FeatureSchema nvarchar(MAX) = NULL,
    @TargetVariable nvarchar(500) = NULL,
    @ProblemType nvarchar(20) = NULL,
    @Metrics_Clear bit = 0,
    @Metrics nvarchar(MAX) = NULL,
    @HoldoutMetrics_Clear bit = 0,
    @HoldoutMetrics nvarchar(MAX) = NULL,
    @FeatureImportance_Clear bit = 0,
    @FeatureImportance nvarchar(MAX) = NULL,
    @Lineage_Clear bit = 0,
    @Lineage nvarchar(MAX) = NULL,
    @TrainedAt_Clear bit = 0,
    @TrainedAt datetimeoffset = NULL,
    @TrainingDurationSec_Clear bit = 0,
    @TrainingDurationSec int = NULL,
    @TrainingRowCount_Clear bit = 0,
    @TrainingRowCount int = NULL,
    @Status nvarchar(20) = NULL,
    @ComponentID_Clear bit = 0,
    @ComponentID uniqueidentifier = NULL,
    @Kind nvarchar(20) = NULL,
    @ParentModelID_Clear bit = 0,
    @ParentModelID uniqueidentifier = NULL,
    @Task_Clear bit = 0,
    @Task nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLModel]
    SET
        [PipelineID] = ISNULL(@PipelineID, [PipelineID]),
        [Version] = ISNULL(@Version, [Version]),
        [AlgorithmID] = ISNULL(@AlgorithmID, [AlgorithmID]),
        [ArtifactFileID] = CASE WHEN @ArtifactFileID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactFileID, [ArtifactFileID]) END,
        [FittedPreprocessing] = CASE WHEN @FittedPreprocessing_Clear = 1 THEN NULL ELSE ISNULL(@FittedPreprocessing, [FittedPreprocessing]) END,
        [FeatureSchema] = ISNULL(@FeatureSchema, [FeatureSchema]),
        [TargetVariable] = ISNULL(@TargetVariable, [TargetVariable]),
        [ProblemType] = ISNULL(@ProblemType, [ProblemType]),
        [Metrics] = CASE WHEN @Metrics_Clear = 1 THEN NULL ELSE ISNULL(@Metrics, [Metrics]) END,
        [HoldoutMetrics] = CASE WHEN @HoldoutMetrics_Clear = 1 THEN NULL ELSE ISNULL(@HoldoutMetrics, [HoldoutMetrics]) END,
        [FeatureImportance] = CASE WHEN @FeatureImportance_Clear = 1 THEN NULL ELSE ISNULL(@FeatureImportance, [FeatureImportance]) END,
        [Lineage] = CASE WHEN @Lineage_Clear = 1 THEN NULL ELSE ISNULL(@Lineage, [Lineage]) END,
        [TrainedAt] = CASE WHEN @TrainedAt_Clear = 1 THEN NULL ELSE ISNULL(@TrainedAt, [TrainedAt]) END,
        [TrainingDurationSec] = CASE WHEN @TrainingDurationSec_Clear = 1 THEN NULL ELSE ISNULL(@TrainingDurationSec, [TrainingDurationSec]) END,
        [TrainingRowCount] = CASE WHEN @TrainingRowCount_Clear = 1 THEN NULL ELSE ISNULL(@TrainingRowCount, [TrainingRowCount]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ComponentID] = CASE WHEN @ComponentID_Clear = 1 THEN NULL ELSE ISNULL(@ComponentID, [ComponentID]) END,
        [Kind] = ISNULL(@Kind, [Kind]),
        [ParentModelID] = CASE WHEN @ParentModelID_Clear = 1 THEN NULL ELSE ISNULL(@ParentModelID, [ParentModelID]) END,
        [Task] = CASE WHEN @Task_Clear = 1 THEN NULL ELSE ISNULL(@Task, [Task]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLModels] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLModels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLModel table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLModel]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLModel];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLModel
ON [${flyway:defaultSchema}].[MLModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLModel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLModel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLModel] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Models
-- Item: spDeleteMLModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLModel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLModel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLModel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLModel]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModel] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLModel] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID EA0DDF40-1685-4B4F-A743-4E4EE69B74B2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EA0DDF40-1685-4B4F-A743-4E4EE69B74B2', @RelatedEntityNameFieldMap='RequiredPortType';

/* SQL text to update entity field related entity name field map for entity field ID 9C13ED72-EDF9-49C2-90A5-7CC7FBACB519 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9C13ED72-EDF9-49C2-90A5-7CC7FBACB519', @RelatedEntityNameFieldMap='ChildComponent';

/* Base View SQL for MJ: ML Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Components
-- Item: vwMLComponents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Components
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLComponent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLComponents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLComponents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLComponents]
AS
SELECT
    m.*,
    MJMLAlgorithm_AlgorithmID.[Name] AS [Algorithm],
    MJUser_ApprovedByUserID.[Name] AS [ApprovedByUser]
FROM
    [${flyway:defaultSchema}].[MLComponent] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ApprovedByUserID
  ON
    [m].[ApprovedByUserID] = MJUser_ApprovedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLComponents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Components
-- Item: Permissions for vwMLComponents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLComponents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Components
-- Item: spCreateMLComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLComponent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLComponent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLComponent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLComponent]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Kind nvarchar(20),
    @AlgorithmID_Clear bit = 0,
    @AlgorithmID uniqueidentifier = NULL,
    @Task_Clear bit = 0,
    @Task nvarchar(20) = NULL,
    @LearningType_Clear bit = 0,
    @LearningType nvarchar(20) = NULL,
    @Parametric_Clear bit = 0,
    @Parametric nvarchar(10) = NULL,
    @EnsembleType_Clear bit = 0,
    @EnsembleType nvarchar(20) = NULL,
    @InterpretabilityClass_Clear bit = 0,
    @InterpretabilityClass nvarchar(20) = NULL,
    @DataShape_Clear bit = 0,
    @DataShape nvarchar(20) = NULL,
    @HyperparameterSchema_Clear bit = 0,
    @HyperparameterSchema nvarchar(MAX) = NULL,
    @DefaultHyperparameters_Clear bit = 0,
    @DefaultHyperparameters nvarchar(MAX) = NULL,
    @GraphSpec_Clear bit = 0,
    @GraphSpec nvarchar(MAX) = NULL,
    @SupportsFeatureImportance bit = NULL,
    @Source nvarchar(20) = NULL,
    @CodeApprovalStatus nvarchar(20) = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLComponent]
            (
                [ID],
                [Name],
                [Description],
                [Kind],
                [AlgorithmID],
                [Task],
                [LearningType],
                [Parametric],
                [EnsembleType],
                [InterpretabilityClass],
                [DataShape],
                [HyperparameterSchema],
                [DefaultHyperparameters],
                [GraphSpec],
                [SupportsFeatureImportance],
                [Source],
                [CodeApprovalStatus],
                [ApprovedByUserID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Kind,
                CASE WHEN @AlgorithmID_Clear = 1 THEN NULL ELSE ISNULL(@AlgorithmID, NULL) END,
                CASE WHEN @Task_Clear = 1 THEN NULL ELSE ISNULL(@Task, NULL) END,
                CASE WHEN @LearningType_Clear = 1 THEN NULL ELSE ISNULL(@LearningType, NULL) END,
                CASE WHEN @Parametric_Clear = 1 THEN NULL ELSE ISNULL(@Parametric, NULL) END,
                CASE WHEN @EnsembleType_Clear = 1 THEN NULL ELSE ISNULL(@EnsembleType, NULL) END,
                CASE WHEN @InterpretabilityClass_Clear = 1 THEN NULL ELSE ISNULL(@InterpretabilityClass, NULL) END,
                CASE WHEN @DataShape_Clear = 1 THEN NULL ELSE ISNULL(@DataShape, NULL) END,
                CASE WHEN @HyperparameterSchema_Clear = 1 THEN NULL ELSE ISNULL(@HyperparameterSchema, NULL) END,
                CASE WHEN @DefaultHyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@DefaultHyperparameters, NULL) END,
                CASE WHEN @GraphSpec_Clear = 1 THEN NULL ELSE ISNULL(@GraphSpec, NULL) END,
                ISNULL(@SupportsFeatureImportance, 0),
                ISNULL(@Source, 'System'),
                ISNULL(@CodeApprovalStatus, 'Approved'),
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLComponent]
            (
                [Name],
                [Description],
                [Kind],
                [AlgorithmID],
                [Task],
                [LearningType],
                [Parametric],
                [EnsembleType],
                [InterpretabilityClass],
                [DataShape],
                [HyperparameterSchema],
                [DefaultHyperparameters],
                [GraphSpec],
                [SupportsFeatureImportance],
                [Source],
                [CodeApprovalStatus],
                [ApprovedByUserID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Kind,
                CASE WHEN @AlgorithmID_Clear = 1 THEN NULL ELSE ISNULL(@AlgorithmID, NULL) END,
                CASE WHEN @Task_Clear = 1 THEN NULL ELSE ISNULL(@Task, NULL) END,
                CASE WHEN @LearningType_Clear = 1 THEN NULL ELSE ISNULL(@LearningType, NULL) END,
                CASE WHEN @Parametric_Clear = 1 THEN NULL ELSE ISNULL(@Parametric, NULL) END,
                CASE WHEN @EnsembleType_Clear = 1 THEN NULL ELSE ISNULL(@EnsembleType, NULL) END,
                CASE WHEN @InterpretabilityClass_Clear = 1 THEN NULL ELSE ISNULL(@InterpretabilityClass, NULL) END,
                CASE WHEN @DataShape_Clear = 1 THEN NULL ELSE ISNULL(@DataShape, NULL) END,
                CASE WHEN @HyperparameterSchema_Clear = 1 THEN NULL ELSE ISNULL(@HyperparameterSchema, NULL) END,
                CASE WHEN @DefaultHyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@DefaultHyperparameters, NULL) END,
                CASE WHEN @GraphSpec_Clear = 1 THEN NULL ELSE ISNULL(@GraphSpec, NULL) END,
                ISNULL(@SupportsFeatureImportance, 0),
                ISNULL(@Source, 'System'),
                ISNULL(@CodeApprovalStatus, 'Approved'),
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLComponents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLComponent] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Components */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLComponent] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Components
-- Item: spUpdateMLComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLComponent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLComponent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLComponent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLComponent]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Kind nvarchar(20) = NULL,
    @AlgorithmID_Clear bit = 0,
    @AlgorithmID uniqueidentifier = NULL,
    @Task_Clear bit = 0,
    @Task nvarchar(20) = NULL,
    @LearningType_Clear bit = 0,
    @LearningType nvarchar(20) = NULL,
    @Parametric_Clear bit = 0,
    @Parametric nvarchar(10) = NULL,
    @EnsembleType_Clear bit = 0,
    @EnsembleType nvarchar(20) = NULL,
    @InterpretabilityClass_Clear bit = 0,
    @InterpretabilityClass nvarchar(20) = NULL,
    @DataShape_Clear bit = 0,
    @DataShape nvarchar(20) = NULL,
    @HyperparameterSchema_Clear bit = 0,
    @HyperparameterSchema nvarchar(MAX) = NULL,
    @DefaultHyperparameters_Clear bit = 0,
    @DefaultHyperparameters nvarchar(MAX) = NULL,
    @GraphSpec_Clear bit = 0,
    @GraphSpec nvarchar(MAX) = NULL,
    @SupportsFeatureImportance bit = NULL,
    @Source nvarchar(20) = NULL,
    @CodeApprovalStatus nvarchar(20) = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLComponent]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Kind] = ISNULL(@Kind, [Kind]),
        [AlgorithmID] = CASE WHEN @AlgorithmID_Clear = 1 THEN NULL ELSE ISNULL(@AlgorithmID, [AlgorithmID]) END,
        [Task] = CASE WHEN @Task_Clear = 1 THEN NULL ELSE ISNULL(@Task, [Task]) END,
        [LearningType] = CASE WHEN @LearningType_Clear = 1 THEN NULL ELSE ISNULL(@LearningType, [LearningType]) END,
        [Parametric] = CASE WHEN @Parametric_Clear = 1 THEN NULL ELSE ISNULL(@Parametric, [Parametric]) END,
        [EnsembleType] = CASE WHEN @EnsembleType_Clear = 1 THEN NULL ELSE ISNULL(@EnsembleType, [EnsembleType]) END,
        [InterpretabilityClass] = CASE WHEN @InterpretabilityClass_Clear = 1 THEN NULL ELSE ISNULL(@InterpretabilityClass, [InterpretabilityClass]) END,
        [DataShape] = CASE WHEN @DataShape_Clear = 1 THEN NULL ELSE ISNULL(@DataShape, [DataShape]) END,
        [HyperparameterSchema] = CASE WHEN @HyperparameterSchema_Clear = 1 THEN NULL ELSE ISNULL(@HyperparameterSchema, [HyperparameterSchema]) END,
        [DefaultHyperparameters] = CASE WHEN @DefaultHyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@DefaultHyperparameters, [DefaultHyperparameters]) END,
        [GraphSpec] = CASE WHEN @GraphSpec_Clear = 1 THEN NULL ELSE ISNULL(@GraphSpec, [GraphSpec]) END,
        [SupportsFeatureImportance] = ISNULL(@SupportsFeatureImportance, [SupportsFeatureImportance]),
        [Source] = ISNULL(@Source, [Source]),
        [CodeApprovalStatus] = ISNULL(@CodeApprovalStatus, [CodeApprovalStatus]),
        [ApprovedByUserID] = CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, [ApprovedByUserID]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLComponents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLComponents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLComponent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLComponent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLComponent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLComponent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLComponent
ON [${flyway:defaultSchema}].[MLComponent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLComponent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLComponent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Components */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLComponent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Components
-- Item: spDeleteMLComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLComponent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLComponent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLComponent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLComponent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLComponent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLComponent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Components */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLComponent] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: ML Component Slots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Slots
-- Item: vwMLComponentSlots
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Component Slots
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLComponentSlot
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLComponentSlots]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLComponentSlots];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLComponentSlots]
AS
SELECT
    m.*,
    MJMLComponent_ComponentID.[Name] AS [Component],
    MJMLPortType_RequiredPortTypeID.[Name] AS [RequiredPortType]
FROM
    [${flyway:defaultSchema}].[MLComponentSlot] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLComponent] AS MJMLComponent_ComponentID
  ON
    [m].[ComponentID] = MJMLComponent_ComponentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLPortType] AS MJMLPortType_RequiredPortTypeID
  ON
    [m].[RequiredPortTypeID] = MJMLPortType_RequiredPortTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLComponentSlots] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Component Slots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Slots
-- Item: Permissions for vwMLComponentSlots
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLComponentSlots] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Component Slots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Slots
-- Item: spCreateMLComponentSlot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLComponentSlot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLComponentSlot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLComponentSlot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLComponentSlot]
    @ID uniqueidentifier = NULL,
    @ComponentID uniqueidentifier,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @RequiredPortTypeID uniqueidentifier,
    @MinCount int = NULL,
    @MaxCount_Clear bit = 0,
    @MaxCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLComponentSlot]
            (
                [ID],
                [ComponentID],
                [Name],
                [Description],
                [RequiredPortTypeID],
                [MinCount],
                [MaxCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ComponentID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @RequiredPortTypeID,
                ISNULL(@MinCount, 1),
                CASE WHEN @MaxCount_Clear = 1 THEN NULL ELSE ISNULL(@MaxCount, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLComponentSlot]
            (
                [ComponentID],
                [Name],
                [Description],
                [RequiredPortTypeID],
                [MinCount],
                [MaxCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ComponentID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @RequiredPortTypeID,
                ISNULL(@MinCount, 1),
                CASE WHEN @MaxCount_Clear = 1 THEN NULL ELSE ISNULL(@MaxCount, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLComponentSlots] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLComponentSlot] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Component Slots */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLComponentSlot] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Component Slots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Slots
-- Item: spUpdateMLComponentSlot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLComponentSlot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLComponentSlot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLComponentSlot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLComponentSlot]
    @ID uniqueidentifier,
    @ComponentID uniqueidentifier = NULL,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @RequiredPortTypeID uniqueidentifier = NULL,
    @MinCount int = NULL,
    @MaxCount_Clear bit = 0,
    @MaxCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLComponentSlot]
    SET
        [ComponentID] = ISNULL(@ComponentID, [ComponentID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [RequiredPortTypeID] = ISNULL(@RequiredPortTypeID, [RequiredPortTypeID]),
        [MinCount] = ISNULL(@MinCount, [MinCount]),
        [MaxCount] = CASE WHEN @MaxCount_Clear = 1 THEN NULL ELSE ISNULL(@MaxCount, [MaxCount]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLComponentSlots] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLComponentSlots]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLComponentSlot] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLComponentSlot table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLComponentSlot]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLComponentSlot];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLComponentSlot
ON [${flyway:defaultSchema}].[MLComponentSlot]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLComponentSlot]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLComponentSlot] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Component Slots */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLComponentSlot] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Component Slots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Component Slots
-- Item: spDeleteMLComponentSlot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLComponentSlot
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLComponentSlot]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLComponentSlot];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLComponentSlot]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLComponentSlot]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLComponentSlot] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Component Slots */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLComponentSlot] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: ML Composite Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Composite Memberships
-- Item: vwMLCompositeMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Composite Memberships
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLCompositeMembership
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLCompositeMemberships]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLCompositeMemberships];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLCompositeMemberships]
AS
SELECT
    m.*,
    MJMLComponent_CompositeComponentID.[Name] AS [CompositeComponent],
    MJMLComponent_ChildComponentID.[Name] AS [ChildComponent]
FROM
    [${flyway:defaultSchema}].[MLCompositeMembership] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLComponent] AS MJMLComponent_CompositeComponentID
  ON
    [m].[CompositeComponentID] = MJMLComponent_CompositeComponentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLComponent] AS MJMLComponent_ChildComponentID
  ON
    [m].[ChildComponentID] = MJMLComponent_ChildComponentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLCompositeMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Composite Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Composite Memberships
-- Item: Permissions for vwMLCompositeMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLCompositeMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Composite Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Composite Memberships
-- Item: spCreateMLCompositeMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLCompositeMembership
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLCompositeMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLCompositeMembership];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLCompositeMembership]
    @ID uniqueidentifier = NULL,
    @CompositeComponentID uniqueidentifier,
    @ChildComponentID uniqueidentifier,
    @Role_Clear bit = 0,
    @Role nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLCompositeMembership]
            (
                [ID],
                [CompositeComponentID],
                [ChildComponentID],
                [Role]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompositeComponentID,
                @ChildComponentID,
                CASE WHEN @Role_Clear = 1 THEN NULL ELSE ISNULL(@Role, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLCompositeMembership]
            (
                [CompositeComponentID],
                [ChildComponentID],
                [Role]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompositeComponentID,
                @ChildComponentID,
                CASE WHEN @Role_Clear = 1 THEN NULL ELSE ISNULL(@Role, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLCompositeMemberships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLCompositeMembership] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Composite Memberships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLCompositeMembership] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Composite Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Composite Memberships
-- Item: spUpdateMLCompositeMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLCompositeMembership
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLCompositeMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLCompositeMembership];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLCompositeMembership]
    @ID uniqueidentifier,
    @CompositeComponentID uniqueidentifier = NULL,
    @ChildComponentID uniqueidentifier = NULL,
    @Role_Clear bit = 0,
    @Role nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLCompositeMembership]
    SET
        [CompositeComponentID] = ISNULL(@CompositeComponentID, [CompositeComponentID]),
        [ChildComponentID] = ISNULL(@ChildComponentID, [ChildComponentID]),
        [Role] = CASE WHEN @Role_Clear = 1 THEN NULL ELSE ISNULL(@Role, [Role]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLCompositeMemberships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLCompositeMemberships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLCompositeMembership] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLCompositeMembership table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLCompositeMembership]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLCompositeMembership];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLCompositeMembership
ON [${flyway:defaultSchema}].[MLCompositeMembership]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLCompositeMembership]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLCompositeMembership] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Composite Memberships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLCompositeMembership] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Composite Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Composite Memberships
-- Item: spDeleteMLCompositeMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLCompositeMembership
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLCompositeMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLCompositeMembership];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLCompositeMembership]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLCompositeMembership]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLCompositeMembership] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Composite Memberships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLCompositeMembership] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MLPortAdapter */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Adapters
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FromPortTypeID in table MLPortAdapter
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLPortAdapter_FromPortTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLPortAdapter]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLPortAdapter_FromPortTypeID ON [${flyway:defaultSchema}].[MLPortAdapter] ([FromPortTypeID]);

-- Index for foreign key ToPortTypeID in table MLPortAdapter
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLPortAdapter_ToPortTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLPortAdapter]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLPortAdapter_ToPortTypeID ON [${flyway:defaultSchema}].[MLPortAdapter] ([ToPortTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID EA272B1F-075F-456F-BC83-F17E2EFC6E00 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EA272B1F-075F-456F-BC83-F17E2EFC6E00', @RelatedEntityNameFieldMap='FromPortType';

/* Index for Foreign Keys for MLPortType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for MLTrainingPipeline */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TargetEntityID in table MLTrainingPipeline
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingPipeline_TargetEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingPipeline]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingPipeline_TargetEntityID ON [${flyway:defaultSchema}].[MLTrainingPipeline] ([TargetEntityID]);

-- Index for foreign key AlgorithmID in table MLTrainingPipeline
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingPipeline_AlgorithmID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingPipeline]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingPipeline_AlgorithmID ON [${flyway:defaultSchema}].[MLTrainingPipeline] ([AlgorithmID]);

-- Index for foreign key ComponentID in table MLTrainingPipeline
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MLTrainingPipeline_ComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MLTrainingPipeline]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MLTrainingPipeline_ComponentID ON [${flyway:defaultSchema}].[MLTrainingPipeline] ([ComponentID]);

/* SQL text to update entity field related entity name field map for entity field ID 5999F7B6-24F5-4871-96F6-67CF5502052C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5999F7B6-24F5-4871-96F6-67CF5502052C', @RelatedEntityNameFieldMap='Component';

/* Base View SQL for MJ: ML Port Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Types
-- Item: vwMLPortTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Port Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLPortType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLPortTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLPortTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLPortTypes]
AS
SELECT
    m.*
FROM
    [${flyway:defaultSchema}].[MLPortType] AS m
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLPortTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Port Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Types
-- Item: Permissions for vwMLPortTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLPortTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Port Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Types
-- Item: spCreateMLPortType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLPortType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLPortType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLPortType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLPortType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ShapeSpec_Clear bit = 0,
    @ShapeSpec nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLPortType]
            (
                [ID],
                [Name],
                [Description],
                [ShapeSpec],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ShapeSpec_Clear = 1 THEN NULL ELSE ISNULL(@ShapeSpec, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLPortType]
            (
                [Name],
                [Description],
                [ShapeSpec],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ShapeSpec_Clear = 1 THEN NULL ELSE ISNULL(@ShapeSpec, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLPortTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPortType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Port Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPortType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Port Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Types
-- Item: spUpdateMLPortType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLPortType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLPortType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLPortType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLPortType]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ShapeSpec_Clear bit = 0,
    @ShapeSpec nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLPortType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ShapeSpec] = CASE WHEN @ShapeSpec_Clear = 1 THEN NULL ELSE ISNULL(@ShapeSpec, [ShapeSpec]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLPortTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLPortTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPortType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLPortType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLPortType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLPortType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLPortType
ON [${flyway:defaultSchema}].[MLPortType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLPortType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLPortType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Port Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPortType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Port Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Types
-- Item: spDeleteMLPortType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLPortType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLPortType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLPortType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLPortType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLPortType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPortType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Port Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPortType] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: ML Training Pipelines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: vwMLTrainingPipelines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Training Pipelines
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLTrainingPipeline
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLTrainingPipelines]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLTrainingPipelines];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLTrainingPipelines]
AS
SELECT
    m.*,
    MJEntity_TargetEntityID.[Name] AS [TargetEntity],
    MJMLAlgorithm_AlgorithmID.[Name] AS [Algorithm],
    MJMLComponent_ComponentID.[Name] AS [Component]
FROM
    [${flyway:defaultSchema}].[MLTrainingPipeline] AS m
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_TargetEntityID
  ON
    [m].[TargetEntityID] = MJEntity_TargetEntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLAlgorithm] AS MJMLAlgorithm_AlgorithmID
  ON
    [m].[AlgorithmID] = MJMLAlgorithm_AlgorithmID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[MLComponent] AS MJMLComponent_ComponentID
  ON
    [m].[ComponentID] = MJMLComponent_ComponentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Training Pipelines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: Permissions for vwMLTrainingPipelines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLTrainingPipelines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Training Pipelines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: spCreateMLTrainingPipeline
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLTrainingPipeline
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLTrainingPipeline]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingPipeline];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLTrainingPipeline]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Version int = NULL,
    @Status nvarchar(20) = NULL,
    @TargetEntityID uniqueidentifier,
    @TargetVariable nvarchar(500),
    @ProblemType nvarchar(20),
    @AlgorithmID uniqueidentifier,
    @Hyperparameters_Clear bit = 0,
    @Hyperparameters nvarchar(MAX) = NULL,
    @SourceBindings_Clear bit = 0,
    @SourceBindings nvarchar(MAX) = NULL,
    @FeatureSteps_Clear bit = 0,
    @FeatureSteps nvarchar(MAX) = NULL,
    @AsOfStrategy_Clear bit = 0,
    @AsOfStrategy nvarchar(MAX) = NULL,
    @LeakageGuard_Clear bit = 0,
    @LeakageGuard nvarchar(MAX) = NULL,
    @ValidationStrategy_Clear bit = 0,
    @ValidationStrategy nvarchar(MAX) = NULL,
    @ComponentID_Clear bit = 0,
    @ComponentID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingPipeline]
            (
                [ID],
                [Name],
                [Description],
                [Version],
                [Status],
                [TargetEntityID],
                [TargetVariable],
                [ProblemType],
                [AlgorithmID],
                [Hyperparameters],
                [SourceBindings],
                [FeatureSteps],
                [AsOfStrategy],
                [LeakageGuard],
                [ValidationStrategy],
                [ComponentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Version, 1),
                ISNULL(@Status, 'Draft'),
                @TargetEntityID,
                @TargetVariable,
                @ProblemType,
                @AlgorithmID,
                CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, NULL) END,
                CASE WHEN @SourceBindings_Clear = 1 THEN NULL ELSE ISNULL(@SourceBindings, NULL) END,
                CASE WHEN @FeatureSteps_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSteps, NULL) END,
                CASE WHEN @AsOfStrategy_Clear = 1 THEN NULL ELSE ISNULL(@AsOfStrategy, NULL) END,
                CASE WHEN @LeakageGuard_Clear = 1 THEN NULL ELSE ISNULL(@LeakageGuard, NULL) END,
                CASE WHEN @ValidationStrategy_Clear = 1 THEN NULL ELSE ISNULL(@ValidationStrategy, NULL) END,
                CASE WHEN @ComponentID_Clear = 1 THEN NULL ELSE ISNULL(@ComponentID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLTrainingPipeline]
            (
                [Name],
                [Description],
                [Version],
                [Status],
                [TargetEntityID],
                [TargetVariable],
                [ProblemType],
                [AlgorithmID],
                [Hyperparameters],
                [SourceBindings],
                [FeatureSteps],
                [AsOfStrategy],
                [LeakageGuard],
                [ValidationStrategy],
                [ComponentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Version, 1),
                ISNULL(@Status, 'Draft'),
                @TargetEntityID,
                @TargetVariable,
                @ProblemType,
                @AlgorithmID,
                CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, NULL) END,
                CASE WHEN @SourceBindings_Clear = 1 THEN NULL ELSE ISNULL(@SourceBindings, NULL) END,
                CASE WHEN @FeatureSteps_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSteps, NULL) END,
                CASE WHEN @AsOfStrategy_Clear = 1 THEN NULL ELSE ISNULL(@AsOfStrategy, NULL) END,
                CASE WHEN @LeakageGuard_Clear = 1 THEN NULL ELSE ISNULL(@LeakageGuard, NULL) END,
                CASE WHEN @ValidationStrategy_Clear = 1 THEN NULL ELSE ISNULL(@ValidationStrategy, NULL) END,
                CASE WHEN @ComponentID_Clear = 1 THEN NULL ELSE ISNULL(@ComponentID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLTrainingPipelines] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Training Pipelines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Training Pipelines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: spUpdateMLTrainingPipeline
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLTrainingPipeline
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLTrainingPipeline]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Version int = NULL,
    @Status nvarchar(20) = NULL,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetVariable nvarchar(500) = NULL,
    @ProblemType nvarchar(20) = NULL,
    @AlgorithmID uniqueidentifier = NULL,
    @Hyperparameters_Clear bit = 0,
    @Hyperparameters nvarchar(MAX) = NULL,
    @SourceBindings_Clear bit = 0,
    @SourceBindings nvarchar(MAX) = NULL,
    @FeatureSteps_Clear bit = 0,
    @FeatureSteps nvarchar(MAX) = NULL,
    @AsOfStrategy_Clear bit = 0,
    @AsOfStrategy nvarchar(MAX) = NULL,
    @LeakageGuard_Clear bit = 0,
    @LeakageGuard nvarchar(MAX) = NULL,
    @ValidationStrategy_Clear bit = 0,
    @ValidationStrategy nvarchar(MAX) = NULL,
    @ComponentID_Clear bit = 0,
    @ComponentID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingPipeline]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Version] = ISNULL(@Version, [Version]),
        [Status] = ISNULL(@Status, [Status]),
        [TargetEntityID] = ISNULL(@TargetEntityID, [TargetEntityID]),
        [TargetVariable] = ISNULL(@TargetVariable, [TargetVariable]),
        [ProblemType] = ISNULL(@ProblemType, [ProblemType]),
        [AlgorithmID] = ISNULL(@AlgorithmID, [AlgorithmID]),
        [Hyperparameters] = CASE WHEN @Hyperparameters_Clear = 1 THEN NULL ELSE ISNULL(@Hyperparameters, [Hyperparameters]) END,
        [SourceBindings] = CASE WHEN @SourceBindings_Clear = 1 THEN NULL ELSE ISNULL(@SourceBindings, [SourceBindings]) END,
        [FeatureSteps] = CASE WHEN @FeatureSteps_Clear = 1 THEN NULL ELSE ISNULL(@FeatureSteps, [FeatureSteps]) END,
        [AsOfStrategy] = CASE WHEN @AsOfStrategy_Clear = 1 THEN NULL ELSE ISNULL(@AsOfStrategy, [AsOfStrategy]) END,
        [LeakageGuard] = CASE WHEN @LeakageGuard_Clear = 1 THEN NULL ELSE ISNULL(@LeakageGuard, [LeakageGuard]) END,
        [ValidationStrategy] = CASE WHEN @ValidationStrategy_Clear = 1 THEN NULL ELSE ISNULL(@ValidationStrategy, [ValidationStrategy]) END,
        [ComponentID] = CASE WHEN @ComponentID_Clear = 1 THEN NULL ELSE ISNULL(@ComponentID, [ComponentID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLTrainingPipelines] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLTrainingPipelines]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLTrainingPipeline table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLTrainingPipeline]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLTrainingPipeline];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLTrainingPipeline
ON [${flyway:defaultSchema}].[MLTrainingPipeline]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLTrainingPipeline]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLTrainingPipeline] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Training Pipelines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Training Pipelines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Training Pipelines
-- Item: spDeleteMLTrainingPipeline
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLTrainingPipeline
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLTrainingPipeline]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLTrainingPipeline]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Training Pipelines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLTrainingPipeline] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 7CAC86E9-5B0A-4D72-A5EA-C86D2C676258 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7CAC86E9-5B0A-4D72-A5EA-C86D2C676258', @RelatedEntityNameFieldMap='ToPortType';

/* Base View SQL for MJ: ML Port Adapters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Adapters
-- Item: vwMLPortAdapters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: ML Port Adapters
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MLPortAdapter
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMLPortAdapters]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMLPortAdapters];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMLPortAdapters]
AS
SELECT
    m.*,
    MJMLPortType_FromPortTypeID.[Name] AS [FromPortType],
    MJMLPortType_ToPortTypeID.[Name] AS [ToPortType]
FROM
    [${flyway:defaultSchema}].[MLPortAdapter] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MLPortType] AS MJMLPortType_FromPortTypeID
  ON
    [m].[FromPortTypeID] = MJMLPortType_FromPortTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[MLPortType] AS MJMLPortType_ToPortTypeID
  ON
    [m].[ToPortTypeID] = MJMLPortType_ToPortTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMLPortAdapters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: ML Port Adapters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Adapters
-- Item: Permissions for vwMLPortAdapters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMLPortAdapters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: ML Port Adapters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Adapters
-- Item: spCreateMLPortAdapter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MLPortAdapter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMLPortAdapter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMLPortAdapter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMLPortAdapter]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @FromPortTypeID uniqueidentifier,
    @ToPortTypeID uniqueidentifier,
    @Strategy nvarchar(50),
    @ImplementationKey_Clear bit = 0,
    @ImplementationKey nvarchar(255) = NULL,
    @IsLossy bit = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MLPortAdapter]
            (
                [ID],
                [Name],
                [FromPortTypeID],
                [ToPortTypeID],
                [Strategy],
                [ImplementationKey],
                [IsLossy],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @FromPortTypeID,
                @ToPortTypeID,
                @Strategy,
                CASE WHEN @ImplementationKey_Clear = 1 THEN NULL ELSE ISNULL(@ImplementationKey, NULL) END,
                ISNULL(@IsLossy, 0),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MLPortAdapter]
            (
                [Name],
                [FromPortTypeID],
                [ToPortTypeID],
                [Strategy],
                [ImplementationKey],
                [IsLossy],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @FromPortTypeID,
                @ToPortTypeID,
                @Strategy,
                CASE WHEN @ImplementationKey_Clear = 1 THEN NULL ELSE ISNULL(@ImplementationKey, NULL) END,
                ISNULL(@IsLossy, 0),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMLPortAdapters] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPortAdapter] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: ML Port Adapters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMLPortAdapter] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: ML Port Adapters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Adapters
-- Item: spUpdateMLPortAdapter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MLPortAdapter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMLPortAdapter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMLPortAdapter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMLPortAdapter]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @FromPortTypeID uniqueidentifier = NULL,
    @ToPortTypeID uniqueidentifier = NULL,
    @Strategy nvarchar(50) = NULL,
    @ImplementationKey_Clear bit = 0,
    @ImplementationKey nvarchar(255) = NULL,
    @IsLossy bit = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLPortAdapter]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [FromPortTypeID] = ISNULL(@FromPortTypeID, [FromPortTypeID]),
        [ToPortTypeID] = ISNULL(@ToPortTypeID, [ToPortTypeID]),
        [Strategy] = ISNULL(@Strategy, [Strategy]),
        [ImplementationKey] = CASE WHEN @ImplementationKey_Clear = 1 THEN NULL ELSE ISNULL(@ImplementationKey, [ImplementationKey]) END,
        [IsLossy] = ISNULL(@IsLossy, [IsLossy]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMLPortAdapters] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMLPortAdapters]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPortAdapter] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MLPortAdapter table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMLPortAdapter]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMLPortAdapter];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMLPortAdapter
ON [${flyway:defaultSchema}].[MLPortAdapter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MLPortAdapter]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MLPortAdapter] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: ML Port Adapters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMLPortAdapter] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: ML Port Adapters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: ML Port Adapters
-- Item: spDeleteMLPortAdapter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MLPortAdapter
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMLPortAdapter]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMLPortAdapter];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMLPortAdapter]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MLPortAdapter]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPortAdapter] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: ML Port Adapters */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMLPortAdapter] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8e659f3e-823c-4b40-8dde-96ee1084826f' OR (EntityID = '737A5E52-3EAA-4972-96F4-2097C8C5E7FE' AND Name = 'Component')) BEGIN
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
            '8e659f3e-823c-4b40-8dde-96ee1084826f',
            '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', -- Entity: MJ: ML Component Slots
            100019,
            'Component',
            'Component',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96a8c50a-a6ec-4245-a409-bef4b75b10d0' OR (EntityID = '737A5E52-3EAA-4972-96F4-2097C8C5E7FE' AND Name = 'RequiredPortType')) BEGIN
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
            '96a8c50a-a6ec-4245-a409-bef4b75b10d0',
            '737A5E52-3EAA-4972-96F4-2097C8C5E7FE', -- Entity: MJ: ML Component Slots
            100020,
            'RequiredPortType',
            'Required Port Type',
            NULL,
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '769131d2-a865-4c1a-ae11-719680ad1080' OR (EntityID = 'D92B09E5-E5BC-498F-BDE3-273328ED5044' AND Name = 'Component')) BEGIN
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
            '769131d2-a865-4c1a-ae11-719680ad1080',
            'D92B09E5-E5BC-498F-BDE3-273328ED5044', -- Entity: MJ: ML Component Ports
            100019,
            'Component',
            'Component',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c9a1afc3-ee22-4e33-b178-a47a441c3416' OR (EntityID = 'D92B09E5-E5BC-498F-BDE3-273328ED5044' AND Name = 'PortType')) BEGIN
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
            'c9a1afc3-ee22-4e33-b178-a47a441c3416',
            'D92B09E5-E5BC-498F-BDE3-273328ED5044', -- Entity: MJ: ML Component Ports
            100020,
            'PortType',
            'Port Type',
            NULL,
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86ec22d9-5094-4141-a328-9a5aea5d613d' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'Algorithm')) BEGIN
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
            '86ec22d9-5094-4141-a328-9a5aea5d613d',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100043,
            'Algorithm',
            'Algorithm',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '21ead646-9f1e-4441-a3e9-5cd8cf41969f' OR (EntityID = '33447B99-6716-4B9B-96C3-2A6B24B1FD3C' AND Name = 'ApprovedByUser')) BEGIN
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
            '21ead646-9f1e-4441-a3e9-5cd8cf41969f',
            '33447B99-6716-4B9B-96C3-2A6B24B1FD3C', -- Entity: MJ: ML Components
            100044,
            'ApprovedByUser',
            'Approved By User',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a0b2fa0-ae01-4de6-a182-33d889970415' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = 'FromPortType')) BEGIN
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
            '7a0b2fa0-ae01-4de6-a182-33d889970415',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
            100021,
            'FromPortType',
            'From Port Type',
            NULL,
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '579a179a-795a-4e5d-9ca8-1001102c8f6f' OR (EntityID = '4F296017-6F36-4E2E-90DD-7C058F7D1236' AND Name = 'ToPortType')) BEGIN
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
            '579a179a-795a-4e5d-9ca8-1001102c8f6f',
            '4F296017-6F36-4E2E-90DD-7C058F7D1236', -- Entity: MJ: ML Port Adapters
            100022,
            'ToPortType',
            'To Port Type',
            NULL,
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1adcc0ce-2b13-458e-a2a1-d3a7bebdeb41' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'Component')) BEGIN
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
            '1adcc0ce-2b13-458e-a2a1-d3a7bebdeb41',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            100053,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '102064e5-3564-4b4b-a788-6446cc5a78c8' OR (EntityID = 'A3997636-011D-46E0-BC01-8B1E61E1087B' AND Name = 'RootParentModelID')) BEGIN
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
            '102064e5-3564-4b4b-a788-6446cc5a78c8',
            'A3997636-011D-46E0-BC01-8B1E61E1087B', -- Entity: MJ: ML Models
            100054,
            'RootParentModelID',
            'Root Parent Model ID',
            NULL,
            'uniqueidentifier',
            16,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df6cd4a2-9f69-47b6-adcf-9d91d291ef04' OR (EntityID = '703FD109-331B-438D-902B-8E4A93C3F6AA' AND Name = 'Component')) BEGIN
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
            'df6cd4a2-9f69-47b6-adcf-9d91d291ef04',
            '703FD109-331B-438D-902B-8E4A93C3F6AA', -- Entity: MJ: ML Training Pipelines
            100041,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a5692ee-b192-45c8-9a86-d53f7b339453' OR (EntityID = 'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5' AND Name = 'CompositeComponent')) BEGIN
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
            '0a5692ee-b192-45c8-9a86-d53f7b339453',
            'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5', -- Entity: MJ: ML Composite Memberships
            100013,
            'CompositeComponent',
            'Composite Component',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '45223bdd-4d2d-4f99-92c0-994190ea5dac' OR (EntityID = 'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5' AND Name = 'ChildComponent')) BEGIN
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
            '45223bdd-4d2d-4f99-92c0-994190ea5dac',
            'EFB163B4-B1F3-49D3-9BB1-E0ECB91C18D5', -- Entity: MJ: ML Composite Memberships
            100014,
            'ChildComponent',
            'Child Component',
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

