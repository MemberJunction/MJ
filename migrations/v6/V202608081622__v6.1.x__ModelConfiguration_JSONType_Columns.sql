/*
    ModelConfiguration — the per-modality model-catalog configuration cascade

    Plan: plans/model-configuration.md.

    Adds ONE nullable JSON column, `ModelConfiguration`, at THREE levels of the AI model
    catalog, forming an inherit-with-override cascade resolved base-first:

        AIModelType.ModelConfiguration          (type-wide default — e.g. every Realtime model)
          <  AIModel.ModelConfiguration         (per-model)
            <  AIModelVendor.ModelConfiguration (per model-on-this-provider — the winner)

    This is the structured generalization of the scalar cascade these same three tables
    already carry (`SupportsPrefill` / `PrefillFallbackText`: NOT NULL at the type, nullable =
    inherit at model and model-vendor). Instead of adding a capability column per knob, new
    session/call-time configuration lands as typed properties inside this one bag.

    The column is a JSONType field: `metadata/entities/JSONType-interfaces/IAIModelConfiguration.ts`
    is pushed into `EntityField.JSONTypeDefinition` (see the bridge records in
    `metadata/entities/.entity-field-jsontype-model-configuration.json`), and CodeGen then emits a
    strongly-typed `ModelConfigurationObject` accessor on all three generated entities. First
    consumer: the realtime session builders read `Realtime.TurnDetection` through
    `AIEngine.GetEffectiveModelConfiguration` to pick each model's turn-detection mode.

    Boundary rule (documented on the interface): anything the engine filters/sorts/joins on stays
    a COLUMN (PowerRank, IsActive, Priority, Status); anything a driver consumes at session/call
    time belongs in this bag.

    Purely additive — no drops, no data changes, no CHECK constraints.
*/

-- ════════════════════════════════════════════════════════════════════════════════════
-- 1. The three catalog levels gain the same nullable JSON column
-- ════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE [${flyway:defaultSchema}].[AIModelType]
    ADD [ModelConfiguration] NVARCHAR(MAX) NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[AIModel]
    ADD [ModelConfiguration] NVARCHAR(MAX) NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor]
    ADD [ModelConfiguration] NVARCHAR(MAX) NULL;
GO

-- ════════════════════════════════════════════════════════════════════════════════════
-- 2. Column descriptions
-- ════════════════════════════════════════════════════════════════════════════════════

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type-wide default of the per-modality model-configuration bag (JSON, IAIModelConfiguration shape: LLM / Realtime / Vision / Audio sections). Base layer of the ModelConfiguration cascade — AIModel and AIModelVendor rows inherit from it per key and may override. NULL = contributes nothing.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIModelType',
    @level2type = N'COLUMN', @level2name = 'ModelConfiguration';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-model layer of the per-modality model-configuration bag (JSON, IAIModelConfiguration shape). Deep-merges per key over the AIModelType default; AIModelVendor rows may override per key on top. NULL = inherit the type default unchanged.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'ModelConfiguration';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Most-specific layer of the per-modality model-configuration bag (JSON, IAIModelConfiguration shape) — configuration for THIS model on THIS provider. Deep-merges per key over the model and type layers. NULL = inherit the merged model/type configuration unchanged.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIModelVendor',
    @level2type = N'COLUMN', @level2name = 'ModelConfiguration';
GO
