-- ============================================================
-- V202605031400__v5.32.x__AIAgent_DelegationOnly (PostgreSQL)
--
-- Adds DelegationOnly column to AIAgent so a parent agent can opt out of the
-- post-sub-agent re-prompt iteration. When set, the agent's run completes
-- immediately after a successful sub-agent invocation — the sub-agent's
-- result becomes the final output without a second LLM call on the parent.
--
-- Default false preserves existing two-iteration behaviour for every existing
-- agent. Opt in only on agents whose sole responsibility is to delegate to
-- one sub-agent (e.g. Query Builder → Query Strategist).
-- ============================================================

ALTER TABLE ${flyway:defaultSchema}."AIAgent"
    ADD COLUMN "DelegationOnly" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ${flyway:defaultSchema}."AIAgent"."DelegationOnly"
    IS 'When true, the agent terminates immediately after a successful sub-agent invocation — skipping the otherwise-required second prompt iteration where the parent re-reads the sub-agent result. Use only for "router" agents whose entire job is to dispatch to one sub-agent and pass its formatted result back unchanged. Default false preserves the two-iteration behaviour for all existing agents.';
