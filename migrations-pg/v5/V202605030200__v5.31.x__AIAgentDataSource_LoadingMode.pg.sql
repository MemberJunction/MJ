-- ============================================================
-- V202605030200__v5.31.x__AIAgentDataSource_LoadingMode (PostgreSQL)
--
-- Adds LoadingMode column to AIAgentDataSource so individual sources can
-- opt in to lazy (on-demand) tool-based fetching instead of being eagerly
-- preloaded into the agent's prompt context by AgentDataPreloader.
--
-- Default 'Eager' preserves existing behaviour for every existing row;
-- consumers must explicitly set 'Lazy' on a source to opt it in.
--
-- Companion package: @memberjunction/ai-agent-lazy-context
-- ============================================================

ALTER TABLE ${flyway:defaultSchema}."AIAgentDataSource"
    ADD COLUMN "LoadingMode" VARCHAR(20) NOT NULL DEFAULT 'Eager'
    CONSTRAINT "CK_AIAgentDataSource_LoadingMode"
    CHECK ("LoadingMode" IN ('Eager', 'Lazy', 'Hybrid'));

COMMENT ON COLUMN ${flyway:defaultSchema}."AIAgentDataSource"."LoadingMode"
    IS 'Loading mode for this data source. Eager (default): preloaded into prompt context by AgentDataPreloader on every agent run. Lazy: exposed as a callable tool the agent invokes on demand via @memberjunction/ai-agent-lazy-context. Hybrid: reserved for future use (small summary preloaded, full data via tool).';
