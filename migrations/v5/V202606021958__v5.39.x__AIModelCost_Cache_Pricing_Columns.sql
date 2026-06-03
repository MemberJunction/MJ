-- Add optional prompt-cache pricing to AIModelCost so cache reads/writes can be billed at their
-- own (usually much cheaper) per-unit rates instead of the full input rate. These mirror the
-- existing InputPricePerUnit/OutputPricePerUnit and are interpreted under the SAME UnitTypeID
-- (e.g. per-1M-tokens) as the row they belong to.
--
-- Both columns are NULLABLE on purpose: NULL means "this vendor/model has no distinct cache rate
-- recorded," and the cost calculator falls back to InputPricePerUnit for that bucket. That keeps
-- existing rows behaving exactly as they do today until cache rates are populated.
--
--   CacheReadPricePerUnit  -> price per unit for input tokens served FROM the provider's cache
--                             (cache hits). Typically ~0.1x input (Anthropic/Gemini) or ~0.5x (OpenAI).
--   CacheWritePricePerUnit -> price per unit for input tokens WRITTEN to the provider's cache
--                             (cache creation). Anthropic bills this (~1.25x input); OpenAI/Gemini
--                             generally do not, so leave NULL (falls back to input rate, but
--                             TokensCacheWrite is 0 for those providers so there is no effect).
--
-- NOTE: The hand-written DDL + extended properties are below. The CodeGen-generated metadata
-- (EntityField records for these columns) is appended after the whitespace below, per MJ convention.

ALTER TABLE ${flyway:defaultSchema}.AIModelCost ADD
    CacheReadPricePerUnit  DECIMAL(18,8) NULL,
    CacheWritePricePerUnit DECIMAL(18,8) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional price per unit for input tokens served from the AI provider''s prompt cache (cache reads / hits), expressed in the same currency and UnitType (e.g. per 1M tokens) as InputPricePerUnit. When NULL, cache-read tokens are priced at InputPricePerUnit. Cache reads are usually far cheaper than uncached input (e.g. ~0.1x for Anthropic/Gemini, ~0.5x for OpenAI).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'CacheReadPricePerUnit';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional price per unit for input tokens written to the AI provider''s prompt cache (cache writes / creation), expressed in the same currency and UnitType as InputPricePerUnit. When NULL, cache-write tokens are priced at InputPricePerUnit. Populated for providers that bill cache creation separately (e.g. Anthropic, ~1.25x input); leave NULL for providers that do not (OpenAI, Gemini), which also report 0 cache-write tokens.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'CacheWritePricePerUnit';


-- ---------------------------------------------------------------------------------------------
-- Prompt-cache token ROLLUP columns
-- ---------------------------------------------------------------------------------------------
-- AIPromptRun already records TokensCacheRead/TokensCacheWrite (this run's own provider cache
-- usage). These add the hierarchical ROLLUP counterparts, mirroring TokensUsedRollup/
-- TokensPromptRollup: for a leaf run they equal the run's own value; for a consolidated parent
-- (parallel / multi-attempt / failover) they SUM the attempts, so cache tokens are not
-- under-counted when one logical prompt fans out into several provider calls.
--
-- AIAgentRun gains TotalCacheReadTokensUsed/TotalCacheWriteTokensUsed, the agent-level totals
-- summed from child prompt runs' rollups + sub-agent runs' totals — the cache counterparts of the
-- existing TotalPromptTokensUsed/TotalCompletionTokensUsed, so agent-run analytics can report cache
-- usage and savings without walking the prompt-run hierarchy at query time.

ALTER TABLE ${flyway:defaultSchema}.AIPromptRun ADD
    TokensCacheReadRollup  INT NULL,
    TokensCacheWriteRollup INT NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Rollup of TokensCacheRead across this prompt run and all of its descendant prompt runs (e.g. the individual attempts behind a parallel / multi-attempt / failover consolidation). For a leaf run this equals TokensCacheRead. Use this (not TokensCacheRead) when aggregating cache reads up a prompt-run or agent-run hierarchy so fan-out provider calls are not under-counted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPromptRun',
    @level2type = N'COLUMN', @level2name = N'TokensCacheReadRollup';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Rollup of TokensCacheWrite across this prompt run and all of its descendant prompt runs. For a leaf run this equals TokensCacheWrite. Mirrors TokensUsedRollup/TokensPromptRollup; populated for providers that report cache writes (e.g. Anthropic), otherwise 0 or NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPromptRun',
    @level2type = N'COLUMN', @level2name = N'TokensCacheWriteRollup';

ALTER TABLE ${flyway:defaultSchema}.AIAgentRun ADD
    TotalCacheReadTokensUsed  INT NULL,
    TotalCacheWriteTokensUsed INT NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total input tokens served from the AI provider''s prompt cache (cache reads / hits) across this agent run, summed from child prompt runs'' TokensCacheReadRollup and sub-agent runs'' TotalCacheReadTokensUsed. Counts only; the cost impact (cache reads are billed at a steep discount) is reflected in TotalCost. The cache counterpart of TotalPromptTokensUsed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'TotalCacheReadTokensUsed';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total input tokens written to the AI provider''s prompt cache (cache writes / creation) across this agent run, summed from child prompt runs'' TokensCacheWriteRollup and sub-agent runs'' TotalCacheWriteTokensUsed. Populated for providers that bill cache creation (e.g. Anthropic); 0 or NULL otherwise. The cache counterpart of TotalCompletionTokensUsed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'TotalCacheWriteTokensUsed';
