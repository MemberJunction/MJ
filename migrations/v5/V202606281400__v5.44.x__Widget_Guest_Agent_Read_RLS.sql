-- ============================================================================
-- Widget Guest — Read the widget-pinned agent(s)  [DEMO-GRADE]
-- ============================================================================
-- The widget's client-side ConversationsRuntime resolves the pinned agent from
-- AIEngineBase, which loads MJ: AI Agents via GraphQL under the guest. Without read
-- access the guest's agent cache is empty and DefaultAgentResolver cannot find the
-- pinned agent (Sage), so a text/voice turn fails with "could not resolve a default
-- conversation manager agent".
--
-- This filter limits a Widget Guest to ONLY the agents that are pinned to an ACTIVE
-- widget instance — i.e. the agents you have deliberately exposed publicly — so the
-- guest never sees your internal agent roster. It is a static subquery (no token
-- needed) and is attached to the Widget Guest role's READ permission on AI Agents.
--
-- NOTE (hardening debt): the broader "guest agent execution" surface (AI Agent Runs /
-- Run Steps / Prompt Runs writes) is granted UNSCOPED for the demo. See DEPLOYMENT.md
-- §8 — production should either RLS-scope those run entities or move agent execution to
-- a privileged server-side widget dispatch so the guest never writes them directly.
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RowLevelSecurityFilter WHERE ID = 'D3A9E2C4-5F6B-4C7D-AE8F-9A0B1C2D3E4F')
    INSERT INTO ${flyway:defaultSchema}.RowLevelSecurityFilter (ID, Name, FilterText, Description)
    VALUES (
        'D3A9E2C4-5F6B-4C7D-AE8F-9A0B1C2D3E4F',
        'Widget Guest: Widget-Pinned Agents',
        'ID IN (SELECT PinnedAgentID FROM ${flyway:defaultSchema}.vwWidgetInstances WHERE Status = ''Active'' AND PinnedAgentID IS NOT NULL)',
        'Restricts a public web-widget guest to reading ONLY the agents pinned to an active widget instance (the agents intentionally exposed to the public), never the full internal agent roster. Attached to the Widget Guest role''s read permission on MJ: AI Agents so the client-side ConversationsRuntime can resolve the pinned agent without exposing other agents.'
    );
