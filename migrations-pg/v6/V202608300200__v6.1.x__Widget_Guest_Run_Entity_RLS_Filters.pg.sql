-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
--
-- The schema name is emitted UNQUOTED, so PostgreSQL folds it to lowercase. That is deliberate and
-- self-consistent: everything downstream in a converted migration refers to it unquoted too, so
-- both definition and lookup land on the same folded name.
--
-- DOWNSTREAM NOTE for the build engineer: a PostgreSQL database that was populated by an EARLIER
-- converter — one that emitted a quoted, case-preserved name — already holds that mixed-case
-- schema: for a target named MySchema_Name, the quoted "MySchema_Name". Re-converting against
-- that database creates a SECOND, empty schema myschema_name rather than reusing the existing
-- one, because IF NOT EXISTS compares the folded name and finds no match. The repo's own committed
-- migrations-pg files are unaffected (the only quoted CREATE SCHEMAs there are the four pg_dump
-- baselines, which this path does not produce), so this is an open-app / downstream concern, not
-- one for this repo's Flyway history.
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $mj$
DECLARE
  v_WidgetGuestAgentRunsFilterID UUID := '48078109-E006-456D-A877-F254EA447B34';
  v_WidgetGuestAgentRunStepsFilterID UUID := '1E0E85CD-6DAE-4BEC-A543-6EB68DD51BEF';
  v_WidgetGuestPromptRunsFilterID UUID := '269C124C-6FB8-474B-A34E-174D0D341815';
BEGIN
  /*******************************************************************************
  * Security fix (#3855): give the Widget Guest role a WORKING read-scope on each
  * of the three AI run entities.
  *
  * ── The gap ──────────────────────────────────────────────────────────────────
  * V202607061250__v5.45.x__Widget_And_Returning_Visitor_Memory seeded ONE filter,
  * 'Widget Guest: Own Agent Runs' (48078109-E006-456D-A877-F254EA447B34), whose
  * Description claimed it was "Attached to the Widget Guest role's read permission
  * on those three run entities". It was attached to NONE of them — the Widget
  * Guest EntityPermission rows on MJ: AI Agent Runs, MJ: AI Agent Run Steps and
  * MJ: AI Prompt Runs all carried ReadRLSFilterID = NULL. Because a public widget
  * guest authenticates as the shared Anonymous principal, one guest could read
  * another guest's run rows — and MJ: AI Prompt Runs holds the rendered system
  * prompt and the full message history. That is the leak this migration closes.
  *
  * ── Why ONE filter could not have closed it (the ConversationID trap) ─────────
  * MJ appends a filter's FilterText verbatim as a WHERE clause against the
  * entity's BASE VIEW (EntityInfo.GetUserRowLevelSecurityWhereClause →
  * RowLevelSecurityFilterInfo.MarkupFilterText). The seeded text is
  *   ConversationID IN (SELECT ID FROM vwConversations WHERE ExternalID = '...')
  * and its comment asserted "All three carry a ConversationID". Only ONE does:
  *   • AIAgentRun.ConversationID    — EXISTS (nullable UUID).
  *   • AIAgentRunStep              — has NO ConversationID; it reaches its run
  *                                   through AgentRunID.
  *   • AIPromptRun                 — has NO ConversationID, and NO AgentRunID
  *                                   either: that column was dropped by
  *                                   V202607241645__v5.50.x__Break_CodeGen_Cycle_
  *                                   Remove_PromptRun_AgentRunID to break a
  *                                   CodeGen FK cycle.
  * Attaching the single filter to all three permissions would therefore have
  * turned a read leak into a hard failure on two of them — every guest read of
  * Agent Run Steps and Prompt Runs would die with "Invalid column name
  * 'ConversationID'". That is EXACTLY the defect V202607282018__v5.50.x__Fix_UI_
  * Own_AIPromptRuns_RLS_Filter had to repair for the UI role, for the same
  * entity, for the same reason. So: one filter per entity, each with a derivation
  * path the entity can actually express.
  *
  * A separate, independent reason one shared filter is wrong: MJ enforces a
  * same-entity invariant on row filters — BuildSameEntityErrors() in
  * packages/MJCoreEntitiesServer/src/custom/rowFilterValidation.ts rejects any
  * filter whose referrers resolve to more than one entity, with the message
  * "use a separate filter record per entity". A filter shared across the three
  * run entities violates that invariant by construction.
  *
  * ── The three derivations ────────────────────────────────────────────────────
  * A guest's session Conversation is stamped with ExternalID = the opaque
  * per-session id (WidgetSessionService / runtime-widget-transport), which is the
  * same value the signed guest token carries as its scope. Every filter below
  * anchors on that one fact and differs ONLY in how many hops it needs to get
  * from its own entity to that Conversation:
  *
  *   MJ: AI Agent Runs      1 hop  — AIAgentRun.ConversationID → Conversation
  *   MJ: AI Agent Run Steps 2 hops — AIAgentRunStep.AgentRunID → AIAgentRun
  *                                   → Conversation
  *   MJ: AI Prompt Runs     3 hops — AIPromptRun.ID is the TargetLogID of the
  *                                   prompt-type AIAgentRunStep that produced it
  *                                   → AIAgentRun → Conversation
  *
  * The prompt-run derivation is NOT invented here: it is the one prescribed by
  * the AgentRunID-drop migration's own design notes ("the relationship is
  * derivable through AIAgentRunStep.TargetLogID for prompt-type steps") and
  * already used by the UI role's repaired filter. TargetLogID is polymorphic —
  * it holds an ActionExecutionLog.ID for action steps and an AIAgentRun.ID for
  * sub-agent steps — so the StepType = 'Prompt' predicate is load-bearing, not
  * decoration: without it an AIPromptRun.ID could collide with an unrelated log
  * id and widen the guest's visibility. TargetLogID IS NOT NULL keeps NULLs out
  * of the IN-list for the same reason the UI filter does.
  *
  * Standalone prompt runs — those not produced by any agent-run step — match no
  * TargetLogID and so are invisible to guests. That is correct: they are
  * admin/system-triggered and never belong to a guest session.
  *
  * ── Injection safety (preserved from the original seed, deliberately) ─────────
  * {{ScopeResourceID}} resolves to the base64url per-session id ([A-Za-z0-9_-]
  * only — no quote or escape characters), so substituting it into a single-quoted
  * literal cannot break out of the literal. Substitution happens in
  * RowLevelSecurityFilterInfo.MarkupFilterText, which additionally doubles any
  * embedded quote. An ABSENT scope resolves to '' rather than being left
  * unresolved, so every filter here degrades to a predicate matching NO rows —
  * fail-closed. Each filter below keeps that property: the token appears exactly
  * once, inside a quoted equality against Conversation.ExternalID, never in a
  * negation or LIKE where '' would match everything.
  *
  * ── Scope of this migration ──────────────────────────────────────────────────
  * This migration seeds/repairs the three FILTER rows only. The
  * EntityPermission → filter LINK ships declaratively in
  * metadata/entity-permissions/.entity-permissions.json via v_lookup by Name,
  * because creating a RowLevelSecurityFilter row is denied to the System user
  * MetadataSync runs as — the same SQL-seed + metadata-link split the original
  * Widget Guest work used (see that migration's §5 comment). The permission rows
  * are therefore NOT touched here.
  *
  * Re-runnable: MERGE on fixed UUIDs, so re-applying it converges rather than
  * duplicating. The MERGE also rewrites the existing 48078109 row's Description,
  * which was factually false — a lying description is how this gap survived a
  * security review. Its FilterText is unchanged (it was always correct for
  * MJ: AI Agent Runs; it was only ever wrong as a THREE-entity claim).
  ******************************************************************************/
  MERGE INTO __mj."RowLevelSecurityFilter" AS tgt
  USING (VALUES
  -- MJ: AI Agent Runs — 1 hop. AIAgentRun.ConversationID exists, so the guest
  -- session Conversation (ExternalID = session scope) is reachable directly.
  (v_WidgetGuestAgentRunsFilterID, 'Widget Guest: Own Agent Runs',
  'Isolates a public web-widget guest to the MJ: AI Agent Runs of its OWN session. A guest''s session Conversation is stamped with ExternalID = the opaque per-session scope ({{ScopeResourceID}}) carried on the signed guest token, and AIAgentRun.ConversationID points at it directly — a one-hop derivation. Attached to the Widget Guest role''s read permission on MJ: AI Agent Runs ONLY: the sibling run entities cannot express this predicate (neither AIAgentRunStep nor AIPromptRun has a ConversationID column) and use their own filters — "Widget Guest: Own Agent Run Steps" and "Widget Guest: Own Prompt Runs". Guests share the Anonymous principal, so without this filter one guest reads another''s runs (#3855). The text path runs the agent under a trusted server principal (no guest run writes); the voice path still writes runs under the guest, and this filter scopes their reads.',
  'ConversationID IN (SELECT ID FROM __mj.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')'),
  -- MJ: AI Agent Run Steps — 2 hops. No ConversationID on AIAgentRunStep; it
  -- reaches the guest session Conversation through its parent run. Same nested
  -- shape as the shipped "Widget Guest: Own Agent Session Channels" filter.
  (v_WidgetGuestAgentRunStepsFilterID, 'Widget Guest: Own Agent Run Steps',
  'Isolates a public web-widget guest to the MJ: AI Agent Run Steps of its OWN session. AIAgentRunStep has NO ConversationID column, so it cannot use the one-hop predicate its parent entity uses; it scopes through AIAgentRunStep.AgentRunID to the agent runs whose Conversation carries ExternalID = the per-session scope ({{ScopeResourceID}}) on the signed guest token. Attached to the Widget Guest role''s read permission on MJ: AI Agent Run Steps. Exists as its own record rather than sharing the agent-run filter both because the column set differs and because MJ enforces a same-entity invariant on row filters (BuildSameEntityErrors in rowFilterValidation.ts): one filter record per entity.',
  'AgentRunID IN (SELECT ID FROM __mj.vwAIAgentRuns WHERE ConversationID IN (SELECT ID FROM __mj.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}''))'),
  -- MJ: AI Prompt Runs — 3 hops, and the highest-value target of the three:
  -- these rows hold the rendered system prompt and message history. AIPromptRun
  -- has neither ConversationID nor AgentRunID (dropped by V202607241645), so it
  -- is reached the only way that remains — as the TargetLogID of a prompt-type
  -- agent-run step. Derivation copied from the repaired UI-role filter
  -- (V202607282018), not invented here.
  (v_WidgetGuestPromptRunsFilterID, 'Widget Guest: Own Prompt Runs',
  'Isolates a public web-widget guest to the MJ: AI Prompt Runs of its OWN session — the most sensitive of the three run entities, since a prompt run holds the rendered system prompt and message history. AIPromptRun has NO ConversationID and NO AgentRunID (that column was dropped by V202607241645 to break a CodeGen FK cycle), so the run is reached as the TargetLogID of the prompt-type AIAgentRunStep that produced it, then up through AIAgentRun to the Conversation whose ExternalID equals the per-session scope ({{ScopeResourceID}}) on the signed guest token. StepType = ''Prompt'' is load-bearing: TargetLogID is polymorphic (ActionExecutionLog.ID for action steps, AIAgentRun.ID for sub-agent steps). Standalone prompt runs match no TargetLogID and stay invisible to guests, which is correct — they are admin/system triggered. Attached to the Widget Guest role''s read permission on MJ: AI Prompt Runs.',
  'ID IN (SELECT TargetLogID FROM __mj.vwAIAgentRunSteps WHERE StepType = ''Prompt'' AND TargetLogID IS NOT NULL AND AgentRunID IN (SELECT ID FROM __mj.vwAIAgentRuns WHERE ConversationID IN (SELECT ID FROM __mj.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')))')
  ) AS src ("ID", "Name", "Description", "FilterText")
  ON tgt."ID" = src."ID"
  WHEN MATCHED THEN UPDATE
  SET "Name" = src."Name", "Description" = src."Description", "FilterText" = src."FilterText"
  WHEN NOT MATCHED THEN INSERT ("ID", "Name", "Description", "FilterText")
  VALUES (src."ID", src."Name", src."Description", src."FilterText");
END $mj$;
