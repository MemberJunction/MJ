-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609122036__v6.1.x__Native_Tool_Calling.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."AIPrompt"
ADD COLUMN "PromptConfiguration" TEXT NULL /*
    Native tool calling — schema for the whole feature.

    Four groups of purely additive changes. No drops, no data changes, no backfill.

        1. The per-prompt configuration cascade  — AIPrompt / AIPromptModel  .PromptConfiguration
        2. Prompt-run instrumentation           — AIPromptRun                .ToolCallingMode
        3. Agent-step instrumentation           — AIAgentRunStep             .ToolCallingMode, .NativeToolCallCount,
                                                                              .NativeDualChannel, .NativeToolResultsSent
        4. Declaration control                  — AIAgent                    .DeclareActionsAsNativeTools
                                                  AIAgentAction              .DeclareAsNativeTool

    ─────────────────────────────────────────────────────────────────────────────────────────────
    1. WHY A JSON BAG FOR PROMPT CONFIGURATION

    `PromptConfiguration` is ONE nullable JSON column at BOTH levels of the prompt stack, forming an
    inherit-with-override cascade that layers ON TOP of the resolved model-catalog configuration:

        AIPrompt.PromptConfiguration           (per-prompt)
          <  AIPromptModel.PromptConfiguration (per prompt-on-this-model — the winner)

    This mirrors the `ModelConfiguration` cascade already carried by AIModelType / AIModel /
    AIModelVendor (migration V202608081622), and answers the open question the native-tool-calling
    plan left for team review: whether prompt-level opt-in should be bit columns or a JSON bag. It
    is a bag. `AIPrompt` already carries fifty-odd columns, so the same anti-widening argument that
    produced `ModelConfiguration` applies here with more force — and a JSON bag lets the shape keep
    adapting without a migration per knob. A knob graduates to a real column when it needs a foreign
    key or becomes a first-class thing the platform reasons about.

    WHY NOT plain `Configuration`: `AIPromptModel` already has a `ConfigurationID` FK to
    `MJ: AI Configurations`, and CodeGen's view emits that FK's display column as `Configuration` —
    so a base-table column of that name makes `vwAIPromptModels` fail to build with "Column name
    'Configuration' ... is specified more than once". `PromptConfiguration` is collision-free on both
    tables and reads consistently beside the catalog's `ModelConfiguration`.

    Both columns are JSONType fields sharing ONE source of truth with the model catalog:
    `metadata/entities/JSONType-interfaces/IAIConfiguration.ts` defines the per-modality section
    types (LLMConfigurationSettings, RealtimeConfigurationSettings, …) once, plus a per-table outer
    type for each column — IAIModelConfiguration, IAIPromptConfiguration, IAIPromptModelConfiguration.
    That one file is pushed into `EntityField.JSONTypeDefinition` for all five fields (see the bridge
    records in `metadata/entities/.entity-field-jsontype-ai-configuration.json`), and CodeGen emits a
    strongly-typed `PromptConfigurationObject` accessor on the two generated prompt entities.

    First consumer: native tool calling. The prompt runner reads `LLM.UseNativeToolCalling` from this
    cascade and resolves it against the catalog's `LLM.SupportsNativeToolCalling` (capability) and
    `LLM.DefaultToNativeToolCalling` (policy).

    Boundary rule (documented on the interface): anything the engine filters/sorts/joins on stays a
    COLUMN; anything a driver or runner consumes at call time belongs in this bag.

    ─────────────────────────────────────────────────────────────────────────────────────────────
    2/3. WHY THE INSTRUMENTATION IS COLUMNS AND NOT THE BAG

    Same boundary rule, read the other way. These exist to be GROUPed BY across thousands of runs —
    comparing malformed-response rates, iteration counts and token usage between the paths (plan §10,
    phase 3). SQL cannot cheaply predicate into a JSON bag, so a knob whose entire purpose is
    aggregate analysis is exactly the case that stays a column.

    Cheap now, very expensive to retrofit: without them, no run recorded before the flag existed can
    ever be attributed to a path, and a comparison of the two paths has no data to run on.

    The prompt-run column answers "which path did this inference take". The step columns answer
    "which path did this agent STEP take, and how much did the model actually use it" — the grain
    a comparison runs at, because what matters is an agent's behaviour across a loop, not a
    single inference.

    WHY NOT JUST JOIN STEPS TO AIPromptRun: `AIAgentRunStep.TargetLogID` does reach the prompt run,
    so the mode is *derivable* today — but only for steps whose target is a prompt run, and only by a
    join that silently returns nothing for every other step type. `NativeToolCallCount` is not
    derivable at all: the count lives in the provider response, which is not persisted per step. A
    comparison that has to reconstruct its independent variable through a lossy join is one nobody
    re-runs.

    The `ToolCallingMode` value list is enforced by CHECK constraints, which are the source of truth
    CodeGen derives `EntityFieldValue` rows and the generated TypeScript union from:

        'Envelope'       — no tools declared. The default vendor-agnostic JSON-envelope path, and
                           also the "wanted native but the model/vendor does not support it" case,
                           which additionally logs a warning so a misconfiguration is visible.
        'Native'         — Actions declared as tools; control flow stays in the JSON envelope (the hybrid).
        'NativeImplicit' — Actions, sub-agents, payload_change_request and ask_user declared as tools;
                           a tool call continues the loop, plain text ends the turn.
        'NativeFallback' — a native attempt failed in a tools-specific way and the run completed via
                           a single envelope retry.

    NULL on any of these = a step/run that never reached a model call, or a row predating the feature.

    ─────────────────────────────────────────────────────────────────────────────────────────────
    4. WHY DECLARATION NEEDS ITS OWN SWITCHES

    BaseAgent declares EVERY effective Action as a native tool, and the only switch reaching an agent
    was the Loop agent-type system prompt's preference — shared by all 27 Loop agents. Measurement
    put a number on the cost: the Research Agent's prompt says it never does work itself, yet once its one
    action (Scoped Search) was declared as a tool, GPT 5.6-luna used it on 7 of 9 turns (0 of 9 in
    the envelope arm). Declaration turned a dormant capability into an active one, and no prompt text
    can undo that because the prompt already says never.

    Both columns default to 1, so nothing changes for existing agents. Both control SUPPLY (whether
    tools go on the request), not the runner's gate: capability and preference still decide whether
    supplied tools are used. In native mode the prose action catalog is dropped, so an undeclared
    action is unreachable on that turn — accepted by design.
*/ /* ════════════════════════════════════════════════════════════════════════════════════ */ /* 1. The per-prompt configuration cascade */ /* ════════════════════════════════════════════════════════════════════════════════════ */;

ALTER TABLE __mj."AIPromptModel"
ADD COLUMN "PromptConfiguration" TEXT NULL;

COMMENT ON COLUMN __mj."AIPrompt"."PromptConfiguration" IS 'Per-prompt call-time configuration bag (JSON, IAIPromptConfiguration shape: LLM / Realtime / Vision / Audio sections). Base layer of the prompt Configuration cascade — AIPromptModel rows inherit from it per key and may override — and itself layered on top of the resolved AIModel/AIModelVendor ModelConfiguration. NULL = contributes nothing.';

COMMENT ON COLUMN __mj."AIPromptModel"."PromptConfiguration" IS 'Most-specific layer of the prompt configuration bag (JSON, IAIPromptModelConfiguration shape) — configuration for THIS prompt on THIS model. Deep-merges per key over the AIPrompt layer, which in turn sits above the model-catalog ModelConfiguration cascade. NULL = inherit the merged configuration unchanged.';

ALTER TABLE __mj."AIPromptRun"
ADD COLUMN "ToolCallingMode" VARCHAR(25) NULL /* ════════════════════════════════════════════════════════════════════════════════════ */ /* 2. Prompt-run instrumentation */ /* ════════════════════════════════════════════════════════════════════════════════════ */;

ALTER TABLE __mj."AIPromptRun"
  ADD CONSTRAINT "CK_AIPromptRun_ToolCallingMode" CHECK ("ToolCallingMode" IN ('Native', 'Envelope', 'NativeFallback', 'NativeImplicit'));

COMMENT ON COLUMN __mj."AIPromptRun"."ToolCallingMode" IS 'Which tool-calling path this run actually took. ''Native'' = Actions declared as tools, control flow in the JSON envelope (the hybrid). ''NativeImplicit'' = Actions, sub-agents, payload_change_request and ask_user declared as tools; a tool call continues the loop and plain text ends the turn. ''Envelope'' = no tools declared — the vendor-agnostic JSON-envelope path, including a prompt that asked for native mode on a model/vendor without the capability (also logs a warning). ''NativeFallback'' = a native attempt failed in a tools-specific way and completed via a single envelope retry. NULL = pre-feature rows or a run that never reached a model call.';

ALTER TABLE __mj."AIAgentRunStep"
ADD COLUMN "ToolCallingMode" VARCHAR(25) NULL /* ════════════════════════════════════════════════════════════════════════════════════ */ /* 3. Agent-step instrumentation */ /* ════════════════════════════════════════════════════════════════════════════════════ */;

ALTER TABLE __mj."AIAgentRunStep"
  ADD CONSTRAINT "CK_AIAgentRunStep_ToolCallingMode" CHECK ("ToolCallingMode" IN ('Native', 'Envelope', 'NativeFallback', 'NativeImplicit'));

ALTER TABLE __mj."AIAgentRunStep"
ADD COLUMN "NativeToolCallCount" INT NULL;

ALTER TABLE __mj."AIAgentRunStep"
  ADD CONSTRAINT "CK_AIAgentRunStep_NativeToolCallCount" CHECK ("NativeToolCallCount" IS NULL OR "NativeToolCallCount" >= 0);

ALTER TABLE __mj."AIAgentRunStep"
ADD COLUMN "NativeDualChannel" BOOLEAN NULL;

ALTER TABLE __mj."AIAgentRunStep"
ADD COLUMN "NativeToolResultsSent" BOOLEAN NULL;

COMMENT ON COLUMN __mj."AIAgentRunStep"."ToolCallingMode" IS 'Which tool-calling path this step''s model call took: Native (Actions as tools, envelope control flow), NativeImplicit (Actions, sub-agents, payload changes and ask_user as tools; plain text ends the turn), Envelope (prose action catalog + JSON envelope), or NativeFallback (a native attempt failed in a tools-specific way and completed via an envelope retry). NULL for steps that never reached a model call, and for rows predating the feature.';

COMMENT ON COLUMN __mj."AIAgentRunStep"."NativeToolCallCount" IS 'How many native tool calls the model made on this step. 0 on a native-mode step where the model chose to answer with the envelope instead; NULL when the step took the envelope path or never reached a model call.';

COMMENT ON COLUMN __mj."AIAgentRunStep"."NativeDualChannel" IS 'On a native-mode step where the model made tool calls: 1 when the same turn also carried a parseable JSON Loop envelope (the model answered on both channels; the loop dispatched the tool call and discarded the envelope), 0 when the tool calls came alone. NULL when the step made no tool calls or took the envelope path.';

COMMENT ON COLUMN __mj."AIAgentRunStep"."NativeToolResultsSent" IS 'For native tool-calling steps: 1 = the results of this step''s tool calls were returned to the model as native tool-result turns, 0 = as the markdown action-results user message. NULL for envelope steps and for rows predating the feature.';

ALTER TABLE __mj."AIAgent"
ADD COLUMN "DeclareActionsAsNativeTools" BOOLEAN NOT NULL DEFAULT TRUE /* ════════════════════════════════════════════════════════════════════════════════════ */ /* 4. Native tool DECLARATION control */ /* ════════════════════════════════════════════════════════════════════════════════════ */;

ALTER TABLE __mj."AIAgentAction"
ADD COLUMN "DeclareAsNativeTool" BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN __mj."AIAgent"."DeclareActionsAsNativeTools" IS 'When native tool calling is in effect for a run, whether this agent''s Actions are declared as native tools (1, default) or withheld so the agent runs on the envelope path with the prose action catalog (0). Set 0 for coordinator agents whose prompt forbids doing work themselves. Controls supply only: capability and preference on the model and prompt still decide whether declared tools are used.';

COMMENT ON COLUMN __mj."AIAgentAction"."DeclareAsNativeTool" IS 'Whether this Action may be declared as a native tool for this agent (1, default). 0 keeps it out of the tool set on native turns; because the prose catalog is not rendered in native mode, the action is then unavailable on those turns. Use for actions an agent holds but should rarely reach for on its own.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '99ad0015-7ed6-4109-b853-87580b1cf904' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'DeclareActionsAsNativeTools')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('99ad0015-7ed6-4109-b853-87580b1cf904', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' /* Entity: MJ: AI Agents */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1'), 'DeclareActionsAsNativeTools', 'Declare Actions As Native Tools', 'When native tool calling is in effect for a run, whether this agent''s Actions are declared as native tools (1, default) or withheld so the agent runs on the envelope path with the prose action catalog (0). Set 0 for coordinator agents whose prompt forbids doing work themselves. Controls supply only: capability and preference on the model and prompt still decide whether declared tools are used.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '89540107-976d-4038-a90e-e7b042b88f49' OR ("EntityID" = 'AD4D32AE-6848-41A0-A966-2A1F8B751251' AND "Name" = 'PromptConfiguration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('89540107-976d-4038-a90e-e7b042b88f49', 'AD4D32AE-6848-41A0-A966-2A1F8B751251' /* Entity: MJ: AI Prompt Models */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'AD4D32AE-6848-41A0-A966-2A1F8B751251'), 'PromptConfiguration', 'Prompt Configuration', 'Most-specific layer of the prompt configuration bag (JSON, IAIPromptModelConfiguration shape) — configuration for THIS prompt on THIS model. Deep-merges per key over the AIPrompt layer, which in turn sits above the model-catalog ModelConfiguration cascade. NULL = inherit the merged configuration unchanged.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7418bacd-becf-4fd8-8d8d-d3db76512da0' OR ("EntityID" = '196B0316-6078-47A4-94B9-44A2FC5E8A55' AND "Name" = 'DeclareAsNativeTool')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7418bacd-becf-4fd8-8d8d-d3db76512da0', '196B0316-6078-47A4-94B9-44A2FC5E8A55' /* Entity: MJ: AI Agent Actions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '196B0316-6078-47A4-94B9-44A2FC5E8A55'), 'DeclareAsNativeTool', 'Declare As Native Tool', 'Whether this Action may be declared as a native tool for this agent (1, default). 0 keeps it out of the tool set on native turns; because the prose catalog is not rendered in native mode, the action is then unavailable on those turns. Use for actions an agent holds but should rarely reach for on its own.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1ce02273-9936-42d6-8577-9bed9bd99922' OR ("EntityID" = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND "Name" = 'PromptConfiguration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1ce02273-9936-42d6-8577-9bed9bd99922', '73AD0238-8B56-EF11-991A-6045BDEBA539' /* Entity: MJ: AI Prompts */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '73AD0238-8B56-EF11-991A-6045BDEBA539'), 'PromptConfiguration', 'Prompt Configuration', 'Per-prompt call-time configuration bag (JSON, IAIPromptConfiguration shape: LLM / Realtime / Vision / Audio sections). Base layer of the prompt Configuration cascade — AIPromptModel rows inherit from it per key and may override — and itself layered on top of the resolved AIModel/AIModelVendor ModelConfiguration. NULL = contributes nothing.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b666547f-6075-421f-b337-0123c5a15fb1' OR ("EntityID" = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND "Name" = 'ToolCallingMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b666547f-6075-421f-b337-0123c5a15fb1', '7C1C98D0-3978-4CE8-8E3F-C90301E59767' /* Entity: MJ: AI Prompt Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7C1C98D0-3978-4CE8-8E3F-C90301E59767'), 'ToolCallingMode', 'Tool Calling Mode', 'Which tool-calling path this run actually took. ''Native'' = Actions declared as tools, control flow in the JSON envelope (the hybrid). ''NativeImplicit'' = Actions, sub-agents, payload_change_request and ask_user declared as tools; a tool call continues the loop and plain text ends the turn. ''Envelope'' = no tools declared — the vendor-agnostic JSON-envelope path, including a prompt that asked for native mode on a model/vendor without the capability (also logs a warning). ''NativeFallback'' = a native attempt failed in a tools-specific way and completed via a single envelope retry. NULL = pre-feature rows or a run that never reached a model call.', 'nvarchar', 50, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bdf051de-9abf-41dd-9734-8fb9a12f7836' OR ("EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND "Name" = 'ToolCallingMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bdf051de-9abf-41dd-9734-8fb9a12f7836', '99273DAD-560E-4ABC-8332-C97AB58B7463' /* Entity: MJ: AI Agent Run Steps */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463'), 'ToolCallingMode', 'Tool Calling Mode', 'Which tool-calling path this step''s model call took: Native (Actions as tools, envelope control flow), NativeImplicit (Actions, sub-agents, payload changes and ask_user as tools; plain text ends the turn), Envelope (prose action catalog + JSON envelope), or NativeFallback (a native attempt failed in a tools-specific way and completed via an envelope retry). NULL for steps that never reached a model call, and for rows predating the feature.', 'nvarchar', 50, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6c2142c1-e36c-4c94-ad23-78237fd6397a' OR ("EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND "Name" = 'NativeToolCallCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6c2142c1-e36c-4c94-ad23-78237fd6397a', '99273DAD-560E-4ABC-8332-C97AB58B7463' /* Entity: MJ: AI Agent Run Steps */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463'), 'NativeToolCallCount', 'Native Tool Call Count', 'How many native tool calls the model made on this step. 0 on a native-mode step where the model chose to answer with the envelope instead; NULL when the step took the envelope path or never reached a model call.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d1ebea3-6390-45ed-a40e-abe859ea362a' OR ("EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND "Name" = 'NativeDualChannel')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4d1ebea3-6390-45ed-a40e-abe859ea362a', '99273DAD-560E-4ABC-8332-C97AB58B7463' /* Entity: MJ: AI Agent Run Steps */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463'), 'NativeDualChannel', 'Native Dual Channel', 'On a native-mode step where the model made tool calls: 1 when the same turn also carried a parseable JSON Loop envelope (the model answered on both channels; the loop dispatched the tool call and discarded the envelope), 0 when the tool calls came alone. NULL when the step made no tool calls or took the envelope path.', 'bit', 1, 1, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a24c37f5-abf0-4ed6-9827-67566782d577' OR ("EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND "Name" = 'NativeToolResultsSent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a24c37f5-abf0-4ed6-9827-67566782d577', '99273DAD-560E-4ABC-8332-C97AB58B7463' /* Entity: MJ: AI Agent Run Steps */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '99273DAD-560E-4ABC-8332-C97AB58B7463'), 'NativeToolResultsSent', 'Native Tool Results Sent', 'For native tool-calling steps: 1 = the results of this step''s tool calls were returned to the model as native tool-result turns, 0 = as the markdown action-results user message. NULL for envelope steps and for rows predating the feature.', 'bit', 1, 1, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 1ddeebe2-b52f-46e1-b6f3-f9a991432592 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1ddeebe2-b52f-46e1-b6f3-f9a991432592',
    'B666547F-6075-421F-B337-0123C5A15FB1',
    1,
    'Envelope',
    'Envelope',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ca261c55-f96a-4afc-8a77-374bb2f23427 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ca261c55-f96a-4afc-8a77-374bb2f23427',
    'B666547F-6075-421F-B337-0123C5A15FB1',
    2,
    'Native',
    'Native',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 7f0fec1a-62c3-4683-b8a0-3cb48cb0cdb5 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7f0fec1a-62c3-4683-b8a0-3cb48cb0cdb5',
    'B666547F-6075-421F-B337-0123C5A15FB1',
    3,
    'NativeFallback',
    'NativeFallback',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID e31819f8-5d59-49d3-837f-13ecc8b3eaad */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e31819f8-5d59-49d3-837f-13ecc8b3eaad',
    'B666547F-6075-421F-B337-0123C5A15FB1',
    4,
    'NativeImplicit',
    'NativeImplicit',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID B666547F-6075-421F-B337-0123C5A15FB1 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'B666547F-6075-421F-B337-0123C5A15FB1';
/* SQL text to insert entity field value with ID d211cd46-4fa3-4908-aea5-129765dca18f */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd211cd46-4fa3-4908-aea5-129765dca18f',
    'BDF051DE-9ABF-41DD-9734-8FB9A12F7836',
    1,
    'Envelope',
    'Envelope',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a6642ec3-4e50-4137-bbd7-a841e64e81b7 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a6642ec3-4e50-4137-bbd7-a841e64e81b7',
    'BDF051DE-9ABF-41DD-9734-8FB9A12F7836',
    2,
    'Native',
    'Native',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c7175cdc-be95-409a-9a61-541b63c72008 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c7175cdc-be95-409a-9a61-541b63c72008',
    'BDF051DE-9ABF-41DD-9734-8FB9A12F7836',
    3,
    'NativeFallback',
    'NativeFallback',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID d023ec8f-5d65-443a-8dbb-ca0032003aa7 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd023ec8f-5d65-443a-8dbb-ca0032003aa7',
    'BDF051DE-9ABF-41DD-9734-8FB9A12F7836',
    4,
    'NativeImplicit',
    'NativeImplicit',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID BDF051DE-9ABF-41DD-9734-8FB9A12F7836 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'BDF051DE-9ABF-41DD-9734-8FB9A12F7836';

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '7418BACD-BECF-4FD8-8D8D-D3DB76512DA0'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 1 fields */
/* UPDATE Entity Field Category Info MJ: AI Agent Actions.DeclareAsNativeTool */
UPDATE __mj."EntityField" SET "Category" = 'Execution Constraints', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7418BACD-BECF-4FD8-8D8D-D3DB76512DA0';

/* Set categories for 1 fields */
/* UPDATE Entity Field Category Info MJ: AI Prompts.PromptConfiguration */
UPDATE __mj."EntityField" SET "Category" = 'Model Selection & Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '1CE02273-9936-42D6-8577-9BED9BD99922';

/* Set categories for 2 fields */
/* UPDATE Entity Field Category Info MJ: AI Prompt Models.EffortLevel */
UPDATE __mj."EntityField" SET "Category" = 'Execution & Parallel Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9D5AD02E-FEAE-4B1A-A5FC-68A198A73B27';
/* UPDATE Entity Field Category Info MJ: AI Prompt Models.PromptConfiguration */
UPDATE __mj."EntityField" SET "Category" = 'Vendor & Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '89540107-976D-4038-A90E-E7B042B88F49';

/* Set categories for 8 fields */
/* UPDATE Entity Field Category Info MJ: AI Agent Run Steps.ToolCallingMode */
UPDATE __mj."EntityField" SET "Category" = 'Data & Payload', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BDF051DE-9ABF-41DD-9734-8FB9A12F7836';
/* UPDATE Entity Field Category Info MJ: AI Agent Run Steps.NativeToolCallCount */
UPDATE __mj."EntityField" SET "Category" = 'Data & Payload', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6C2142C1-E36C-4C94-AD23-78237FD6397A';
/* UPDATE Entity Field Category Info MJ: AI Agent Run Steps.NativeDualChannel */
UPDATE __mj."EntityField" SET "Category" = 'Data & Payload', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4D1EBEA3-6390-45ED-A40E-ABE859EA362A';
/* UPDATE Entity Field Category Info MJ: AI Agent Run Steps.NativeToolResultsSent */
UPDATE __mj."EntityField" SET "Category" = 'Data & Payload', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A24C37F5-ABF0-4ED6-9827-67566782D577';
/* UPDATE Entity Field Category Info MJ: AI Agent Run Steps.ParentIDDepth */
UPDATE __mj."EntityField" SET "Category" = 'Step Identification & Hierarchy', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5AE1BA14-236D-43AC-9A8A-065E86CAD8B4';
/* UPDATE Entity Field Category Info MJ: AI Agent Run Steps.ParentIDPath */
UPDATE __mj."EntityField" SET "Category" = 'Step Identification & Hierarchy', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '57514093-A70F-4D00-8D55-D3805215EB50';
/* UPDATE Entity Field Category Info MJ: AI Agent Run Steps.ParentIDIsLeaf */
UPDATE __mj."EntityField" SET "Category" = 'Step Identification & Hierarchy', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0FC26E32-F786-41E4-B41D-D0E438764619';
/* UPDATE Entity Field Category Info MJ: AI Agent Run Steps.ParentIDChildCount */
UPDATE __mj."EntityField" SET "Category" = 'Step Identification & Hierarchy', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B12CC766-8A09-474C-9960-9B351A8EDC4D';

/* Set categories for 9 fields */
/* UPDATE Entity Field Category Info MJ: AI Prompt Runs.InputUnitsUsed */
UPDATE __mj."EntityField" SET "Category" = 'Performance & Cost Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '80751109-3D30-4FA2-AFB5-670CCC940D5F';
/* UPDATE Entity Field Category Info MJ: AI Prompt Runs.OutputUnitsUsed */
UPDATE __mj."EntityField" SET "Category" = 'Performance & Cost Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '403E5F99-370B-4D05-AB5A-E35DEDF41E27';
/* UPDATE Entity Field Category Info MJ: AI Prompt Runs.UsageTypeID */
UPDATE __mj."EntityField" SET "Category" = 'Performance & Cost Metrics', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B6567FD4-C231-4679-8520-35D64C42ECEE';
/* UPDATE Entity Field Category Info MJ: AI Prompt Runs.ToolCallingMode */
UPDATE __mj."EntityField" SET "Category" = 'Run Execution Core', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B666547F-6075-421F-B337-0123C5A15FB1';
/* UPDATE Entity Field Category Info MJ: AI Prompt Runs.UsageType */
UPDATE __mj."EntityField" SET "Category" = 'Prompt & Result Content', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'DC346A80-A4D5-4636-93F3-35B847FA9DCE';
/* UPDATE Entity Field Category Info MJ: AI Prompt Runs.ParentIDDepth */
UPDATE __mj."EntityField" SET "Category" = 'Run Execution Core', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '76E8F964-6050-4CAB-9605-EB96029CAC25';
/* UPDATE Entity Field Category Info MJ: AI Prompt Runs.ParentIDPath */
UPDATE __mj."EntityField" SET "Category" = 'Run Execution Core', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4FA6D94D-BD54-4366-A80E-CA82B71A1D00';
/* UPDATE Entity Field Category Info MJ: AI Prompt Runs.ParentIDIsLeaf */
UPDATE __mj."EntityField" SET "Category" = 'Run Execution Core', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '689A526D-679F-4B32-8A61-A78E2D0CBB4D';
/* UPDATE Entity Field Category Info MJ: AI Prompt Runs.ParentIDChildCount */
UPDATE __mj."EntityField" SET "Category" = 'Run Execution Core', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8731F1D2-777D-411F-BCD0-2144290CA2CC';

/* Set categories for 10 fields */
/* UPDATE Entity Field Category Info MJ: AI Agents.ContextWindowMaxTokens */
UPDATE __mj."EntityField" SET "Category" = 'Runtime Limits & Execution Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '03B2DCAA-9FFF-4A88-BABF-1FB41085CFB1';
/* UPDATE Entity Field Category Info MJ: AI Agents.CompactionTriggerPercent */
UPDATE __mj."EntityField" SET "Category" = 'Context Compression', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'ECD9E558-9503-402E-B1BB-553C423DF7C8';
/* UPDATE Entity Field Category Info MJ: AI Agents.CompactionTargetPercent */
UPDATE __mj."EntityField" SET "Category" = 'Context Compression', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '743CB348-E133-474D-A915-DCF6CD212F60';
/* UPDATE Entity Field Category Info MJ: AI Agents.ConversationSummaryPromptID */
UPDATE __mj."EntityField" SET "Category" = 'Context Compression', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C0CA3839-427C-4003-AFD7-6354086172AD';
/* UPDATE Entity Field Category Info MJ: AI Agents.DeclareActionsAsNativeTools */
UPDATE __mj."EntityField" SET "Category" = 'Runtime Limits & Execution Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '99AD0015-7ED6-4109-B853-87580B1CF904';
/* UPDATE Entity Field Category Info MJ: AI Agents.ConversationSummaryPrompt */
UPDATE __mj."EntityField" SET "Category" = 'Context Compression', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2758FC37-4C31-4F7A-A25D-A12EFAA47CE7';
/* UPDATE Entity Field Category Info MJ: AI Agents.ParentIDDepth */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy & Invocation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7036263F-027D-44C7-9CC1-D579450964BB';
/* UPDATE Entity Field Category Info MJ: AI Agents.ParentIDPath */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy & Invocation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7F029995-68BF-4363-B404-E9B9E7C01C47';
/* UPDATE Entity Field Category Info MJ: AI Agents.ParentIDIsLeaf */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy & Invocation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E6899580-3FCB-4D3B-8127-C553344748ED';
/* UPDATE Entity Field Category Info MJ: AI Agents.ParentIDChildCount */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy & Invocation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '766C810E-0F91-437B-B213-6338FCCE2F3A';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Actions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_action_agent_id"
    ON "__mj"."AIAgentAction" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_action_action_id"
    ON "__mj"."AIAgentAction" ("ActionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_action_compact_prompt_id"
    ON "__mj"."AIAgentAction" ("CompactPromptID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Actions
-- Item: vwAIAgentActions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Actions
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentAction
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentActions"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAction_ActionID."Name" AS "Action",
    MJAIPrompt_CompactPromptID."Name" AS "CompactPrompt"
FROM
    "__mj"."AIAgentAction" AS a
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."Action" AS MJAction_ActionID
  ON
    "a"."ActionID" = MJAction_ActionID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_CompactPromptID
  ON
    "a"."CompactPromptID" = MJAIPrompt_CompactPromptID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentActions'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentActions'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentActions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentActions" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIAgentActions" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentActions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentActions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Actions
-- Item: spCreateAIAgentAction
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentAction"(
    p_id UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_actionid_clear boolean DEFAULT false,
    p_actionid UUID DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_minexecutionsperrun_clear boolean DEFAULT false,
    p_minexecutionsperrun int DEFAULT NULL,
    p_maxexecutionsperrun_clear boolean DEFAULT false,
    p_maxexecutionsperrun int DEFAULT NULL,
    p_resultexpirationturns_clear boolean DEFAULT false,
    p_resultexpirationturns int DEFAULT NULL,
    p_resultexpirationmode varchar(20) DEFAULT NULL,
    p_compactmode_clear boolean DEFAULT false,
    p_compactmode varchar(20) DEFAULT NULL,
    p_compactlength_clear boolean DEFAULT false,
    p_compactlength int DEFAULT NULL,
    p_compactpromptid_clear boolean DEFAULT false,
    p_compactpromptid UUID DEFAULT NULL,
    p_declareasnativetool BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentActions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentAction"
        (
            "ID",
            "AgentID",
                "ActionID",
                "Status",
                "MinExecutionsPerRun",
                "MaxExecutionsPerRun",
                "ResultExpirationTurns",
                "ResultExpirationMode",
                "CompactMode",
                "CompactLength",
                "CompactPromptID",
                "DeclareAsNativeTool"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, NULL) END,
                CASE WHEN p_actionid_clear = true THEN NULL ELSE COALESCE(p_actionid, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_minexecutionsperrun_clear = true THEN NULL ELSE COALESCE(p_minexecutionsperrun, NULL) END,
                CASE WHEN p_maxexecutionsperrun_clear = true THEN NULL ELSE COALESCE(p_maxexecutionsperrun, NULL) END,
                CASE WHEN p_resultexpirationturns_clear = true THEN NULL ELSE COALESCE(p_resultexpirationturns, NULL) END,
                COALESCE(p_resultexpirationmode, 'None'),
                CASE WHEN p_compactmode_clear = true THEN NULL ELSE COALESCE(p_compactmode, NULL) END,
                CASE WHEN p_compactlength_clear = true THEN NULL ELSE COALESCE(p_compactlength, NULL) END,
                CASE WHEN p_compactpromptid_clear = true THEN NULL ELSE COALESCE(p_compactpromptid, NULL) END,
                COALESCE(p_declareasnativetool, TRUE)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentActions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentAction" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentAction" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Actions
-- Item: spUpdateAIAgentAction
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentAction"(
    p_id UUID,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_actionid_clear boolean DEFAULT false,
    p_actionid UUID DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_minexecutionsperrun_clear boolean DEFAULT false,
    p_minexecutionsperrun int DEFAULT NULL,
    p_maxexecutionsperrun_clear boolean DEFAULT false,
    p_maxexecutionsperrun int DEFAULT NULL,
    p_resultexpirationturns_clear boolean DEFAULT false,
    p_resultexpirationturns int DEFAULT NULL,
    p_resultexpirationmode varchar(20) DEFAULT NULL,
    p_compactmode_clear boolean DEFAULT false,
    p_compactmode varchar(20) DEFAULT NULL,
    p_compactlength_clear boolean DEFAULT false,
    p_compactlength int DEFAULT NULL,
    p_compactpromptid_clear boolean DEFAULT false,
    p_compactpromptid UUID DEFAULT NULL,
    p_declareasnativetool BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentActions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentAction"
    SET
        "AgentID" = CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, "AgentID") END,
        "ActionID" = CASE WHEN p_actionid_clear = true THEN NULL ELSE COALESCE(p_actionid, "ActionID") END,
        "Status" = COALESCE(p_status, "Status"),
        "MinExecutionsPerRun" = CASE WHEN p_minexecutionsperrun_clear = true THEN NULL ELSE COALESCE(p_minexecutionsperrun, "MinExecutionsPerRun") END,
        "MaxExecutionsPerRun" = CASE WHEN p_maxexecutionsperrun_clear = true THEN NULL ELSE COALESCE(p_maxexecutionsperrun, "MaxExecutionsPerRun") END,
        "ResultExpirationTurns" = CASE WHEN p_resultexpirationturns_clear = true THEN NULL ELSE COALESCE(p_resultexpirationturns, "ResultExpirationTurns") END,
        "ResultExpirationMode" = COALESCE(p_resultexpirationmode, "ResultExpirationMode"),
        "CompactMode" = CASE WHEN p_compactmode_clear = true THEN NULL ELSE COALESCE(p_compactmode, "CompactMode") END,
        "CompactLength" = CASE WHEN p_compactlength_clear = true THEN NULL ELSE COALESCE(p_compactlength, "CompactLength") END,
        "CompactPromptID" = CASE WHEN p_compactpromptid_clear = true THEN NULL ELSE COALESCE(p_compactpromptid, "CompactPromptID") END,
        "DeclareAsNativeTool" = COALESCE(p_declareasnativetool, "DeclareAsNativeTool")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentActions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentAction" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentAction" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentAction table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_action"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_action" ON "__mj"."AIAgentAction";

CREATE TRIGGER "trg_update_ai_agent_action"
BEFORE UPDATE ON "__mj"."AIAgentAction"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_action"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Actions
-- Item: spDeleteAIAgentAction
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentAction"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIAgentAction"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentAction" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentAction" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_agent_run_id"
    ON "__mj"."AIAgentRunStep" ("AgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_parent_id"
    ON "__mj"."AIAgentRunStep" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRunStep"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRunStep" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRunStep"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRunStep" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRunStep"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRunStep" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIAgentRunStep"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."AIAgentRunStep" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: vwAIAgentRunSteps
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Run Steps
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRunStep
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentRunSteps"
AS
SELECT
    a.*,
    MJAIAgentRun_AgentRunID."RunName" AS "AgentRun",
    MJAIAgentRunStep_ParentID."StepName" AS "Parent",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."AIAgentRunStep" AS a
INNER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_AgentRunID
  ON
    "a"."AgentRunID" = MJAIAgentRun_AgentRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRunStep" AS MJAIAgentRunStep_ParentID
  ON
    "a"."ParentID" = MJAIAgentRunStep_ParentID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_agent_run_step_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRunSteps'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRunSteps'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentRunSteps'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentRunSteps" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIAgentRunSteps" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentRunSteps" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentRunSteps" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: spCreateAIAgentRunStep
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRunStep
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRunStep'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRunStep"(
    p_id UUID DEFAULT NULL,
    p_agentrunid UUID DEFAULT NULL,
    p_stepnumber int DEFAULT NULL,
    p_steptype varchar(50) DEFAULT NULL,
    p_stepname varchar(255) DEFAULT NULL,
    p_targetid_clear boolean DEFAULT false,
    p_targetid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_inputdata_clear boolean DEFAULT false,
    p_inputdata TEXT DEFAULT NULL,
    p_outputdata_clear boolean DEFAULT false,
    p_outputdata TEXT DEFAULT NULL,
    p_targetlogid_clear boolean DEFAULT false,
    p_targetlogid UUID DEFAULT NULL,
    p_payloadatstart_clear boolean DEFAULT false,
    p_payloadatstart TEXT DEFAULT NULL,
    p_payloadatend_clear boolean DEFAULT false,
    p_payloadatend TEXT DEFAULT NULL,
    p_finalpayloadvalidationresult_clear boolean DEFAULT false,
    p_finalpayloadvalidationresult varchar(25) DEFAULT NULL,
    p_finalpayloadvalidationmessages_clear boolean DEFAULT false,
    p_finalpayloadvalidationmessages TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_skills_clear boolean DEFAULT false,
    p_skills TEXT DEFAULT NULL,
    p_toolcallingmode_clear boolean DEFAULT false,
    p_toolcallingmode varchar(25) DEFAULT NULL,
    p_nativetoolcallcount_clear boolean DEFAULT false,
    p_nativetoolcallcount int DEFAULT NULL,
    p_nativedualchannel_clear boolean DEFAULT false,
    p_nativedualchannel BOOLEAN DEFAULT NULL,
    p_nativetoolresultssent_clear boolean DEFAULT false,
    p_nativetoolresultssent BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRunSteps" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentRunStep"
        (
            "ID",
            "AgentRunID",
                "StepNumber",
                "StepType",
                "StepName",
                "TargetID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "Success",
                "ErrorMessage",
                "InputData",
                "OutputData",
                "TargetLogID",
                "PayloadAtStart",
                "PayloadAtEnd",
                "FinalPayloadValidationResult",
                "FinalPayloadValidationMessages",
                "ParentID",
                "Comments",
                "Skills",
                "ToolCallingMode",
                "NativeToolCallCount",
                "NativeDualChannel",
                "NativeToolResultsSent"
        )
    VALUES
        (
            v_new_id,
            p_agentrunid,
                p_stepnumber,
                COALESCE(p_steptype, 'Prompt'),
                p_stepname,
                CASE WHEN p_targetid_clear = true THEN NULL ELSE COALESCE(p_targetid, NULL) END,
                COALESCE(p_status, 'Running'),
                COALESCE(p_startedat, NOW()),
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_inputdata_clear = true THEN NULL ELSE COALESCE(p_inputdata, NULL) END,
                CASE WHEN p_outputdata_clear = true THEN NULL ELSE COALESCE(p_outputdata, NULL) END,
                CASE WHEN p_targetlogid_clear = true THEN NULL ELSE COALESCE(p_targetlogid, NULL) END,
                CASE WHEN p_payloadatstart_clear = true THEN NULL ELSE COALESCE(p_payloadatstart, NULL) END,
                CASE WHEN p_payloadatend_clear = true THEN NULL ELSE COALESCE(p_payloadatend, NULL) END,
                CASE WHEN p_finalpayloadvalidationresult_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationresult, NULL) END,
                CASE WHEN p_finalpayloadvalidationmessages_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationmessages, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_skills_clear = true THEN NULL ELSE COALESCE(p_skills, NULL) END,
                CASE WHEN p_toolcallingmode_clear = true THEN NULL ELSE COALESCE(p_toolcallingmode, NULL) END,
                CASE WHEN p_nativetoolcallcount_clear = true THEN NULL ELSE COALESCE(p_nativetoolcallcount, NULL) END,
                CASE WHEN p_nativedualchannel_clear = true THEN NULL ELSE COALESCE(p_nativedualchannel, NULL) END,
                CASE WHEN p_nativetoolresultssent_clear = true THEN NULL ELSE COALESCE(p_nativetoolresultssent, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRunSteps"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunStep" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunStep" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: spUpdateAIAgentRunStep
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRunStep
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRunStep'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentRunStep"(
    p_id UUID,
    p_agentrunid UUID DEFAULT NULL,
    p_stepnumber int DEFAULT NULL,
    p_steptype varchar(50) DEFAULT NULL,
    p_stepname varchar(255) DEFAULT NULL,
    p_targetid_clear boolean DEFAULT false,
    p_targetid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_inputdata_clear boolean DEFAULT false,
    p_inputdata TEXT DEFAULT NULL,
    p_outputdata_clear boolean DEFAULT false,
    p_outputdata TEXT DEFAULT NULL,
    p_targetlogid_clear boolean DEFAULT false,
    p_targetlogid UUID DEFAULT NULL,
    p_payloadatstart_clear boolean DEFAULT false,
    p_payloadatstart TEXT DEFAULT NULL,
    p_payloadatend_clear boolean DEFAULT false,
    p_payloadatend TEXT DEFAULT NULL,
    p_finalpayloadvalidationresult_clear boolean DEFAULT false,
    p_finalpayloadvalidationresult varchar(25) DEFAULT NULL,
    p_finalpayloadvalidationmessages_clear boolean DEFAULT false,
    p_finalpayloadvalidationmessages TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_skills_clear boolean DEFAULT false,
    p_skills TEXT DEFAULT NULL,
    p_toolcallingmode_clear boolean DEFAULT false,
    p_toolcallingmode varchar(25) DEFAULT NULL,
    p_nativetoolcallcount_clear boolean DEFAULT false,
    p_nativetoolcallcount int DEFAULT NULL,
    p_nativedualchannel_clear boolean DEFAULT false,
    p_nativedualchannel BOOLEAN DEFAULT NULL,
    p_nativetoolresultssent_clear boolean DEFAULT false,
    p_nativetoolresultssent BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRunSteps" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentRunStep"
    SET
        "AgentRunID" = COALESCE(p_agentrunid, "AgentRunID"),
        "StepNumber" = COALESCE(p_stepnumber, "StepNumber"),
        "StepType" = COALESCE(p_steptype, "StepType"),
        "StepName" = COALESCE(p_stepname, "StepName"),
        "TargetID" = CASE WHEN p_targetid_clear = true THEN NULL ELSE COALESCE(p_targetid, "TargetID") END,
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "Success" = CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, "Success") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "InputData" = CASE WHEN p_inputdata_clear = true THEN NULL ELSE COALESCE(p_inputdata, "InputData") END,
        "OutputData" = CASE WHEN p_outputdata_clear = true THEN NULL ELSE COALESCE(p_outputdata, "OutputData") END,
        "TargetLogID" = CASE WHEN p_targetlogid_clear = true THEN NULL ELSE COALESCE(p_targetlogid, "TargetLogID") END,
        "PayloadAtStart" = CASE WHEN p_payloadatstart_clear = true THEN NULL ELSE COALESCE(p_payloadatstart, "PayloadAtStart") END,
        "PayloadAtEnd" = CASE WHEN p_payloadatend_clear = true THEN NULL ELSE COALESCE(p_payloadatend, "PayloadAtEnd") END,
        "FinalPayloadValidationResult" = CASE WHEN p_finalpayloadvalidationresult_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationresult, "FinalPayloadValidationResult") END,
        "FinalPayloadValidationMessages" = CASE WHEN p_finalpayloadvalidationmessages_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationmessages, "FinalPayloadValidationMessages") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "Skills" = CASE WHEN p_skills_clear = true THEN NULL ELSE COALESCE(p_skills, "Skills") END,
        "ToolCallingMode" = CASE WHEN p_toolcallingmode_clear = true THEN NULL ELSE COALESCE(p_toolcallingmode, "ToolCallingMode") END,
        "NativeToolCallCount" = CASE WHEN p_nativetoolcallcount_clear = true THEN NULL ELSE COALESCE(p_nativetoolcallcount, "NativeToolCallCount") END,
        "NativeDualChannel" = CASE WHEN p_nativedualchannel_clear = true THEN NULL ELSE COALESCE(p_nativedualchannel, "NativeDualChannel") END,
        "NativeToolResultsSent" = CASE WHEN p_nativetoolresultssent_clear = true THEN NULL ELSE COALESCE(p_nativetoolresultssent, "NativeToolResultsSent") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRunSteps"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunStep" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunStep" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunStep table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_run_step"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run_step" ON "__mj"."AIAgentRunStep";

CREATE TRIGGER "trg_update_ai_agent_run_step"
BEFORE UPDATE ON "__mj"."AIAgentRunStep"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_run_step"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: spDeleteAIAgentRunStep
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRunStep
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRunStep'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentRunStep"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunStepID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "OriginatingAgentRunStepID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "OriginatingAgentRunStepID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Run Steps.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRunStep"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIAgentRunStep"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRunStep" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Models
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_model_prompt_id"
    ON "__mj"."AIPromptModel" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_model_model_id"
    ON "__mj"."AIPromptModel" ("ModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_model_vendor_id"
    ON "__mj"."AIPromptModel" ("VendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_model_configuration_id"
    ON "__mj"."AIPromptModel" ("ConfigurationID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Models
-- Item: vwAIPromptModels
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Models
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPromptModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIPromptModels"
AS
SELECT
    a.*,
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJAIModel_ModelID."Name" AS "Model",
    MJAIVendor_VendorID."Name" AS "Vendor",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration"
FROM
    "__mj"."AIPromptModel" AS a
INNER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "a"."PromptID" = MJAIPrompt_PromptID."ID"
INNER JOIN
    "__mj"."AIModel" AS MJAIModel_ModelID
  ON
    "a"."ModelID" = MJAIModel_ModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIVendor" AS MJAIVendor_VendorID
  ON
    "a"."VendorID" = MJAIVendor_VendorID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIPromptModels'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIPromptModels'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIPromptModels'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwAIPromptModels" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIPromptModels" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIPromptModels" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIPromptModels" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Models
-- Item: spCreateAIPromptModel
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPromptModel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPromptModel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIPromptModel"(
    p_id UUID DEFAULT NULL,
    p_promptid UUID DEFAULT NULL,
    p_modelid UUID DEFAULT NULL,
    p_vendorid_clear boolean DEFAULT false,
    p_vendorid UUID DEFAULT NULL,
    p_configurationid_clear boolean DEFAULT false,
    p_configurationid UUID DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_executiongroup int DEFAULT NULL,
    p_modelparameters_clear boolean DEFAULT false,
    p_modelparameters TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_parallelizationmode varchar(20) DEFAULT NULL,
    p_parallelcount int DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam varchar(100) DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel int DEFAULT NULL,
    p_promptconfiguration_clear boolean DEFAULT false,
    p_promptconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIPromptModels" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIPromptModel"
        (
            "ID",
            "PromptID",
                "ModelID",
                "VendorID",
                "ConfigurationID",
                "Priority",
                "ExecutionGroup",
                "ModelParameters",
                "Status",
                "ParallelizationMode",
                "ParallelCount",
                "ParallelConfigParam",
                "EffortLevel",
                "PromptConfiguration"
        )
    VALUES
        (
            v_new_id,
            p_promptid,
                p_modelid,
                CASE WHEN p_vendorid_clear = true THEN NULL ELSE COALESCE(p_vendorid, NULL) END,
                CASE WHEN p_configurationid_clear = true THEN NULL ELSE COALESCE(p_configurationid, NULL) END,
                COALESCE(p_priority, 0),
                COALESCE(p_executiongroup, 0),
                CASE WHEN p_modelparameters_clear = true THEN NULL ELSE COALESCE(p_modelparameters, NULL) END,
                COALESCE(p_status, 'Active'),
                COALESCE(p_parallelizationmode, 'None'),
                COALESCE(p_parallelcount, 1),
                CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, NULL) END,
                CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, NULL) END,
                CASE WHEN p_promptconfiguration_clear = true THEN NULL ELSE COALESCE(p_promptconfiguration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPromptModels"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptModel" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Models
-- Item: spUpdateAIPromptModel
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPromptModel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPromptModel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIPromptModel"(
    p_id UUID,
    p_promptid UUID DEFAULT NULL,
    p_modelid UUID DEFAULT NULL,
    p_vendorid_clear boolean DEFAULT false,
    p_vendorid UUID DEFAULT NULL,
    p_configurationid_clear boolean DEFAULT false,
    p_configurationid UUID DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_executiongroup int DEFAULT NULL,
    p_modelparameters_clear boolean DEFAULT false,
    p_modelparameters TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_parallelizationmode varchar(20) DEFAULT NULL,
    p_parallelcount int DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam varchar(100) DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel int DEFAULT NULL,
    p_promptconfiguration_clear boolean DEFAULT false,
    p_promptconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIPromptModels" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIPromptModel"
    SET
        "PromptID" = COALESCE(p_promptid, "PromptID"),
        "ModelID" = COALESCE(p_modelid, "ModelID"),
        "VendorID" = CASE WHEN p_vendorid_clear = true THEN NULL ELSE COALESCE(p_vendorid, "VendorID") END,
        "ConfigurationID" = CASE WHEN p_configurationid_clear = true THEN NULL ELSE COALESCE(p_configurationid, "ConfigurationID") END,
        "Priority" = COALESCE(p_priority, "Priority"),
        "ExecutionGroup" = COALESCE(p_executiongroup, "ExecutionGroup"),
        "ModelParameters" = CASE WHEN p_modelparameters_clear = true THEN NULL ELSE COALESCE(p_modelparameters, "ModelParameters") END,
        "Status" = COALESCE(p_status, "Status"),
        "ParallelizationMode" = COALESCE(p_parallelizationmode, "ParallelizationMode"),
        "ParallelCount" = COALESCE(p_parallelcount, "ParallelCount"),
        "ParallelConfigParam" = CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, "ParallelConfigParam") END,
        "EffortLevel" = CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, "EffortLevel") END,
        "PromptConfiguration" = CASE WHEN p_promptconfiguration_clear = true THEN NULL ELSE COALESCE(p_promptconfiguration, "PromptConfiguration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPromptModels"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptModel" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptModel table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_prompt_model"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt_model" ON "__mj"."AIPromptModel";

CREATE TRIGGER "trg_update_ai_prompt_model"
BEFORE UPDATE ON "__mj"."AIPromptModel"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_prompt_model"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Models
-- Item: spDeleteAIPromptModel
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPromptModel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPromptModel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIPromptModel"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIPromptModel"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptModel" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_usage_type_id"
    ON "__mj"."AIPromptRun" ("UsageTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_prompt_id"
    ON "__mj"."AIPromptRun" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_model_id"
    ON "__mj"."AIPromptRun" ("ModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_vendor_id"
    ON "__mj"."AIPromptRun" ("VendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_agent_id"
    ON "__mj"."AIPromptRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_configuration_id"
    ON "__mj"."AIPromptRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_parent_id"
    ON "__mj"."AIPromptRun" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_original_model_id"
    ON "__mj"."AIPromptRun" ("OriginalModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_rerun_from_prompt_run_id"
    ON "__mj"."AIPromptRun" ("RerunFromPromptRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_judge_id"
    ON "__mj"."AIPromptRun" ("JudgeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_child_prompt_id"
    ON "__mj"."AIPromptRun" ("ChildPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_test_run_id"
    ON "__mj"."AIPromptRun" ("TestRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIPromptRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIPromptRun" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIPromptRun" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIPromptRun" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIPromptRun" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIPromptRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."AIPromptRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIPromptRuns"
AS
SELECT
    a.*,
    MJAIUsageType_UsageTypeID."Name" AS "UsageType",
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJAIModel_ModelID."Name" AS "Model",
    MJAIVendor_VendorID."Name" AS "Vendor",
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIPromptRun_ParentID."RunName" AS "Parent",
    MJAIModel_OriginalModelID."Name" AS "OriginalModel",
    MJAIPromptRun_RerunFromPromptRunID."RunName" AS "RerunFromPromptRun",
    MJAIPrompt_JudgeID."Name" AS "Judge",
    MJAIPrompt_ChildPromptID."Name" AS "ChildPrompt",
    MJTestRun_TestRunID."Test" AS "TestRun",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."AIPromptRun" AS a
LEFT OUTER JOIN
    "__mj"."AIUsageType" AS MJAIUsageType_UsageTypeID
  ON
    "a"."UsageTypeID" = MJAIUsageType_UsageTypeID."ID"
INNER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "a"."PromptID" = MJAIPrompt_PromptID."ID"
INNER JOIN
    "__mj"."AIModel" AS MJAIModel_ModelID
  ON
    "a"."ModelID" = MJAIModel_ModelID."ID"
INNER JOIN
    "__mj"."AIVendor" AS MJAIVendor_VendorID
  ON
    "a"."VendorID" = MJAIVendor_VendorID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptRun" AS MJAIPromptRun_ParentID
  ON
    "a"."ParentID" = MJAIPromptRun_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_OriginalModelID
  ON
    "a"."OriginalModelID" = MJAIModel_OriginalModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptRun" AS MJAIPromptRun_RerunFromPromptRunID
  ON
    "a"."RerunFromPromptRunID" = MJAIPromptRun_RerunFromPromptRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_JudgeID
  ON
    "a"."JudgeID" = MJAIPrompt_JudgeID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ChildPromptID
  ON
    "a"."ChildPromptID" = MJAIPrompt_ChildPromptID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_prompt_run_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIPromptRuns'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIPromptRuns'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIPromptRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwAIPromptRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIPromptRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIPromptRuns"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['InputUnitsUsed', 'OutputUnitsUsed', 'UsageTypeID', 'PromptID', 'ModelID', 'VendorID', 'AgentID', 'ConfigurationID', 'RunAt', 'CompletedAt', 'ExecutionTimeMS', 'Messages', 'Result', 'TokensUsed', 'TokensPrompt', 'TokensCompletion', 'TotalCost', 'Success', 'ErrorMessage', 'ParentID', 'RunType', 'ExecutionOrder', 'Cost', 'CostCurrency', 'TokensUsedRollup', 'TokensPromptRollup', 'TokensCompletionRollup', 'Temperature', 'TopP', 'TopK', 'MinP', 'FrequencyPenalty', 'PresencePenalty', 'Seed', 'StopSequences', 'ResponseFormat', 'LogProbs', 'TopLogProbs', 'DescendantCost', 'ValidationAttemptCount', 'SuccessfulValidationCount', 'FinalValidationPassed', 'ValidationBehavior', 'RetryStrategy', 'MaxRetriesConfigured', 'FinalValidationError', 'ValidationErrorCount', 'CommonValidationError', 'FirstAttemptAt', 'LastAttemptAt', 'TotalRetryDurationMS', 'ValidationAttempts', 'ValidationSummary', 'FailoverAttempts', 'FailoverErrors', 'FailoverDurations', 'OriginalModelID', 'OriginalRequestStartTime', 'TotalFailoverDuration', 'RerunFromPromptRunID', 'ModelSelection', 'Status', 'Cancelled', 'CancellationReason', 'ModelPowerRank', 'SelectionStrategy', 'CacheHit', 'CacheKey', 'JudgeID', 'JudgeScore', 'WasSelectedResult', 'StreamingEnabled', 'FirstTokenTime', 'ErrorDetails', 'ChildPromptID', 'QueueTime', 'PromptTime', 'CompletionTime', 'ModelSpecificResponseDetails', 'EffortLevel', 'RunName', 'Comments', 'TestRunID', 'AssistantPrefill', 'TokensCacheRead', 'TokensCacheWrite', 'TokensCacheReadRollup', 'TokensCacheWriteRollup', 'ToolCallingMode']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'InputUnitsUsed' THEN '($1->>''InputUnitsUsed'')::DECIMAL(19, 8)'
        WHEN 'OutputUnitsUsed' THEN '($1->>''OutputUnitsUsed'')::DECIMAL(19, 8)'
        WHEN 'UsageTypeID' THEN '($1->>''UsageTypeID'')::UUID'
        WHEN 'PromptID' THEN '($1->>''PromptID'')::UUID'
        WHEN 'ModelID' THEN '($1->>''ModelID'')::UUID'
        WHEN 'VendorID' THEN '($1->>''VendorID'')::UUID'
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'RunAt' THEN 'COALESCE(($1->>''RunAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'ExecutionTimeMS' THEN '($1->>''ExecutionTimeMS'')::INT'
        WHEN 'Messages' THEN '($1->>''Messages'')'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'TokensUsed' THEN '($1->>''TokensUsed'')::INT'
        WHEN 'TokensPrompt' THEN '($1->>''TokensPrompt'')::INT'
        WHEN 'TokensCompletion' THEN '($1->>''TokensCompletion'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'Success' THEN 'COALESCE(($1->>''Success'')::BOOLEAN, FALSE)'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'RunType' THEN 'COALESCE(($1->>''RunType''), ''Single'')'
        WHEN 'ExecutionOrder' THEN '($1->>''ExecutionOrder'')::INT'
        WHEN 'Cost' THEN '($1->>''Cost'')::DECIMAL(19, 8)'
        WHEN 'CostCurrency' THEN '($1->>''CostCurrency'')'
        WHEN 'TokensUsedRollup' THEN '($1->>''TokensUsedRollup'')::INT'
        WHEN 'TokensPromptRollup' THEN '($1->>''TokensPromptRollup'')::INT'
        WHEN 'TokensCompletionRollup' THEN '($1->>''TokensCompletionRollup'')::INT'
        WHEN 'Temperature' THEN '($1->>''Temperature'')::DECIMAL(3, 2)'
        WHEN 'TopP' THEN '($1->>''TopP'')::DECIMAL(3, 2)'
        WHEN 'TopK' THEN '($1->>''TopK'')::INT'
        WHEN 'MinP' THEN '($1->>''MinP'')::DECIMAL(3, 2)'
        WHEN 'FrequencyPenalty' THEN '($1->>''FrequencyPenalty'')::DECIMAL(3, 2)'
        WHEN 'PresencePenalty' THEN '($1->>''PresencePenalty'')::DECIMAL(3, 2)'
        WHEN 'Seed' THEN '($1->>''Seed'')::INT'
        WHEN 'StopSequences' THEN '($1->>''StopSequences'')'
        WHEN 'ResponseFormat' THEN '($1->>''ResponseFormat'')'
        WHEN 'LogProbs' THEN '($1->>''LogProbs'')::BOOLEAN'
        WHEN 'TopLogProbs' THEN '($1->>''TopLogProbs'')::INT'
        WHEN 'DescendantCost' THEN '($1->>''DescendantCost'')::DECIMAL(18, 6)'
        WHEN 'ValidationAttemptCount' THEN '($1->>''ValidationAttemptCount'')::INT'
        WHEN 'SuccessfulValidationCount' THEN '($1->>''SuccessfulValidationCount'')::INT'
        WHEN 'FinalValidationPassed' THEN '($1->>''FinalValidationPassed'')::BOOLEAN'
        WHEN 'ValidationBehavior' THEN '($1->>''ValidationBehavior'')'
        WHEN 'RetryStrategy' THEN '($1->>''RetryStrategy'')'
        WHEN 'MaxRetriesConfigured' THEN '($1->>''MaxRetriesConfigured'')::INT'
        WHEN 'FinalValidationError' THEN '($1->>''FinalValidationError'')'
        WHEN 'ValidationErrorCount' THEN '($1->>''ValidationErrorCount'')::INT'
        WHEN 'CommonValidationError' THEN '($1->>''CommonValidationError'')'
        WHEN 'FirstAttemptAt' THEN '($1->>''FirstAttemptAt'')::TIMESTAMPTZ'
        WHEN 'LastAttemptAt' THEN '($1->>''LastAttemptAt'')::TIMESTAMPTZ'
        WHEN 'TotalRetryDurationMS' THEN '($1->>''TotalRetryDurationMS'')::INT'
        WHEN 'ValidationAttempts' THEN '($1->>''ValidationAttempts'')'
        WHEN 'ValidationSummary' THEN '($1->>''ValidationSummary'')'
        WHEN 'FailoverAttempts' THEN '($1->>''FailoverAttempts'')::INT'
        WHEN 'FailoverErrors' THEN '($1->>''FailoverErrors'')'
        WHEN 'FailoverDurations' THEN '($1->>''FailoverDurations'')'
        WHEN 'OriginalModelID' THEN '($1->>''OriginalModelID'')::UUID'
        WHEN 'OriginalRequestStartTime' THEN '($1->>''OriginalRequestStartTime'')::TIMESTAMPTZ'
        WHEN 'TotalFailoverDuration' THEN '($1->>''TotalFailoverDuration'')::INT'
        WHEN 'RerunFromPromptRunID' THEN '($1->>''RerunFromPromptRunID'')::UUID'
        WHEN 'ModelSelection' THEN '($1->>''ModelSelection'')'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'Cancelled' THEN 'COALESCE(($1->>''Cancelled'')::BOOLEAN, FALSE)'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'ModelPowerRank' THEN '($1->>''ModelPowerRank'')::INT'
        WHEN 'SelectionStrategy' THEN '($1->>''SelectionStrategy'')'
        WHEN 'CacheHit' THEN 'COALESCE(($1->>''CacheHit'')::BOOLEAN, FALSE)'
        WHEN 'CacheKey' THEN '($1->>''CacheKey'')'
        WHEN 'JudgeID' THEN '($1->>''JudgeID'')::UUID'
        WHEN 'JudgeScore' THEN '($1->>''JudgeScore'')::FLOAT(53)'
        WHEN 'WasSelectedResult' THEN 'COALESCE(($1->>''WasSelectedResult'')::BOOLEAN, FALSE)'
        WHEN 'StreamingEnabled' THEN 'COALESCE(($1->>''StreamingEnabled'')::BOOLEAN, FALSE)'
        WHEN 'FirstTokenTime' THEN '($1->>''FirstTokenTime'')::INT'
        WHEN 'ErrorDetails' THEN '($1->>''ErrorDetails'')'
        WHEN 'ChildPromptID' THEN '($1->>''ChildPromptID'')::UUID'
        WHEN 'QueueTime' THEN '($1->>''QueueTime'')::INT'
        WHEN 'PromptTime' THEN '($1->>''PromptTime'')::INT'
        WHEN 'CompletionTime' THEN '($1->>''CompletionTime'')::INT'
        WHEN 'ModelSpecificResponseDetails' THEN '($1->>''ModelSpecificResponseDetails'')'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'AssistantPrefill' THEN '($1->>''AssistantPrefill'')'
        WHEN 'TokensCacheRead' THEN '($1->>''TokensCacheRead'')::INT'
        WHEN 'TokensCacheWrite' THEN '($1->>''TokensCacheWrite'')::INT'
        WHEN 'TokensCacheReadRollup' THEN '($1->>''TokensCacheReadRollup'')::INT'
        WHEN 'TokensCacheWriteRollup' THEN '($1->>''TokensCacheWriteRollup'')::INT'
        WHEN 'ToolCallingMode' THEN '($1->>''ToolCallingMode'')'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIPromptRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPromptRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIPromptRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIPromptRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIPromptRun: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIPromptRun"
    SET
        "InputUnitsUsed" = CASE WHEN p_data ? 'InputUnitsUsed' THEN (p_data->>'InputUnitsUsed')::DECIMAL(19, 8) ELSE "InputUnitsUsed" END,
        "OutputUnitsUsed" = CASE WHEN p_data ? 'OutputUnitsUsed' THEN (p_data->>'OutputUnitsUsed')::DECIMAL(19, 8) ELSE "OutputUnitsUsed" END,
        "UsageTypeID" = CASE WHEN p_data ? 'UsageTypeID' THEN (p_data->>'UsageTypeID')::UUID ELSE "UsageTypeID" END,
        "PromptID" = CASE WHEN p_data ? 'PromptID' THEN (p_data->>'PromptID')::UUID ELSE "PromptID" END,
        "ModelID" = CASE WHEN p_data ? 'ModelID' THEN (p_data->>'ModelID')::UUID ELSE "ModelID" END,
        "VendorID" = CASE WHEN p_data ? 'VendorID' THEN (p_data->>'VendorID')::UUID ELSE "VendorID" END,
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "RunAt" = CASE WHEN p_data ? 'RunAt' THEN (p_data->>'RunAt')::TIMESTAMPTZ ELSE "RunAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "ExecutionTimeMS" = CASE WHEN p_data ? 'ExecutionTimeMS' THEN (p_data->>'ExecutionTimeMS')::INT ELSE "ExecutionTimeMS" END,
        "Messages" = CASE WHEN p_data ? 'Messages' THEN (p_data->>'Messages') ELSE "Messages" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "TokensUsed" = CASE WHEN p_data ? 'TokensUsed' THEN (p_data->>'TokensUsed')::INT ELSE "TokensUsed" END,
        "TokensPrompt" = CASE WHEN p_data ? 'TokensPrompt' THEN (p_data->>'TokensPrompt')::INT ELSE "TokensPrompt" END,
        "TokensCompletion" = CASE WHEN p_data ? 'TokensCompletion' THEN (p_data->>'TokensCompletion')::INT ELSE "TokensCompletion" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "RunType" = CASE WHEN p_data ? 'RunType' THEN (p_data->>'RunType') ELSE "RunType" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INT ELSE "ExecutionOrder" END,
        "Cost" = CASE WHEN p_data ? 'Cost' THEN (p_data->>'Cost')::DECIMAL(19, 8) ELSE "Cost" END,
        "CostCurrency" = CASE WHEN p_data ? 'CostCurrency' THEN (p_data->>'CostCurrency') ELSE "CostCurrency" END,
        "TokensUsedRollup" = CASE WHEN p_data ? 'TokensUsedRollup' THEN (p_data->>'TokensUsedRollup')::INT ELSE "TokensUsedRollup" END,
        "TokensPromptRollup" = CASE WHEN p_data ? 'TokensPromptRollup' THEN (p_data->>'TokensPromptRollup')::INT ELSE "TokensPromptRollup" END,
        "TokensCompletionRollup" = CASE WHEN p_data ? 'TokensCompletionRollup' THEN (p_data->>'TokensCompletionRollup')::INT ELSE "TokensCompletionRollup" END,
        "Temperature" = CASE WHEN p_data ? 'Temperature' THEN (p_data->>'Temperature')::DECIMAL(3, 2) ELSE "Temperature" END,
        "TopP" = CASE WHEN p_data ? 'TopP' THEN (p_data->>'TopP')::DECIMAL(3, 2) ELSE "TopP" END,
        "TopK" = CASE WHEN p_data ? 'TopK' THEN (p_data->>'TopK')::INT ELSE "TopK" END,
        "MinP" = CASE WHEN p_data ? 'MinP' THEN (p_data->>'MinP')::DECIMAL(3, 2) ELSE "MinP" END,
        "FrequencyPenalty" = CASE WHEN p_data ? 'FrequencyPenalty' THEN (p_data->>'FrequencyPenalty')::DECIMAL(3, 2) ELSE "FrequencyPenalty" END,
        "PresencePenalty" = CASE WHEN p_data ? 'PresencePenalty' THEN (p_data->>'PresencePenalty')::DECIMAL(3, 2) ELSE "PresencePenalty" END,
        "Seed" = CASE WHEN p_data ? 'Seed' THEN (p_data->>'Seed')::INT ELSE "Seed" END,
        "StopSequences" = CASE WHEN p_data ? 'StopSequences' THEN (p_data->>'StopSequences') ELSE "StopSequences" END,
        "ResponseFormat" = CASE WHEN p_data ? 'ResponseFormat' THEN (p_data->>'ResponseFormat') ELSE "ResponseFormat" END,
        "LogProbs" = CASE WHEN p_data ? 'LogProbs' THEN (p_data->>'LogProbs')::BOOLEAN ELSE "LogProbs" END,
        "TopLogProbs" = CASE WHEN p_data ? 'TopLogProbs' THEN (p_data->>'TopLogProbs')::INT ELSE "TopLogProbs" END,
        "DescendantCost" = CASE WHEN p_data ? 'DescendantCost' THEN (p_data->>'DescendantCost')::DECIMAL(18, 6) ELSE "DescendantCost" END,
        "ValidationAttemptCount" = CASE WHEN p_data ? 'ValidationAttemptCount' THEN (p_data->>'ValidationAttemptCount')::INT ELSE "ValidationAttemptCount" END,
        "SuccessfulValidationCount" = CASE WHEN p_data ? 'SuccessfulValidationCount' THEN (p_data->>'SuccessfulValidationCount')::INT ELSE "SuccessfulValidationCount" END,
        "FinalValidationPassed" = CASE WHEN p_data ? 'FinalValidationPassed' THEN (p_data->>'FinalValidationPassed')::BOOLEAN ELSE "FinalValidationPassed" END,
        "ValidationBehavior" = CASE WHEN p_data ? 'ValidationBehavior' THEN (p_data->>'ValidationBehavior') ELSE "ValidationBehavior" END,
        "RetryStrategy" = CASE WHEN p_data ? 'RetryStrategy' THEN (p_data->>'RetryStrategy') ELSE "RetryStrategy" END,
        "MaxRetriesConfigured" = CASE WHEN p_data ? 'MaxRetriesConfigured' THEN (p_data->>'MaxRetriesConfigured')::INT ELSE "MaxRetriesConfigured" END,
        "FinalValidationError" = CASE WHEN p_data ? 'FinalValidationError' THEN (p_data->>'FinalValidationError') ELSE "FinalValidationError" END,
        "ValidationErrorCount" = CASE WHEN p_data ? 'ValidationErrorCount' THEN (p_data->>'ValidationErrorCount')::INT ELSE "ValidationErrorCount" END,
        "CommonValidationError" = CASE WHEN p_data ? 'CommonValidationError' THEN (p_data->>'CommonValidationError') ELSE "CommonValidationError" END,
        "FirstAttemptAt" = CASE WHEN p_data ? 'FirstAttemptAt' THEN (p_data->>'FirstAttemptAt')::TIMESTAMPTZ ELSE "FirstAttemptAt" END,
        "LastAttemptAt" = CASE WHEN p_data ? 'LastAttemptAt' THEN (p_data->>'LastAttemptAt')::TIMESTAMPTZ ELSE "LastAttemptAt" END,
        "TotalRetryDurationMS" = CASE WHEN p_data ? 'TotalRetryDurationMS' THEN (p_data->>'TotalRetryDurationMS')::INT ELSE "TotalRetryDurationMS" END,
        "ValidationAttempts" = CASE WHEN p_data ? 'ValidationAttempts' THEN (p_data->>'ValidationAttempts') ELSE "ValidationAttempts" END,
        "ValidationSummary" = CASE WHEN p_data ? 'ValidationSummary' THEN (p_data->>'ValidationSummary') ELSE "ValidationSummary" END,
        "FailoverAttempts" = CASE WHEN p_data ? 'FailoverAttempts' THEN (p_data->>'FailoverAttempts')::INT ELSE "FailoverAttempts" END,
        "FailoverErrors" = CASE WHEN p_data ? 'FailoverErrors' THEN (p_data->>'FailoverErrors') ELSE "FailoverErrors" END,
        "FailoverDurations" = CASE WHEN p_data ? 'FailoverDurations' THEN (p_data->>'FailoverDurations') ELSE "FailoverDurations" END,
        "OriginalModelID" = CASE WHEN p_data ? 'OriginalModelID' THEN (p_data->>'OriginalModelID')::UUID ELSE "OriginalModelID" END,
        "OriginalRequestStartTime" = CASE WHEN p_data ? 'OriginalRequestStartTime' THEN (p_data->>'OriginalRequestStartTime')::TIMESTAMPTZ ELSE "OriginalRequestStartTime" END,
        "TotalFailoverDuration" = CASE WHEN p_data ? 'TotalFailoverDuration' THEN (p_data->>'TotalFailoverDuration')::INT ELSE "TotalFailoverDuration" END,
        "RerunFromPromptRunID" = CASE WHEN p_data ? 'RerunFromPromptRunID' THEN (p_data->>'RerunFromPromptRunID')::UUID ELSE "RerunFromPromptRunID" END,
        "ModelSelection" = CASE WHEN p_data ? 'ModelSelection' THEN (p_data->>'ModelSelection') ELSE "ModelSelection" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "Cancelled" = CASE WHEN p_data ? 'Cancelled' THEN (p_data->>'Cancelled')::BOOLEAN ELSE "Cancelled" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "ModelPowerRank" = CASE WHEN p_data ? 'ModelPowerRank' THEN (p_data->>'ModelPowerRank')::INT ELSE "ModelPowerRank" END,
        "SelectionStrategy" = CASE WHEN p_data ? 'SelectionStrategy' THEN (p_data->>'SelectionStrategy') ELSE "SelectionStrategy" END,
        "CacheHit" = CASE WHEN p_data ? 'CacheHit' THEN (p_data->>'CacheHit')::BOOLEAN ELSE "CacheHit" END,
        "CacheKey" = CASE WHEN p_data ? 'CacheKey' THEN (p_data->>'CacheKey') ELSE "CacheKey" END,
        "JudgeID" = CASE WHEN p_data ? 'JudgeID' THEN (p_data->>'JudgeID')::UUID ELSE "JudgeID" END,
        "JudgeScore" = CASE WHEN p_data ? 'JudgeScore' THEN (p_data->>'JudgeScore')::FLOAT(53) ELSE "JudgeScore" END,
        "WasSelectedResult" = CASE WHEN p_data ? 'WasSelectedResult' THEN (p_data->>'WasSelectedResult')::BOOLEAN ELSE "WasSelectedResult" END,
        "StreamingEnabled" = CASE WHEN p_data ? 'StreamingEnabled' THEN (p_data->>'StreamingEnabled')::BOOLEAN ELSE "StreamingEnabled" END,
        "FirstTokenTime" = CASE WHEN p_data ? 'FirstTokenTime' THEN (p_data->>'FirstTokenTime')::INT ELSE "FirstTokenTime" END,
        "ErrorDetails" = CASE WHEN p_data ? 'ErrorDetails' THEN (p_data->>'ErrorDetails') ELSE "ErrorDetails" END,
        "ChildPromptID" = CASE WHEN p_data ? 'ChildPromptID' THEN (p_data->>'ChildPromptID')::UUID ELSE "ChildPromptID" END,
        "QueueTime" = CASE WHEN p_data ? 'QueueTime' THEN (p_data->>'QueueTime')::INT ELSE "QueueTime" END,
        "PromptTime" = CASE WHEN p_data ? 'PromptTime' THEN (p_data->>'PromptTime')::INT ELSE "PromptTime" END,
        "CompletionTime" = CASE WHEN p_data ? 'CompletionTime' THEN (p_data->>'CompletionTime')::INT ELSE "CompletionTime" END,
        "ModelSpecificResponseDetails" = CASE WHEN p_data ? 'ModelSpecificResponseDetails' THEN (p_data->>'ModelSpecificResponseDetails') ELSE "ModelSpecificResponseDetails" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "AssistantPrefill" = CASE WHEN p_data ? 'AssistantPrefill' THEN (p_data->>'AssistantPrefill') ELSE "AssistantPrefill" END,
        "TokensCacheRead" = CASE WHEN p_data ? 'TokensCacheRead' THEN (p_data->>'TokensCacheRead')::INT ELSE "TokensCacheRead" END,
        "TokensCacheWrite" = CASE WHEN p_data ? 'TokensCacheWrite' THEN (p_data->>'TokensCacheWrite')::INT ELSE "TokensCacheWrite" END,
        "TokensCacheReadRollup" = CASE WHEN p_data ? 'TokensCacheReadRollup' THEN (p_data->>'TokensCacheReadRollup')::INT ELSE "TokensCacheReadRollup" END,
        "TokensCacheWriteRollup" = CASE WHEN p_data ? 'TokensCacheWriteRollup' THEN (p_data->>'TokensCacheWriteRollup')::INT ELSE "TokensCacheWriteRollup" END,
        "ToolCallingMode" = CASE WHEN p_data ? 'ToolCallingMode' THEN (p_data->>'ToolCallingMode') ELSE "ToolCallingMode" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPromptRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_prompt_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt_run" ON "__mj"."AIPromptRun";

CREATE TRIGGER "trg_update_ai_prompt_run"
BEFORE UPDATE ON "__mj"."AIPromptRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_prompt_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPromptRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIPromptRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: AI Prompt Run Medias records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRunMedia"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.RerunFromPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "RerunFromPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "RerunFromPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIResultCache"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Content Item Tags.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentItemTag"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ContentItemTag"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Content Process Run Prompt Runs records via AIPromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentProcessRunPromptRun"
        WHERE "AIPromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteContentProcessRunPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Compaction Runs records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationCompactionRun"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationCompactionRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DuplicateRunDetailMatch"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DuplicateRunDetailMatch"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutineRun"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutineRun"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIPromptRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_category_id"
    ON "__mj"."Action" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_code_approved_by_user_id"
    ON "__mj"."Action" ("CodeApprovedByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_parent_id"
    ON "__mj"."Action" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_default_compact_prompt_id"
    ON "__mj"."Action" ("DefaultCompactPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_created_by_agent_id"
    ON "__mj"."Action" ("CreatedByAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: fn_action_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: Action.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_action_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."Action"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."Action" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."Action" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."Action" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: fn_action_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: Action.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_action_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."Action"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."Action" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."Action" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."Action" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: fn_action_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: Action.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_action_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."Action"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."Action" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: fn_action_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: Action.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_action_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."Action"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."Action" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: vwActions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Actions
-----               SCHEMA:      __mj
-----               BASE TABLE:  Action
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwActions"
AS
SELECT
    a.*,
    MJActionCategory_CategoryID."Name" AS "Category",
    MJUser_CodeApprovedByUserID."Name" AS "CodeApprovedByUser",
    MJAction_ParentID."Name" AS "Parent",
    MJAIPrompt_DefaultCompactPromptID."Name" AS "DefaultCompactPrompt",
    MJAIAgent_CreatedByAgentID."Name" AS "CreatedByAgent",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."Action" AS a
LEFT OUTER JOIN
    "__mj"."ActionCategory" AS MJActionCategory_CategoryID
  ON
    "a"."CategoryID" = MJActionCategory_CategoryID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_CodeApprovedByUserID
  ON
    "a"."CodeApprovedByUserID" = MJUser_CodeApprovedByUserID."ID"
LEFT OUTER JOIN
    "__mj"."Action" AS MJAction_ParentID
  ON
    "a"."ParentID" = MJAction_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_DefaultCompactPromptID
  ON
    "a"."DefaultCompactPromptID" = MJAIPrompt_DefaultCompactPromptID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_CreatedByAgentID
  ON
    "a"."CreatedByAgentID" = MJAIAgent_CreatedByAgentID."ID"

LEFT JOIN LATERAL "__mj"."fn_action_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwActions'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwActions'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwActions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwActions" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwActions" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwActions" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwActions" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: spCreateAction
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Action
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAction"(
    p_id UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_name varchar(425) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_userprompt_clear boolean DEFAULT false,
    p_userprompt TEXT DEFAULT NULL,
    p_usercomments_clear boolean DEFAULT false,
    p_usercomments TEXT DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code TEXT DEFAULT NULL,
    p_codecomments_clear boolean DEFAULT false,
    p_codecomments TEXT DEFAULT NULL,
    p_codeapprovalstatus varchar(20) DEFAULT NULL,
    p_codeapprovalcomments_clear boolean DEFAULT false,
    p_codeapprovalcomments TEXT DEFAULT NULL,
    p_codeapprovedbyuserid_clear boolean DEFAULT false,
    p_codeapprovedbyuserid UUID DEFAULT NULL,
    p_codeapprovedat_clear boolean DEFAULT false,
    p_codeapprovedat TIMESTAMPTZ DEFAULT NULL,
    p_codelocked BOOLEAN DEFAULT NULL,
    p_forcecodegeneration BOOLEAN DEFAULT NULL,
    p_retentionperiod_clear boolean DEFAULT false,
    p_retentionperiod int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass varchar(255) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_iconclass_clear boolean DEFAULT false,
    p_iconclass varchar(100) DEFAULT NULL,
    p_defaultcompactpromptid_clear boolean DEFAULT false,
    p_defaultcompactpromptid UUID DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config TEXT DEFAULT NULL,
    p_runtimeactionconfiguration_clear boolean DEFAULT false,
    p_runtimeactionconfiguration TEXT DEFAULT NULL,
    p_maxexecutiontimems_clear boolean DEFAULT false,
    p_maxexecutiontimems int DEFAULT NULL,
    p_createdbyagentid_clear boolean DEFAULT false,
    p_createdbyagentid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwActions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Action"
        (
            "ID",
            "CategoryID",
                "Name",
                "Description",
                "Type",
                "UserPrompt",
                "UserComments",
                "Code",
                "CodeComments",
                "CodeApprovalStatus",
                "CodeApprovalComments",
                "CodeApprovedByUserID",
                "CodeApprovedAt",
                "CodeLocked",
                "ForceCodeGeneration",
                "RetentionPeriod",
                "Status",
                "DriverClass",
                "ParentID",
                "IconClass",
                "DefaultCompactPromptID",
                "Config",
                "RuntimeActionConfiguration",
                "MaxExecutionTimeMS",
                "CreatedByAgentID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_type, 'Generated'),
                CASE WHEN p_userprompt_clear = true THEN NULL ELSE COALESCE(p_userprompt, NULL) END,
                CASE WHEN p_usercomments_clear = true THEN NULL ELSE COALESCE(p_usercomments, NULL) END,
                CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, NULL) END,
                CASE WHEN p_codecomments_clear = true THEN NULL ELSE COALESCE(p_codecomments, NULL) END,
                COALESCE(p_codeapprovalstatus, 'Pending'),
                CASE WHEN p_codeapprovalcomments_clear = true THEN NULL ELSE COALESCE(p_codeapprovalcomments, NULL) END,
                CASE WHEN p_codeapprovedbyuserid_clear = true THEN NULL ELSE COALESCE(p_codeapprovedbyuserid, NULL) END,
                CASE WHEN p_codeapprovedat_clear = true THEN NULL ELSE COALESCE(p_codeapprovedat, NULL) END,
                COALESCE(p_codelocked, FALSE),
                COALESCE(p_forcecodegeneration, FALSE),
                CASE WHEN p_retentionperiod_clear = true THEN NULL ELSE COALESCE(p_retentionperiod, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, NULL) END,
                CASE WHEN p_defaultcompactpromptid_clear = true THEN NULL ELSE COALESCE(p_defaultcompactpromptid, NULL) END,
                CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, NULL) END,
                CASE WHEN p_runtimeactionconfiguration_clear = true THEN NULL ELSE COALESCE(p_runtimeactionconfiguration, NULL) END,
                CASE WHEN p_maxexecutiontimems_clear = true THEN NULL ELSE COALESCE(p_maxexecutiontimems, NULL) END,
                CASE WHEN p_createdbyagentid_clear = true THEN NULL ELSE COALESCE(p_createdbyagentid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwActions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAction" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: spUpdateAction
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Action
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAction"(
    p_id UUID,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_name varchar(425) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_userprompt_clear boolean DEFAULT false,
    p_userprompt TEXT DEFAULT NULL,
    p_usercomments_clear boolean DEFAULT false,
    p_usercomments TEXT DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code TEXT DEFAULT NULL,
    p_codecomments_clear boolean DEFAULT false,
    p_codecomments TEXT DEFAULT NULL,
    p_codeapprovalstatus varchar(20) DEFAULT NULL,
    p_codeapprovalcomments_clear boolean DEFAULT false,
    p_codeapprovalcomments TEXT DEFAULT NULL,
    p_codeapprovedbyuserid_clear boolean DEFAULT false,
    p_codeapprovedbyuserid UUID DEFAULT NULL,
    p_codeapprovedat_clear boolean DEFAULT false,
    p_codeapprovedat TIMESTAMPTZ DEFAULT NULL,
    p_codelocked BOOLEAN DEFAULT NULL,
    p_forcecodegeneration BOOLEAN DEFAULT NULL,
    p_retentionperiod_clear boolean DEFAULT false,
    p_retentionperiod int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass varchar(255) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_iconclass_clear boolean DEFAULT false,
    p_iconclass varchar(100) DEFAULT NULL,
    p_defaultcompactpromptid_clear boolean DEFAULT false,
    p_defaultcompactpromptid UUID DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config TEXT DEFAULT NULL,
    p_runtimeactionconfiguration_clear boolean DEFAULT false,
    p_runtimeactionconfiguration TEXT DEFAULT NULL,
    p_maxexecutiontimems_clear boolean DEFAULT false,
    p_maxexecutiontimems int DEFAULT NULL,
    p_createdbyagentid_clear boolean DEFAULT false,
    p_createdbyagentid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwActions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Action"
    SET
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Type" = COALESCE(p_type, "Type"),
        "UserPrompt" = CASE WHEN p_userprompt_clear = true THEN NULL ELSE COALESCE(p_userprompt, "UserPrompt") END,
        "UserComments" = CASE WHEN p_usercomments_clear = true THEN NULL ELSE COALESCE(p_usercomments, "UserComments") END,
        "Code" = CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, "Code") END,
        "CodeComments" = CASE WHEN p_codecomments_clear = true THEN NULL ELSE COALESCE(p_codecomments, "CodeComments") END,
        "CodeApprovalStatus" = COALESCE(p_codeapprovalstatus, "CodeApprovalStatus"),
        "CodeApprovalComments" = CASE WHEN p_codeapprovalcomments_clear = true THEN NULL ELSE COALESCE(p_codeapprovalcomments, "CodeApprovalComments") END,
        "CodeApprovedByUserID" = CASE WHEN p_codeapprovedbyuserid_clear = true THEN NULL ELSE COALESCE(p_codeapprovedbyuserid, "CodeApprovedByUserID") END,
        "CodeApprovedAt" = CASE WHEN p_codeapprovedat_clear = true THEN NULL ELSE COALESCE(p_codeapprovedat, "CodeApprovedAt") END,
        "CodeLocked" = COALESCE(p_codelocked, "CodeLocked"),
        "ForceCodeGeneration" = COALESCE(p_forcecodegeneration, "ForceCodeGeneration"),
        "RetentionPeriod" = CASE WHEN p_retentionperiod_clear = true THEN NULL ELSE COALESCE(p_retentionperiod, "RetentionPeriod") END,
        "Status" = COALESCE(p_status, "Status"),
        "DriverClass" = CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, "DriverClass") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "IconClass" = CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, "IconClass") END,
        "DefaultCompactPromptID" = CASE WHEN p_defaultcompactpromptid_clear = true THEN NULL ELSE COALESCE(p_defaultcompactpromptid, "DefaultCompactPromptID") END,
        "Config" = CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, "Config") END,
        "RuntimeActionConfiguration" = CASE WHEN p_runtimeactionconfiguration_clear = true THEN NULL ELSE COALESCE(p_runtimeactionconfiguration, "RuntimeActionConfiguration") END,
        "MaxExecutionTimeMS" = CASE WHEN p_maxexecutiontimems_clear = true THEN NULL ELSE COALESCE(p_maxexecutiontimems, "MaxExecutionTimeMS") END,
        "CreatedByAgentID" = CASE WHEN p_createdbyagentid_clear = true THEN NULL ELSE COALESCE(p_createdbyagentid, "CreatedByAgentID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwActions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAction" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Action table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_action"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_action" ON "__mj"."Action";

CREATE TRIGGER "trg_update_action"
BEFORE UPDATE ON "__mj"."Action"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_action"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: spDeleteAction
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Action
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAction"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Actions.ActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentAction"
        WHERE "ActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentAction"
        SET "ActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.ActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentStep"
        WHERE "ActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentStep"
        SET "ActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Skill Actions records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AISkillAction"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAISkillAction"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Authorizations records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ActionAuthorization"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteActionAuthorization"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Contexts records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ActionContext"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteActionContext"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Execution Logs records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ActionExecutionLog"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteActionExecutionLog"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Libraries records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ActionLibrary"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteActionLibrary"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Params records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ActionParam"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteActionParam"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Result Codes records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ActionResultCode"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteActionResultCode"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Actions records via ParentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Action"
        WHERE "ParentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAction"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Entity Actions records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityAction"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteEntityAction"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: MCP Server Tools.GeneratedActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."MCPServerTool"
        WHERE "GeneratedActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."MCPServerTool"
        SET "GeneratedActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.ActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RecordProcess"
        WHERE "ActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RecordProcess"
        SET "ActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.ActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "ActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "ActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."Action"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAction" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_id"
    ON "__mj"."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_parent_run_id"
    ON "__mj"."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_id"
    ON "__mj"."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_user_id"
    ON "__mj"."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_detail_id"
    ON "__mj"."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_last_run_id"
    ON "__mj"."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_configuration_id"
    ON "__mj"."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_model_id"
    ON "__mj"."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_vendor_id"
    ON "__mj"."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_scheduled_job_run_id"
    ON "__mj"."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_test_run_id"
    ON "__mj"."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_primary_scope_entity_id"
    ON "__mj"."AIAgentRun" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_session_id"
    ON "__mj"."AIAgentRun" ("AgentSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentRunID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentRunID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentRunID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentRunID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentRunID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentRunID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun" c
        INNER JOIN
            cte_descendants p ON c."ParentRunID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentRunID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentRunID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentRunID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentRuns"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentRun_ParentRunID."RunName" AS "ParentRun",
    MJConversation_ConversationID."Name" AS "Conversation",
    MJUser_UserID."Name" AS "User",
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJAIAgentRun_LastRunID."RunName" AS "LastRun",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIModel_OverrideModelID."Name" AS "OverrideModel",
    MJAIVendor_OverrideVendorID."Name" AS "OverrideVendor",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    hier_ParentRunID."RootID" AS "RootParentRunID",
    hier_ParentRunID."Depth" AS "ParentRunIDDepth",
    hier_ParentRunID."Path" AS "ParentRunIDPath",
    hier_ParentRunID."IsLeaf" AS "ParentRunIDIsLeaf",
    hier_ParentRunID."ChildCount" AS "ParentRunIDChildCount"
FROM
    "__mj"."AIAgentRun" AS a
INNER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_ParentRunID
  ON
    "a"."ParentRunID" = MJAIAgentRun_ParentRunID."ID"
LEFT OUTER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "a"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_LastRunID
  ON
    "a"."LastRunID" = MJAIAgentRun_LastRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_OverrideModelID
  ON
    "a"."OverrideModelID" = MJAIModel_OverrideModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIVendor" AS MJAIVendor_OverrideVendorID
  ON
    "a"."OverrideVendorID" = MJAIVendor_OverrideVendorID."ID"
LEFT OUTER JOIN
    "__mj"."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "a"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_agent_run_parent_run_id_get_hierarchy_meta"(a."ID", a."ParentRunID") AS hier_ParentRunID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRuns'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRuns'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'LastHeartbeatAt', 'AgentSessionID', 'PlanMode', 'ExternalSessionID', 'ContinuationDepth']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ParentRunID' THEN '($1->>''ParentRunID'')::UUID'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Running'')'
        WHEN 'StartedAt' THEN 'COALESCE(($1->>''StartedAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'Success' THEN '($1->>''Success'')::BOOLEAN'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ConversationID' THEN '($1->>''ConversationID'')::UUID'
        WHEN 'UserID' THEN '($1->>''UserID'')::UUID'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'AgentState' THEN '($1->>''AgentState'')'
        WHEN 'TotalTokensUsed' THEN '($1->>''TotalTokensUsed'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'TotalPromptTokensUsed' THEN '($1->>''TotalPromptTokensUsed'')::INT'
        WHEN 'TotalCompletionTokensUsed' THEN '($1->>''TotalCompletionTokensUsed'')::INT'
        WHEN 'TotalTokensUsedRollup' THEN '($1->>''TotalTokensUsedRollup'')::INT'
        WHEN 'TotalPromptTokensUsedRollup' THEN '($1->>''TotalPromptTokensUsedRollup'')::INT'
        WHEN 'TotalCompletionTokensUsedRollup' THEN '($1->>''TotalCompletionTokensUsedRollup'')::INT'
        WHEN 'TotalCostRollup' THEN '($1->>''TotalCostRollup'')::DECIMAL(19, 8)'
        WHEN 'ConversationDetailID' THEN '($1->>''ConversationDetailID'')::UUID'
        WHEN 'ConversationDetailSequence' THEN '($1->>''ConversationDetailSequence'')::INT'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'FinalStep' THEN '($1->>''FinalStep'')'
        WHEN 'FinalPayload' THEN '($1->>''FinalPayload'')'
        WHEN 'Message' THEN '($1->>''Message'')'
        WHEN 'LastRunID' THEN '($1->>''LastRunID'')::UUID'
        WHEN 'StartingPayload' THEN '($1->>''StartingPayload'')'
        WHEN 'TotalPromptIterations' THEN 'COALESCE(($1->>''TotalPromptIterations'')::INT, 0)'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'OverrideModelID' THEN '($1->>''OverrideModelID'')::UUID'
        WHEN 'OverrideVendorID' THEN '($1->>''OverrideVendorID'')::UUID'
        WHEN 'Data' THEN '($1->>''Data'')'
        WHEN 'Verbose' THEN '($1->>''Verbose'')::BOOLEAN'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'ScheduledJobRunID' THEN '($1->>''ScheduledJobRunID'')::UUID'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'PrimaryScopeEntityID' THEN '($1->>''PrimaryScopeEntityID'')::UUID'
        WHEN 'PrimaryScopeRecordID' THEN '($1->>''PrimaryScopeRecordID'')'
        WHEN 'SecondaryScopes' THEN '($1->>''SecondaryScopes'')'
        WHEN 'ExternalReferenceID' THEN '($1->>''ExternalReferenceID'')'
        WHEN 'CompanyID' THEN '($1->>''CompanyID'')::UUID'
        WHEN 'TotalCacheReadTokensUsed' THEN '($1->>''TotalCacheReadTokensUsed'')::INT'
        WHEN 'TotalCacheWriteTokensUsed' THEN '($1->>''TotalCacheWriteTokensUsed'')::INT'
        WHEN 'LastHeartbeatAt' THEN '($1->>''LastHeartbeatAt'')::TIMESTAMPTZ'
        WHEN 'AgentSessionID' THEN '($1->>''AgentSessionID'')::UUID'
        WHEN 'PlanMode' THEN 'COALESCE(($1->>''PlanMode'')::BOOLEAN, FALSE)'
        WHEN 'ExternalSessionID' THEN '($1->>''ExternalSessionID'')'
        WHEN 'ContinuationDepth' THEN 'COALESCE(($1->>''ContinuationDepth'')::INTEGER, 0)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIAgentRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgentRun: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIAgentRun"
    SET
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ParentRunID" = CASE WHEN p_data ? 'ParentRunID' THEN (p_data->>'ParentRunID')::UUID ELSE "ParentRunID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "StartedAt" = CASE WHEN p_data ? 'StartedAt' THEN (p_data->>'StartedAt')::TIMESTAMPTZ ELSE "StartedAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ConversationID" = CASE WHEN p_data ? 'ConversationID' THEN (p_data->>'ConversationID')::UUID ELSE "ConversationID" END,
        "UserID" = CASE WHEN p_data ? 'UserID' THEN (p_data->>'UserID')::UUID ELSE "UserID" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "AgentState" = CASE WHEN p_data ? 'AgentState' THEN (p_data->>'AgentState') ELSE "AgentState" END,
        "TotalTokensUsed" = CASE WHEN p_data ? 'TotalTokensUsed' THEN (p_data->>'TotalTokensUsed')::INT ELSE "TotalTokensUsed" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "TotalPromptTokensUsed" = CASE WHEN p_data ? 'TotalPromptTokensUsed' THEN (p_data->>'TotalPromptTokensUsed')::INT ELSE "TotalPromptTokensUsed" END,
        "TotalCompletionTokensUsed" = CASE WHEN p_data ? 'TotalCompletionTokensUsed' THEN (p_data->>'TotalCompletionTokensUsed')::INT ELSE "TotalCompletionTokensUsed" END,
        "TotalTokensUsedRollup" = CASE WHEN p_data ? 'TotalTokensUsedRollup' THEN (p_data->>'TotalTokensUsedRollup')::INT ELSE "TotalTokensUsedRollup" END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_data ? 'TotalPromptTokensUsedRollup' THEN (p_data->>'TotalPromptTokensUsedRollup')::INT ELSE "TotalPromptTokensUsedRollup" END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_data ? 'TotalCompletionTokensUsedRollup' THEN (p_data->>'TotalCompletionTokensUsedRollup')::INT ELSE "TotalCompletionTokensUsedRollup" END,
        "TotalCostRollup" = CASE WHEN p_data ? 'TotalCostRollup' THEN (p_data->>'TotalCostRollup')::DECIMAL(19, 8) ELSE "TotalCostRollup" END,
        "ConversationDetailID" = CASE WHEN p_data ? 'ConversationDetailID' THEN (p_data->>'ConversationDetailID')::UUID ELSE "ConversationDetailID" END,
        "ConversationDetailSequence" = CASE WHEN p_data ? 'ConversationDetailSequence' THEN (p_data->>'ConversationDetailSequence')::INT ELSE "ConversationDetailSequence" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "FinalStep" = CASE WHEN p_data ? 'FinalStep' THEN (p_data->>'FinalStep') ELSE "FinalStep" END,
        "FinalPayload" = CASE WHEN p_data ? 'FinalPayload' THEN (p_data->>'FinalPayload') ELSE "FinalPayload" END,
        "Message" = CASE WHEN p_data ? 'Message' THEN (p_data->>'Message') ELSE "Message" END,
        "LastRunID" = CASE WHEN p_data ? 'LastRunID' THEN (p_data->>'LastRunID')::UUID ELSE "LastRunID" END,
        "StartingPayload" = CASE WHEN p_data ? 'StartingPayload' THEN (p_data->>'StartingPayload') ELSE "StartingPayload" END,
        "TotalPromptIterations" = CASE WHEN p_data ? 'TotalPromptIterations' THEN (p_data->>'TotalPromptIterations')::INT ELSE "TotalPromptIterations" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "OverrideModelID" = CASE WHEN p_data ? 'OverrideModelID' THEN (p_data->>'OverrideModelID')::UUID ELSE "OverrideModelID" END,
        "OverrideVendorID" = CASE WHEN p_data ? 'OverrideVendorID' THEN (p_data->>'OverrideVendorID')::UUID ELSE "OverrideVendorID" END,
        "Data" = CASE WHEN p_data ? 'Data' THEN (p_data->>'Data') ELSE "Data" END,
        "Verbose" = CASE WHEN p_data ? 'Verbose' THEN (p_data->>'Verbose')::BOOLEAN ELSE "Verbose" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "ScheduledJobRunID" = CASE WHEN p_data ? 'ScheduledJobRunID' THEN (p_data->>'ScheduledJobRunID')::UUID ELSE "ScheduledJobRunID" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "PrimaryScopeEntityID" = CASE WHEN p_data ? 'PrimaryScopeEntityID' THEN (p_data->>'PrimaryScopeEntityID')::UUID ELSE "PrimaryScopeEntityID" END,
        "PrimaryScopeRecordID" = CASE WHEN p_data ? 'PrimaryScopeRecordID' THEN (p_data->>'PrimaryScopeRecordID') ELSE "PrimaryScopeRecordID" END,
        "SecondaryScopes" = CASE WHEN p_data ? 'SecondaryScopes' THEN (p_data->>'SecondaryScopes') ELSE "SecondaryScopes" END,
        "ExternalReferenceID" = CASE WHEN p_data ? 'ExternalReferenceID' THEN (p_data->>'ExternalReferenceID') ELSE "ExternalReferenceID" END,
        "CompanyID" = CASE WHEN p_data ? 'CompanyID' THEN (p_data->>'CompanyID')::UUID ELSE "CompanyID" END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_data ? 'TotalCacheReadTokensUsed' THEN (p_data->>'TotalCacheReadTokensUsed')::INT ELSE "TotalCacheReadTokensUsed" END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_data ? 'TotalCacheWriteTokensUsed' THEN (p_data->>'TotalCacheWriteTokensUsed')::INT ELSE "TotalCacheWriteTokensUsed" END,
        "LastHeartbeatAt" = CASE WHEN p_data ? 'LastHeartbeatAt' THEN (p_data->>'LastHeartbeatAt')::TIMESTAMPTZ ELSE "LastHeartbeatAt" END,
        "AgentSessionID" = CASE WHEN p_data ? 'AgentSessionID' THEN (p_data->>'AgentSessionID')::UUID ELSE "AgentSessionID" END,
        "PlanMode" = CASE WHEN p_data ? 'PlanMode' THEN (p_data->>'PlanMode')::BOOLEAN ELSE "PlanMode" END,
        "ExternalSessionID" = CASE WHEN p_data ? 'ExternalSessionID' THEN (p_data->>'ExternalSessionID') ELSE "ExternalSessionID" END,
        "ContinuationDepth" = CASE WHEN p_data ? 'ContinuationDepth' THEN (p_data->>'ContinuationDepth')::INTEGER ELSE "ContinuationDepth" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run" ON "__mj"."AIAgentRun";

CREATE TRIGGER "trg_update_ai_agent_run"
BEFORE UPDATE ON "__mj"."AIAgentRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentExample"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentExample"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentNote"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentNote"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "OriginatingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "OriginatingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.ResumingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "ResumingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "ResumingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Medias records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunMedia"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Steps records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRunStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ParentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "ParentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "ParentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.LastRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "LastRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "LastRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Skills.ActivatedByRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationSkill"
        WHERE "ActivatedByRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ConversationSkill"
        SET "ActivatedByRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DuplicateRunDetailMatch"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DuplicateRunDetailMatch"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Session Iterations.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ExperimentSessionIteration"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ExperimentSessionIteration"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Sessions.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ExperimentSession"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ExperimentSession"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Process Run Details.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ProcessRunDetail"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ProcessRunDetail"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutineRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutineRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIAgentRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_parent_id"
    ON "__mj"."AIAgent" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_context_compression_prompt_id"
    ON "__mj"."AIAgent" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_type_id"
    ON "__mj"."AIAgent" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_artifact_type_id"
    ON "__mj"."AIAgent" ("DefaultArtifactTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_owner_user_id"
    ON "__mj"."AIAgent" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_attachment_storage_provider_id"
    ON "__mj"."AIAgent" ("AttachmentStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_category_id"
    ON "__mj"."AIAgent" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_storage_account_id"
    ON "__mj"."AIAgent" ("DefaultStorageAccountID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_co_agent_id"
    ON "__mj"."AIAgent" ("DefaultCoAgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_recording_storage_provider_id"
    ON "__mj"."AIAgent" ("RecordingStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_media_collection_id"
    ON "__mj"."AIAgent" ("DefaultMediaCollectionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_conversation_summary_prompt_id"
    ON "__mj"."AIAgent" ("ConversationSummaryPromptID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgent" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgent" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgent" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgent" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgent" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgent"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgent" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fn_ai_agent_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIAgent"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."AIAgent" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: vwAIAgents
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agents
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgents"
AS
SELECT
    a.*,
    MJAIAgent_ParentID."Name" AS "Parent",
    MJAIPrompt_ContextCompressionPromptID."Name" AS "ContextCompressionPrompt",
    MJAIAgentType_TypeID."Name" AS "Type",
    MJArtifactType_DefaultArtifactTypeID."Name" AS "DefaultArtifactType",
    MJUser_OwnerUserID."Name" AS "OwnerUser",
    MJFileStorageProvider_AttachmentStorageProviderID."Name" AS "AttachmentStorageProvider",
    MJAIAgentCategory_CategoryID."Name" AS "Category",
    MJFileStorageAccount_DefaultStorageAccountID."Name" AS "DefaultStorageAccount",
    MJAIAgent_DefaultCoAgentID."Name" AS "DefaultCoAgent",
    MJFileStorageProvider_RecordingStorageProviderID."Name" AS "RecordingStorageProvider",
    MJCollection_DefaultMediaCollectionID."Name" AS "DefaultMediaCollection",
    MJAIPrompt_ConversationSummaryPromptID."Name" AS "ConversationSummaryPrompt",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."AIAgent" AS a
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_ParentID
  ON
    "a"."ParentID" = MJAIAgent_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ContextCompressionPromptID
  ON
    "a"."ContextCompressionPromptID" = MJAIPrompt_ContextCompressionPromptID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentType" AS MJAIAgentType_TypeID
  ON
    "a"."TypeID" = MJAIAgentType_TypeID."ID"
LEFT OUTER JOIN
    "__mj"."ArtifactType" AS MJArtifactType_DefaultArtifactTypeID
  ON
    "a"."DefaultArtifactTypeID" = MJArtifactType_DefaultArtifactTypeID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_OwnerUserID
  ON
    "a"."OwnerUserID" = MJUser_OwnerUserID."ID"
LEFT OUTER JOIN
    "__mj"."FileStorageProvider" AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    "a"."AttachmentStorageProviderID" = MJFileStorageProvider_AttachmentStorageProviderID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentCategory" AS MJAIAgentCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIAgentCategory_CategoryID."ID"
LEFT OUTER JOIN
    "__mj"."FileStorageAccount" AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    "a"."DefaultStorageAccountID" = MJFileStorageAccount_DefaultStorageAccountID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_DefaultCoAgentID
  ON
    "a"."DefaultCoAgentID" = MJAIAgent_DefaultCoAgentID."ID"
LEFT OUTER JOIN
    "__mj"."FileStorageProvider" AS MJFileStorageProvider_RecordingStorageProviderID
  ON
    "a"."RecordingStorageProviderID" = MJFileStorageProvider_RecordingStorageProviderID."ID"
LEFT OUTER JOIN
    "__mj"."Collection" AS MJCollection_DefaultMediaCollectionID
  ON
    "a"."DefaultMediaCollectionID" = MJCollection_DefaultMediaCollectionID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ConversationSummaryPromptID
  ON
    "a"."ConversationSummaryPromptID" = MJAIPrompt_ConversationSummaryPromptID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_agent_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgents'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgents'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgents'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgents" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIAgents" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgents" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgents" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spCreateAIAgent
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgent (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgent"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgents"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration', 'AllowMemoryWrite', 'RecordingDefault', 'RecordingStorageProviderID', 'DefaultMediaCollectionID', 'SupportsPlanMode', 'AcceptsSkills', 'SkillActivationMode', 'RequirePlanMode', 'ContextWindowMaxTokens', 'CompactionTriggerPercent', 'CompactionTargetPercent', 'ConversationSummaryPromptID', 'DeclareActionsAsNativeTools']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'Name' THEN '($1->>''Name'')'
        WHEN 'Description' THEN '($1->>''Description'')'
        WHEN 'LogoURL' THEN '($1->>''LogoURL'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'ExposeAsAction' THEN 'COALESCE(($1->>''ExposeAsAction'')::BOOLEAN, FALSE)'
        WHEN 'ExecutionOrder' THEN 'COALESCE(($1->>''ExecutionOrder'')::INT, 0)'
        WHEN 'ExecutionMode' THEN 'COALESCE(($1->>''ExecutionMode''), ''Sequential'')'
        WHEN 'EnableContextCompression' THEN 'COALESCE(($1->>''EnableContextCompression'')::BOOLEAN, FALSE)'
        WHEN 'ContextCompressionMessageThreshold' THEN '($1->>''ContextCompressionMessageThreshold'')::INT'
        WHEN 'ContextCompressionPromptID' THEN '($1->>''ContextCompressionPromptID'')::UUID'
        WHEN 'ContextCompressionMessageRetentionCount' THEN '($1->>''ContextCompressionMessageRetentionCount'')::INT'
        WHEN 'TypeID' THEN '($1->>''TypeID'')::UUID'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'DriverClass' THEN '($1->>''DriverClass'')'
        WHEN 'IconClass' THEN '($1->>''IconClass'')'
        WHEN 'ModelSelectionMode' THEN 'COALESCE(($1->>''ModelSelectionMode''), ''Agent Type'')'
        WHEN 'PayloadDownstreamPaths' THEN 'COALESCE(($1->>''PayloadDownstreamPaths''), ''["*"]'')'
        WHEN 'PayloadUpstreamPaths' THEN 'COALESCE(($1->>''PayloadUpstreamPaths''), ''["*"]'')'
        WHEN 'PayloadSelfReadPaths' THEN '($1->>''PayloadSelfReadPaths'')'
        WHEN 'PayloadSelfWritePaths' THEN '($1->>''PayloadSelfWritePaths'')'
        WHEN 'PayloadScope' THEN '($1->>''PayloadScope'')'
        WHEN 'FinalPayloadValidation' THEN '($1->>''FinalPayloadValidation'')'
        WHEN 'FinalPayloadValidationMode' THEN 'COALESCE(($1->>''FinalPayloadValidationMode''), ''Retry'')'
        WHEN 'FinalPayloadValidationMaxRetries' THEN 'COALESCE(($1->>''FinalPayloadValidationMaxRetries'')::INT, 3)'
        WHEN 'MaxCostPerRun' THEN '($1->>''MaxCostPerRun'')::DECIMAL(10, 4)'
        WHEN 'MaxTokensPerRun' THEN '($1->>''MaxTokensPerRun'')::INT'
        WHEN 'MaxIterationsPerRun' THEN '($1->>''MaxIterationsPerRun'')::INT'
        WHEN 'MaxTimePerRun' THEN '($1->>''MaxTimePerRun'')::INT'
        WHEN 'MinExecutionsPerRun' THEN '($1->>''MinExecutionsPerRun'')::INT'
        WHEN 'MaxExecutionsPerRun' THEN '($1->>''MaxExecutionsPerRun'')::INT'
        WHEN 'StartingPayloadValidation' THEN '($1->>''StartingPayloadValidation'')'
        WHEN 'StartingPayloadValidationMode' THEN 'COALESCE(($1->>''StartingPayloadValidationMode''), ''Fail'')'
        WHEN 'DefaultPromptEffortLevel' THEN '($1->>''DefaultPromptEffortLevel'')::INT'
        WHEN 'ChatHandlingOption' THEN '($1->>''ChatHandlingOption'')'
        WHEN 'DefaultArtifactTypeID' THEN '($1->>''DefaultArtifactTypeID'')::UUID'
        WHEN 'OwnerUserID' THEN 'CASE WHEN ($1->>''OwnerUserID'')::UUID = ''00000000-0000-0000-0000-000000000000''::uuid THEN ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'' ELSE COALESCE(($1->>''OwnerUserID'')::UUID, ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'') END'
        WHEN 'InvocationMode' THEN 'COALESCE(($1->>''InvocationMode''), ''Any'')'
        WHEN 'ArtifactCreationMode' THEN 'COALESCE(($1->>''ArtifactCreationMode''), ''Always'')'
        WHEN 'FunctionalRequirements' THEN '($1->>''FunctionalRequirements'')'
        WHEN 'TechnicalDesign' THEN '($1->>''TechnicalDesign'')'
        WHEN 'InjectNotes' THEN 'COALESCE(($1->>''InjectNotes'')::BOOLEAN, TRUE)'
        WHEN 'MaxNotesToInject' THEN 'COALESCE(($1->>''MaxNotesToInject'')::INT, 5)'
        WHEN 'NoteInjectionStrategy' THEN 'COALESCE(($1->>''NoteInjectionStrategy''), ''Relevant'')'
        WHEN 'InjectExamples' THEN 'COALESCE(($1->>''InjectExamples'')::BOOLEAN, FALSE)'
        WHEN 'MaxExamplesToInject' THEN 'COALESCE(($1->>''MaxExamplesToInject'')::INT, 3)'
        WHEN 'ExampleInjectionStrategy' THEN 'COALESCE(($1->>''ExampleInjectionStrategy''), ''Semantic'')'
        WHEN 'IsRestricted' THEN 'COALESCE(($1->>''IsRestricted'')::BOOLEAN, FALSE)'
        WHEN 'MessageMode' THEN 'COALESCE(($1->>''MessageMode''), ''None'')'
        WHEN 'MaxMessages' THEN '($1->>''MaxMessages'')::INT'
        WHEN 'AttachmentStorageProviderID' THEN '($1->>''AttachmentStorageProviderID'')::UUID'
        WHEN 'AttachmentRootPath' THEN '($1->>''AttachmentRootPath'')'
        WHEN 'InlineStorageThresholdBytes' THEN '($1->>''InlineStorageThresholdBytes'')::INT'
        WHEN 'AgentTypePromptParams' THEN '($1->>''AgentTypePromptParams'')'
        WHEN 'ScopeConfig' THEN '($1->>''ScopeConfig'')'
        WHEN 'NoteRetentionDays' THEN '($1->>''NoteRetentionDays'')::INT'
        WHEN 'ExampleRetentionDays' THEN '($1->>''ExampleRetentionDays'')::INT'
        WHEN 'AutoArchiveEnabled' THEN 'COALESCE(($1->>''AutoArchiveEnabled'')::BOOLEAN, TRUE)'
        WHEN 'RerankerConfiguration' THEN '($1->>''RerankerConfiguration'')'
        WHEN 'CategoryID' THEN '($1->>''CategoryID'')::UUID'
        WHEN 'AllowEphemeralClientTools' THEN 'COALESCE(($1->>''AllowEphemeralClientTools'')::BOOLEAN, TRUE)'
        WHEN 'DefaultStorageAccountID' THEN '($1->>''DefaultStorageAccountID'')::UUID'
        WHEN 'SearchScopeAccess' THEN 'COALESCE(($1->>''SearchScopeAccess''), ''None'')'
        WHEN 'AcceptUnregisteredFiles' THEN 'COALESCE(($1->>''AcceptUnregisteredFiles'')::BOOLEAN, FALSE)'
        WHEN 'DefaultCoAgentID' THEN '($1->>''DefaultCoAgentID'')::UUID'
        WHEN 'TypeConfiguration' THEN '($1->>''TypeConfiguration'')'
        WHEN 'AllowMemoryWrite' THEN 'COALESCE(($1->>''AllowMemoryWrite'')::BOOLEAN, TRUE)'
        WHEN 'RecordingDefault' THEN '($1->>''RecordingDefault'')'
        WHEN 'RecordingStorageProviderID' THEN '($1->>''RecordingStorageProviderID'')::UUID'
        WHEN 'DefaultMediaCollectionID' THEN '($1->>''DefaultMediaCollectionID'')::UUID'
        WHEN 'SupportsPlanMode' THEN 'COALESCE(($1->>''SupportsPlanMode'')::BOOLEAN, TRUE)'
        WHEN 'AcceptsSkills' THEN 'COALESCE(($1->>''AcceptsSkills''), ''None'')'
        WHEN 'SkillActivationMode' THEN 'COALESCE(($1->>''SkillActivationMode''), ''RequestedOnly'')'
        WHEN 'RequirePlanMode' THEN 'COALESCE(($1->>''RequirePlanMode'')::BOOLEAN, FALSE)'
        WHEN 'ContextWindowMaxTokens' THEN '($1->>''ContextWindowMaxTokens'')::INT'
        WHEN 'CompactionTriggerPercent' THEN '($1->>''CompactionTriggerPercent'')::INT'
        WHEN 'CompactionTargetPercent' THEN '($1->>''CompactionTargetPercent'')::INT'
        WHEN 'ConversationSummaryPromptID' THEN '($1->>''ConversationSummaryPromptID'')::UUID'
        WHEN 'DeclareActionsAsNativeTools' THEN 'COALESCE(($1->>''DeclareActionsAsNativeTools'')::BOOLEAN, TRUE)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIAgent" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgent" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spUpdateAIAgent
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgent (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgent"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgents"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgent: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIAgent"
    SET
        "Name" = CASE WHEN p_data ? 'Name' THEN (p_data->>'Name') ELSE "Name" END,
        "Description" = CASE WHEN p_data ? 'Description' THEN (p_data->>'Description') ELSE "Description" END,
        "LogoURL" = CASE WHEN p_data ? 'LogoURL' THEN (p_data->>'LogoURL') ELSE "LogoURL" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "ExposeAsAction" = CASE WHEN p_data ? 'ExposeAsAction' THEN (p_data->>'ExposeAsAction')::BOOLEAN ELSE "ExposeAsAction" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INT ELSE "ExecutionOrder" END,
        "ExecutionMode" = CASE WHEN p_data ? 'ExecutionMode' THEN (p_data->>'ExecutionMode') ELSE "ExecutionMode" END,
        "EnableContextCompression" = CASE WHEN p_data ? 'EnableContextCompression' THEN (p_data->>'EnableContextCompression')::BOOLEAN ELSE "EnableContextCompression" END,
        "ContextCompressionMessageThreshold" = CASE WHEN p_data ? 'ContextCompressionMessageThreshold' THEN (p_data->>'ContextCompressionMessageThreshold')::INT ELSE "ContextCompressionMessageThreshold" END,
        "ContextCompressionPromptID" = CASE WHEN p_data ? 'ContextCompressionPromptID' THEN (p_data->>'ContextCompressionPromptID')::UUID ELSE "ContextCompressionPromptID" END,
        "ContextCompressionMessageRetentionCount" = CASE WHEN p_data ? 'ContextCompressionMessageRetentionCount' THEN (p_data->>'ContextCompressionMessageRetentionCount')::INT ELSE "ContextCompressionMessageRetentionCount" END,
        "TypeID" = CASE WHEN p_data ? 'TypeID' THEN (p_data->>'TypeID')::UUID ELSE "TypeID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "DriverClass" = CASE WHEN p_data ? 'DriverClass' THEN (p_data->>'DriverClass') ELSE "DriverClass" END,
        "IconClass" = CASE WHEN p_data ? 'IconClass' THEN (p_data->>'IconClass') ELSE "IconClass" END,
        "ModelSelectionMode" = CASE WHEN p_data ? 'ModelSelectionMode' THEN (p_data->>'ModelSelectionMode') ELSE "ModelSelectionMode" END,
        "PayloadDownstreamPaths" = CASE WHEN p_data ? 'PayloadDownstreamPaths' THEN (p_data->>'PayloadDownstreamPaths') ELSE "PayloadDownstreamPaths" END,
        "PayloadUpstreamPaths" = CASE WHEN p_data ? 'PayloadUpstreamPaths' THEN (p_data->>'PayloadUpstreamPaths') ELSE "PayloadUpstreamPaths" END,
        "PayloadSelfReadPaths" = CASE WHEN p_data ? 'PayloadSelfReadPaths' THEN (p_data->>'PayloadSelfReadPaths') ELSE "PayloadSelfReadPaths" END,
        "PayloadSelfWritePaths" = CASE WHEN p_data ? 'PayloadSelfWritePaths' THEN (p_data->>'PayloadSelfWritePaths') ELSE "PayloadSelfWritePaths" END,
        "PayloadScope" = CASE WHEN p_data ? 'PayloadScope' THEN (p_data->>'PayloadScope') ELSE "PayloadScope" END,
        "FinalPayloadValidation" = CASE WHEN p_data ? 'FinalPayloadValidation' THEN (p_data->>'FinalPayloadValidation') ELSE "FinalPayloadValidation" END,
        "FinalPayloadValidationMode" = CASE WHEN p_data ? 'FinalPayloadValidationMode' THEN (p_data->>'FinalPayloadValidationMode') ELSE "FinalPayloadValidationMode" END,
        "FinalPayloadValidationMaxRetries" = CASE WHEN p_data ? 'FinalPayloadValidationMaxRetries' THEN (p_data->>'FinalPayloadValidationMaxRetries')::INT ELSE "FinalPayloadValidationMaxRetries" END,
        "MaxCostPerRun" = CASE WHEN p_data ? 'MaxCostPerRun' THEN (p_data->>'MaxCostPerRun')::DECIMAL(10, 4) ELSE "MaxCostPerRun" END,
        "MaxTokensPerRun" = CASE WHEN p_data ? 'MaxTokensPerRun' THEN (p_data->>'MaxTokensPerRun')::INT ELSE "MaxTokensPerRun" END,
        "MaxIterationsPerRun" = CASE WHEN p_data ? 'MaxIterationsPerRun' THEN (p_data->>'MaxIterationsPerRun')::INT ELSE "MaxIterationsPerRun" END,
        "MaxTimePerRun" = CASE WHEN p_data ? 'MaxTimePerRun' THEN (p_data->>'MaxTimePerRun')::INT ELSE "MaxTimePerRun" END,
        "MinExecutionsPerRun" = CASE WHEN p_data ? 'MinExecutionsPerRun' THEN (p_data->>'MinExecutionsPerRun')::INT ELSE "MinExecutionsPerRun" END,
        "MaxExecutionsPerRun" = CASE WHEN p_data ? 'MaxExecutionsPerRun' THEN (p_data->>'MaxExecutionsPerRun')::INT ELSE "MaxExecutionsPerRun" END,
        "StartingPayloadValidation" = CASE WHEN p_data ? 'StartingPayloadValidation' THEN (p_data->>'StartingPayloadValidation') ELSE "StartingPayloadValidation" END,
        "StartingPayloadValidationMode" = CASE WHEN p_data ? 'StartingPayloadValidationMode' THEN (p_data->>'StartingPayloadValidationMode') ELSE "StartingPayloadValidationMode" END,
        "DefaultPromptEffortLevel" = CASE WHEN p_data ? 'DefaultPromptEffortLevel' THEN (p_data->>'DefaultPromptEffortLevel')::INT ELSE "DefaultPromptEffortLevel" END,
        "ChatHandlingOption" = CASE WHEN p_data ? 'ChatHandlingOption' THEN (p_data->>'ChatHandlingOption') ELSE "ChatHandlingOption" END,
        "DefaultArtifactTypeID" = CASE WHEN p_data ? 'DefaultArtifactTypeID' THEN (p_data->>'DefaultArtifactTypeID')::UUID ELSE "DefaultArtifactTypeID" END,
        "OwnerUserID" = CASE WHEN p_data ? 'OwnerUserID' THEN (p_data->>'OwnerUserID')::UUID ELSE "OwnerUserID" END,
        "InvocationMode" = CASE WHEN p_data ? 'InvocationMode' THEN (p_data->>'InvocationMode') ELSE "InvocationMode" END,
        "ArtifactCreationMode" = CASE WHEN p_data ? 'ArtifactCreationMode' THEN (p_data->>'ArtifactCreationMode') ELSE "ArtifactCreationMode" END,
        "FunctionalRequirements" = CASE WHEN p_data ? 'FunctionalRequirements' THEN (p_data->>'FunctionalRequirements') ELSE "FunctionalRequirements" END,
        "TechnicalDesign" = CASE WHEN p_data ? 'TechnicalDesign' THEN (p_data->>'TechnicalDesign') ELSE "TechnicalDesign" END,
        "InjectNotes" = CASE WHEN p_data ? 'InjectNotes' THEN (p_data->>'InjectNotes')::BOOLEAN ELSE "InjectNotes" END,
        "MaxNotesToInject" = CASE WHEN p_data ? 'MaxNotesToInject' THEN (p_data->>'MaxNotesToInject')::INT ELSE "MaxNotesToInject" END,
        "NoteInjectionStrategy" = CASE WHEN p_data ? 'NoteInjectionStrategy' THEN (p_data->>'NoteInjectionStrategy') ELSE "NoteInjectionStrategy" END,
        "InjectExamples" = CASE WHEN p_data ? 'InjectExamples' THEN (p_data->>'InjectExamples')::BOOLEAN ELSE "InjectExamples" END,
        "MaxExamplesToInject" = CASE WHEN p_data ? 'MaxExamplesToInject' THEN (p_data->>'MaxExamplesToInject')::INT ELSE "MaxExamplesToInject" END,
        "ExampleInjectionStrategy" = CASE WHEN p_data ? 'ExampleInjectionStrategy' THEN (p_data->>'ExampleInjectionStrategy') ELSE "ExampleInjectionStrategy" END,
        "IsRestricted" = CASE WHEN p_data ? 'IsRestricted' THEN (p_data->>'IsRestricted')::BOOLEAN ELSE "IsRestricted" END,
        "MessageMode" = CASE WHEN p_data ? 'MessageMode' THEN (p_data->>'MessageMode') ELSE "MessageMode" END,
        "MaxMessages" = CASE WHEN p_data ? 'MaxMessages' THEN (p_data->>'MaxMessages')::INT ELSE "MaxMessages" END,
        "AttachmentStorageProviderID" = CASE WHEN p_data ? 'AttachmentStorageProviderID' THEN (p_data->>'AttachmentStorageProviderID')::UUID ELSE "AttachmentStorageProviderID" END,
        "AttachmentRootPath" = CASE WHEN p_data ? 'AttachmentRootPath' THEN (p_data->>'AttachmentRootPath') ELSE "AttachmentRootPath" END,
        "InlineStorageThresholdBytes" = CASE WHEN p_data ? 'InlineStorageThresholdBytes' THEN (p_data->>'InlineStorageThresholdBytes')::INT ELSE "InlineStorageThresholdBytes" END,
        "AgentTypePromptParams" = CASE WHEN p_data ? 'AgentTypePromptParams' THEN (p_data->>'AgentTypePromptParams') ELSE "AgentTypePromptParams" END,
        "ScopeConfig" = CASE WHEN p_data ? 'ScopeConfig' THEN (p_data->>'ScopeConfig') ELSE "ScopeConfig" END,
        "NoteRetentionDays" = CASE WHEN p_data ? 'NoteRetentionDays' THEN (p_data->>'NoteRetentionDays')::INT ELSE "NoteRetentionDays" END,
        "ExampleRetentionDays" = CASE WHEN p_data ? 'ExampleRetentionDays' THEN (p_data->>'ExampleRetentionDays')::INT ELSE "ExampleRetentionDays" END,
        "AutoArchiveEnabled" = CASE WHEN p_data ? 'AutoArchiveEnabled' THEN (p_data->>'AutoArchiveEnabled')::BOOLEAN ELSE "AutoArchiveEnabled" END,
        "RerankerConfiguration" = CASE WHEN p_data ? 'RerankerConfiguration' THEN (p_data->>'RerankerConfiguration') ELSE "RerankerConfiguration" END,
        "CategoryID" = CASE WHEN p_data ? 'CategoryID' THEN (p_data->>'CategoryID')::UUID ELSE "CategoryID" END,
        "AllowEphemeralClientTools" = CASE WHEN p_data ? 'AllowEphemeralClientTools' THEN (p_data->>'AllowEphemeralClientTools')::BOOLEAN ELSE "AllowEphemeralClientTools" END,
        "DefaultStorageAccountID" = CASE WHEN p_data ? 'DefaultStorageAccountID' THEN (p_data->>'DefaultStorageAccountID')::UUID ELSE "DefaultStorageAccountID" END,
        "SearchScopeAccess" = CASE WHEN p_data ? 'SearchScopeAccess' THEN (p_data->>'SearchScopeAccess') ELSE "SearchScopeAccess" END,
        "AcceptUnregisteredFiles" = CASE WHEN p_data ? 'AcceptUnregisteredFiles' THEN (p_data->>'AcceptUnregisteredFiles')::BOOLEAN ELSE "AcceptUnregisteredFiles" END,
        "DefaultCoAgentID" = CASE WHEN p_data ? 'DefaultCoAgentID' THEN (p_data->>'DefaultCoAgentID')::UUID ELSE "DefaultCoAgentID" END,
        "TypeConfiguration" = CASE WHEN p_data ? 'TypeConfiguration' THEN (p_data->>'TypeConfiguration') ELSE "TypeConfiguration" END,
        "AllowMemoryWrite" = CASE WHEN p_data ? 'AllowMemoryWrite' THEN (p_data->>'AllowMemoryWrite')::BOOLEAN ELSE "AllowMemoryWrite" END,
        "RecordingDefault" = CASE WHEN p_data ? 'RecordingDefault' THEN (p_data->>'RecordingDefault') ELSE "RecordingDefault" END,
        "RecordingStorageProviderID" = CASE WHEN p_data ? 'RecordingStorageProviderID' THEN (p_data->>'RecordingStorageProviderID')::UUID ELSE "RecordingStorageProviderID" END,
        "DefaultMediaCollectionID" = CASE WHEN p_data ? 'DefaultMediaCollectionID' THEN (p_data->>'DefaultMediaCollectionID')::UUID ELSE "DefaultMediaCollectionID" END,
        "SupportsPlanMode" = CASE WHEN p_data ? 'SupportsPlanMode' THEN (p_data->>'SupportsPlanMode')::BOOLEAN ELSE "SupportsPlanMode" END,
        "AcceptsSkills" = CASE WHEN p_data ? 'AcceptsSkills' THEN (p_data->>'AcceptsSkills') ELSE "AcceptsSkills" END,
        "SkillActivationMode" = CASE WHEN p_data ? 'SkillActivationMode' THEN (p_data->>'SkillActivationMode') ELSE "SkillActivationMode" END,
        "RequirePlanMode" = CASE WHEN p_data ? 'RequirePlanMode' THEN (p_data->>'RequirePlanMode')::BOOLEAN ELSE "RequirePlanMode" END,
        "ContextWindowMaxTokens" = CASE WHEN p_data ? 'ContextWindowMaxTokens' THEN (p_data->>'ContextWindowMaxTokens')::INT ELSE "ContextWindowMaxTokens" END,
        "CompactionTriggerPercent" = CASE WHEN p_data ? 'CompactionTriggerPercent' THEN (p_data->>'CompactionTriggerPercent')::INT ELSE "CompactionTriggerPercent" END,
        "CompactionTargetPercent" = CASE WHEN p_data ? 'CompactionTargetPercent' THEN (p_data->>'CompactionTargetPercent')::INT ELSE "CompactionTargetPercent" END,
        "ConversationSummaryPromptID" = CASE WHEN p_data ? 'ConversationSummaryPromptID' THEN (p_data->>'ConversationSummaryPromptID')::UUID ELSE "ConversationSummaryPromptID" END,
        "DeclareActionsAsNativeTools" = CASE WHEN p_data ? 'DeclareActionsAsNativeTools' THEN (p_data->>'DeclareActionsAsNativeTools')::BOOLEAN ELSE "DeclareActionsAsNativeTools" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent" ON "__mj"."AIAgent";

CREATE TRIGGER "trg_update_ai_agent"
BEFORE UPDATE ON "__mj"."AIAgent"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgent"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Actions.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentAction"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentAction"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Artifact Types records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentArtifactType"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentArtifactType"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Client Tools records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentClientTool"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentClientTool"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Co Agents records via CoAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentCoAgent"
        WHERE "CoAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentCoAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Co Agents.TargetAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentCoAgent"
        WHERE "TargetAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentCoAgent"
        SET "TargetAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Configurations records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentConfiguration"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentConfiguration"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Credentials records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentCredential"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentCredential"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Data Sources records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentDataSource"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentDataSource"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Examples records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentExample"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentExample"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Learning Cycles records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentLearningCycle"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentLearningCycle"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Modalities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentModality"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentModality"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Models.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentModel"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentModel"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentNote"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentNote"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Permissions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPermission"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Personas records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPersona"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPersona"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPrompt"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRelationship"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRelationship"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Requests records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRequest"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Runs records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Search Scopes records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentSearchScope"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentSearchScope"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Sessions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentSession"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentSession"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Skills records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentSkill"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentSkill"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Steps records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentStep"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.SubAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentStep"
        WHERE "SubAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentStep"
        SET "SubAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.DefaultCoAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "DefaultCoAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "DefaultCoAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Bridge Agent Identities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIBridgeAgentIdentity"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIBridgeAgentIdentity"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIResultCache"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Skill Sub Agents records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AISkillSubAgent"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAISkillSubAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Actions.CreatedByAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Action"
        WHERE "CreatedByAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Action"
        SET "CreatedByAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationDetail"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ConversationDetail"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Conversation Widget Instances records via PinnedAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationWidgetInstance"
        WHERE "PinnedAgentID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationWidgetInstance"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversations.DefaultAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Conversation"
        WHERE "DefaultAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Conversation"
        SET "DefaultAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Entity Documents.ReasoningAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityDocument"
        WHERE "ReasoningAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."EntityDocument"
        SET "ReasoningAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RecordProcess"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RecordProcess"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Search Execution Logs.AIAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."SearchExecutionLog"
        WHERE "AIAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."SearchExecutionLog"
        SET "AIAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIAgent"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgent" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_configuration_default_prompt_for_context_co"
    ON "__mj"."AIConfiguration" ("DefaultPromptForContextCompressionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_configuration_default_prompt_for_context_su"
    ON "__mj"."AIConfiguration" ("DefaultPromptForContextSummarizationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_configuration_default_storage_provider_id"
    ON "__mj"."AIConfiguration" ("DefaultStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_configuration_parent_id"
    ON "__mj"."AIConfiguration" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: fn_ai_configuration_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIConfiguration.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_configuration_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIConfiguration"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIConfiguration" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIConfiguration" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIConfiguration" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: fn_ai_configuration_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIConfiguration.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_configuration_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIConfiguration"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIConfiguration" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIConfiguration" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIConfiguration" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: fn_ai_configuration_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIConfiguration.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_configuration_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIConfiguration"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIConfiguration" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: fn_ai_configuration_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIConfiguration.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_configuration_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIConfiguration"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."AIConfiguration" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: vwAIConfigurations
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Configurations
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIConfigurations"
AS
SELECT
    a.*,
    MJAIPrompt_DefaultPromptForContextCompressionID."Name" AS "DefaultPromptForContextCompression",
    MJAIPrompt_DefaultPromptForContextSummarizationID."Name" AS "DefaultPromptForContextSummarization",
    MJFileStorageProvider_DefaultStorageProviderID."Name" AS "DefaultStorageProvider",
    MJAIConfiguration_ParentID."Name" AS "Parent",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."AIConfiguration" AS a
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_DefaultPromptForContextCompressionID
  ON
    "a"."DefaultPromptForContextCompressionID" = MJAIPrompt_DefaultPromptForContextCompressionID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_DefaultPromptForContextSummarizationID
  ON
    "a"."DefaultPromptForContextSummarizationID" = MJAIPrompt_DefaultPromptForContextSummarizationID."ID"
LEFT OUTER JOIN
    "__mj"."FileStorageProvider" AS MJFileStorageProvider_DefaultStorageProviderID
  ON
    "a"."DefaultStorageProviderID" = MJFileStorageProvider_DefaultStorageProviderID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ParentID
  ON
    "a"."ParentID" = MJAIConfiguration_ParentID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_configuration_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIConfigurations'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIConfigurations'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIConfigurations'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwAIConfigurations" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIConfigurations" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIConfigurations" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIConfigurations" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: spCreateAIConfiguration
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIConfiguration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIConfiguration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIConfiguration"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_defaultpromptforcontextcompressionid_clear boolean DEFAULT false,
    p_defaultpromptforcontextcompressionid UUID DEFAULT NULL,
    p_defaultpromptforcontextsummarizationid_clear boolean DEFAULT false,
    p_defaultpromptforcontextsummarizationid UUID DEFAULT NULL,
    p_defaultstorageproviderid_clear boolean DEFAULT false,
    p_defaultstorageproviderid UUID DEFAULT NULL,
    p_defaultstoragerootpath_clear boolean DEFAULT false,
    p_defaultstoragerootpath varchar(500) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIConfigurations" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIConfiguration"
        (
            "ID",
            "Name",
                "Description",
                "IsDefault",
                "Status",
                "DefaultPromptForContextCompressionID",
                "DefaultPromptForContextSummarizationID",
                "DefaultStorageProviderID",
                "DefaultStorageRootPath",
                "ParentID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_isdefault, FALSE),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_defaultpromptforcontextcompressionid_clear = true THEN NULL ELSE COALESCE(p_defaultpromptforcontextcompressionid, NULL) END,
                CASE WHEN p_defaultpromptforcontextsummarizationid_clear = true THEN NULL ELSE COALESCE(p_defaultpromptforcontextsummarizationid, NULL) END,
                CASE WHEN p_defaultstorageproviderid_clear = true THEN NULL ELSE COALESCE(p_defaultstorageproviderid, NULL) END,
                CASE WHEN p_defaultstoragerootpath_clear = true THEN NULL ELSE COALESCE(p_defaultstoragerootpath, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIConfigurations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIConfiguration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIConfiguration" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: spUpdateAIConfiguration
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIConfiguration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIConfiguration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIConfiguration"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_defaultpromptforcontextcompressionid_clear boolean DEFAULT false,
    p_defaultpromptforcontextcompressionid UUID DEFAULT NULL,
    p_defaultpromptforcontextsummarizationid_clear boolean DEFAULT false,
    p_defaultpromptforcontextsummarizationid UUID DEFAULT NULL,
    p_defaultstorageproviderid_clear boolean DEFAULT false,
    p_defaultstorageproviderid UUID DEFAULT NULL,
    p_defaultstoragerootpath_clear boolean DEFAULT false,
    p_defaultstoragerootpath varchar(500) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIConfigurations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIConfiguration"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "IsDefault" = COALESCE(p_isdefault, "IsDefault"),
        "Status" = COALESCE(p_status, "Status"),
        "DefaultPromptForContextCompressionID" = CASE WHEN p_defaultpromptforcontextcompressionid_clear = true THEN NULL ELSE COALESCE(p_defaultpromptforcontextcompressionid, "DefaultPromptForContextCompressionID") END,
        "DefaultPromptForContextSummarizationID" = CASE WHEN p_defaultpromptforcontextsummarizationid_clear = true THEN NULL ELSE COALESCE(p_defaultpromptforcontextsummarizationid, "DefaultPromptForContextSummarizationID") END,
        "DefaultStorageProviderID" = CASE WHEN p_defaultstorageproviderid_clear = true THEN NULL ELSE COALESCE(p_defaultstorageproviderid, "DefaultStorageProviderID") END,
        "DefaultStorageRootPath" = CASE WHEN p_defaultstoragerootpath_clear = true THEN NULL ELSE COALESCE(p_defaultstoragerootpath, "DefaultStorageRootPath") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIConfigurations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIConfiguration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIConfiguration" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIConfiguration table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_configuration"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_configuration" ON "__mj"."AIConfiguration";

CREATE TRIGGER "trg_update_ai_configuration"
BEFORE UPDATE ON "__mj"."AIConfiguration"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_configuration"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Configurations
-- Item: spDeleteAIConfiguration
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIConfiguration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIConfiguration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIConfiguration"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Configurations.AIConfigurationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentConfiguration"
        WHERE "AIConfigurationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentConfiguration"
        SET "AIConfigurationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via ConfigurationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPrompt"
        WHERE "ConfigurationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ConfigurationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "ConfigurationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "ConfigurationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Configuration Params records via ConfigurationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIConfigurationParam"
        WHERE "ConfigurationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIConfigurationParam"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIConfiguration"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIConfiguration"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Models records via ConfigurationID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptModel"
        WHERE "ConfigurationID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptModel"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ConfigurationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "ConfigurationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "ConfigurationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.ConfigurationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "ConfigurationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIResultCache"
        SET "ConfigurationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Scoped Prompt Configs.ConfigurationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ScopedPromptConfig"
        WHERE "ConfigurationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ScopedPromptConfig"
        SET "ConfigurationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIConfiguration"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIConfiguration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIConfiguration" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_template_id"
    ON "__mj"."AIPrompt" ("TemplateID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_category_id"
    ON "__mj"."AIPrompt" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_type_id"
    ON "__mj"."AIPrompt" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_ai_model_type_id"
    ON "__mj"."AIPrompt" ("AIModelTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_result_selector_prompt_id"
    ON "__mj"."AIPrompt" ("ResultSelectorPromptID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: vwAIPrompts
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompts
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIPrompts"
AS
SELECT
    a.*,
    MJTemplate_TemplateID."Name" AS "Template",
    MJAIPromptCategory_CategoryID."Name" AS "Category",
    MJAIPromptType_TypeID."Name" AS "Type",
    MJAIModelType_AIModelTypeID."Name" AS "AIModelType",
    MJAIPrompt_ResultSelectorPromptID."Name" AS "ResultSelectorPrompt"
FROM
    "__mj"."AIPrompt" AS a
INNER JOIN
    "__mj"."Template" AS MJTemplate_TemplateID
  ON
    "a"."TemplateID" = MJTemplate_TemplateID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptCategory" AS MJAIPromptCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIPromptCategory_CategoryID."ID"
INNER JOIN
    "__mj"."AIPromptType" AS MJAIPromptType_TypeID
  ON
    "a"."TypeID" = MJAIPromptType_TypeID."ID"
LEFT OUTER JOIN
    "__mj"."AIModelType" AS MJAIModelType_AIModelTypeID
  ON
    "a"."AIModelTypeID" = MJAIModelType_AIModelTypeID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ResultSelectorPromptID
  ON
    "a"."ResultSelectorPromptID" = MJAIPrompt_ResultSelectorPromptID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIPrompts'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIPrompts'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIPrompts'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwAIPrompts" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIPrompts" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwAIPrompts" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIPrompts" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spCreateAIPrompt
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIPrompt"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_responseformat varchar(20) DEFAULT NULL,
    p_modelspecificresponseformat_clear boolean DEFAULT false,
    p_modelspecificresponseformat TEXT DEFAULT NULL,
    p_aimodeltypeid_clear boolean DEFAULT false,
    p_aimodeltypeid UUID DEFAULT NULL,
    p_minpowerrank_clear boolean DEFAULT false,
    p_minpowerrank int DEFAULT NULL,
    p_selectionstrategy varchar(20) DEFAULT NULL,
    p_powerpreference varchar(20) DEFAULT NULL,
    p_parallelizationmode varchar(20) DEFAULT NULL,
    p_parallelcount_clear boolean DEFAULT false,
    p_parallelcount int DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam varchar(100) DEFAULT NULL,
    p_outputtype varchar(50) DEFAULT NULL,
    p_outputexample_clear boolean DEFAULT false,
    p_outputexample TEXT DEFAULT NULL,
    p_validationbehavior varchar(50) DEFAULT NULL,
    p_maxretries int DEFAULT NULL,
    p_retrydelayms int DEFAULT NULL,
    p_retrystrategy varchar(20) DEFAULT NULL,
    p_resultselectorpromptid_clear boolean DEFAULT false,
    p_resultselectorpromptid UUID DEFAULT NULL,
    p_enablecaching BOOLEAN DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_cachematchtype varchar(20) DEFAULT NULL,
    p_cachesimilaritythreshold_clear boolean DEFAULT false,
    p_cachesimilaritythreshold float(53) DEFAULT NULL,
    p_cachemustmatchmodel BOOLEAN DEFAULT NULL,
    p_cachemustmatchvendor BOOLEAN DEFAULT NULL,
    p_cachemustmatchagent BOOLEAN DEFAULT NULL,
    p_cachemustmatchconfig BOOLEAN DEFAULT NULL,
    p_promptrole varchar(20) DEFAULT NULL,
    p_promptposition varchar(20) DEFAULT NULL,
    p_temperature_clear boolean DEFAULT false,
    p_temperature decimal(3, 2) DEFAULT NULL,
    p_topp_clear boolean DEFAULT false,
    p_topp decimal(3, 2) DEFAULT NULL,
    p_topk_clear boolean DEFAULT false,
    p_topk int DEFAULT NULL,
    p_minp_clear boolean DEFAULT false,
    p_minp decimal(3, 2) DEFAULT NULL,
    p_frequencypenalty_clear boolean DEFAULT false,
    p_frequencypenalty decimal(3, 2) DEFAULT NULL,
    p_presencepenalty_clear boolean DEFAULT false,
    p_presencepenalty decimal(3, 2) DEFAULT NULL,
    p_seed_clear boolean DEFAULT false,
    p_seed int DEFAULT NULL,
    p_stopsequences_clear boolean DEFAULT false,
    p_stopsequences varchar(1000) DEFAULT NULL,
    p_includelogprobs_clear boolean DEFAULT false,
    p_includelogprobs BOOLEAN DEFAULT NULL,
    p_toplogprobs_clear boolean DEFAULT false,
    p_toplogprobs int DEFAULT NULL,
    p_failoverstrategy varchar(50) DEFAULT NULL,
    p_failovermaxattempts_clear boolean DEFAULT false,
    p_failovermaxattempts int DEFAULT NULL,
    p_failoverdelayseconds_clear boolean DEFAULT false,
    p_failoverdelayseconds int DEFAULT NULL,
    p_failovermodelstrategy varchar(50) DEFAULT NULL,
    p_failovererrorscope varchar(50) DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel int DEFAULT NULL,
    p_assistantprefill_clear boolean DEFAULT false,
    p_assistantprefill TEXT DEFAULT NULL,
    p_prefillfallbackmode varchar(20) DEFAULT NULL,
    p_requirespecificmodels BOOLEAN DEFAULT NULL,
    p_promptconfiguration_clear boolean DEFAULT false,
    p_promptconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIPrompts" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIPrompt"
        (
            "ID",
            "Name",
                "Description",
                "TemplateID",
                "CategoryID",
                "TypeID",
                "Status",
                "ResponseFormat",
                "ModelSpecificResponseFormat",
                "AIModelTypeID",
                "MinPowerRank",
                "SelectionStrategy",
                "PowerPreference",
                "ParallelizationMode",
                "ParallelCount",
                "ParallelConfigParam",
                "OutputType",
                "OutputExample",
                "ValidationBehavior",
                "MaxRetries",
                "RetryDelayMS",
                "RetryStrategy",
                "ResultSelectorPromptID",
                "EnableCaching",
                "CacheTTLSeconds",
                "CacheMatchType",
                "CacheSimilarityThreshold",
                "CacheMustMatchModel",
                "CacheMustMatchVendor",
                "CacheMustMatchAgent",
                "CacheMustMatchConfig",
                "PromptRole",
                "PromptPosition",
                "Temperature",
                "TopP",
                "TopK",
                "MinP",
                "FrequencyPenalty",
                "PresencePenalty",
                "Seed",
                "StopSequences",
                "IncludeLogProbs",
                "TopLogProbs",
                "FailoverStrategy",
                "FailoverMaxAttempts",
                "FailoverDelaySeconds",
                "FailoverModelStrategy",
                "FailoverErrorScope",
                "EffortLevel",
                "AssistantPrefill",
                "PrefillFallbackMode",
                "RequireSpecificModels",
                "PromptConfiguration"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_templateid,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                p_typeid,
                p_status,
                COALESCE(p_responseformat, 'Any'),
                CASE WHEN p_modelspecificresponseformat_clear = true THEN NULL ELSE COALESCE(p_modelspecificresponseformat, NULL) END,
                CASE WHEN p_aimodeltypeid_clear = true THEN NULL ELSE COALESCE(p_aimodeltypeid, NULL) END,
                CASE WHEN p_minpowerrank_clear = true THEN NULL ELSE COALESCE(p_minpowerrank, 0) END,
                COALESCE(p_selectionstrategy, 'Default'),
                COALESCE(p_powerpreference, 'Highest'),
                COALESCE(p_parallelizationmode, 'None'),
                CASE WHEN p_parallelcount_clear = true THEN NULL ELSE COALESCE(p_parallelcount, NULL) END,
                CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, NULL) END,
                COALESCE(p_outputtype, 'string'),
                CASE WHEN p_outputexample_clear = true THEN NULL ELSE COALESCE(p_outputexample, NULL) END,
                COALESCE(p_validationbehavior, 'Warn'),
                COALESCE(p_maxretries, 0),
                COALESCE(p_retrydelayms, 0),
                COALESCE(p_retrystrategy, 'Fixed'),
                CASE WHEN p_resultselectorpromptid_clear = true THEN NULL ELSE COALESCE(p_resultselectorpromptid, NULL) END,
                COALESCE(p_enablecaching, FALSE),
                CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, NULL) END,
                COALESCE(p_cachematchtype, 'Exact'),
                CASE WHEN p_cachesimilaritythreshold_clear = true THEN NULL ELSE COALESCE(p_cachesimilaritythreshold, NULL) END,
                COALESCE(p_cachemustmatchmodel, TRUE),
                COALESCE(p_cachemustmatchvendor, TRUE),
                COALESCE(p_cachemustmatchagent, FALSE),
                COALESCE(p_cachemustmatchconfig, FALSE),
                COALESCE(p_promptrole, 'System'),
                COALESCE(p_promptposition, 'First'),
                CASE WHEN p_temperature_clear = true THEN NULL ELSE COALESCE(p_temperature, NULL) END,
                CASE WHEN p_topp_clear = true THEN NULL ELSE COALESCE(p_topp, NULL) END,
                CASE WHEN p_topk_clear = true THEN NULL ELSE COALESCE(p_topk, NULL) END,
                CASE WHEN p_minp_clear = true THEN NULL ELSE COALESCE(p_minp, NULL) END,
                CASE WHEN p_frequencypenalty_clear = true THEN NULL ELSE COALESCE(p_frequencypenalty, NULL) END,
                CASE WHEN p_presencepenalty_clear = true THEN NULL ELSE COALESCE(p_presencepenalty, NULL) END,
                CASE WHEN p_seed_clear = true THEN NULL ELSE COALESCE(p_seed, NULL) END,
                CASE WHEN p_stopsequences_clear = true THEN NULL ELSE COALESCE(p_stopsequences, NULL) END,
                CASE WHEN p_includelogprobs_clear = true THEN NULL ELSE COALESCE(p_includelogprobs, FALSE) END,
                CASE WHEN p_toplogprobs_clear = true THEN NULL ELSE COALESCE(p_toplogprobs, NULL) END,
                COALESCE(p_failoverstrategy, 'SameModelDifferentVendor'),
                CASE WHEN p_failovermaxattempts_clear = true THEN NULL ELSE COALESCE(p_failovermaxattempts, 3) END,
                CASE WHEN p_failoverdelayseconds_clear = true THEN NULL ELSE COALESCE(p_failoverdelayseconds, 5) END,
                COALESCE(p_failovermodelstrategy, 'PreferSameModel'),
                COALESCE(p_failovererrorscope, 'All'),
                CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, NULL) END,
                CASE WHEN p_assistantprefill_clear = true THEN NULL ELSE COALESCE(p_assistantprefill, NULL) END,
                COALESCE(p_prefillfallbackmode, 'Ignore'),
                COALESCE(p_requirespecificmodels, FALSE),
                CASE WHEN p_promptconfiguration_clear = true THEN NULL ELSE COALESCE(p_promptconfiguration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPrompts"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPrompt" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spUpdateAIPrompt
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIPrompt"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_responseformat varchar(20) DEFAULT NULL,
    p_modelspecificresponseformat_clear boolean DEFAULT false,
    p_modelspecificresponseformat TEXT DEFAULT NULL,
    p_aimodeltypeid_clear boolean DEFAULT false,
    p_aimodeltypeid UUID DEFAULT NULL,
    p_minpowerrank_clear boolean DEFAULT false,
    p_minpowerrank int DEFAULT NULL,
    p_selectionstrategy varchar(20) DEFAULT NULL,
    p_powerpreference varchar(20) DEFAULT NULL,
    p_parallelizationmode varchar(20) DEFAULT NULL,
    p_parallelcount_clear boolean DEFAULT false,
    p_parallelcount int DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam varchar(100) DEFAULT NULL,
    p_outputtype varchar(50) DEFAULT NULL,
    p_outputexample_clear boolean DEFAULT false,
    p_outputexample TEXT DEFAULT NULL,
    p_validationbehavior varchar(50) DEFAULT NULL,
    p_maxretries int DEFAULT NULL,
    p_retrydelayms int DEFAULT NULL,
    p_retrystrategy varchar(20) DEFAULT NULL,
    p_resultselectorpromptid_clear boolean DEFAULT false,
    p_resultselectorpromptid UUID DEFAULT NULL,
    p_enablecaching BOOLEAN DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_cachematchtype varchar(20) DEFAULT NULL,
    p_cachesimilaritythreshold_clear boolean DEFAULT false,
    p_cachesimilaritythreshold float(53) DEFAULT NULL,
    p_cachemustmatchmodel BOOLEAN DEFAULT NULL,
    p_cachemustmatchvendor BOOLEAN DEFAULT NULL,
    p_cachemustmatchagent BOOLEAN DEFAULT NULL,
    p_cachemustmatchconfig BOOLEAN DEFAULT NULL,
    p_promptrole varchar(20) DEFAULT NULL,
    p_promptposition varchar(20) DEFAULT NULL,
    p_temperature_clear boolean DEFAULT false,
    p_temperature decimal(3, 2) DEFAULT NULL,
    p_topp_clear boolean DEFAULT false,
    p_topp decimal(3, 2) DEFAULT NULL,
    p_topk_clear boolean DEFAULT false,
    p_topk int DEFAULT NULL,
    p_minp_clear boolean DEFAULT false,
    p_minp decimal(3, 2) DEFAULT NULL,
    p_frequencypenalty_clear boolean DEFAULT false,
    p_frequencypenalty decimal(3, 2) DEFAULT NULL,
    p_presencepenalty_clear boolean DEFAULT false,
    p_presencepenalty decimal(3, 2) DEFAULT NULL,
    p_seed_clear boolean DEFAULT false,
    p_seed int DEFAULT NULL,
    p_stopsequences_clear boolean DEFAULT false,
    p_stopsequences varchar(1000) DEFAULT NULL,
    p_includelogprobs_clear boolean DEFAULT false,
    p_includelogprobs BOOLEAN DEFAULT NULL,
    p_toplogprobs_clear boolean DEFAULT false,
    p_toplogprobs int DEFAULT NULL,
    p_failoverstrategy varchar(50) DEFAULT NULL,
    p_failovermaxattempts_clear boolean DEFAULT false,
    p_failovermaxattempts int DEFAULT NULL,
    p_failoverdelayseconds_clear boolean DEFAULT false,
    p_failoverdelayseconds int DEFAULT NULL,
    p_failovermodelstrategy varchar(50) DEFAULT NULL,
    p_failovererrorscope varchar(50) DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel int DEFAULT NULL,
    p_assistantprefill_clear boolean DEFAULT false,
    p_assistantprefill TEXT DEFAULT NULL,
    p_prefillfallbackmode varchar(20) DEFAULT NULL,
    p_requirespecificmodels BOOLEAN DEFAULT NULL,
    p_promptconfiguration_clear boolean DEFAULT false,
    p_promptconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIPrompts" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIPrompt"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "TemplateID" = COALESCE(p_templateid, "TemplateID"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "Status" = COALESCE(p_status, "Status"),
        "ResponseFormat" = COALESCE(p_responseformat, "ResponseFormat"),
        "ModelSpecificResponseFormat" = CASE WHEN p_modelspecificresponseformat_clear = true THEN NULL ELSE COALESCE(p_modelspecificresponseformat, "ModelSpecificResponseFormat") END,
        "AIModelTypeID" = CASE WHEN p_aimodeltypeid_clear = true THEN NULL ELSE COALESCE(p_aimodeltypeid, "AIModelTypeID") END,
        "MinPowerRank" = CASE WHEN p_minpowerrank_clear = true THEN NULL ELSE COALESCE(p_minpowerrank, "MinPowerRank") END,
        "SelectionStrategy" = COALESCE(p_selectionstrategy, "SelectionStrategy"),
        "PowerPreference" = COALESCE(p_powerpreference, "PowerPreference"),
        "ParallelizationMode" = COALESCE(p_parallelizationmode, "ParallelizationMode"),
        "ParallelCount" = CASE WHEN p_parallelcount_clear = true THEN NULL ELSE COALESCE(p_parallelcount, "ParallelCount") END,
        "ParallelConfigParam" = CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, "ParallelConfigParam") END,
        "OutputType" = COALESCE(p_outputtype, "OutputType"),
        "OutputExample" = CASE WHEN p_outputexample_clear = true THEN NULL ELSE COALESCE(p_outputexample, "OutputExample") END,
        "ValidationBehavior" = COALESCE(p_validationbehavior, "ValidationBehavior"),
        "MaxRetries" = COALESCE(p_maxretries, "MaxRetries"),
        "RetryDelayMS" = COALESCE(p_retrydelayms, "RetryDelayMS"),
        "RetryStrategy" = COALESCE(p_retrystrategy, "RetryStrategy"),
        "ResultSelectorPromptID" = CASE WHEN p_resultselectorpromptid_clear = true THEN NULL ELSE COALESCE(p_resultselectorpromptid, "ResultSelectorPromptID") END,
        "EnableCaching" = COALESCE(p_enablecaching, "EnableCaching"),
        "CacheTTLSeconds" = CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, "CacheTTLSeconds") END,
        "CacheMatchType" = COALESCE(p_cachematchtype, "CacheMatchType"),
        "CacheSimilarityThreshold" = CASE WHEN p_cachesimilaritythreshold_clear = true THEN NULL ELSE COALESCE(p_cachesimilaritythreshold, "CacheSimilarityThreshold") END,
        "CacheMustMatchModel" = COALESCE(p_cachemustmatchmodel, "CacheMustMatchModel"),
        "CacheMustMatchVendor" = COALESCE(p_cachemustmatchvendor, "CacheMustMatchVendor"),
        "CacheMustMatchAgent" = COALESCE(p_cachemustmatchagent, "CacheMustMatchAgent"),
        "CacheMustMatchConfig" = COALESCE(p_cachemustmatchconfig, "CacheMustMatchConfig"),
        "PromptRole" = COALESCE(p_promptrole, "PromptRole"),
        "PromptPosition" = COALESCE(p_promptposition, "PromptPosition"),
        "Temperature" = CASE WHEN p_temperature_clear = true THEN NULL ELSE COALESCE(p_temperature, "Temperature") END,
        "TopP" = CASE WHEN p_topp_clear = true THEN NULL ELSE COALESCE(p_topp, "TopP") END,
        "TopK" = CASE WHEN p_topk_clear = true THEN NULL ELSE COALESCE(p_topk, "TopK") END,
        "MinP" = CASE WHEN p_minp_clear = true THEN NULL ELSE COALESCE(p_minp, "MinP") END,
        "FrequencyPenalty" = CASE WHEN p_frequencypenalty_clear = true THEN NULL ELSE COALESCE(p_frequencypenalty, "FrequencyPenalty") END,
        "PresencePenalty" = CASE WHEN p_presencepenalty_clear = true THEN NULL ELSE COALESCE(p_presencepenalty, "PresencePenalty") END,
        "Seed" = CASE WHEN p_seed_clear = true THEN NULL ELSE COALESCE(p_seed, "Seed") END,
        "StopSequences" = CASE WHEN p_stopsequences_clear = true THEN NULL ELSE COALESCE(p_stopsequences, "StopSequences") END,
        "IncludeLogProbs" = CASE WHEN p_includelogprobs_clear = true THEN NULL ELSE COALESCE(p_includelogprobs, "IncludeLogProbs") END,
        "TopLogProbs" = CASE WHEN p_toplogprobs_clear = true THEN NULL ELSE COALESCE(p_toplogprobs, "TopLogProbs") END,
        "FailoverStrategy" = COALESCE(p_failoverstrategy, "FailoverStrategy"),
        "FailoverMaxAttempts" = CASE WHEN p_failovermaxattempts_clear = true THEN NULL ELSE COALESCE(p_failovermaxattempts, "FailoverMaxAttempts") END,
        "FailoverDelaySeconds" = CASE WHEN p_failoverdelayseconds_clear = true THEN NULL ELSE COALESCE(p_failoverdelayseconds, "FailoverDelaySeconds") END,
        "FailoverModelStrategy" = COALESCE(p_failovermodelstrategy, "FailoverModelStrategy"),
        "FailoverErrorScope" = COALESCE(p_failovererrorscope, "FailoverErrorScope"),
        "EffortLevel" = CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, "EffortLevel") END,
        "AssistantPrefill" = CASE WHEN p_assistantprefill_clear = true THEN NULL ELSE COALESCE(p_assistantprefill, "AssistantPrefill") END,
        "PrefillFallbackMode" = COALESCE(p_prefillfallbackmode, "PrefillFallbackMode"),
        "RequireSpecificModels" = COALESCE(p_requirespecificmodels, "RequireSpecificModels"),
        "PromptConfiguration" = CASE WHEN p_promptconfiguration_clear = true THEN NULL ELSE COALESCE(p_promptconfiguration, "PromptConfiguration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPrompts"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPrompt" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_prompt"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt" ON "__mj"."AIPrompt";

CREATE TRIGGER "trg_update_ai_prompt"
BEFORE UPDATE ON "__mj"."AIPrompt"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_prompt"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIPrompt"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Actions.CompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentAction"
        WHERE "CompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentAction"
        SET "CompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentPrompt"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentStep"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentStep"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.SystemPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentType"
        WHERE "SystemPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentType"
        SET "SystemPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.ContextCompressionPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentType"
        WHERE "ContextCompressionPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentType"
        SET "ContextCompressionPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.ConversationSummaryPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentType"
        WHERE "ConversationSummaryPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentType"
        SET "ConversationSummaryPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ContextCompressionPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "ContextCompressionPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "ContextCompressionPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ConversationSummaryPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgent"
        WHERE "ConversationSummaryPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgent"
        SET "ConversationSummaryPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextCompressionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIConfiguration"
        WHERE "DefaultPromptForContextCompressionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIConfiguration"
        SET "DefaultPromptForContextCompressionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextSummarizationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIConfiguration"
        WHERE "DefaultPromptForContextSummarizationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIConfiguration"
        SET "DefaultPromptForContextSummarizationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Models records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptModel"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptModel"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Runs records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.JudgeID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "JudgeID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "JudgeID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ChildPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "ChildPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "ChildPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompts.ResultSelectorPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPrompt"
        WHERE "ResultSelectorPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPrompt"
        SET "ResultSelectorPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Result Cache records via AIPromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "AIPromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIResultCache"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Actions.DefaultCompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Action"
        WHERE "DefaultCompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Action"
        SET "DefaultCompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Entity Documents.ReasoningPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."EntityDocument"
        WHERE "ReasoningPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."EntityDocument"
        SET "ReasoningPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RecordProcess"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RecordProcess"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Scoped Prompt Configs records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ScopedPromptConfig"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteScopedPromptConfig"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Scoped Prompt Parts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ScopedPromptPart"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteScopedPromptPart"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Tasks.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIPrompt"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPrompt" TO "cdp_Developer";
