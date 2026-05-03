-- ============================================================
-- V202605031400__v5.32.x__AIAgent_DelegationOnly
--
-- Adds DelegationOnly column to AIAgent so a parent agent can opt out of the
-- post-sub-agent re-prompt iteration. When set, the agent's run completes
-- immediately after a successful sub-agent invocation — the sub-agent's
-- result becomes the final output without a second LLM call on the parent.
--
-- Default 0 preserves existing two-iteration behaviour for every existing
-- agent. Opt in only on agents whose sole responsibility is to delegate to
-- one sub-agent (e.g. Query Builder → Query Strategist).
-- ============================================================

ALTER TABLE ${flyway:defaultSchema}.AIAgent
    ADD DelegationOnly BIT NOT NULL CONSTRAINT DF_AIAgent_DelegationOnly DEFAULT 0;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, the agent terminates immediately after a successful sub-agent invocation — skipping the otherwise-required second prompt iteration where the parent re-reads the sub-agent result. Use only for "router" agents whose entire job is to dispatch to one sub-agent and pass its formatted result back unchanged. Default 0 preserves the two-iteration behaviour for all existing agents.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'DelegationOnly';
GO
