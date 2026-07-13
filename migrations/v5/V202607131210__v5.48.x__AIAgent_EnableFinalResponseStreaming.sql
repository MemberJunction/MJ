-- Add per-agent opt-in for final-response streaming. When enabled, the agent
-- framework extracts the user-facing reply from the agent type's raw prompt
-- stream (e.g. a Loop agent's envelope `message`) and re-emits it as
-- kind:'final-response' deltas, which the conversation client renders live.
-- Default OFF: no agent streams until a developer explicitly enables it —
-- mirrors the AllowMemoryWrite / SupportsPlanMode capability-gate pattern.

ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    EnableFinalResponseStreaming BIT NOT NULL DEFAULT 0;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When enabled, the agent framework extracts this agent''s user-facing final reply from its raw prompt stream (via the agent type''s final-response stream extractor, e.g. the Loop envelope''s root-level message on a taskComplete turn) and re-emits it as kind=''final-response'' deltas so the conversation client renders the reply live as it is generated. Off by default: raw stream chunks still flow for observability, but nothing is rendered into the chat bubble. Applies to root-agent runs only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'EnableFinalResponseStreaming';
