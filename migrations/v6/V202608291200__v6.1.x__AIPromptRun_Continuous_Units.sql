/*
    Usage types for AI runs and costs.

    Token counts cannot express what a continuous-media model actually bills for: speech-to-text is
    priced per minute/hour of audio, image generation per image, some TTS per character. Until now a
    run of that kind recorded zero tokens, which made it indistinguishable from a run that did no
    work — so it was skipped by cost calculation entirely.

    WHAT THE MEASURE IS, MODELLED AS A ROW RATHER THAN A STRING.
    An earlier revision of this migration carried the measure as `AIPromptRun.UnitsKind
    NVARCHAR(20)` behind a CHECK constraint. That made the set of measures a property of a
    constraint on one column: nothing else in the schema could reference a measure, `AIModelCost`
    had no way to say what its price was per, and adding a measure meant editing a CHECK on a table
    that has nothing to do with pricing. `AIUsageType` promotes it to a first-class row that both
    the run and the cost point at, which is what makes "what does this price buy" answerable by a
    join instead of by convention.

    Note the two are DIFFERENT questions and stay separate rows:
      - AIUsageType is the BASE MEASURE of a quantity (Seconds, Images, Tokens, Characters).
      - AIModelPriceUnitType is the BILLING measure and its arithmetic (TimePerHour,
        PerMillionTokens, PerImage) — it owns the conversion from base measure to billed unit.
    Audio billed per hour is recorded in Seconds and priced by the Per Hour unit type. Collapsing
    the two would force a new usage type for every billing granularity.

    WHERE THE MEASURE LIVES: ON THE PRICE UNIT TYPE, AND NOWHERE ELSE.
    An earlier revision of this migration ALSO put UsageTypeID on AIModelCost, so a cost row could
    state its own measure. That is derivable — a cost row already names a UnitTypeID — and holding it
    in two places makes the contradiction representable: nothing stops a cost row saying
    `UsageType = Seconds` while its UnitTypeID points at `Per 1M Tokens`, whose measure is Tokens.
    That is not abstract. Cost-row selection filters on the measure and the pricing driver reports
    its own, so a divergence turns the safety check into a comparison between two columns with no
    arbiter. Single-sourcing on AIModelPriceUnitType makes it unrepresentable instead of unlikely:
    a cost row has exactly one place to look, reached through its UnitTypeID, and the FK there means
    whatever it finds is a real measure rather than a string a later insert can drift from.

    THE DIVISOR BECOMES DATA (UnitsPerBillingUnit).
    cost = (quantity / UnitsPerBillingUnit) * PricePerUnit — 1,000,000 for a per-1M-tokens row,
    3,600 for per-hour, 1 for per-image. That number previously existed ONLY inside a TypeScript
    class, which is the root cause of bug B60 rather than a detail of it: `Per Image`, `Per Minute`
    and `Per Hour` were seeded as data by one person, the matching driver classes were never written
    by another, and the seam between them was silent for months while six ACTIVE image cost rows
    priced nothing. As a column, seeding the row is sufficient — a generic driver reads UsageTypeID
    and UnitsPerBillingUnit and does the arithmetic. DriverClass remains, for genuinely non-linear
    pricing (tiered rates, per-image-by-resolution, minimum-billing increments such as the Groq
    10-second floor this branch's metadata notes as unmodelled).

    NULLABILITY: NULLABLE HERE, TIGHTENED IN THE RELEASE THAT FOLLOWS THE SEED.
    Every new column is nullable, which is NOT the end state. The four AIUsageType rows are
    declarative metadata (`metadata/ai-usage-types`), and metadata is pushed by the release-time
    consolidated `*__Metadata_Sync.sql`, which by construction carries a LATER timestamp than any
    migration a PR can author. So a NOT NULL column with a DEFAULT pointing at the Tokens row —
    which is what an earlier revision of this file had — makes the from-scratch build fail on the
    ADD itself: SQL Server materialises the default into every existing row and the foreign key
    then has nothing to resolve. Nullable + FK is the strongest guarantee available before the
    seed exists: any NON-NULL value is guaranteed to resolve to a real measure.
    The runtime is written to that contract rather than around it — a price unit type with no
    measure REFUSES to price (it does not guess Tokens), and a prompt run with no measure is read
    as token-billed, which is what every row written before this migration actually was.
    Tightening both UsageTypeID columns to NOT NULL is a one-statement follow-up migration in the
    release AFTER the one that ships this seed, at which point the rows are guaranteed present.

    Deliberately NOT added: rollup columns for units. Units of different types cannot be summed
    across a run tree (seconds + images is meaningless), so cost remains the universal aggregate and
    the existing TotalCost / DescendantCost rollups continue to serve that role unchanged.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The usage-type catalog
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE ${flyway:defaultSchema}.AIUsageType (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(50) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    CONSTRAINT PK_AIUsageType PRIMARY KEY (ID),
    CONSTRAINT UQ_AIUsageType_Name UNIQUE (Name)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The base measure a quantity of AI usage is expressed in — Tokens, Seconds, Characters or Images. Referenced by AIModelPriceUnitType (what a billing unit is a quantity of, and therefore what every cost row priced by it measures) and by AIPromptRun (what a recorded quantity counts). Distinct from AIModelPriceUnitType itself, which names the BILLING unit and its scale: audio recorded in Seconds may be billed by the Per Hour unit type.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIUsageType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique name of the base measure, e.g. Tokens, Seconds, Characters, Images.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIUsageType',
    @level2type = N'COLUMN', @level2name = 'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable explanation of what the measure counts and how it is recorded.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIUsageType',
    @level2type = N'COLUMN', @level2name = 'Description';
GO

-- The four measures themselves are NOT seeded here. Type-table rows are declarative metadata in
-- this repo — see `metadata/ai-usage-types` — which is both better documentation than an INSERT
-- and the only form a reviewer can diff against the rest of the catalog. The columns added below
-- are nullable precisely so this table can be empty when the migration finishes; see NULLABILITY
-- in the header for why that ordering is forced rather than chosen.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AIModelPriceUnitType — the single home of the measure AND the divisor
-- ─────────────────────────────────────────────────────────────────────────────

-- Nullable, and deliberately so: `metadata/ai-model-price-unit-types` supplies the measure and the
-- divisor for all six shipped billing units, and that push happens after every migration has run.
-- A NULL here therefore means exactly one thing — nobody has said what this billing unit is a
-- quantity of — and BasePriceUnitType refuses to price such a row rather than assuming Tokens.
-- The CHECK constraint is written to permit NULL (a NULL comparison is UNKNOWN, which passes) so it
-- constrains the values that ARE supplied without re-imposing the ordering problem.
ALTER TABLE ${flyway:defaultSchema}.AIModelPriceUnitType
ADD UsageTypeID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_AIModelPriceUnitType_UsageType FOREIGN KEY REFERENCES ${flyway:defaultSchema}.AIUsageType(ID),
    UnitsPerBillingUnit DECIMAL(19,8) NULL
        CONSTRAINT CK_AIModelPriceUnitType_UnitsPerBillingUnit CHECK (UnitsPerBillingUnit > 0);
GO


EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The base measure this billing unit is a quantity of — Tokens for a per-1M-tokens rate, Seconds for a per-minute or per-hour rate, Images for a per-image rate. This is the authority on what a cost row priced by this unit type measures: AIModelCost deliberately does NOT carry its own copy, because two copies can disagree and nothing would arbitrate.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelPriceUnitType',
    @level2type = N'COLUMN', @level2name = 'UsageTypeID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How many units of the base measure make ONE billed unit: 1000000 for a per-1M-tokens rate, 3600 for per-hour, 60 for per-minute, 1 for per-image. Cost is (quantity / UnitsPerBillingUnit) * PricePerUnit. Holding the divisor as DATA is what lets a new linear billing unit ship by seeding a row, with no driver class and no build — the code-only requirement is what made bug B60 possible. DriverClass remains for non-linear pricing (tiered rates, per-image-by-resolution, minimum-billing increments).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelPriceUnitType',
    @level2type = N'COLUMN', @level2name = 'UnitsPerBillingUnit';
GO

-- The six shipped rows are given their measure and divisor by
-- `metadata/ai-model-price-unit-types`, not by UPDATE statements here. Two of them were already
-- tracked there; the four token/image rows from the v3 baseline are declared in the same file with
-- their baseline IDs so the push updates them in place.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AIPromptRun — record the billable quantity in its own measure
-- ─────────────────────────────────────────────────────────────────────────────

-- UsageTypeID is nullable for the ordering reason in the header, and NULL carries a definite
-- meaning on this table rather than an absent one: token-billed. That is not a convention invented
-- here to paper over the nullability — it is what every row written before this migration IS, since
-- the schema had no way to express any other measure. MJAIPromptRunEntityServer reads NULL as
-- Tokens at exactly one seam (`UsageKind`), so the rest of the runtime still sees a definite
-- measure. When the follow-up migration tightens the column, the accompanying backfill sets those
-- historical rows to the Tokens row explicitly and that seam collapses to a straight lookup.
ALTER TABLE ${flyway:defaultSchema}.AIPromptRun
ADD InputUnitsUsed DECIMAL(19,8) NULL
        CONSTRAINT CK_AIPromptRun_InputUnitsUsed_NonNegative CHECK (InputUnitsUsed >= 0),
    OutputUnitsUsed DECIMAL(19,8) NULL
        CONSTRAINT CK_AIPromptRun_OutputUnitsUsed_NonNegative CHECK (OutputUnitsUsed >= 0),
    UsageTypeID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_AIPromptRun_UsageType FOREIGN KEY REFERENCES ${flyway:defaultSchema}.AIUsageType(ID);
GO


EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quantity of continuous input consumed by this run, expressed in the base measure named by UsageTypeID (e.g. seconds of audio submitted for transcription). NULL for token-billed runs, which use the Tokens* columns instead.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRun',
    @level2type = N'COLUMN', @level2name = 'InputUnitsUsed';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quantity of continuous output produced by this run, expressed in the base measure named by UsageTypeID (e.g. seconds of audio synthesized, or images generated). NULL for token-billed runs.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRun',
    @level2type = N'COLUMN', @level2name = 'OutputUnitsUsed';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The base measure this run''s quantities are counted in. Defaults to Tokens, where the Tokens* columns carry the quantity and the units columns are unused; a continuous-media run sets it to Seconds, Characters or Images and populates InputUnitsUsed / OutputUnitsUsed. Always the base measure, never the billing measure: audio billed per hour is still recorded as Seconds, and the price unit type converts. NULL means token-billed, which is what every row predating this column is; it is read as Tokens at one seam in MJAIPromptRunEntityServer, and becomes NOT NULL in the release after the AI Usage Types seed ships.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRun',
    @level2type = N'COLUMN', @level2name = 'UsageTypeID';
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Demote AIModelPriceType — descriptive only, and stop offering it for edit
-- ─────────────────────────────────────────────────────────────────────────────

/*
    Three vocabularies described one concept, and the MANDATORY one was the one nothing read.

    `AIModelCost.PriceTypeID` is a NOT NULL FK to `MJ: AI Model Price Types` (Tokens, Minutes, Image
    Generation, API Calls). It is editable in the generated Explorer form, exposed over GraphQL, and
    cached on `AIEngineBase.ModelPriceTypes` — and no business logic anywhere prices, filters or
    branches on it. Meanwhile AIModelPriceUnitType carries the real contract. The incoherence is
    visible in this branch's own seed data: the Groq Whisper rows are PriceType = Minutes AND
    UnitType = Per Hour, and the Comments field has to apologise for it.

    Adding AIUsageType without demoting this leaves a fourth vocabulary and locks the ambiguity in
    permanently, so the demotion ships in the same migration as the addition.

    NOT dropped, deliberately. The column is NOT NULL and carried by 235 metadata rows; dropping it
    is on the Forbidden list in packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md and would break every
    historical `EXEC spCreateAIModelCost`. That policy's Deprecation section is the intended path:
    the field stays physically present and functional, and is flagged not-for-new-use.

    The demotion itself — Status, IncludeInGeneratedForm, AutoUpdateDescription and the field's
    description — is declared in `metadata/entities/.ai-model-costs-pricetype-deprecation.json`
    rather than by an EntityField UPDATE here. What remains below is the part that genuinely is
    schema: a database default, so a cost-row author can omit a field they are being told not to
    think about, and the column's own MS_Description.
*/

-- A database default so future cost-row authors can omit a field they are being told not to think
-- about. Without it, every new row must still name a value from the vocabulary just deprecated,
-- which is incoherent enough that people would reasonably ignore the deprecation. Additive, and
-- allowed under the publish policy. 'Tokens' is the AIModelPriceType row every existing token cost
-- row already uses.
DECLARE @PriceTypeTokens UNIQUEIDENTIFIER =
    (SELECT TOP 1 [ID] FROM ${flyway:defaultSchema}.AIModelPriceType WHERE [Name] = 'Tokens');

IF @PriceTypeTokens IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE [name] = 'DF_AIModelCost_PriceTypeID')
BEGIN
    DECLARE @AddDefault NVARCHAR(MAX) = N'
        ALTER TABLE ${flyway:defaultSchema}.AIModelCost
        ADD CONSTRAINT DF_AIModelCost_PriceTypeID
        DEFAULT ''' + CAST(@PriceTypeTokens AS NVARCHAR(36)) + N''' FOR [PriceTypeID];';
    EXEC sp_executesql @AddDefault;
END
GO

-- Drop-then-add rather than sp_updateextendedproperty, which THROWS when the property does not
-- already exist ("Property 'MS_Description' does not exist for ..."). Whether it exists depends on
-- whether CodeGen has ever run against this database: on a mature dev database it has, so the update
-- form works and looks correct; on a clean-room build from migrations alone it has not, and the
-- update form aborts the whole migration. Found by exactly that clean-room build — the same
-- fresh-install-only class as the stored-procedure signature traps above, and as the
-- EntityField.Sequence trap in migrations/CLAUDE.md, which is why that file prescribes this pattern
-- for modifying any existing description.
IF EXISTS (
    SELECT 1 FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.AIModelCost')
      AND minor_id = (
          SELECT column_id FROM sys.columns
          WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIModelCost')
            AND name = 'PriceTypeID'
      )
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = 'AIModelCost',
        @level2type = N'COLUMN', @level2name = 'PriceTypeID';
END
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'DEPRECATED — descriptive only. The authority on what a cost row measures is UnitTypeID -> AIModelPriceUnitType.UsageTypeID. Retained because the column is NOT NULL and referenced by shipped configurations; do not populate it for new cost rows.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelCost',
    @level2type = N'COLUMN', @level2name = 'PriceTypeID';
GO
