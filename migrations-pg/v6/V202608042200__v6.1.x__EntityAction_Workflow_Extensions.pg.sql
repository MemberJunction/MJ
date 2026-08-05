-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202608042200__v6.1.x__EntityAction_Workflow_Extensions.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."EntityAction"
  ADD COLUMN "Sequence" INT NOT NULL DEFAULT 0,
  ADD COLUMN "ScopeEntityID" UUID NULL,
  ADD COLUMN "ScopeRecordID" VARCHAR(450) NULL
 /* ============================================================================= */ /* Entity Action Workflow Extensions */ /* ============================================================================= */ /* Turns EntityAction into the general workflow-hook substrate for MJ and every */ /* OpenApp built on it. Design + rationale: plans/entity-action-workflow-extensions.md */ /* WHAT THIS ADDS (all additive; no existing behaviour changes) */ /*   1. EntityAction.Sequence          — deterministic ordering when several entity */ /*                                       actions bind to the same invocation type. */ /*   2. EntityAction.ScopeEntityID     — optional binding to a SPECIFIC record, so a */ /*      EntityAction.ScopeRecordID       workflow can be attached to "this Deal Type", */ /*                                       "this Contract Type", "this Pipeline", "this */ /*                                       Company". NULL = applies to all records of */ /*                                       the entity (today's behaviour, unchanged). */ /*   3. EntityActionParam.ValueType    — adds 'Entity Object Data', which passes */ /*      gains a fifth option              entity.GetAll() rather than the BaseEntity */ /*                                       instance. See the note below; this one */ /*                                       prevents a silent-empty-payload bug. */ /*   PART 2 (below) — execution logging: */ /*   4. ActionExecutionLog gains         — EntityActionID, EntityActionInvocationTypeID, */ /*      entity-action provenance           TargetEntityID, TargetRecordID. */ /*   5. Param-value logging becomes      — ActionParam.LogValue, */ /*      fail-closed                        EntityActionParam.LogValue, and a HARD rule */ /*                                         that whole-record value types are never */ /*                                         written to the log. */ /*   6. EntityAction.LoggingMode         — volume control per binding. */ /*   PART 3 (below) — input/output separation: */ /*   7. ActionExecutionLog.ResultParams   — the final merged set, so that Params can */ /*                                          stop being overwritten and keep the */ /*                                          AS-CALLED inputs. */ /* WHAT THIS DOES *NOT* DO */ /*   No engine changes. The columns are inert until the server-side work in the */ /*   plan lands (scope filtering in EntityActionEngineBase, Sequence ordering, */ /*   the 'Entity Object Data' branch in MapParams, routing After* through */ /*   QueueManager, and the redaction rules in PART 2). Shipping schema first is */ /*   deliberate — CodeGen has to generate the entity types before any TypeScript */ /*   can reference these columns. */ /*   ⚠️ UNTIL THE PART 2 ENGINE WORK LANDS, PARAM LOGGING STILL WRITES EVERY VALUE. */ /*   The columns exist; nothing reads them yet. Do NOT author bindings that pass */ /*   whole records into actions until the redaction rules ship — see the plan's */ /*   post-CodeGen runbook for the order. */ /* ⚠️  CODEGEN HAS NOT BEEN RUN AGAINST THIS MIGRATION. Whoever applies it must run */ /*     `mj codegen` and commit the generated output before writing code against the */ /*     new columns. */ /* WHY 'Entity Object Data' EXISTS */ /*   EntityActionParam.ValueType='Entity Object' passes the live BaseEntity instance. */ /*   That is right for actions that call entity methods, and WRONG for anything that */ /*   serializes the value — most importantly the `Data` payload of the `Execute Agent` */ /*   action, which is typed Record<string, unknown> and gets JSON-serialized into the */ /*   agent run. BaseEntity fields are getters, not enumerable own properties, so the */ /*   agent receives `{}` — silently, with no error anywhere. That is the same trap the */ /*   framework already documents for the spread operator, and the fix is the same: */ /*   GetAll(). A 'Script' param returning entity.GetAll() works today, but every author */ /*   reaches for 'Entity Object' first and gets an empty payload, so the safe option */ /*   needs to exist by name. */ /* ============================================================================= */ /* ----------------------------------------------------------------------------- */ /* 1 + 2. EntityAction: Sequence and optional record scope */ /* ----------------------------------------------------------------------------- */;

ALTER TABLE __mj."EntityAction"
  ADD CONSTRAINT "FK_EntityAction_ScopeEntity" FOREIGN KEY ("ScopeEntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  ADD CONSTRAINT "CK_EntityAction_Scope" CHECK ((
    "ScopeEntityID" IS NULL AND "ScopeRecordID" IS NULL
  )
  OR (
    NOT "ScopeEntityID" IS NULL AND NOT "ScopeRecordID" IS NULL
  ));

COMMENT ON COLUMN __mj."EntityAction"."Sequence" IS 'Execution order when multiple Entity Actions are bound to the same entity and invocation type. Lower runs first; ties fall back to creation order. Defaults to 0 so existing rows are unaffected.';

COMMENT ON COLUMN __mj."EntityAction"."ScopeEntityID" IS 'Optional. Together with ScopeRecordID, narrows this Entity Action to records related to ONE specific record - for example a single Deal Type, Contract Type, Pipeline or Company - rather than every record of EntityID. NULL (the default) means the action applies to all records, which is the pre-existing behaviour. How a scope record relates to the subject record is resolved by the app that owns the scope entity; the framework only stores and filters on the pair.';

COMMENT ON COLUMN __mj."EntityAction"."ScopeRecordID" IS 'Optional. The primary key of the scope record, as text, paired with ScopeEntityID. Both columns are NULL or both are set (CK_EntityAction_Scope). Lets a configuration record such as a Deal Type surface "the workflows bound to me" as a real relationship rather than something buried in filter code.';

ALTER TABLE __mj."EntityActionParam"
DROP CONSTRAINT "CHK_EntityActionParam_ValueType" /* ----------------------------------------------------------------------------- */ /* 3. EntityActionParam.ValueType gains 'Entity Object Data' */ /* ----------------------------------------------------------------------------- */;

ALTER TABLE __mj."EntityActionParam"
  ADD CONSTRAINT "CHK_EntityActionParam_ValueType" CHECK ("ValueType" = 'Script'
  OR "ValueType" = 'Entity Object'
  OR "ValueType" = 'Entity Object Data'
  OR "ValueType" = 'Entity Field'
  OR "ValueType" = 'Static');

COMMENT ON COLUMN __mj."EntityActionParam"."ValueType" IS 'How the parameter value is produced at invocation time. Static = the literal Value (parsed as JSON when it parses). Entity Object = the live BaseEntity instance, for actions that call entity methods. Entity Object Data = entity.GetAll(), a plain object - use this for any action that SERIALIZES the value, such as the Data payload of Execute Agent, because a BaseEntity serializes to {} (its fields are getters, not enumerable own properties). Entity Field = the named field''s value. Script = evaluated expression with the entity in scope.';

ALTER TABLE __mj."ActionExecutionLog"
  ADD COLUMN "EntityActionID" UUID NULL,
  ADD COLUMN "EntityActionInvocationTypeID" UUID NULL,
  ADD COLUMN "TargetEntityID" UUID NULL,
  ADD COLUMN "TargetRecordID" VARCHAR(450) NULL
 /* ============================================================================= */ /* PART 2 — Execution logging: provenance, and payloads that are safe to write */ /* ============================================================================= */ /* Two problems, one cause. */ /* (a) PROVENANCE. `ActionExecutionLog` records ActionID / StartedAt / EndedAt / */ /*     Params / ResultCode / UserID / Message. It cannot answer "which Entity */ /*     Action fired this, on which record, from which event" — so the moment */ /*     Entity Actions become the workflow substrate, a failed workflow is */ /*     undiagnosable. Four nullable columns fix that. */ /* (b) PAYLOAD. `ActionEngine.StartActionLog` writes */ /*     `JSON.stringify(params.Params)` on EVERY run, and `EndActionLog` writes */ /*     the merged input+output set again. Unconditionally — there is no opt-out. */ /*     That is harmless while Entity Actions are unused, and stops being harmless */ /*     the instant they are the workflow substrate, because entity-action params */ /*     are WHOLE RECORDS: `ValueType='Entity Object'` and `'Entity Object Data'` */ /*     put the entire row into ActionExecutionLog.Params, twice per invocation. */ /*     An AfterUpdate binding on a busy entity therefore writes the full record */ /*     to a general-purpose log on every save. */ /*       - SPACE: the NVARCHAR(MAX) payload is the size problem, not the row. */ /*         A row per invocation is cheap; a record serialized twice is not. */ /*       - SECURITY: message bodies, Person fields, contract terms landing in a */ /*         log with broad read access. `RetentionPeriod` deletes it eventually, */ /*         which is not the same as never writing it. */ /* THE POSTURE IS FAIL-CLOSED, matching how the family treats this elsewhere: */ /* the safe behaviour is the default, and logging a value is opt-in. */ /*   1. HARD RULE, no configuration: params whose ValueType is 'Entity Object' */ /*      or 'Entity Object Data' are NEVER written to the log. They are whole */ /*      records by definition. The log records the param name, its type, and a */ /*      redaction marker. */ /*   2. ActionParam.LogValue        — the definition declares whether a param's */ /*                                    value is loggable at all. Default 1. */ /*   3. EntityActionParam.LogValue  — per-binding override (NULL = inherit). */ /*                                    Lets one binding redact a param that is */ /*                                    ordinarily fine to log. */ /*   4. EntityAction.LoggingMode    — volume control for high-traffic bindings. */ /* Rule 1 is what actually closes the hole; 2-4 handle the grey area (a Static */ /* param holding an API key, an Entity Field holding a national ID) and volume. */ /* ============================================================================= */ /* ----------------------------------------------------------------------------- */ /* 2a. ActionExecutionLog: entity-action provenance */ /* ----------------------------------------------------------------------------- */;

ALTER TABLE __mj."ActionExecutionLog"
  ADD CONSTRAINT "FK_ActionExecutionLog_EntityAction" FOREIGN KEY ("EntityActionID") REFERENCES __mj."EntityAction" (
    "ID"
  ),
  ADD CONSTRAINT "FK_ActionExecutionLog_EntityActionInvocationType" FOREIGN KEY ("EntityActionInvocationTypeID") REFERENCES __mj."EntityActionInvocationType" (
    "ID"
  ),
  ADD CONSTRAINT "FK_ActionExecutionLog_TargetEntity" FOREIGN KEY ("TargetEntityID") REFERENCES __mj."Entity" (
    "ID"
  );

COMMENT ON COLUMN __mj."ActionExecutionLog"."EntityActionID" IS 'Optional. The Entity Action binding that caused this run. NULL when the action was invoked directly - from a resolver, a script, an agent step or a scheduled action.';

COMMENT ON COLUMN __mj."ActionExecutionLog"."EntityActionInvocationTypeID" IS 'Optional. Which lifecycle event fired the binding - AfterUpdate, Validate, List and so on. Recorded separately from EntityActionID because one binding may be attached to several invocation types, and telling a Validate refusal apart from an AfterUpdate side effect is the first question anyone asks of this log.';

COMMENT ON COLUMN __mj."ActionExecutionLog"."TargetEntityID" IS 'Optional. The entity of the record this run operated on. Deliberately denormalized rather than joined through EntityActionID: it survives the binding being deleted or retargeted, and it lets the log be queried by record with no join. Kept generic because every invoker has a subject - not only Entity Actions.';

COMMENT ON COLUMN __mj."ActionExecutionLog"."TargetRecordID" IS 'Optional. The primary key of the record this run operated on, as text, paired with TargetEntityID. For multi-record invocation types (List, View) one log row is written per record, so this is always a single record.';

ALTER TABLE __mj."ActionParam"
ADD COLUMN "LogValue" BOOLEAN NOT NULL DEFAULT TRUE /* ----------------------------------------------------------------------------- */ /* 2b. Param-value logging control */ /* ----------------------------------------------------------------------------- */;

COMMENT ON COLUMN __mj."ActionParam"."LogValue" IS 'Whether this parameter''s VALUE may be written to ActionExecutionLog.Params. Default 1. Set to 0 for parameters that carry records, credentials or personal data - for example the Data payload of Execute Agent. Independent of the hard rule that Entity Action params of ValueType ''Entity Object'' or ''Entity Object Data'' are never logged regardless of this flag. When logging is suppressed the log records the parameter name, its type and a redaction marker, never the value.';

ALTER TABLE __mj."EntityActionParam"
ADD COLUMN "LogValue" BOOLEAN NULL;

COMMENT ON COLUMN __mj."EntityActionParam"."LogValue" IS 'Optional per-binding override of ActionParam.LogValue. NULL (the default) inherits the parameter definition. Set to 0 when this particular binding passes something sensitive through a parameter that is ordinarily safe to log - a message body through a generic Text parameter, for instance. Cannot re-enable logging for a value type the hard rule suppresses.';

ALTER TABLE __mj."EntityAction"
ADD COLUMN "LoggingMode" VARCHAR(20) NOT NULL DEFAULT 'All' /* ----------------------------------------------------------------------------- */ /* 2c. Per-binding volume control */ /* ----------------------------------------------------------------------------- */;

ALTER TABLE __mj."EntityAction"
  ADD CONSTRAINT "CK_EntityAction_LoggingMode" CHECK ("LoggingMode" IN ('All', 'FailuresOnly', 'None'));

COMMENT ON COLUMN __mj."EntityAction"."LoggingMode" IS 'How much of this binding''s activity reaches ActionExecutionLog. All (default) writes a row per invocation. FailuresOnly writes only runs that did not succeed - the right setting for a high-frequency binding on a busy entity, where the successful runs are noise. None disables logging for the binding entirely and should be rare, because it also removes the failure record.';

ALTER TABLE __mj."ActionExecutionLog"
ADD COLUMN "ResultParams" TEXT NULL /* ============================================================================= */ /* PART 3 — Separate the as-called inputs from the final result set */ /* ============================================================================= */ /* `ActionExecutionLog.Params` is written TWICE against the same column: */ /*   StartActionLog  Params = JSON.stringify(params.Params)              -- inputs */ /*   EndActionLog    Params = JSON.stringify(result.Params ?? params.Params) */ /*                                                    -- merged inputs + outputs */ /* The second write OVERWRITES the first. And because Custom and Generated */ /* actions mutate `params.Params` in place, the end state is not merely the */ /* inputs plus outputs — it is the inputs AS THE ACTION LEFT THEM. So the values */ /* the action was actually CALLED with are captured at start and then destroyed */ /* at end. "What was this called with" and "what did it end up holding" are */ /* different questions, and only the second is currently answerable. */ /* Splitting them costs one nullable column, and MJ already has the precedent one */ /* table over: QueueTask separates Data / Options / Output rather than merging. */ /*   Params        -> the AS-CALLED inputs. Written once at start, never */ /*                    overwritten. Answers "what was this invoked with". */ /*   ResultParams  -> the final merged set at completion. Answers "what did the */ /*                    action produce, and what did the inputs become". */ /* Both are subject to the redaction rules in PART 2 — a param suppressed on the */ /* way in is suppressed on the way out. */ /* ResultParams is written on FAILURE exactly as on success. Both failure paths in */ /* ActionEngine.InternalRunAction already reach EndActionLog — the returned */ /* Success:false case and the thrown-exception catch, which passes params.Params */ /* (the mutated array) — so this needs no new control flow. A failed run's */ /* partially-mutated inputs are usually the most diagnostic thing available, and */ /* an audit trail that records only successes is not an audit trail. */ /* ============================================================================= */;

COMMENT ON COLUMN __mj."ActionExecutionLog"."ResultParams" IS 'JSON-formatted FINAL parameter set captured when the action finished - the inputs as the action left them, plus any output parameters it produced. Written on FAILURE exactly as on success, under the same redaction rules: a failed run''s partially-mutated inputs are usually the most diagnostic thing available, and an audit trail that records only successes is not an audit trail. Distinct from Params, which holds the values the action was called with and is never overwritten. NULL means one thing only - the run never finished (process died, host killed) - so it is a signal rather than an absence, and must not be backfilled.';

COMMENT ON COLUMN __mj."ActionExecutionLog"."Params" IS 'JSON-formatted input parameters AS THE ACTION WAS CALLED, captured once when execution starts and never overwritten. Custom and Generated actions mutate their parameter array in place, so this is the only durable record of the values actually passed in; the final state lives in ResultParams. Parameter values may be redacted per ActionParam.LogValue / EntityActionParam.LogValue, and whole-record value types are never written - see the parameter''s own documentation.';

COMMENT ON COLUMN __mj."ActionExecutionLog"."Message" IS 'Human-readable summary message returned by the action - the reason for a refusal, or a short description of what was done. Not the action''s output data: parameter values live in Params and ResultParams, and the outcome code in ResultCode.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '148d5921-0a1a-4b27-9963-87dc616d32d2' OR ("EntityID" = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('148d5921-0a1a-4b27-9963-87dc616d32d2', '34248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entity Actions */, 100019, 'Sequence', 'Sequence', 'Execution order when multiple Entity Actions are bound to the same entity and invocation type. Lower runs first; ties fall back to creation order. Defaults to 0 so existing rows are unaffected.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '86caa55a-44d1-46cd-b073-1e864e1233ae' OR ("EntityID" = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ScopeEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86caa55a-44d1-46cd-b073-1e864e1233ae', '34248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entity Actions */, 100020, 'ScopeEntityID', 'Scope Entity ID', 'Optional. Together with ScopeRecordID, narrows this Entity Action to records related to ONE specific record - for example a single Deal Type, Contract Type, Pipeline or Company - rather than every record of EntityID. NULL (the default) means the action applies to all records, which is the pre-existing behaviour. How a scope record relates to the subject record is resolved by the app that owns the scope entity; the framework only stores and filters on the pair.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd7aaa2ed-6481-4b85-8906-7c73cb1d0fc9' OR ("EntityID" = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ScopeRecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d7aaa2ed-6481-4b85-8906-7c73cb1d0fc9', '34248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entity Actions */, 100021, 'ScopeRecordID', 'Scope Record ID', 'Optional. The primary key of the scope record, as text, paired with ScopeEntityID. Both columns are NULL or both are set (CK_EntityAction_Scope). Lets a configuration record such as a Deal Type surface "the workflows bound to me" as a real relationship rather than something buried in filter code.', 'nvarchar', 900, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '41d8ae35-2d96-4655-bef1-b16f5860b688' OR ("EntityID" = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'LoggingMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('41d8ae35-2d96-4655-bef1-b16f5860b688', '34248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entity Actions */, 100022, 'LoggingMode', 'Logging Mode', 'How much of this binding''s activity reaches ActionExecutionLog. All (default) writes a row per invocation. FailuresOnly writes only runs that did not succeed - the right setting for a high-frequency binding on a busy entity, where the successful runs are noise. None disables logging for the binding entirely and should be rare, because it also removes the failure record.', 'nvarchar', 40, 0, 0, FALSE, 'All', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a06bac2d-d59e-4d0e-ba24-db99a3d7f4c5' OR ("EntityID" = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EntityActionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a06bac2d-d59e-4d0e-ba24-db99a3d7f4c5', '3E248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Action Execution Logs */, 100030, 'EntityActionID', 'Entity Action ID', 'Optional. The Entity Action binding that caused this run. NULL when the action was invoked directly - from a resolver, a script, an agent step or a scheduled action.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '34248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '82f166b9-98c5-419b-8ca3-94c75f6923d0' OR ("EntityID" = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EntityActionInvocationTypeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('82f166b9-98c5-419b-8ca3-94c75f6923d0', '3E248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Action Execution Logs */, 100031, 'EntityActionInvocationTypeID', 'Entity Action Invocation Type ID', 'Optional. Which lifecycle event fired the binding - AfterUpdate, Validate, List and so on. Recorded separately from EntityActionID because one binding may be attached to several invocation types, and telling a Validate refusal apart from an AfterUpdate side effect is the first question anyone asks of this log.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '37248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '927cfe61-12a6-42fe-9cef-dd20f4475ba5' OR ("EntityID" = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'TargetEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('927cfe61-12a6-42fe-9cef-dd20f4475ba5', '3E248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Action Execution Logs */, 100032, 'TargetEntityID', 'Target Entity ID', 'Optional. The entity of the record this run operated on. Deliberately denormalized rather than joined through EntityActionID: it survives the binding being deleted or retargeted, and it lets the log be queried by record with no join. Kept generic because every invoker has a subject - not only Entity Actions.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aa659c40-fe09-430c-b9a6-750263bfdc77' OR ("EntityID" = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'TargetRecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aa659c40-fe09-430c-b9a6-750263bfdc77', '3E248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Action Execution Logs */, 100033, 'TargetRecordID', 'Target Record ID', 'Optional. The primary key of the record this run operated on, as text, paired with TargetEntityID. For multi-record invocation types (List, View) one log row is written per record, so this is always a single record.', 'nvarchar', 900, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1c62e051-5abe-44b2-919d-44b19ab41bc8' OR ("EntityID" = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ResultParams')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1c62e051-5abe-44b2-919d-44b19ab41bc8', '3E248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Action Execution Logs */, 100034, 'ResultParams', 'Result Params', 'JSON-formatted FINAL parameter set captured when the action finished - the inputs as the action left them, plus any output parameters it produced. Written on FAILURE exactly as on success, under the same redaction rules: a failed run''s partially-mutated inputs are usually the most diagnostic thing available, and an audit trail that records only successes is not an audit trail. Distinct from Params, which holds the values the action was called with and is never overwritten. NULL means one thing only - the run never finished (process died, host killed) - so it is a signal rather than an absence, and must not be backfilled.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '683ab110-8380-4d0c-8110-d1aecc75671e' OR ("EntityID" = '3F248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'LogValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('683ab110-8380-4d0c-8110-d1aecc75671e', '3F248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Action Params */, 100027, 'LogValue', 'Log Value', 'Whether this parameter''s VALUE may be written to ActionExecutionLog.Params. Default 1. Set to 0 for parameters that carry records, credentials or personal data - for example the Data payload of Execute Agent. Independent of the hard rule that Entity Action params of ValueType ''Entity Object'' or ''Entity Object Data'' are never logged regardless of this flag. When logging is suppressed the log records the parameter name, its type and a redaction marker, never the value.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ca3b5587-44a5-4266-9ce5-edaa583daca2' OR ("EntityID" = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'LogValue')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ca3b5587-44a5-4266-9ce5-edaa583daca2', '56248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entity Action Params */, 100020, 'LogValue', 'Log Value', 'Optional per-binding override of ActionParam.LogValue. NULL (the default) inherits the parameter definition. Set to 0 when this particular binding passes something sensitive through a parameter that is ordinarily safe to log - a message body through a generic Text parameter, for instance. Cannot re-enable logging for a value type the hard rule suppresses.', 'bit', 1, 1, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID de132a53-55fe-480e-bec7-e7f33517c966 */
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
    'de132a53-55fe-480e-bec7-e7f33517c966',
    '995817F0-6F36-EF11-86D4-6045BDEE16E6',
    3,
    'Entity Object Data',
    'Entity Object Data',
    NOW(),
    NOW()
  );
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 4
WHERE
  "ID" = 'E45B6265-0617-46E5-933D-01776851E9BC';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 5
WHERE
  "ID" = 'D76E1A37-E252-462B-9E5C-F9B46C9909AD';
/* SQL text to insert entity field value with ID 2707f767-5b33-49e1-a077-a18d712b17f4 */
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
    '2707f767-5b33-49e1-a077-a18d712b17f4',
    '41D8AE35-2D96-4655-BEF1-B16F5860B688',
    1,
    'All',
    'All',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f964b10c-58e2-40c2-adab-be073c6660da */
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
    'f964b10c-58e2-40c2-adab-be073c6660da',
    '41D8AE35-2D96-4655-BEF1-B16F5860B688',
    2,
    'FailuresOnly',
    'FailuresOnly',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID cabd6977-363f-4e39-aa1b-f0eb940884a5 */
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
    'cabd6977-363f-4e39-aa1b-f0eb940884a5',
    '41D8AE35-2D96-4655-BEF1-B16F5860B688',
    3,
    'None',
    'None',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 41D8AE35-2D96-4655-BEF1-B16F5860B688 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '41D8AE35-2D96-4655-BEF1-B16F5860B688';
/* Create Entity Relationship: MJ: Entities -> MJ: Action Execution Logs (One To Many via TargetEntityID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '290ddcfd-f93e-41d1-900e-5b9c705fc1c2') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('290ddcfd-f93e-41d1-900e-5b9c705fc1c2', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'TargetEntityID', 'One To Many', TRUE, TRUE, 72, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd92846bf-ef9d-4ef0-9d45-92629374f217') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d92846bf-ef9d-4ef0-9d45-92629374f217', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '34248F34-2837-EF11-86D4-6045BDEE16E6', 'ScopeEntityID', 'One To Many', TRUE, TRUE, 73, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4d923946-1eed-4848-b916-495f57738fce') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4d923946-1eed-4848-b916-495f57738fce', '34248F34-2837-EF11-86D4-6045BDEE16E6', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'EntityActionID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd102c008-1a3f-45c4-9d73-8fb30ffe9b54') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d102c008-1a3f-45c4-9d73-8fb30ffe9b54', '37248F34-2837-EF11-86D4-6045BDEE16E6', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'EntityActionInvocationTypeID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9286e6fd-c29a-47ba-8690-0a35bdf96cc5' OR ("EntityID" = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ScopeEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9286e6fd-c29a-47ba-8690-0a35bdf96cc5', '34248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entity Actions */, 100025, 'ScopeEntity', 'Scope Entity', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '34725233-b141-483f-96f0-0e0e7c8dd870' OR ("EntityID" = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EntityAction')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('34725233-b141-483f-96f0-0e0e7c8dd870', '3E248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Action Execution Logs */, 100037, 'EntityAction', 'Entity Action', NULL, 'nvarchar', 850, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9d336063-c666-47ea-b0d5-ed692e81e6e7' OR ("EntityID" = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EntityActionInvocationType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9d336063-c666-47ea-b0d5-ed692e81e6e7', '3E248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Action Execution Logs */, 100038, 'EntityActionInvocationType', 'Entity Action Invocation Type', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '898d7496-df26-4aaf-ba4b-6be563d78184' OR ("EntityID" = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'TargetEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('898d7496-df26-4aaf-ba4b-6be563d78184', '3E248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Action Execution Logs */, 100039, 'TargetEntity', 'Target Entity', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Execution Logs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_execution_log_action_id"
    ON __mj."ActionExecutionLog" ("ActionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_execution_log_user_id"
    ON __mj."ActionExecutionLog" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_execution_log_entity_action_id"
    ON __mj."ActionExecutionLog" ("EntityActionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_execution_log_entity_action_invocation_"
    ON __mj."ActionExecutionLog" ("EntityActionInvocationTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_execution_log_target_entity_id"
    ON __mj."ActionExecutionLog" ("TargetEntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Execution Logs
-- Item: vwActionExecutionLogs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Action Execution Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  ActionExecutionLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwActionExecutionLogs"
AS
SELECT
    a.*,
    MJAction_ActionID."Name" AS "Action",
    MJUser_UserID."Name" AS "User",
    MJEntityAction_EntityActionID."Action" AS "EntityAction",
    MJEntityActionInvocationType_EntityActionInvocationTypeID."Name" AS "EntityActionInvocationType",
    MJEntity_TargetEntityID."Name" AS "TargetEntity"
FROM
    __mj."ActionExecutionLog" AS a
INNER JOIN
    __mj."Action" AS MJAction_ActionID
  ON
    "a"."ActionID" = MJAction_ActionID."ID"
INNER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."vwEntityActions" AS MJEntityAction_EntityActionID
  ON
    "a"."EntityActionID" = MJEntityAction_EntityActionID."ID"
LEFT OUTER JOIN
    __mj."EntityActionInvocationType" AS MJEntityActionInvocationType_EntityActionInvocationTypeID
  ON
    "a"."EntityActionInvocationTypeID" = MJEntityActionInvocationType_EntityActionInvocationTypeID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_TargetEntityID
  ON
    "a"."TargetEntityID" = MJEntity_TargetEntityID."ID"
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
    AND tc.relname = 'vwActionExecutionLogs'
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
    AND tc.relname = 'vwActionExecutionLogs'
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
        AND tc.relname = 'vwActionExecutionLogs'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwActionExecutionLogs" CASCADE;
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
GRANT SELECT ON __mj."vwActionExecutionLogs" TO "cdp_UI";
GRANT SELECT ON __mj."vwActionExecutionLogs" TO "cdp_Integration";
GRANT SELECT ON __mj."vwActionExecutionLogs" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Execution Logs
-- Item: spCreateActionExecutionLog
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ActionExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateActionExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateActionExecutionLog"(
    p_id UUID DEFAULT NULL,
    p_actionid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_params_clear boolean DEFAULT false,
    p_params TEXT DEFAULT NULL,
    p_resultcode_clear boolean DEFAULT false,
    p_resultcode varchar(255) DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_retentionperiod_clear boolean DEFAULT false,
    p_retentionperiod int DEFAULT NULL,
    p_message_clear boolean DEFAULT false,
    p_message TEXT DEFAULT NULL,
    p_entityactionid_clear boolean DEFAULT false,
    p_entityactionid UUID DEFAULT NULL,
    p_entityactioninvocationtypeid_clear boolean DEFAULT false,
    p_entityactioninvocationtypeid UUID DEFAULT NULL,
    p_targetentityid_clear boolean DEFAULT false,
    p_targetentityid UUID DEFAULT NULL,
    p_targetrecordid_clear boolean DEFAULT false,
    p_targetrecordid varchar(450) DEFAULT NULL,
    p_resultparams_clear boolean DEFAULT false,
    p_resultparams TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwActionExecutionLogs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ActionExecutionLog"
        (
            "ID",
            "ActionID",
                "StartedAt",
                "EndedAt",
                "Params",
                "ResultCode",
                "UserID",
                "RetentionPeriod",
                "Message",
                "EntityActionID",
                "EntityActionInvocationTypeID",
                "TargetEntityID",
                "TargetRecordID",
                "ResultParams"
        )
    VALUES
        (
            v_new_id,
            p_actionid,
                COALESCE(p_startedat, NOW()),
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END,
                CASE WHEN p_params_clear = true THEN NULL ELSE COALESCE(p_params, NULL) END,
                CASE WHEN p_resultcode_clear = true THEN NULL ELSE COALESCE(p_resultcode, NULL) END,
                p_userid,
                CASE WHEN p_retentionperiod_clear = true THEN NULL ELSE COALESCE(p_retentionperiod, NULL) END,
                CASE WHEN p_message_clear = true THEN NULL ELSE COALESCE(p_message, NULL) END,
                CASE WHEN p_entityactionid_clear = true THEN NULL ELSE COALESCE(p_entityactionid, NULL) END,
                CASE WHEN p_entityactioninvocationtypeid_clear = true THEN NULL ELSE COALESCE(p_entityactioninvocationtypeid, NULL) END,
                CASE WHEN p_targetentityid_clear = true THEN NULL ELSE COALESCE(p_targetentityid, NULL) END,
                CASE WHEN p_targetrecordid_clear = true THEN NULL ELSE COALESCE(p_targetrecordid, NULL) END,
                CASE WHEN p_resultparams_clear = true THEN NULL ELSE COALESCE(p_resultparams, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwActionExecutionLogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateActionExecutionLog" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spCreateActionExecutionLog" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Execution Logs
-- Item: spUpdateActionExecutionLog
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ActionExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateActionExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateActionExecutionLog"(
    p_id UUID,
    p_actionid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_params_clear boolean DEFAULT false,
    p_params TEXT DEFAULT NULL,
    p_resultcode_clear boolean DEFAULT false,
    p_resultcode varchar(255) DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_retentionperiod_clear boolean DEFAULT false,
    p_retentionperiod int DEFAULT NULL,
    p_message_clear boolean DEFAULT false,
    p_message TEXT DEFAULT NULL,
    p_entityactionid_clear boolean DEFAULT false,
    p_entityactionid UUID DEFAULT NULL,
    p_entityactioninvocationtypeid_clear boolean DEFAULT false,
    p_entityactioninvocationtypeid UUID DEFAULT NULL,
    p_targetentityid_clear boolean DEFAULT false,
    p_targetentityid UUID DEFAULT NULL,
    p_targetrecordid_clear boolean DEFAULT false,
    p_targetrecordid varchar(450) DEFAULT NULL,
    p_resultparams_clear boolean DEFAULT false,
    p_resultparams TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwActionExecutionLogs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ActionExecutionLog"
    SET
        "ActionID" = COALESCE(p_actionid, "ActionID"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "Params" = CASE WHEN p_params_clear = true THEN NULL ELSE COALESCE(p_params, "Params") END,
        "ResultCode" = CASE WHEN p_resultcode_clear = true THEN NULL ELSE COALESCE(p_resultcode, "ResultCode") END,
        "UserID" = COALESCE(p_userid, "UserID"),
        "RetentionPeriod" = CASE WHEN p_retentionperiod_clear = true THEN NULL ELSE COALESCE(p_retentionperiod, "RetentionPeriod") END,
        "Message" = CASE WHEN p_message_clear = true THEN NULL ELSE COALESCE(p_message, "Message") END,
        "EntityActionID" = CASE WHEN p_entityactionid_clear = true THEN NULL ELSE COALESCE(p_entityactionid, "EntityActionID") END,
        "EntityActionInvocationTypeID" = CASE WHEN p_entityactioninvocationtypeid_clear = true THEN NULL ELSE COALESCE(p_entityactioninvocationtypeid, "EntityActionInvocationTypeID") END,
        "TargetEntityID" = CASE WHEN p_targetentityid_clear = true THEN NULL ELSE COALESCE(p_targetentityid, "TargetEntityID") END,
        "TargetRecordID" = CASE WHEN p_targetrecordid_clear = true THEN NULL ELSE COALESCE(p_targetrecordid, "TargetRecordID") END,
        "ResultParams" = CASE WHEN p_resultparams_clear = true THEN NULL ELSE COALESCE(p_resultparams, "ResultParams") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwActionExecutionLogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateActionExecutionLog" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spUpdateActionExecutionLog" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionExecutionLog table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_action_execution_log"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_action_execution_log" ON __mj."ActionExecutionLog";

CREATE TRIGGER "trg_update_action_execution_log"
BEFORE UPDATE ON __mj."ActionExecutionLog"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_action_execution_log"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Execution Logs
-- Item: spDeleteActionExecutionLog
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ActionExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteActionExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteActionExecutionLog"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ActionExecutionLog"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteActionExecutionLog" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Params
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_param_action_id"
    ON __mj."ActionParam" ("ActionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Params
-- Item: vwActionParams
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Action Params
-----               SCHEMA:      __mj
-----               BASE TABLE:  ActionParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwActionParams"
AS
SELECT
    a.*,
    MJAction_ActionID."Name" AS "Action"
FROM
    __mj."ActionParam" AS a
INNER JOIN
    __mj."Action" AS MJAction_ActionID
  ON
    "a"."ActionID" = MJAction_ActionID."ID"
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
    AND tc.relname = 'vwActionParams'
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
    AND tc.relname = 'vwActionParams'
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
        AND tc.relname = 'vwActionParams'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwActionParams" CASCADE;
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
GRANT SELECT ON __mj."vwActionParams" TO "cdp_Integration";
GRANT SELECT ON __mj."vwActionParams" TO "cdp_UI";
GRANT SELECT ON __mj."vwActionParams" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Params
-- Item: spCreateActionParam
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ActionParam
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateActionParam'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateActionParam"(
    p_id UUID DEFAULT NULL,
    p_actionid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_defaultvalue_clear boolean DEFAULT false,
    p_defaultvalue TEXT DEFAULT NULL,
    p_type char(10) DEFAULT NULL,
    p_valuetype varchar(30) DEFAULT NULL,
    p_isarray BOOLEAN DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_isrequired BOOLEAN DEFAULT NULL,
    p_mediamodality_clear boolean DEFAULT false,
    p_mediamodality varchar(20) DEFAULT NULL,
    p_logvalue BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwActionParams" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ActionParam"
        (
            "ID",
            "ActionID",
                "Name",
                "DefaultValue",
                "Type",
                "ValueType",
                "IsArray",
                "Description",
                "IsRequired",
                "MediaModality",
                "LogValue"
        )
    VALUES
        (
            v_new_id,
            p_actionid,
                p_name,
                CASE WHEN p_defaultvalue_clear = true THEN NULL ELSE COALESCE(p_defaultvalue, NULL) END,
                p_type,
                p_valuetype,
                COALESCE(p_isarray, FALSE),
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_isrequired, TRUE),
                CASE WHEN p_mediamodality_clear = true THEN NULL ELSE COALESCE(p_mediamodality, NULL) END,
                COALESCE(p_logvalue, TRUE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwActionParams"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateActionParam" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spCreateActionParam" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Params
-- Item: spUpdateActionParam
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ActionParam
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateActionParam'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateActionParam"(
    p_id UUID,
    p_actionid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_defaultvalue_clear boolean DEFAULT false,
    p_defaultvalue TEXT DEFAULT NULL,
    p_type char(10) DEFAULT NULL,
    p_valuetype varchar(30) DEFAULT NULL,
    p_isarray BOOLEAN DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_isrequired BOOLEAN DEFAULT NULL,
    p_mediamodality_clear boolean DEFAULT false,
    p_mediamodality varchar(20) DEFAULT NULL,
    p_logvalue BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwActionParams" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ActionParam"
    SET
        "ActionID" = COALESCE(p_actionid, "ActionID"),
        "Name" = COALESCE(p_name, "Name"),
        "DefaultValue" = CASE WHEN p_defaultvalue_clear = true THEN NULL ELSE COALESCE(p_defaultvalue, "DefaultValue") END,
        "Type" = COALESCE(p_type, "Type"),
        "ValueType" = COALESCE(p_valuetype, "ValueType"),
        "IsArray" = COALESCE(p_isarray, "IsArray"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "IsRequired" = COALESCE(p_isrequired, "IsRequired"),
        "MediaModality" = CASE WHEN p_mediamodality_clear = true THEN NULL ELSE COALESCE(p_mediamodality, "MediaModality") END,
        "LogValue" = COALESCE(p_logvalue, "LogValue")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwActionParams"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateActionParam" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spUpdateActionParam" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionParam table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_action_param"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_action_param" ON __mj."ActionParam";

CREATE TRIGGER "trg_update_action_param"
BEFORE UPDATE ON __mj."ActionParam"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_action_param"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Params
-- Item: spDeleteActionParam
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ActionParam
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteActionParam'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteActionParam"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ActionParam"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteActionParam" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spDeleteActionParam" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_chunk_content_item_id"
    ON __mj."ContentItemChunk" ("ContentItemID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_chunk_parent_chunk_id"
    ON __mj."ContentItemChunk" ("ParentChunkID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: fnContentItemChunkParentChunkID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ContentItemChunk.ParentChunkID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_content_item_chunk_parent_chunk_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentChunkID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."ContentItemChunk"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentChunkID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."ContentItemChunk" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentChunkID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentChunkID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: vwContentItemChunks
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Chunks
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentItemChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentItemChunks"
AS
SELECT
    c.*,
    MJContentItem_ContentItemID."Name" AS "ContentItem",
    MJContentItemChunk_ParentChunkID."SegmentTitle" AS "ParentChunk",
    root_ParentChunkID.root_id AS "RootParentChunkID"
FROM
    __mj."ContentItemChunk" AS c
INNER JOIN
    __mj."ContentItem" AS MJContentItem_ContentItemID
  ON
    "c"."ContentItemID" = MJContentItem_ContentItemID."ID"
LEFT OUTER JOIN
    __mj."ContentItemChunk" AS MJContentItemChunk_ParentChunkID
  ON
    "c"."ParentChunkID" = MJContentItemChunk_ParentChunkID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_content_item_chunk_parent_chunk_id_get_root_id"(c."ID", c."ParentChunkID") AS root_id
) AS root_ParentChunkID ON true
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
    AND tc.relname = 'vwContentItemChunks'
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
    AND tc.relname = 'vwContentItemChunks'
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
        AND tc.relname = 'vwContentItemChunks'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwContentItemChunks" CASCADE;
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
GRANT SELECT ON __mj."vwContentItemChunks" TO "cdp_UI";
GRANT SELECT ON __mj."vwContentItemChunks" TO "cdp_Developer";
GRANT SELECT ON __mj."vwContentItemChunks" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spCreateContentItemChunk
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateContentItemChunk"(
    p_id UUID DEFAULT NULL,
    p_contentitemid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_lastdeletedat_clear boolean DEFAULT false,
    p_lastdeletedat TIMESTAMPTZ DEFAULT NULL,
    p_modality varchar(20) DEFAULT NULL,
    p_startoffset_clear boolean DEFAULT false,
    p_startoffset int DEFAULT NULL,
    p_endoffset_clear boolean DEFAULT false,
    p_endoffset int DEFAULT NULL,
    p_startms_clear boolean DEFAULT false,
    p_startms int DEFAULT NULL,
    p_endms_clear boolean DEFAULT false,
    p_endms int DEFAULT NULL,
    p_pagenumber_clear boolean DEFAULT false,
    p_pagenumber int DEFAULT NULL,
    p_segmenttitle_clear boolean DEFAULT false,
    p_segmenttitle varchar(500) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transcript_clear boolean DEFAULT false,
    p_transcript TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_parentchunkid_clear boolean DEFAULT false,
    p_parentchunkid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwContentItemChunks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ContentItemChunk"
        (
            "ID",
            "ContentItemID",
                "Sequence",
                "Text",
                "VectorRecordID",
                "EmbeddingStatus",
                "TaggingStatus",
                "DeleteStatus",
                "LastEmbeddedAt",
                "LastTaggedAt",
                "LastDeletedAt",
                "Modality",
                "StartOffset",
                "EndOffset",
                "StartMs",
                "EndMs",
                "PageNumber",
                "SegmentTitle",
                "Description",
                "Transcript",
                "SegmenterKey",
                "ParentChunkID"
        )
    VALUES
        (
            v_new_id,
            p_contentitemid,
                p_sequence,
                CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, NULL) END,
                CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, NULL) END,
                COALESCE(p_embeddingstatus, 'Pending'),
                COALESCE(p_taggingstatus, 'Pending'),
                CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, NULL) END,
                CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, NULL) END,
                CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, NULL) END,
                CASE WHEN p_lastdeletedat_clear = true THEN NULL ELSE COALESCE(p_lastdeletedat, NULL) END,
                COALESCE(p_modality, 'text'),
                CASE WHEN p_startoffset_clear = true THEN NULL ELSE COALESCE(p_startoffset, NULL) END,
                CASE WHEN p_endoffset_clear = true THEN NULL ELSE COALESCE(p_endoffset, NULL) END,
                CASE WHEN p_startms_clear = true THEN NULL ELSE COALESCE(p_startms, NULL) END,
                CASE WHEN p_endms_clear = true THEN NULL ELSE COALESCE(p_endms, NULL) END,
                CASE WHEN p_pagenumber_clear = true THEN NULL ELSE COALESCE(p_pagenumber, NULL) END,
                CASE WHEN p_segmenttitle_clear = true THEN NULL ELSE COALESCE(p_segmenttitle, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_transcript_clear = true THEN NULL ELSE COALESCE(p_transcript, NULL) END,
                CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, NULL) END,
                CASE WHEN p_parentchunkid_clear = true THEN NULL ELSE COALESCE(p_parentchunkid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwContentItemChunks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemChunk" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spUpdateContentItemChunk
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentItemChunk"(
    p_id UUID,
    p_contentitemid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_lastdeletedat_clear boolean DEFAULT false,
    p_lastdeletedat TIMESTAMPTZ DEFAULT NULL,
    p_modality varchar(20) DEFAULT NULL,
    p_startoffset_clear boolean DEFAULT false,
    p_startoffset int DEFAULT NULL,
    p_endoffset_clear boolean DEFAULT false,
    p_endoffset int DEFAULT NULL,
    p_startms_clear boolean DEFAULT false,
    p_startms int DEFAULT NULL,
    p_endms_clear boolean DEFAULT false,
    p_endms int DEFAULT NULL,
    p_pagenumber_clear boolean DEFAULT false,
    p_pagenumber int DEFAULT NULL,
    p_segmenttitle_clear boolean DEFAULT false,
    p_segmenttitle varchar(500) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transcript_clear boolean DEFAULT false,
    p_transcript TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_parentchunkid_clear boolean DEFAULT false,
    p_parentchunkid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwContentItemChunks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ContentItemChunk"
    SET
        "ContentItemID" = COALESCE(p_contentitemid, "ContentItemID"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Text" = CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, "Text") END,
        "VectorRecordID" = CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, "VectorRecordID") END,
        "EmbeddingStatus" = COALESCE(p_embeddingstatus, "EmbeddingStatus"),
        "TaggingStatus" = COALESCE(p_taggingstatus, "TaggingStatus"),
        "DeleteStatus" = CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, "DeleteStatus") END,
        "LastEmbeddedAt" = CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, "LastEmbeddedAt") END,
        "LastTaggedAt" = CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, "LastTaggedAt") END,
        "LastDeletedAt" = CASE WHEN p_lastdeletedat_clear = true THEN NULL ELSE COALESCE(p_lastdeletedat, "LastDeletedAt") END,
        "Modality" = COALESCE(p_modality, "Modality"),
        "StartOffset" = CASE WHEN p_startoffset_clear = true THEN NULL ELSE COALESCE(p_startoffset, "StartOffset") END,
        "EndOffset" = CASE WHEN p_endoffset_clear = true THEN NULL ELSE COALESCE(p_endoffset, "EndOffset") END,
        "StartMs" = CASE WHEN p_startms_clear = true THEN NULL ELSE COALESCE(p_startms, "StartMs") END,
        "EndMs" = CASE WHEN p_endms_clear = true THEN NULL ELSE COALESCE(p_endms, "EndMs") END,
        "PageNumber" = CASE WHEN p_pagenumber_clear = true THEN NULL ELSE COALESCE(p_pagenumber, "PageNumber") END,
        "SegmentTitle" = CASE WHEN p_segmenttitle_clear = true THEN NULL ELSE COALESCE(p_segmenttitle, "SegmentTitle") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Transcript" = CASE WHEN p_transcript_clear = true THEN NULL ELSE COALESCE(p_transcript, "Transcript") END,
        "SegmenterKey" = CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, "SegmenterKey") END,
        "ParentChunkID" = CASE WHEN p_parentchunkid_clear = true THEN NULL ELSE COALESCE(p_parentchunkid, "ParentChunkID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwContentItemChunks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemChunk" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemChunk table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_content_item_chunk"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_item_chunk" ON __mj."ContentItemChunk";

CREATE TRIGGER "trg_update_content_item_chunk"
BEFORE UPDATE ON __mj."ContentItemChunk"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_content_item_chunk"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spDeleteContentItemChunk
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentItemChunk"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ContentItemChunk"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemChunk" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Action Params
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_action_param_entity_action_id"
    ON __mj."EntityActionParam" ("EntityActionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_action_param_action_param_id"
    ON __mj."EntityActionParam" ("ActionParamID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Action Params
-- Item: vwEntityActionParams
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Params
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityActionParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityActionParams"
AS
SELECT
    e.*,
    MJEntityAction_EntityActionID."Action" AS "EntityAction",
    MJActionParam_ActionParamID."Name" AS "ActionParam"
FROM
    __mj."EntityActionParam" AS e
INNER JOIN
    __mj."vwEntityActions" AS MJEntityAction_EntityActionID
  ON
    "e"."EntityActionID" = MJEntityAction_EntityActionID."ID"
INNER JOIN
    __mj."ActionParam" AS MJActionParam_ActionParamID
  ON
    "e"."ActionParamID" = MJActionParam_ActionParamID."ID"
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
    AND tc.relname = 'vwEntityActionParams'
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
    AND tc.relname = 'vwEntityActionParams'
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
        AND tc.relname = 'vwEntityActionParams'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwEntityActionParams" CASCADE;
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
GRANT SELECT ON __mj."vwEntityActionParams" TO "cdp_Developer";
GRANT SELECT ON __mj."vwEntityActionParams" TO "cdp_Integration";
GRANT SELECT ON __mj."vwEntityActionParams" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Action Params
-- Item: spCreateEntityActionParam
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityActionParam
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityActionParam'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionParam"(
    p_id UUID DEFAULT NULL,
    p_entityactionid UUID DEFAULT NULL,
    p_actionparamid UUID DEFAULT NULL,
    p_valuetype varchar(20) DEFAULT NULL,
    p_value_clear boolean DEFAULT false,
    p_value TEXT DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_logvalue_clear boolean DEFAULT false,
    p_logvalue BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwEntityActionParams" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."EntityActionParam"
        (
            "ID",
            "EntityActionID",
                "ActionParamID",
                "ValueType",
                "Value",
                "Comments",
                "LogValue"
        )
    VALUES
        (
            v_new_id,
            p_entityactionid,
                p_actionparamid,
                p_valuetype,
                CASE WHEN p_value_clear = true THEN NULL ELSE COALESCE(p_value, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_logvalue_clear = true THEN NULL ELSE COALESCE(p_logvalue, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwEntityActionParams"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateEntityActionParam" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateEntityActionParam" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Action Params
-- Item: spUpdateEntityActionParam
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityActionParam
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityActionParam'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionParam"(
    p_id UUID,
    p_entityactionid UUID DEFAULT NULL,
    p_actionparamid UUID DEFAULT NULL,
    p_valuetype varchar(20) DEFAULT NULL,
    p_value_clear boolean DEFAULT false,
    p_value TEXT DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_logvalue_clear boolean DEFAULT false,
    p_logvalue BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwEntityActionParams" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."EntityActionParam"
    SET
        "EntityActionID" = COALESCE(p_entityactionid, "EntityActionID"),
        "ActionParamID" = COALESCE(p_actionparamid, "ActionParamID"),
        "ValueType" = COALESCE(p_valuetype, "ValueType"),
        "Value" = CASE WHEN p_value_clear = true THEN NULL ELSE COALESCE(p_value, "Value") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "LogValue" = CASE WHEN p_logvalue_clear = true THEN NULL ELSE COALESCE(p_logvalue, "LogValue") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwEntityActionParams"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityActionParam" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityActionParam" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityActionParam table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_entity_action_param"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_action_param" ON __mj."EntityActionParam";

CREATE TRIGGER "trg_update_entity_action_param"
BEFORE UPDATE ON __mj."EntityActionParam"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_entity_action_param"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Action Params
-- Item: spDeleteEntityActionParam
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityActionParam
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityActionParam'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionParam"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."EntityActionParam"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionParam" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionParam" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Actions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_action_entity_id"
    ON __mj."EntityAction" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_action_action_id"
    ON __mj."EntityAction" ("ActionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_action_scope_entity_id"
    ON __mj."EntityAction" ("ScopeEntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Actions
-- Item: vwEntityActions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Actions
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityAction
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityActions"
AS
SELECT
    e.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJAction_ActionID."Name" AS "Action",
    MJEntity_ScopeEntityID."Name" AS "ScopeEntity"
FROM
    __mj."EntityAction" AS e
INNER JOIN
    __mj."Entity" AS MJEntity_EntityID
  ON
    "e"."EntityID" = MJEntity_EntityID."ID"
INNER JOIN
    __mj."Action" AS MJAction_ActionID
  ON
    "e"."ActionID" = MJAction_ActionID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_ScopeEntityID
  ON
    "e"."ScopeEntityID" = MJEntity_ScopeEntityID."ID"
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
    AND tc.relname = 'vwEntityActions'
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
    AND tc.relname = 'vwEntityActions'
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
        AND tc.relname = 'vwEntityActions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwEntityActions" CASCADE;
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
GRANT SELECT ON __mj."vwEntityActions" TO "cdp_UI";
GRANT SELECT ON __mj."vwEntityActions" TO "cdp_Integration";
GRANT SELECT ON __mj."vwEntityActions" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Actions
-- Item: spCreateEntityAction
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityAction"(
    p_entityid UUID,
    p_actionid UUID,
    p_status varchar(20) DEFAULT NULL,
    p_id UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_scopeentityid_clear boolean DEFAULT false,
    p_scopeentityid UUID DEFAULT NULL,
    p_scoperecordid_clear boolean DEFAULT false,
    p_scoperecordid varchar(450) DEFAULT NULL,
    p_loggingmode varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwEntityActions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."EntityAction"
        (
            "ID",
            "EntityID",
                "ActionID",
                "Status",
                "Sequence",
                "ScopeEntityID",
                "ScopeRecordID",
                "LoggingMode"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_actionid,
                COALESCE(p_status, 'Pending'),
                COALESCE(p_sequence, 0),
                CASE WHEN p_scopeentityid_clear = true THEN NULL ELSE COALESCE(p_scopeentityid, NULL) END,
                CASE WHEN p_scoperecordid_clear = true THEN NULL ELSE COALESCE(p_scoperecordid, NULL) END,
                COALESCE(p_loggingmode, 'All')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwEntityActions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateEntityAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spCreateEntityAction" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Actions
-- Item: spUpdateEntityAction
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityAction"(
    p_entityid UUID DEFAULT NULL,
    p_actionid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_id UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_scopeentityid_clear boolean DEFAULT false,
    p_scopeentityid UUID DEFAULT NULL,
    p_scoperecordid_clear boolean DEFAULT false,
    p_scoperecordid varchar(450) DEFAULT NULL,
    p_loggingmode varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwEntityActions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."EntityAction"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "ActionID" = COALESCE(p_actionid, "ActionID"),
        "Status" = COALESCE(p_status, "Status"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "ScopeEntityID" = CASE WHEN p_scopeentityid_clear = true THEN NULL ELSE COALESCE(p_scopeentityid, "ScopeEntityID") END,
        "ScopeRecordID" = CASE WHEN p_scoperecordid_clear = true THEN NULL ELSE COALESCE(p_scoperecordid, "ScopeRecordID") END,
        "LoggingMode" = COALESCE(p_loggingmode, "LoggingMode")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwEntityActions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityAction" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityAction table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_entity_action"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_action" ON __mj."EntityAction";

CREATE TRIGGER "trg_update_entity_action"
BEFORE UPDATE ON __mj."EntityAction"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_entity_action"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Actions
-- Item: spDeleteEntityAction
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityAction"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."EntityAction"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityAction" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_category_id"
    ON __mj."Action" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_code_approved_by_user_id"
    ON __mj."Action" ("CodeApprovedByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_parent_id"
    ON __mj."Action" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_default_compact_prompt_id"
    ON __mj."Action" ("DefaultCompactPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_created_by_agent_id"
    ON __mj."Action" ("CreatedByAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: fnActionParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: Action.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_action_parent_id_get_root_id"(
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
            __mj."Action"
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
            __mj."Action" c
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwActions"
AS
SELECT
    a.*,
    MJActionCategory_CategoryID."Name" AS "Category",
    MJUser_CodeApprovedByUserID."Name" AS "CodeApprovedByUser",
    MJAction_ParentID."Name" AS "Parent",
    MJAIPrompt_DefaultCompactPromptID."Name" AS "DefaultCompactPrompt",
    MJAIAgent_CreatedByAgentID."Name" AS "CreatedByAgent",
    root_ParentID.root_id AS "RootParentID"
FROM
    __mj."Action" AS a
LEFT OUTER JOIN
    __mj."ActionCategory" AS MJActionCategory_CategoryID
  ON
    "a"."CategoryID" = MJActionCategory_CategoryID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_CodeApprovedByUserID
  ON
    "a"."CodeApprovedByUserID" = MJUser_CodeApprovedByUserID."ID"
LEFT OUTER JOIN
    __mj."Action" AS MJAction_ParentID
  ON
    "a"."ParentID" = MJAction_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_DefaultCompactPromptID
  ON
    "a"."DefaultCompactPromptID" = MJAIPrompt_DefaultCompactPromptID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_CreatedByAgentID
  ON
    "a"."CreatedByAgentID" = MJAIAgent_CreatedByAgentID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_action_parent_id_get_root_id"(a."ID", a."ParentID") AS root_id
) AS root_ParentID ON true
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

  DROP VIEW IF EXISTS __mj."vwActions" CASCADE;
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
GRANT SELECT ON __mj."vwActions" TO "cdp_UI";
GRANT SELECT ON __mj."vwActions" TO "cdp_Integration";
GRANT SELECT ON __mj."vwActions" TO "cdp_Developer";

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

CREATE OR REPLACE FUNCTION __mj."spCreateAction"(
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
) RETURNS SETOF __mj."vwActions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Action"
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
    SELECT * FROM __mj."vwActions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spCreateAction" TO "cdp_Developer";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateAction"(
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
) RETURNS SETOF __mj."vwActions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Action"
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
    SELECT * FROM __mj."vwActions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAction" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Action table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_action"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_action" ON __mj."Action";

CREATE TRIGGER "trg_update_action"
BEFORE UPDATE ON __mj."Action"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_action"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteAction"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: Action Authorizations records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionAuthorization"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionAuthorization"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Contexts records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionContext"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionContext"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Execution Logs records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionExecutionLog"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionExecutionLog"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Libraries records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionLibrary"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionLibrary"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Params records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionParam"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionParam"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Result Codes records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionResultCode"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionResultCode"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Actions records via ParentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Action"
        WHERE "ParentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAction"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Actions.ActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentAction"
        WHERE "ActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentAction"
        SET "ActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.ActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "ActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentStep"
        SET "ActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Skill Actions records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AISkillAction"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteAISkillAction"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Entity Actions records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityAction"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteEntityAction"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: MCP Server Tools.GeneratedActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."MCPServerTool"
        WHERE "GeneratedActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."MCPServerTool"
        SET "GeneratedActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.ActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."RecordProcess"
        WHERE "ActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."RecordProcess"
        SET "ActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Scheduled Actions records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ScheduledAction"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteScheduledAction"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."Action"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAction" TO "cdp_Developer";
