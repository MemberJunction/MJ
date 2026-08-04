-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606301200__v5.44.x__Agent_Skills_And_Plan_Mode.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — resolve before relying on this migration ══╗
-- UNHANDLED BY THE AST TRANSPILER (7 statement(s)):
--   [1] (DECLARE) DECLARE @StepTypeConstraint NVARCHAR(200) /* ===================================
--   [2] (SELECT) SELECT @StepTypeConstraint = name FROM sys.check_constraints WHERE parent_object
--   [3] (parse-error) IF @StepTypeConstraint IS NOT NULL BEGIN EXEC('ALTER TABLE [__mj_flyway_defa
--   [4] (PRINT) PRINT 'Dropped existing StepType check constraint: ' + @StepTypeConstraint
--   [5] (END) END
--   [6] (BOOL-INT-RESIDUAL) SupportsPlanMode = 0; a.SupportsPlanMode = 1
--   [7] (parse-error) -- INCLUDED SINCE WITIN 5.44 we are modifying the same table(s) more than once s
--   Each statement above was REPORTED, not silently dropped — port it manually.
-- ╚════════════════════════════════════════════════════════════════╝

/* ============================================================================ */
/* Agent Skills + Plan Mode  (v5.44.x) */
/* ============================================================================ */
/* Carved out of the Conversations Phase 1 roadmap (PR #2953) as a self-contained, */
/* agent-framework feature. Plan + Skills are bundled here because they share two */
/* schema objects: the consolidated AIAgent ALTER and the AIAgentRunStep.StepType */
/* CHECK (both add a value). The remaining Phase 1 pieces (User Routines, */
/* project-scoped memory, group chat) are independent migrations landed when built. */
/*   New tables (all "MJ: " entity names assigned by CodeGen): */
/*     AISkill           — reusable capability bundle (Instructions appended to an */
/*                         accepting agent's system prompt on activation). */
/*     AISkillAction     — Actions bundled into a skill (enabled while skill active). */
/*     AISkillSubAgent   — sub-agents bundled into a skill. */
/*     AIAgentSkill      — agent <-> skill assignment (for AcceptsSkills = Limited). */
/*     AISkillPermission — per-user / per-role access to a skill (View / Run / Edit / */
/*                         Delete). Mirrors AIAgentPermission — the dedicated-table, */
/*                         open-by-default parity model. Backs the AISkillPermissionHelper */
/*                         runtime gate and the MJAISkillPermissionProvider unified-engine */
/*                         wrapper (see guides/UNIFIED_PERMISSIONS_GUIDE.md). */
/*   Additive columns: */
/*     AIAgent.SupportsPlanMode  — capability flag (default ON / opt-out). */
/*     AIAgent.AcceptsSkills     — None | All | Limited (default None / opt-in). */
/*     AISkill.IconClass         — Font Awesome icon class for the /skill picker + catalog. */
/*     AISkill.Color             — accent color for the skill's chip/badge in the UI. */
/*   AIAgentRunStep.StepType extended with 'Plan' and 'Skill'. */
/*   Data seed: SupportsPlanMode = 0 for existing Realtime agents (session-driven, */
/*   structurally skip plan mode). Remote Proxy agents get seeded when that type */
/*   ships (Phase 2). */
/*   Permissions: skills use dedicated-table parity with agents (AISkillPermission, */
/*   above). The "Can Share Skills" authorization is seeded via metadata sync AFTER */
/*   CodeGen registers the entities; the MJ: Permission Domains catalog row for */
/*   'AI Skill Permissions' -> MJAISkillPermissionProvider is likewise metadata sync, */
/*   not this migration. */
/* ============================================================================ */
/* ============================================================================ */
/* 1. AISkill  ("MJ: AI Skills") */
/* ============================================================================ */
CREATE TABLE __mj."AISkill" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "Instructions" TEXT NOT NULL,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "DF_AISkill_Status" DEFAULT (
    'Active'
  ),
  "Category" VARCHAR(100) NULL,
  "IconClass" VARCHAR(100) NULL,
  "Color" VARCHAR(50) NULL,
  "CreatedByUserID" UUID NOT NULL,
  CONSTRAINT "PK_AISkill" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AISkill_CreatedByUser" FOREIGN KEY ("CreatedByUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "CK_AISkill_Status" CHECK ("Status" IN ('Active', 'Pending', 'Deprecated'))
);

COMMENT ON COLUMN __mj."AISkill"."Name" IS 'Skill name.';

COMMENT ON COLUMN __mj."AISkill"."Description" IS 'Short description shown in the skill catalog (used for progressive-disclosure exposure to agents — name + description only are injected until the skill is activated).';

COMMENT ON COLUMN __mj."AISkill"."Instructions" IS 'Instruction text appended to an accepting agent''s system prompt when the skill is activated.';

COMMENT ON COLUMN __mj."AISkill"."Status" IS 'Lifecycle status. Only Active skills can be activated by agents. Defaults to Active so a freshly authored skill is usable by its owner immediately; set to Deprecated to retire without deleting.';

COMMENT ON COLUMN __mj."AISkill"."Category" IS 'Optional grouping category.';

COMMENT ON COLUMN __mj."AISkill"."IconClass" IS 'Optional Font Awesome icon class (e.g. "fa-solid fa-wand-magic-sparkles") shown for this skill in the /skill picker and skill catalog. When null, the UI falls back to a derived default.';

COMMENT ON COLUMN __mj."AISkill"."Color" IS 'Optional accent color (hex or CSS color token) for this skill''s chip/badge in the composer and catalog UI. When null, the UI falls back to a derived default.';

COMMENT ON COLUMN __mj."AISkill"."CreatedByUserID" IS 'User who authored the skill (owner). Authoring is open to self by default; sharing requires the Can Share Skills privilege.';

/* ============================================================================ */
/* 2. AISkillAction  ("MJ: AI Skill Actions") */
/* ============================================================================ */
CREATE TABLE __mj."AISkillAction" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "SkillID" UUID NOT NULL,
  "ActionID" UUID NOT NULL,
  CONSTRAINT "PK_AISkillAction" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AISkillAction_Skill" FOREIGN KEY ("SkillID") REFERENCES __mj."AISkill" (
    "ID"
  ),
  CONSTRAINT "FK_AISkillAction_Action" FOREIGN KEY ("ActionID") REFERENCES __mj."Action" (
    "ID"
  ),
  CONSTRAINT "UQ_AISkillAction_Skill_Action" UNIQUE (
    "SkillID",
    "ActionID"
  )
);

COMMENT ON COLUMN __mj."AISkillAction"."SkillID" IS 'Skill that bundles this action.';

COMMENT ON COLUMN __mj."AISkillAction"."ActionID" IS 'Action made available to the agent while the skill is active. Whether and how often the model invokes it is governed by the skill''s Instructions, not by a hard execution count.';

/* ============================================================================ */
/* 3. AISkillSubAgent  ("MJ: AI Skill Sub Agents") */
/* ============================================================================ */
CREATE TABLE __mj."AISkillSubAgent" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "SkillID" UUID NOT NULL,
  "SubAgentID" UUID NOT NULL,
  CONSTRAINT "PK_AISkillSubAgent" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AISkillSubAgent_Skill" FOREIGN KEY ("SkillID") REFERENCES __mj."AISkill" (
    "ID"
  ),
  CONSTRAINT "FK_AISkillSubAgent_SubAgent" FOREIGN KEY ("SubAgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "UQ_AISkillSubAgent_Skill_SubAgent" UNIQUE (
    "SkillID",
    "SubAgentID"
  )
);

COMMENT ON COLUMN __mj."AISkillSubAgent"."SkillID" IS 'Skill that bundles this sub-agent.';

COMMENT ON COLUMN __mj."AISkillSubAgent"."SubAgentID" IS 'Sub-agent made available to the agent while the skill is active.';

/* ============================================================================ */
/* 4. AIAgentSkill  ("MJ: AI Agent Skills") — agent <-> skill assignment */
/*    Used when the agent's AcceptsSkills = Limited. */
/* ============================================================================ */
CREATE TABLE __mj."AIAgentSkill" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "AgentID" UUID NOT NULL,
  "SkillID" UUID NOT NULL,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIAgentSkill_Status" DEFAULT (
    'Active'
  ),
  CONSTRAINT "PK_AIAgentSkill" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AIAgentSkill_Agent" FOREIGN KEY ("AgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentSkill_Skill" FOREIGN KEY ("SkillID") REFERENCES __mj."AISkill" (
    "ID"
  ),
  CONSTRAINT "UQ_AIAgentSkill_Agent_Skill" UNIQUE (
    "AgentID",
    "SkillID"
  ),
  CONSTRAINT "CK_AIAgentSkill_Status" CHECK ("Status" IN ('Active', 'Pending', 'Revoked'))
);

COMMENT ON COLUMN __mj."AIAgentSkill"."AgentID" IS 'Agent the skill is assigned to. Used when the agent''s AcceptsSkills = Limited.';

COMMENT ON COLUMN __mj."AIAgentSkill"."SkillID" IS 'Skill assigned to the agent.';

COMMENT ON COLUMN __mj."AIAgentSkill"."Status" IS 'Per-assignment status: Active, Pending, or Revoked. Lets an assignment be disabled without unlinking.';

/* ============================================================================ */
/* 4b. AISkillPermission  ("MJ: AI Skill Permissions") — per-user / per-role access */
/*     to a skill. Mirrors AIAgentPermission (dedicated-table parity). Exactly one of */
/*     UserID / RoleID is set per row (enforced by the entity server validator, matching */
/*     AIAgentPermission — not a DB constraint, so a null grantee surfaces as a validation */
/*     error rather than a raw constraint violation). Open-by-default semantics live in the */
/*     AISkillPermissionHelper runtime gate; this table stores only explicit grants. */
/* ============================================================================ */
CREATE TABLE __mj."AISkillPermission" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "SkillID" UUID NOT NULL,
  "RoleID" UUID NULL,
  "UserID" UUID NULL,
  "CanView" BOOLEAN NOT NULL CONSTRAINT "DF_AISkillPermission_CanView" DEFAULT FALSE,
  "CanRun" BOOLEAN NOT NULL CONSTRAINT "DF_AISkillPermission_CanRun" DEFAULT FALSE,
  "CanEdit" BOOLEAN NOT NULL CONSTRAINT "DF_AISkillPermission_CanEdit" DEFAULT FALSE,
  "CanDelete" BOOLEAN NOT NULL CONSTRAINT "DF_AISkillPermission_CanDelete" DEFAULT FALSE,
  "Comments" TEXT NULL,
  CONSTRAINT "PK_AISkillPermission" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_AISkillPermission_Skill" FOREIGN KEY ("SkillID") REFERENCES __mj."AISkill" (
    "ID"
  ),
  CONSTRAINT "FK_AISkillPermission_Role" FOREIGN KEY ("RoleID") REFERENCES __mj."Role" (
    "ID"
  ),
  CONSTRAINT "FK_AISkillPermission_User" FOREIGN KEY ("UserID") REFERENCES __mj."User" (
    "ID"
  )
);

COMMENT ON COLUMN __mj."AISkillPermission"."SkillID" IS 'Skill this permission grant applies to.';

COMMENT ON COLUMN __mj."AISkillPermission"."RoleID" IS 'Role this grant is for. Mutually exclusive with UserID — exactly one of the two is set per row.';

COMMENT ON COLUMN __mj."AISkillPermission"."UserID" IS 'User this grant is for. Mutually exclusive with RoleID — exactly one of the two is set per row.';

COMMENT ON COLUMN __mj."AISkillPermission"."CanView" IS 'Grants viewing the skill in catalogs/pickers. Maps to the normalized Read action.';

COMMENT ON COLUMN __mj."AISkillPermission"."CanRun" IS 'Grants requesting/activating the skill at agent runtime. Maps to the normalized Execute action.';

COMMENT ON COLUMN __mj."AISkillPermission"."CanEdit" IS 'Grants editing the skill definition and its bundled actions/sub-agents. Maps to the normalized Update action.';

COMMENT ON COLUMN __mj."AISkillPermission"."CanDelete" IS 'Grants deleting the skill. Maps to the normalized Delete action.';

COMMENT ON COLUMN __mj."AISkillPermission"."Comments" IS 'Optional free-text note explaining why the grant exists.';

ALTER TABLE __mj."AIAgent"
  ADD COLUMN "SupportsPlanMode" BOOLEAN NOT NULL CONSTRAINT "DF_AIAgent_SupportsPlanMode" DEFAULT TRUE,
  ADD COLUMN "AcceptsSkills" VARCHAR(20) NOT NULL CONSTRAINT "DF_AIAgent_AcceptsSkills" DEFAULT (
    'None'
  ),
  ADD CONSTRAINT "CK_AIAgent_AcceptsSkills" CHECK ("AcceptsSkills" IN ('None', 'All', 'Limited'))
 /* ============================================================================ */ /* 5. ALTER AIAgent — plan-mode capability (default ON / opt-out) + skills */ /*    acceptance gate (default None / opt-in). One consolidated ALTER. */ /* ============================================================================ */;

COMMENT ON COLUMN __mj."AIAgent"."SupportsPlanMode" IS 'Whether this agent supports Plan Mode. Defaults ON (opt-out). Plan-mode instructions are only injected when this is on AND plan mode is enabled per-request, so default runtime behavior is unchanged. Realtime agents are seeded to 0 (they skip plan mode structurally); Remote Proxy agents will be seeded when that type ships.';

COMMENT ON COLUMN __mj."AIAgent"."AcceptsSkills" IS 'Whether this agent accepts skills: None (no skills — default), All (any Active skill), or Limited (only skills assigned via AIAgentSkill). This is the per-agent gate; AISkill.Status and AIAgentSkill.Status provide catalog- and assignment-level gating on top.';

-- PG hand-authoring (gap): SS dynamically finds + drops the existing StepType CHECK before
-- re-adding the widened value list (adds 'Plan' and 'Skill'). The AST transpiler emitted that
-- dynamic-drop block as comments (see UNHANDLED block at top of file), so drop the known
-- constraint here to keep the ADD below idempotent on a DB that already has the 9-value CHECK.
ALTER TABLE __mj."AIAgentRunStep" DROP CONSTRAINT IF EXISTS "CK_AIAgentRunStep_StepType";

ALTER TABLE __mj."AIAgentRunStep"
  ADD CONSTRAINT "CK_AIAgentRunStep_StepType" CHECK ("StepType" IN (
    'Prompt',
    'Actions',
    'Sub-Agent',
    'Chat',
    'Decision',
    'Validation',
    'ForEach',
    'While',
    'Tool',
    'Plan',
    'Skill'
  ));

/* SQL generated to create new entity MJ: AI Skills */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1d52de84-dd3f-4e46-8d2b-574b70080bb4',
    'MJ: AI Skills',
    'AI Skills',
    NULL,
    NULL,
    'AISkill',
    'vwAISkills',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );

/* SQL generated to add new entity MJ: AI Skills to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '1d52de84-dd3f-4e46-8d2b-574b70080bb4',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skills for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1d52de84-dd3f-4e46-8d2b-574b70080bb4',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skills for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1d52de84-dd3f-4e46-8d2b-574b70080bb4',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skills for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1d52de84-dd3f-4e46-8d2b-574b70080bb4',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: AI Skill Actions */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5e3ea927-befa-417e-8fd9-6c114c1c0a2a',
    'MJ: AI Skill Actions',
    'AI Skill Actions',
    NULL,
    NULL,
    'AISkillAction',
    'vwAISkillActions',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );

/* SQL generated to add new entity MJ: AI Skill Actions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '5e3ea927-befa-417e-8fd9-6c114c1c0a2a',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skill Actions for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5e3ea927-befa-417e-8fd9-6c114c1c0a2a',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skill Actions for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5e3ea927-befa-417e-8fd9-6c114c1c0a2a',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skill Actions for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5e3ea927-befa-417e-8fd9-6c114c1c0a2a',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: AI Skill Sub Agents */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'aa4add02-7763-44ce-b07d-0cf74708749c',
    'MJ: AI Skill Sub Agents',
    'AI Skill Sub Agents',
    NULL,
    NULL,
    'AISkillSubAgent',
    'vwAISkillSubAgents',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );

/* SQL generated to add new entity MJ: AI Skill Sub Agents to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'aa4add02-7763-44ce-b07d-0cf74708749c',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skill Sub Agents for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'aa4add02-7763-44ce-b07d-0cf74708749c',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skill Sub Agents for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'aa4add02-7763-44ce-b07d-0cf74708749c',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skill Sub Agents for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'aa4add02-7763-44ce-b07d-0cf74708749c',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: AI Agent Skills */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1f1ebdd5-84da-4554-a029-87aff327971d',
    'MJ: AI Agent Skills',
    'AI Agent Skills',
    NULL,
    NULL,
    'AIAgentSkill',
    'vwAIAgentSkills',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );

/* SQL generated to add new entity MJ: AI Agent Skills to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '1f1ebdd5-84da-4554-a029-87aff327971d',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Skills for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1f1ebdd5-84da-4554-a029-87aff327971d',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Skills for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1f1ebdd5-84da-4554-a029-87aff327971d',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Agent Skills for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1f1ebdd5-84da-4554-a029-87aff327971d',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: AI Skill Permissions */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7eedd9fb-3882-4e98-804e-be1e95fac54a',
    'MJ: AI Skill Permissions',
    'AI Skill Permissions',
    NULL,
    NULL,
    'AISkillPermission',
    'vwAISkillPermissions',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );

/* SQL generated to add new entity MJ: AI Skill Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '7eedd9fb-3882-4e98-804e-be1e95fac54a',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skill Permissions for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7eedd9fb-3882-4e98-804e-be1e95fac54a',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skill Permissions for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7eedd9fb-3882-4e98-804e-be1e95fac54a',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: AI Skill Permissions for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7eedd9fb-3882-4e98-804e-be1e95fac54a',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

ALTER TABLE __mj."AISkillSubAgent"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AISkillSubAgent */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AISkillSubAgent */
UPDATE __mj."AISkillSubAgent" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AISkillSubAgent' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AISkillSubAgent" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AISkillSubAgent" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AISkillSubAgent"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AISkillSubAgent */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AISkillSubAgent */
UPDATE __mj."AISkillSubAgent" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AISkillSubAgent' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AISkillSubAgent" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AISkillSubAgent" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AISkill"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AISkill */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AISkill */
UPDATE __mj."AISkill" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AISkill' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AISkill" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AISkill" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AISkill"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AISkill */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AISkill */
UPDATE __mj."AISkill" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AISkill' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AISkill" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AISkill" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AISkillAction"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AISkillAction */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AISkillAction */
UPDATE __mj."AISkillAction" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AISkillAction' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AISkillAction" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AISkillAction" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AISkillAction"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AISkillAction */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AISkillAction */
UPDATE __mj."AISkillAction" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AISkillAction' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AISkillAction" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AISkillAction" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentSkill"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSkill */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentSkill */
UPDATE __mj."AIAgentSkill" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIAgentSkill' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSkill" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSkill" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentSkill"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSkill */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentSkill */
UPDATE __mj."AIAgentSkill" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AIAgentSkill' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentSkill" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentSkill" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AISkillPermission"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AISkillPermission */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AISkillPermission */
UPDATE __mj."AISkillPermission" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AISkillPermission' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AISkillPermission" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AISkillPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AISkillPermission"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AISkillPermission */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AISkillPermission */
UPDATE __mj."AISkillPermission" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'AISkillPermission' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AISkillPermission" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AISkillPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6f06bf51-578f-4879-ad6a-9ec786939be7' OR ("EntityID" = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6f06bf51-578f-4879-ad6a-9ec786939be7', 'AA4ADD02-7763-44CE-B07D-0CF74708749C' /* Entity: MJ: AI Skill Sub Agents */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '00059b09-d83b-44e4-8604-dc0102128fa1' OR ("EntityID" = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND "Name" = 'SkillID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('00059b09-d83b-44e4-8604-dc0102128fa1', 'AA4ADD02-7763-44CE-B07D-0CF74708749C' /* Entity: MJ: AI Skill Sub Agents */, 100002, 'SkillID', 'Skill ID', 'Skill that bundles this sub-agent.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7319e9ce-62d0-4dd4-99bd-e48fc866277f' OR ("EntityID" = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND "Name" = 'SubAgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7319e9ce-62d0-4dd4-99bd-e48fc866277f', 'AA4ADD02-7763-44CE-B07D-0CF74708749C' /* Entity: MJ: AI Skill Sub Agents */, 100003, 'SubAgentID', 'Sub Agent ID', 'Sub-agent made available to the agent while the skill is active.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eed49c3c-6ef3-4258-b38b-625b2dfb694f' OR ("EntityID" = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eed49c3c-6ef3-4258-b38b-625b2dfb694f', 'AA4ADD02-7763-44CE-B07D-0CF74708749C' /* Entity: MJ: AI Skill Sub Agents */, 100004, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6c692028-511d-4fe4-a475-590724775eb4' OR ("EntityID" = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6c692028-511d-4fe4-a475-590724775eb4', 'AA4ADD02-7763-44CE-B07D-0CF74708749C' /* Entity: MJ: AI Skill Sub Agents */, 100005, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e8ad66e4-d6eb-4a92-8e9d-bae06162b98d' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'SupportsPlanMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e8ad66e4-d6eb-4a92-8e9d-bae06162b98d', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' /* Entity: MJ: AI Agents */, 100160, 'SupportsPlanMode', 'Supports Plan Mode', 'Whether this agent supports Plan Mode. Defaults ON (opt-out). Plan-mode instructions are only injected when this is on AND plan mode is enabled per-request, so default runtime behavior is unchanged. Realtime agents are seeded to 0 (they skip plan mode structurally); Remote Proxy agents will be seeded when that type ships.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5147944d-e146-47a9-b728-e46bbacdeab5' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'AcceptsSkills')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5147944d-e146-47a9-b728-e46bbacdeab5', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' /* Entity: MJ: AI Agents */, 100161, 'AcceptsSkills', 'Accepts Skills', 'Whether this agent accepts skills: None (no skills — default), All (any Active skill), or Limited (only skills assigned via AIAgentSkill). This is the per-agent gate; AISkill.Status and AIAgentSkill.Status provide catalog- and assignment-level gating on top.', 'nvarchar', 40, 0, 0, FALSE, 'None', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b0738691-8e33-41fc-9e5b-efaf4a13ab01' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b0738691-8e33-41fc-9e5b-efaf4a13ab01', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bf89fcce-6d4d-4dd0-ac89-f7785be11f27' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bf89fcce-6d4d-4dd0-ac89-f7785be11f27', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100002, 'Name', 'Name', 'Skill name.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '27eddfe6-8e94-4f90-abb3-bfd7029c3640' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('27eddfe6-8e94-4f90-abb3-bfd7029c3640', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100003, 'Description', 'Description', 'Short description shown in the skill catalog (used for progressive-disclosure exposure to agents — name + description only are injected until the skill is activated).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4ea0de7b-5bf0-4f2a-a8c4-cc8ae1fe47a7' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = 'Instructions')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4ea0de7b-5bf0-4f2a-a8c4-cc8ae1fe47a7', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100004, 'Instructions', 'Instructions', 'Instruction text appended to an accepting agent''s system prompt when the skill is activated.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '58bcaf71-a955-473d-99e4-fa0997cfbe56' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58bcaf71-a955-473d-99e4-fa0997cfbe56', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100005, 'Status', 'Status', 'Lifecycle status. Only Active skills can be activated by agents. Defaults to Active so a freshly authored skill is usable by its owner immediately; set to Deprecated to retire without deleting.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '03bf582c-cbe4-4de3-a5d9-f9b788e0d665' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = 'Category')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('03bf582c-cbe4-4de3-a5d9-f9b788e0d665', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100006, 'Category', 'Category', 'Optional grouping category.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4f38d266-56d2-49de-9912-3c67a28413cc' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = 'IconClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4f38d266-56d2-49de-9912-3c67a28413cc', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100007, 'IconClass', 'Icon Class', 'Optional Font Awesome icon class (e.g. "fa-solid fa-wand-magic-sparkles") shown for this skill in the /skill picker and skill catalog. When null, the UI falls back to a derived default.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9cc2c1ad-8a1d-4dab-bea5-83845f7feec9' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = 'Color')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9cc2c1ad-8a1d-4dab-bea5-83845f7feec9', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100008, 'Color', 'Color', 'Optional accent color (hex or CSS color token) for this skill''s chip/badge in the composer and catalog UI. When null, the UI falls back to a derived default.', 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a807d7c3-7083-42e5-baf7-62eeca9c8813' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = 'CreatedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a807d7c3-7083-42e5-baf7-62eeca9c8813', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100009, 'CreatedByUserID', 'Created By User ID', 'User who authored the skill (owner). Authoring is open to self by default; sharing requires the Can Share Skills privilege.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b0021e00-68ff-4499-b029-d16440781316' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b0021e00-68ff-4499-b029-d16440781316', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100010, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '86ff4d27-32d6-4e3d-9857-da7da9855289' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86ff4d27-32d6-4e3d-9857-da7da9855289', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100011, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '81ab537e-0d9f-4090-9b15-3b372100e402' OR ("EntityID" = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('81ab537e-0d9f-4090-9b15-3b372100e402', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' /* Entity: MJ: AI Skill Actions */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '39650eae-013a-4e44-a315-0695c32df61d' OR ("EntityID" = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND "Name" = 'SkillID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('39650eae-013a-4e44-a315-0695c32df61d', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' /* Entity: MJ: AI Skill Actions */, 100002, 'SkillID', 'Skill ID', 'Skill that bundles this action.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a96bc379-f67f-475c-a272-5f847ce1f821' OR ("EntityID" = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND "Name" = 'ActionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a96bc379-f67f-475c-a272-5f847ce1f821', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' /* Entity: MJ: AI Skill Actions */, 100003, 'ActionID', 'Action ID', 'Action made available to the agent while the skill is active. Whether and how often the model invokes it is governed by the skill''s Instructions, not by a hard execution count.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '38248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '96d3843f-079f-4bee-8ecc-8012a07f10d6' OR ("EntityID" = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('96d3843f-079f-4bee-8ecc-8012a07f10d6', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' /* Entity: MJ: AI Skill Actions */, 100004, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd5737f0b-e63f-464a-8bd0-81b9f7fdb446' OR ("EntityID" = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d5737f0b-e63f-464a-8bd0-81b9f7fdb446', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' /* Entity: MJ: AI Skill Actions */, 100005, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cfb281f4-03ac-41a2-b61a-32f39c6ad41b' OR ("EntityID" = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cfb281f4-03ac-41a2-b61a-32f39c6ad41b', '1F1EBDD5-84DA-4554-A029-87AFF327971D' /* Entity: MJ: AI Agent Skills */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '73aa9933-4307-43e6-8080-f5304d5d34bb' OR ("EntityID" = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND "Name" = 'AgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('73aa9933-4307-43e6-8080-f5304d5d34bb', '1F1EBDD5-84DA-4554-A029-87AFF327971D' /* Entity: MJ: AI Agent Skills */, 100002, 'AgentID', 'Agent ID', 'Agent the skill is assigned to. Used when the agent''s AcceptsSkills = Limited.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '81fa8f23-39ba-4246-b583-daab08cbf4e1' OR ("EntityID" = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND "Name" = 'SkillID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('81fa8f23-39ba-4246-b583-daab08cbf4e1', '1F1EBDD5-84DA-4554-A029-87AFF327971D' /* Entity: MJ: AI Agent Skills */, 100003, 'SkillID', 'Skill ID', 'Skill assigned to the agent.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fdcf5c8c-e402-497c-9da8-5a47e6295937' OR ("EntityID" = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fdcf5c8c-e402-497c-9da8-5a47e6295937', '1F1EBDD5-84DA-4554-A029-87AFF327971D' /* Entity: MJ: AI Agent Skills */, 100004, 'Status', 'Status', 'Per-assignment status: Active, Pending, or Revoked. Lets an assignment be disabled without unlinking.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c8fcf2dd-1109-42f6-9c3b-04a998414c5f' OR ("EntityID" = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c8fcf2dd-1109-42f6-9c3b-04a998414c5f', '1F1EBDD5-84DA-4554-A029-87AFF327971D' /* Entity: MJ: AI Agent Skills */, 100005, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c4d2d43c-ee05-4f56-8636-68cff6c74050' OR ("EntityID" = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c4d2d43c-ee05-4f56-8636-68cff6c74050', '1F1EBDD5-84DA-4554-A029-87AFF327971D' /* Entity: MJ: AI Agent Skills */, 100006, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bcf6f504-a122-4e01-910d-da799502d208' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bcf6f504-a122-4e01-910d-da799502d208', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1584029-6fa2-417f-8592-29288a8a2d3c' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'SkillID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f1584029-6fa2-417f-8592-29288a8a2d3c', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100002, 'SkillID', 'Skill ID', 'Skill this permission grant applies to.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '758c7804-58ea-4092-b420-9e24fcc072eb' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'RoleID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('758c7804-58ea-4092-b420-9e24fcc072eb', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100003, 'RoleID', 'Role ID', 'Role this grant is for. Mutually exclusive with UserID — exactly one of the two is set per row.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e741feb8-69ea-49bc-b6b9-a89ca678a324' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e741feb8-69ea-49bc-b6b9-a89ca678a324', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100004, 'UserID', 'User ID', 'User this grant is for. Mutually exclusive with RoleID — exactly one of the two is set per row.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '360c60b6-7f6e-4659-a588-f7c293119143' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'CanView')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('360c60b6-7f6e-4659-a588-f7c293119143', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100005, 'CanView', 'Can View', 'Grants viewing the skill in catalogs/pickers. Maps to the normalized Read action.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6e0ac00f-a853-4ce1-932c-1b1867eae004' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'CanRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6e0ac00f-a853-4ce1-932c-1b1867eae004', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100006, 'CanRun', 'Can Run', 'Grants requesting/activating the skill at agent runtime. Maps to the normalized Execute action.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c7205e95-20ed-4b5c-a809-74cbec0e82f3' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'CanEdit')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c7205e95-20ed-4b5c-a809-74cbec0e82f3', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100007, 'CanEdit', 'Can Edit', 'Grants editing the skill definition and its bundled actions/sub-agents. Maps to the normalized Update action.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '05ff7c4a-fc59-41df-a656-bf2a5cc4b112' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'CanDelete')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('05ff7c4a-fc59-41df-a656-bf2a5cc4b112', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100008, 'CanDelete', 'Can Delete', 'Grants deleting the skill. Maps to the normalized Delete action.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5a64b3cb-3e78-4cad-99ae-4d8f0a606151' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'Comments')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5a64b3cb-3e78-4cad-99ae-4d8f0a606151', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100009, 'Comments', 'Comments', 'Optional free-text note explaining why the grant exists.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f24f0607-585a-46dd-a1ce-e1204e98b5ae' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f24f0607-585a-46dd-a1ce-e1204e98b5ae', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100010, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '137f6a40-b765-46eb-b13e-e136e8f35766' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('137f6a40-b765-46eb-b13e-e136e8f35766', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100011, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 8182b804-9d3b-424b-b7e1-98e74bd5d37d */
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
    '8182b804-9d3b-424b-b7e1-98e74bd5d37d',
    '58BCAF71-A955-473D-99E4-FA0997CFBE56',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 0479be4e-4225-4301-b05a-71416ab3d22b */
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
    '0479be4e-4225-4301-b05a-71416ab3d22b',
    '58BCAF71-A955-473D-99E4-FA0997CFBE56',
    2,
    'Deprecated',
    'Deprecated',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 366b5c02-e6be-41dd-82b0-456e3764715e */
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
    '366b5c02-e6be-41dd-82b0-456e3764715e',
    '58BCAF71-A955-473D-99E4-FA0997CFBE56',
    3,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 58BCAF71-A955-473D-99E4-FA0997CFBE56 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '58BCAF71-A955-473D-99E4-FA0997CFBE56';

/* SQL text to insert entity field value with ID e6f3d0a3-72ea-464e-b9fe-9943fc06a3f8 */
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
    'e6f3d0a3-72ea-464e-b9fe-9943fc06a3f8',
    'FDCF5C8C-E402-497C-9DA8-5A47E6295937',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 7001b5fe-7a31-4364-b4d4-0b97478fff2b */
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
    '7001b5fe-7a31-4364-b4d4-0b97478fff2b',
    'FDCF5C8C-E402-497C-9DA8-5A47E6295937',
    2,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 4eef763f-87ac-4735-8a57-773ca619c8b4 */
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
    '4eef763f-87ac-4735-8a57-773ca619c8b4',
    'FDCF5C8C-E402-497C-9DA8-5A47E6295937',
    3,
    'Revoked',
    'Revoked',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID FDCF5C8C-E402-497C-9DA8-5A47E6295937 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'FDCF5C8C-E402-497C-9DA8-5A47E6295937';

/* SQL text to insert entity field value with ID dcdfea86-30ca-45b9-a14d-71ef8dfd4c86 */
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
    'dcdfea86-30ca-45b9-a14d-71ef8dfd4c86',
    '5147944D-E146-47A9-B728-E46BBACDEAB5',
    1,
    'All',
    'All',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 96ab48af-a429-49a7-92ac-45bb4064d87e */
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
    '96ab48af-a429-49a7-92ac-45bb4064d87e',
    '5147944D-E146-47A9-B728-E46BBACDEAB5',
    2,
    'Limited',
    'Limited',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID f9379a40-6ea6-4340-b48c-87fa70c7bb54 */
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
    'f9379a40-6ea6-4340-b48c-87fa70c7bb54',
    '5147944D-E146-47A9-B728-E46BBACDEAB5',
    3,
    'None',
    'None',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 5147944D-E146-47A9-B728-E46BBACDEAB5 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '5147944D-E146-47A9-B728-E46BBACDEAB5';

/* SQL text to insert entity field value with ID 6b6811bd-344f-4805-a13a-94076410c986 */
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
    '6b6811bd-344f-4805-a13a-94076410c986',
    'B04A327B-55BF-4914-9DCF-3552A5DD0293',
    5,
    'Plan',
    'Plan',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 903515ef-293d-4186-8fa1-95ac7a83f5ab */
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
    '903515ef-293d-4186-8fa1-95ac7a83f5ab',
    'B04A327B-55BF-4914-9DCF-3552A5DD0293',
    7,
    'Skill',
    'Skill',
    NOW(),
    NOW()
  );

/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 6
WHERE
  "ID" = 'B4FDC768-5F15-4720-B9EA-FB39634AFEF9';

/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 8
WHERE
  "ID" = 'B1115D73-2524-4329-B202-B6D453DE8FA9';

/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 9
WHERE
  "ID" = 'BA69DCBC-B743-4DED-930D-6F0DB4E8C01E';

/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 10
WHERE
  "ID" = '61F9CF39-ECB3-4476-9AFC-7F037F5EB34E';

/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 11
WHERE
  "ID" = '5E90D638-0329-4FF7-BA05-B38037474BF5';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '1d5a8480-384d-461b-ad27-334d676f9113') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1d5a8480-384d-461b-ad27-334d676f9113', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '1F1EBDD5-84DA-4554-A029-87AFF327971D', 'AgentID', 'One To Many', TRUE, TRUE, 35, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bc151c47-e823-4b5f-9261-3118dde42df0') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bc151c47-e823-4b5f-9261-3118dde42df0', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'AA4ADD02-7763-44CE-B07D-0CF74708749C', 'SubAgentID', 'One To Many', TRUE, TRUE, 36, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b3bb324e-0dff-4e77-8dbc-50ec6098d07d') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b3bb324e-0dff-4e77-8dbc-50ec6098d07d', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'AA4ADD02-7763-44CE-B07D-0CF74708749C', 'SkillID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f0cfd509-8c61-4b90-8b32-917c9e394bc9') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f0cfd509-8c61-4b90-8b32-917c9e394bc9', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', '1F1EBDD5-84DA-4554-A029-87AFF327971D', 'SkillID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c214d7b7-6526-48d7-a93f-5adebfacb121') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c214d7b7-6526-48d7-a93f-5adebfacb121', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', 'SkillID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd87b66e2-13b0-4444-af5b-1684e5f71c70') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d87b66e2-13b0-4444-af5b-1684e5f71c70', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', 'SkillID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f2139e41-3ffb-4a97-a769-156cf5ef9726') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f2139e41-3ffb-4a97-a769-156cf5ef9726', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', 'RoleID', 'One To Many', TRUE, TRUE, 15, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a1a64d0d-9b8c-4d26-a051-eb9e0bc91732') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a1a64d0d-9b8c-4d26-a051-eb9e0bc91732', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A', 'UserID', 'One To Many', TRUE, TRUE, 106, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9471d132-baac-4a71-bf22-cc1e0d79a07c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9471d132-baac-4a71-bf22-cc1e0d79a07c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4', 'CreatedByUserID', 'One To Many', TRUE, TRUE, 107, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '91cdffd9-19ce-465a-b1a1-2e1b7c71b5c6') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('91cdffd9-19ce-465a-b1a1-2e1b7c71b5c6', '38248F34-2837-EF11-86D4-6045BDEE16E6', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A', 'ActionID', 'One To Many', TRUE, TRUE, 14, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a631bb20-d464-46d5-aed7-afe0f8b0f5ea' OR ("EntityID" = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND "Name" = 'Skill')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a631bb20-d464-46d5-aed7-afe0f8b0f5ea', 'AA4ADD02-7763-44CE-B07D-0CF74708749C' /* Entity: MJ: AI Skill Sub Agents */, 100011, 'Skill', 'Skill', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b3254762-6b08-431d-bb4c-2973859fb1ed' OR ("EntityID" = 'AA4ADD02-7763-44CE-B07D-0CF74708749C' AND "Name" = 'SubAgent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b3254762-6b08-431d-bb4c-2973859fb1ed', 'AA4ADD02-7763-44CE-B07D-0CF74708749C' /* Entity: MJ: AI Skill Sub Agents */, 100012, 'SubAgent', 'Sub Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9252d454-9cc5-4719-9604-a558224c4a4c' OR ("EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' AND "Name" = 'CreatedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9252d454-9cc5-4719-9604-a558224c4a4c', '1D52DE84-DD3F-4E46-8D2B-574B70080BB4' /* Entity: MJ: AI Skills */, 100023, 'CreatedByUser', 'Created By User', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '24e87322-7829-4951-9bc3-bbe9c72ce9e1' OR ("EntityID" = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND "Name" = 'Skill')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('24e87322-7829-4951-9bc3-bbe9c72ce9e1', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' /* Entity: MJ: AI Skill Actions */, 100011, 'Skill', 'Skill', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '716ccfef-3b4d-4e12-8e75-6db96997a051' OR ("EntityID" = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' AND "Name" = 'Action')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('716ccfef-3b4d-4e12-8e75-6db96997a051', '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A' /* Entity: MJ: AI Skill Actions */, 100012, 'Action', 'Action', NULL, 'nvarchar', 850, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '33ab33c2-ac0f-430a-b189-4fa6cc2f7459' OR ("EntityID" = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND "Name" = 'Agent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('33ab33c2-ac0f-430a-b189-4fa6cc2f7459', '1F1EBDD5-84DA-4554-A029-87AFF327971D' /* Entity: MJ: AI Agent Skills */, 100013, 'Agent', 'Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '28aee521-e7a0-42bb-8b5e-d0390523aff3' OR ("EntityID" = '1F1EBDD5-84DA-4554-A029-87AFF327971D' AND "Name" = 'Skill')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('28aee521-e7a0-42bb-8b5e-d0390523aff3', '1F1EBDD5-84DA-4554-A029-87AFF327971D' /* Entity: MJ: AI Agent Skills */, 100014, 'Skill', 'Skill', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1150580c-84a4-425e-8d9d-5d10cb9ed8c8' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'Skill')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1150580c-84a4-425e-8d9d-5d10cb9ed8c8', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100023, 'Skill', 'Skill', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd7ec9643-30aa-429d-a9b5-d8310a6e1d1e' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'Role')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d7ec9643-30aa-429d-a9b5-d8310a6e1d1e', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100024, 'Role', 'Role', NULL, 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ed9603db-5736-4d0c-93f6-e0386171822c' OR ("EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' AND "Name" = 'User')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ed9603db-5736-4d0c-93f6-e0386171822c', '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A' /* Entity: MJ: AI Skill Permissions */, 100025, 'User', 'User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'FDCF5C8C-E402-497C-9DA8-5A47E6295937'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '33AB33C2-AC0F-430A-B189-4FA6CC2F7459'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '28AEE521-E7A0-42BB-8B5E-D0390523AFF3'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'FDCF5C8C-E402-497C-9DA8-5A47E6295937'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '33AB33C2-AC0F-430A-B189-4FA6CC2F7459'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '28AEE521-E7A0-42BB-8B5E-D0390523AFF3'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '33AB33C2-AC0F-430A-B189-4FA6CC2F7459'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '28AEE521-E7A0-42BB-8B5E-D0390523AFF3'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'FDCF5C8C-E402-497C-9DA8-5A47E6295937'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '24E87322-7829-4951-9BC3-BBE9C72CE9E1'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '716CCFEF-3B4D-4E12-8E75-6DB96997A051'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '24E87322-7829-4951-9BC3-BBE9C72CE9E1'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '716CCFEF-3B4D-4E12-8E75-6DB96997A051'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '24E87322-7829-4951-9BC3-BBE9C72CE9E1'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '6C692028-511D-4FE4-A475-590724775EB4'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'A631BB20-D464-46D5-AED7-AFE0F8B0F5EA'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B3254762-6B08-431D-BB4C-2973859FB1ED'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'A631BB20-D464-46D5-AED7-AFE0F8B0F5EA'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'B3254762-6B08-431D-BB4C-2973859FB1ED'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'A631BB20-D464-46D5-AED7-AFE0F8B0F5EA'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'B3254762-6B08-431D-BB4C-2973859FB1ED'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '360C60B6-7F6E-4659-A588-F7C293119143'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '6E0AC00F-A853-4CE1-932C-1B1867EAE004'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C7205E95-20ED-4B5C-A809-74CBEC0E82F3'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '05FF7C4A-FC59-41DF-A656-BF2A5CC4B112'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1150580C-84A4-425E-8D9D-5D10CB9ED8C8'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D7EC9643-30AA-429D-A9B5-D8310A6E1D1E'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'ED9603DB-5736-4D0C-93F6-E0386171822C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '1150580C-84A4-425E-8D9D-5D10CB9ED8C8'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'D7EC9643-30AA-429D-A9B5-D8310A6E1D1E'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'ED9603DB-5736-4D0C-93F6-E0386171822C'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '1150580C-84A4-425E-8D9D-5D10CB9ED8C8'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'ED9603DB-5736-4D0C-93F6-E0386171822C'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'D7EC9643-30AA-429D-A9B5-D8310A6E1D1E'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '58BCAF71-A955-473D-99E4-FA0997CFBE56'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '03BF582C-CBE4-4DE3-A5D9-F9B788E0D665'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '9252D454-9CC5-4719-9604-A558224C4A4C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '03BF582C-CBE4-4DE3-A5D9-F9B788E0D665'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '9252D454-9CC5-4719-9604-A558224C4A4C'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'BF89FCCE-6D4D-4DD0-AC89-F7785BE11F27'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '03BF582C-CBE4-4DE3-A5D9-F9B788E0D665'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '9252D454-9CC5-4719-9604-A558224C4A4C'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 8 fields */
/* UPDATE Entity Field Category Info MJ: AI Agent Skills.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CFB281F4-03AC-41A2-B61A-32F39C6AD41B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Skills.AgentID */
UPDATE __mj."EntityField" SET "Category" = 'Assignment Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '73AA9933-4307-43E6-8080-F5304D5D34BB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Skills.SkillID */
UPDATE __mj."EntityField" SET "Category" = 'Assignment Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Skill', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '81FA8F23-39BA-4246-B583-DAAB08CBF4E1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Skills.Status */
UPDATE __mj."EntityField" SET "Category" = 'Assignment Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FDCF5C8C-E402-497C-9DA8-5A47E6295937' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Skills.Agent */
UPDATE __mj."EntityField" SET "Category" = 'Assignment Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '33AB33C2-AC0F-430A-B189-4FA6CC2F7459' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Skills.Skill */
UPDATE __mj."EntityField" SET "Category" = 'Assignment Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Skill Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '28AEE521-E7A0-42BB-8B5E-D0390523AFF3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Skills.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C8FCF2DD-1109-42F6-9C3B-04A998414C5F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agent Skills.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C4D2D43C-EE05-4F56-8636-68CFF6C74050' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-brain */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-brain', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '1F1EBDD5-84DA-4554-A029-87AFF327971D';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'bc8ff518-0ccf-48ba-be40-dd79e2c21043',
    '1F1EBDD5-84DA-4554-A029-87AFF327971D',
    'FieldCategoryInfo',
    '{"Assignment Details":{"icon":"fa fa-tasks","description":"Configuration and status of skills assigned to specific AI agents"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'bf4bd092-ce73-4363-99da-1aa695317379',
    '1F1EBDD5-84DA-4554-A029-87AFF327971D',
    'FieldCategoryIcons',
    '{"Assignment Details":"fa fa-tasks","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '1F1EBDD5-84DA-4554-A029-87AFF327971D';

/* Set categories for 12 fields */
/* UPDATE Entity Field Category Info MJ: AI Skills.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B0738691-8E33-41FC-9E5B-EFAF4A13AB01' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Name */
UPDATE __mj."EntityField" SET "Category" = 'Skill Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BF89FCCE-6D4D-4DD0-AC89-F7785BE11F27' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Description */
UPDATE __mj."EntityField" SET "Category" = 'Skill Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '27EDDFE6-8E94-4F90-ABB3-BFD7029C3640' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Instructions */
UPDATE __mj."EntityField" SET "Category" = 'Skill Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '4EA0DE7B-5BF0-4F2A-A8C4-CC8AE1FE47A7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Status */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '58BCAF71-A955-473D-99E4-FA0997CFBE56' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Category */
UPDATE __mj."EntityField" SET "Category" = 'Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '03BF582C-CBE4-4DE3-A5D9-F9B788E0D665' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.IconClass */
UPDATE __mj."EntityField" SET "Category" = 'UI Customization', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4F38D266-56D2-49DE-9912-3C67A28413CC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.Color */
UPDATE __mj."EntityField" SET "Category" = 'UI Customization', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9CC2C1AD-8A1D-4DAB-BEA5-83845F7FEEC9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.CreatedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Ownership and Audit', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A807D7C3-7083-42E5-BAF7-62EECA9C8813' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.CreatedByUser */
UPDATE __mj."EntityField" SET "Category" = 'Ownership and Audit', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9252D454-9CC5-4719-9604-A558224C4A4C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B0021E00-68FF-4499-B029-D16440781316' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skills.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '86FF4D27-32D6-4E3D-9857-DA7DA9855289' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-wand-magic-sparkles */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-wand-magic-sparkles', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1bfb828d-b86f-4abe-b2ac-97c029722d35',
    '1D52DE84-DD3F-4E46-8D2B-574B70080BB4',
    'FieldCategoryInfo',
    '{"Skill Definition":{"icon":"fa fa-book","description":"Core identity and behavioral instructions for the AI skill"},"Configuration":{"icon":"fa fa-cog","description":"Operational settings and classification for the skill"},"UI Customization":{"icon":"fa fa-palette","description":"Visual styling elements for the skill in the catalog"},"Ownership and Audit":{"icon":"fa fa-user-shield","description":"Information regarding skill ownership and authorship"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6d3ca558-12e1-4dc6-9f1e-14165d0417d7',
    '1D52DE84-DD3F-4E46-8D2B-574B70080BB4',
    'FieldCategoryIcons',
    '{"Skill Definition":"fa fa-book","Configuration":"fa fa-cog","UI Customization":"fa fa-palette","Ownership and Audit":"fa fa-user-shield","System Metadata":"fa fa-database"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '1D52DE84-DD3F-4E46-8D2B-574B70080BB4';

/* Set categories for 7 fields */
/* UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6F06BF51-578F-4879-AD6A-9EC786939BE7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.SkillID */
UPDATE __mj."EntityField" SET "Category" = 'Agent Association', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '00059B09-D83B-44E4-8604-DC0102128FA1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.SubAgentID */
UPDATE __mj."EntityField" SET "Category" = 'Agent Association', "GeneratedFormSection" = 'Category', "DisplayName" = 'Sub-Agent ID', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7319E9CE-62D0-4DD4-99BD-E48FC866277F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.Skill */
UPDATE __mj."EntityField" SET "Category" = 'Agent Association', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A631BB20-D464-46D5-AED7-AFE0F8B0F5EA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.SubAgent */
UPDATE __mj."EntityField" SET "Category" = 'Agent Association', "GeneratedFormSection" = 'Category', "DisplayName" = 'Sub-Agent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B3254762-6B08-431D-BB4C-2973859FB1ED' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EED49C3C-6EF3-4258-B38B-625B2DFB694F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Sub Agents.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6C692028-511D-4FE4-A475-590724775EB4' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-network-wired */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-network-wired', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'AA4ADD02-7763-44CE-B07D-0CF74708749C';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '25e4112c-a1d6-41aa-9b4e-7352b9d828e5',
    'AA4ADD02-7763-44CE-B07D-0CF74708749C',
    'FieldCategoryInfo',
    '{"Agent Association":{"icon":"fa fa-link","description":"Associations linking primary AI Skills with their designated Sub-Agents"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'fe44b15b-cc79-4285-9759-4db8d95602f1',
    'AA4ADD02-7763-44CE-B07D-0CF74708749C',
    'FieldCategoryIcons',
    '{"Agent Association":"fa fa-link","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'AA4ADD02-7763-44CE-B07D-0CF74708749C';

/* Set categories for 7 fields */
/* UPDATE Entity Field Category Info MJ: AI Skill Actions.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '81AB537E-0D9F-4090-9B15-3B372100E402' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Actions.SkillID */
UPDATE __mj."EntityField" SET "Category" = 'Skill & Action Mapping', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '39650EAE-013A-4E44-A315-0695C32DF61D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Actions.ActionID */
UPDATE __mj."EntityField" SET "Category" = 'Skill & Action Mapping', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A96BC379-F67F-475C-A272-5F847CE1F821' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Actions.Skill */
UPDATE __mj."EntityField" SET "Category" = 'Skill & Action Mapping', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '24E87322-7829-4951-9BC3-BBE9C72CE9E1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Actions.Action */
UPDATE __mj."EntityField" SET "Category" = 'Skill & Action Mapping', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '716CCFEF-3B4D-4E12-8E75-6DB96997A051' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Actions.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '96D3843F-079F-4BEE-8ECC-8012A07F10D6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Actions.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D5737F0B-E63F-464A-8BD0-81B9F7FDB446' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-bolt */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-bolt', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6bed06d3-7b8c-43e1-84e6-4dfec8328fca',
    '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A',
    'FieldCategoryInfo',
    '{"Skill & Action Mapping":{"icon":"fa fa-link","description":"Associations between AI skills and the actions they are permitted to invoke."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '087db2f4-f6a4-4d7e-8e84-26a917e19755',
    '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A',
    'FieldCategoryIcons',
    '{"Skill & Action Mapping":"fa fa-link","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '5E3EA927-BEFA-417E-8FD9-6C114C1C0A2A';

/* Set categories for 14 fields */
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BCF6F504-A122-4E01-910D-DA799502D208' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.SkillID */
UPDATE __mj."EntityField" SET "Category" = 'Permission Assignment', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F1584029-6FA2-417F-8592-29288A8A2D3C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.Skill */
UPDATE __mj."EntityField" SET "Category" = 'Permission Assignment', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1150580C-84A4-425E-8D9D-5D10CB9ED8C8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.RoleID */
UPDATE __mj."EntityField" SET "Category" = 'Permission Assignment', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '758C7804-58EA-4092-B420-9E24FCC072EB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.Role */
UPDATE __mj."EntityField" SET "Category" = 'Permission Assignment', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D7EC9643-30AA-429D-A9B5-D8310A6E1D1E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Permission Assignment', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E741FEB8-69EA-49BC-B6B9-A89CA678A324' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.User */
UPDATE __mj."EntityField" SET "Category" = 'Permission Assignment', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ED9603DB-5736-4D0C-93F6-E0386171822C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.CanView */
UPDATE __mj."EntityField" SET "Category" = 'Access Rights', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '360C60B6-7F6E-4659-A588-F7C293119143' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.CanRun */
UPDATE __mj."EntityField" SET "Category" = 'Access Rights', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6E0AC00F-A853-4CE1-932C-1B1867EAE004' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.CanEdit */
UPDATE __mj."EntityField" SET "Category" = 'Access Rights', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C7205E95-20ED-4B5C-A809-74CBEC0E82F3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.CanDelete */
UPDATE __mj."EntityField" SET "Category" = 'Access Rights', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '05FF7C4A-FC59-41DF-A656-BF2A5CC4B112' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.Comments */
UPDATE __mj."EntityField" SET "Category" = 'Access Rights', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5A64B3CB-3E78-4CAD-99AE-4D8F0A606151' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F24F0607-585A-46DD-A1CE-E1204E98B5AE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Skill Permissions.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '137F6A40-B765-46EB-B13E-E136E8F35766' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-user-shield */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-user-shield', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '56a6798b-534d-4dc2-a7ff-7343fa38d3cd',
    '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A',
    'FieldCategoryInfo',
    '{"Permission Assignment":{"icon":"fa fa-user-tag","description":"Details regarding the target skill and the user or role receiving the permission grant"},"Access Rights":{"icon":"fa fa-shield-alt","description":"Specific action-level permissions (View, Run, Edit, Delete) and associated justification notes"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '83e98632-300a-4b65-b9a5-14ab5475ec98',
    '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A',
    'FieldCategoryIcons',
    '{"Permission Assignment":"fa fa-user-tag","Access Rights":"fa fa-shield-alt","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '7EEDD9FB-3882-4E98-804E-BE1E95FAC54A';

/* Set categories for 87 fields */
/* UPDATE Entity Field Category Info MJ: AI Agents.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AA64DA98-1DA1-4525-8CC5-BC3E3E4893B6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.LogoURL */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = '77845738-5781-458B-AD3C-5DAE745373C2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '353D4710-73B2-4AF5-8A93-9DC1F47FF6E5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3177830D-10A0-4003-B95D-8514974BA846' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ParentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A6F8773F-4021-45DD-B142-9BFE4F67EC87' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ExposeAsAction */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DF61AC7C-79A7-4058-96A1-85EBA9339D45' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ExecutionOrder */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '090830CE-4073-486C-BBF2-E2105BEADD91' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ExecutionMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8261D630-2560-4C03-BE14-C8A9682ABBB4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.EnableContextCompression */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '09AFE563-63E3-4F2B-B6F1-5945432FF07B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionMessageThreshold */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Context Compression Message Threshold', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '451D5C8F-6749-4789-A158-658B38A74AE4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPromptID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Context Compression Prompt', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FFD209C5-48F3-45D1-9094-E76EC832EA07' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionMessageRetentionCount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Context Compression Message Retention Count', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '73A50D68-976F-49A7-9737-12D1D26C6011' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.TypeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Type', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '91CA077D-3F59-48E1-A593-AF8686276115' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DriverClass */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BB9AD9CB-40C0-41F1-B54B-750C844FD41B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.IconClass */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E3E05E29-CDAF-4BFE-9FC8-4450EEBE05E5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ModelSelectionMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FEEBD49D-5572-45D7-9F1E-08AE762F41D9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.PayloadDownstreamPaths */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '85B6AA86-796D-4970-9E35-5A483498B517' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.PayloadUpstreamPaths */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'DA784B76-66CD-434B-90BD-DEC808917E68' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.PayloadSelfReadPaths */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'EBF3B958-F07C-420B-82BE-2CB1E396A0F5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.PayloadSelfWritePaths */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '61E51FC3-8EFA-40D9-9525-F3FAD0A95DCA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.PayloadScope */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2E542986-0164-4B9E-8457-06826A4AB892' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Final Payload Validation Schema', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '1C7959AE-F48B-4858-8383-28C3F4706314' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidationMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8931DE12-4048-4DEB-A2A3-E821354CFFB2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidationMaxRetries */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AF62DAAB-74D4-4539-9B47-58DD4A023E4B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxCostPerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '23850C5A-311A-4271-AE53-BD36921C5AA5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxTokensPerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C5F8BB50-DC10-4DFC-AC45-8613C152EE94' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxIterationsPerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3FA6B9F3-60BC-4631-8EB4-7ED0D04844C4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxTimePerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E64A4FF8-BAD5-491C-9D8D-E5E70378ED67' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MinExecutionsPerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BCCCA2DC-8A15-4701-98E2-337FB60B463A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxExecutionsPerRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F0CCA759-DEA4-4F61-B233-C632EE9317E1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.StartingPayloadValidation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Starting Payload Validation Schema', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'B7A2371C-A22C-48EA-827E-824F8A40DA3D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.StartingPayloadValidationMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0947203D-A5CA-4ED2-895B-17A8007323FC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultPromptEffortLevel */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DCBAEEFD-C5A2-449D-A4B9-EAB1290C2F89' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ChatHandlingOption */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultArtifactTypeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F58EA638-CE95-4D2A-9095-9909149B83C7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.OwnerUserID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Owner User', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.InvocationMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ArtifactCreationMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4371BED0-7C4A-4D24-9E07-17E15D617607' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.FunctionalRequirements */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F613597C-C38F-4D71-B64A-8BBCFD87D8CC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.TechnicalDesign */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CAEA2872-B089-4192-8FA8-1737FF357FFD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.InjectNotes */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '37E075BD-CC4B-4AE1-8D12-7EC45B663F69' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxNotesToInject */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A8DA4C67-B2F7-4C1D-8522-A2B5B4BADA21' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.NoteInjectionStrategy */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F5F6BE87-06F4-404D-A1C3-B315C562C32B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.InjectExamples */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1C9957C7-A851-4C05-83B3-F49A5FC3FE4D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxExamplesToInject */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DDEE3E91-4B0D-4264-9EF1-ACAAB8D105E5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ExampleInjectionStrategy */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '291FEE7A-1245-4C82-A470-07EEB8847F1E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.IsRestricted */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E5B17B79-282F-4F19-9656-246DE119D588' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MessageMode */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '445C1618-EADB-4B34-B318-40C662141FE1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.MaxMessages */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F8924303-D53A-43B0-B70F-5B74FA6248D9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AttachmentStorageProviderID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4B5A24CC-1BC2-40E3-B83E-C8E164E6CFED' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AttachmentRootPath */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BA112220-B0D8-4C6F-B63A-027EB706B132' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.InlineStorageThresholdBytes */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EC3D6539-FAF4-49B7-9A9B-6327249C9D06' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AgentTypePromptParams */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'FD515BF1-7E8A-4CB0-A8CE-D5C0C8C132D7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ScopeConfig */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'F644A0DD-0C7D-44E5-A2D5-0DAE4F0455AD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.NoteRetentionDays */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '38ABFFF6-5E0D-4AF1-B5CC-AB46B2358FB4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ExampleRetentionDays */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A112A808-63DB-4B48-B38F-06554B912DED' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AutoArchiveEnabled */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '85774265-68C5-4067-9C2B-F70A7F21B94A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.RerankerConfiguration */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '269087F5-DEBE-4B14-8FA3-5938ADCF7325' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.CategoryID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7DCA7B3C-9A81-4D32-AF2E-5EA32B22D988' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AllowEphemeralClientTools */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '98BE9EE9-A855-488E-9D97-441AEBA2B34D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultStorageAccountID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '76AF4818-C79E-4DB5-8039-6B51C1C3A832' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.SearchScopeAccess */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AcceptUnregisteredFiles */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1380146E-BF7D-4624-803A-45B1E65F0B52' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultCoAgentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '724ADC60-12A5-4C77-8C7D-AC8F110EE069' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.TypeConfiguration */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '6F17DFC0-75FA-4F2A-9CF7-DF90B51C1239' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AllowMemoryWrite */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F224B93A-955B-4810-A042-20CD259D4CED' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.RecordingDefault */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '04C616DB-ABF1-4879-A79B-3229FD8A37B3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.RecordingStorageProviderID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5F516126-FCD8-4AF9-8600-E324886CC875' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultMediaCollectionID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FB1433BA-3037-44C5-8CCB-F8E9E4DBB001' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.SupportsPlanMode */
UPDATE __mj."EntityField" SET "Category" = 'Runtime Limits & Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E8AD66E4-D6EB-4A92-8E9D-BAE06162B98D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AcceptsSkills */
UPDATE __mj."EntityField" SET "Category" = 'Runtime Limits & Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5147944D-E146-47A9-B728-E46BBACDEAB5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Parent */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '52E74C81-D246-4B52-B7A7-91757C299671' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPrompt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Context Compression Prompt Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AD36EF69-1494-409C-A97E-FE73669DD28A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Type */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Type Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultArtifactType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6C1C76DF-BBFF-4903-9BB9-3325B5ABB4B1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.OwnerUser */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Owner User Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B098B41F-7953-473E-8257-DB6BFFEF48A0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.AttachmentStorageProvider */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B6261245-1F52-43BA-9C92-A3E494D8C5BE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.Category */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6517DB09-A12E-4F1B-95B6-0B0A92918A1D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultStorageAccount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D900C3B8-F414-4468-AAA1-3CEB52C80ACD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultCoAgent */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AAC9DA92-2BBE-4599-B742-4AE9E01DA10B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.RecordingStorageProvider */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3D53D5CF-CCED-4C20-A342-5FFDF9C34FE8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.DefaultMediaCollection */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6782D948-AE63-4A05-AFFF-066B97C2D865' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.RootParentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Root Parent ID', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '644AA4B2-1044-430C-BCBA-245644294E02' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: AI Agents.RootDefaultCoAgentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Root Default Co-Agent ID', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1861E78B-4306-44CA-8E62-70991A1F58CA' AND "AutoUpdateCategory" = TRUE;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Skills
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_skill_agent_id"
    ON __mj."AIAgentSkill" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_skill_skill_id"
    ON __mj."AIAgentSkill" ("SkillID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Skills
-- Item: vwAIAgentSkills
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Skills
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentSkill
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentSkills"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAISkill_SkillID."Name" AS "Skill"
FROM
    __mj."AIAgentSkill" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
INNER JOIN
    __mj."AISkill" AS MJAISkill_SkillID
  ON
    "a"."SkillID" = MJAISkill_SkillID."ID"
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
    AND tc.relname = 'vwAIAgentSkills'
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
    AND tc.relname = 'vwAIAgentSkills'
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
        AND tc.relname = 'vwAIAgentSkills'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentSkills" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgentSkills" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentSkills" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentSkills" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Skills
-- Item: spCreateAIAgentSkill
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentSkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentSkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentSkill"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_skillid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentSkills" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentSkill"
        (
            "ID",
            "AgentID",
                "SkillID",
                "Status"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_skillid,
                COALESCE(p_status, 'Active')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentSkills"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentSkill" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Skills
-- Item: spUpdateAIAgentSkill
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentSkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentSkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentSkill"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_skillid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentSkills" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentSkill"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "SkillID" = COALESCE(p_skillid, "SkillID"),
        "Status" = COALESCE(p_status, "Status")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentSkills"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentSkill" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSkill table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_skill"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_skill" ON __mj."AIAgentSkill";

CREATE TRIGGER "trg_update_ai_agent_skill"
BEFORE UPDATE ON __mj."AIAgentSkill"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_skill"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Skills
-- Item: spDeleteAIAgentSkill
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentSkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentSkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentSkill"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AIAgentSkill"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentSkill" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Actions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_skill_action_skill_id"
    ON __mj."AISkillAction" ("SkillID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_skill_action_action_id"
    ON __mj."AISkillAction" ("ActionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Actions
-- Item: vwAISkillActions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Skill Actions
-----               SCHEMA:      __mj
-----               BASE TABLE:  AISkillAction
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAISkillActions"
AS
SELECT
    a.*,
    MJAISkill_SkillID."Name" AS "Skill",
    MJAction_ActionID."Name" AS "Action"
FROM
    __mj."AISkillAction" AS a
INNER JOIN
    __mj."AISkill" AS MJAISkill_SkillID
  ON
    "a"."SkillID" = MJAISkill_SkillID."ID"
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
    AND tc.relname = 'vwAISkillActions'
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
    AND tc.relname = 'vwAISkillActions'
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
        AND tc.relname = 'vwAISkillActions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAISkillActions" CASCADE;
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
GRANT SELECT ON __mj."vwAISkillActions" TO "cdp_UI";
GRANT SELECT ON __mj."vwAISkillActions" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAISkillActions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Actions
-- Item: spCreateAISkillAction
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AISkillAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAISkillAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAISkillAction"(
    p_id UUID DEFAULT NULL,
    p_skillid UUID DEFAULT NULL,
    p_actionid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwAISkillActions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AISkillAction"
        (
            "ID",
            "SkillID",
                "ActionID"
        )
    VALUES
        (
            v_new_id,
            p_skillid,
                p_actionid
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAISkillActions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAISkillAction" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAISkillAction" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Actions
-- Item: spUpdateAISkillAction
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AISkillAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAISkillAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAISkillAction"(
    p_id UUID,
    p_skillid UUID DEFAULT NULL,
    p_actionid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwAISkillActions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AISkillAction"
    SET
        "SkillID" = COALESCE(p_skillid, "SkillID"),
        "ActionID" = COALESCE(p_actionid, "ActionID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAISkillActions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAISkillAction" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAISkillAction" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AISkillAction table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_skill_action"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_skill_action" ON __mj."AISkillAction";

CREATE TRIGGER "trg_update_ai_skill_action"
BEFORE UPDATE ON __mj."AISkillAction"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_skill_action"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Actions
-- Item: spDeleteAISkillAction
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AISkillAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAISkillAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAISkillAction"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AISkillAction"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAISkillAction" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAISkillAction" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Permissions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_skill_permission_skill_id"
    ON __mj."AISkillPermission" ("SkillID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_skill_permission_role_id"
    ON __mj."AISkillPermission" ("RoleID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_skill_permission_user_id"
    ON __mj."AISkillPermission" ("UserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Permissions
-- Item: vwAISkillPermissions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Skill Permissions
-----               SCHEMA:      __mj
-----               BASE TABLE:  AISkillPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAISkillPermissions"
AS
SELECT
    a.*,
    MJAISkill_SkillID."Name" AS "Skill",
    MJRole_RoleID."Name" AS "Role",
    MJUser_UserID."Name" AS "User"
FROM
    __mj."AISkillPermission" AS a
INNER JOIN
    __mj."AISkill" AS MJAISkill_SkillID
  ON
    "a"."SkillID" = MJAISkill_SkillID."ID"
LEFT OUTER JOIN
    __mj."Role" AS MJRole_RoleID
  ON
    "a"."RoleID" = MJRole_RoleID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
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
    AND tc.relname = 'vwAISkillPermissions'
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
    AND tc.relname = 'vwAISkillPermissions'
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
        AND tc.relname = 'vwAISkillPermissions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAISkillPermissions" CASCADE;
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
GRANT SELECT ON __mj."vwAISkillPermissions" TO "cdp_UI";
GRANT SELECT ON __mj."vwAISkillPermissions" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAISkillPermissions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Permissions
-- Item: spCreateAISkillPermission
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AISkillPermission
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAISkillPermission'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAISkillPermission"(
    p_id UUID DEFAULT NULL,
    p_skillid UUID DEFAULT NULL,
    p_roleid_clear boolean DEFAULT false,
    p_roleid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_canview BOOLEAN DEFAULT NULL,
    p_canrun BOOLEAN DEFAULT NULL,
    p_canedit BOOLEAN DEFAULT NULL,
    p_candelete BOOLEAN DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwAISkillPermissions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AISkillPermission"
        (
            "ID",
            "SkillID",
                "RoleID",
                "UserID",
                "CanView",
                "CanRun",
                "CanEdit",
                "CanDelete",
                "Comments"
        )
    VALUES
        (
            v_new_id,
            p_skillid,
                CASE WHEN p_roleid_clear = true THEN NULL ELSE COALESCE(p_roleid, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                COALESCE(p_canview, FALSE),
                COALESCE(p_canrun, FALSE),
                COALESCE(p_canedit, FALSE),
                COALESCE(p_candelete, FALSE),
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAISkillPermissions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAISkillPermission" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAISkillPermission" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Permissions
-- Item: spUpdateAISkillPermission
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AISkillPermission
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAISkillPermission'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAISkillPermission"(
    p_id UUID,
    p_skillid UUID DEFAULT NULL,
    p_roleid_clear boolean DEFAULT false,
    p_roleid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_canview BOOLEAN DEFAULT NULL,
    p_canrun BOOLEAN DEFAULT NULL,
    p_canedit BOOLEAN DEFAULT NULL,
    p_candelete BOOLEAN DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwAISkillPermissions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AISkillPermission"
    SET
        "SkillID" = COALESCE(p_skillid, "SkillID"),
        "RoleID" = CASE WHEN p_roleid_clear = true THEN NULL ELSE COALESCE(p_roleid, "RoleID") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "CanView" = COALESCE(p_canview, "CanView"),
        "CanRun" = COALESCE(p_canrun, "CanRun"),
        "CanEdit" = COALESCE(p_canedit, "CanEdit"),
        "CanDelete" = COALESCE(p_candelete, "CanDelete"),
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAISkillPermissions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAISkillPermission" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAISkillPermission" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AISkillPermission table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_skill_permission"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_skill_permission" ON __mj."AISkillPermission";

CREATE TRIGGER "trg_update_ai_skill_permission"
BEFORE UPDATE ON __mj."AISkillPermission"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_skill_permission"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Permissions
-- Item: spDeleteAISkillPermission
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AISkillPermission
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAISkillPermission'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAISkillPermission"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AISkillPermission"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAISkillPermission" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAISkillPermission" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Sub Agents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_skill_sub_agent_skill_id"
    ON __mj."AISkillSubAgent" ("SkillID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_skill_sub_agent_sub_agent_id"
    ON __mj."AISkillSubAgent" ("SubAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Sub Agents
-- Item: vwAISkillSubAgents
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Skill Sub Agents
-----               SCHEMA:      __mj
-----               BASE TABLE:  AISkillSubAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAISkillSubAgents"
AS
SELECT
    a.*,
    MJAISkill_SkillID."Name" AS "Skill",
    MJAIAgent_SubAgentID."Name" AS "SubAgent"
FROM
    __mj."AISkillSubAgent" AS a
INNER JOIN
    __mj."AISkill" AS MJAISkill_SkillID
  ON
    "a"."SkillID" = MJAISkill_SkillID."ID"
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_SubAgentID
  ON
    "a"."SubAgentID" = MJAIAgent_SubAgentID."ID"
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
    AND tc.relname = 'vwAISkillSubAgents'
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
    AND tc.relname = 'vwAISkillSubAgents'
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
        AND tc.relname = 'vwAISkillSubAgents'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAISkillSubAgents" CASCADE;
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
GRANT SELECT ON __mj."vwAISkillSubAgents" TO "cdp_UI";
GRANT SELECT ON __mj."vwAISkillSubAgents" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAISkillSubAgents" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Sub Agents
-- Item: spCreateAISkillSubAgent
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AISkillSubAgent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAISkillSubAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAISkillSubAgent"(
    p_id UUID DEFAULT NULL,
    p_skillid UUID DEFAULT NULL,
    p_subagentid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwAISkillSubAgents" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AISkillSubAgent"
        (
            "ID",
            "SkillID",
                "SubAgentID"
        )
    VALUES
        (
            v_new_id,
            p_skillid,
                p_subagentid
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAISkillSubAgents"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAISkillSubAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAISkillSubAgent" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Sub Agents
-- Item: spUpdateAISkillSubAgent
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AISkillSubAgent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAISkillSubAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAISkillSubAgent"(
    p_id UUID,
    p_skillid UUID DEFAULT NULL,
    p_subagentid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwAISkillSubAgents" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AISkillSubAgent"
    SET
        "SkillID" = COALESCE(p_skillid, "SkillID"),
        "SubAgentID" = COALESCE(p_subagentid, "SubAgentID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAISkillSubAgents"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAISkillSubAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAISkillSubAgent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AISkillSubAgent table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_skill_sub_agent"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_skill_sub_agent" ON __mj."AISkillSubAgent";

CREATE TRIGGER "trg_update_ai_skill_sub_agent"
BEFORE UPDATE ON __mj."AISkillSubAgent"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_skill_sub_agent"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skill Sub Agents
-- Item: spDeleteAISkillSubAgent
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AISkillSubAgent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAISkillSubAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAISkillSubAgent"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AISkillSubAgent"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAISkillSubAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAISkillSubAgent" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skills
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_skill_created_by_user_id"
    ON __mj."AISkill" ("CreatedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skills
-- Item: vwAISkills
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Skills
-----               SCHEMA:      __mj
-----               BASE TABLE:  AISkill
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAISkills"
AS
SELECT
    a.*,
    MJUser_CreatedByUserID."Name" AS "CreatedByUser"
FROM
    __mj."AISkill" AS a
INNER JOIN
    __mj."User" AS MJUser_CreatedByUserID
  ON
    "a"."CreatedByUserID" = MJUser_CreatedByUserID."ID"
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
    AND tc.relname = 'vwAISkills'
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
    AND tc.relname = 'vwAISkills'
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
        AND tc.relname = 'vwAISkills'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAISkills" CASCADE;
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
GRANT SELECT ON __mj."vwAISkills" TO "cdp_UI";
GRANT SELECT ON __mj."vwAISkills" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAISkills" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skills
-- Item: spCreateAISkill
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AISkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAISkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAISkill"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_instructions TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(100) DEFAULT NULL,
    p_iconclass_clear boolean DEFAULT false,
    p_iconclass varchar(100) DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(50) DEFAULT NULL,
    p_createdbyuserid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwAISkills" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AISkill"
        (
            "ID",
            "Name",
                "Description",
                "Instructions",
                "Status",
                "Category",
                "IconClass",
                "Color",
                "CreatedByUserID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_instructions,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, NULL) END,
                CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, NULL) END,
                CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, NULL) END,
                p_createdbyuserid
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAISkills"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAISkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAISkill" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skills
-- Item: spUpdateAISkill
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AISkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAISkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAISkill"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_instructions TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(100) DEFAULT NULL,
    p_iconclass_clear boolean DEFAULT false,
    p_iconclass varchar(100) DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(50) DEFAULT NULL,
    p_createdbyuserid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwAISkills" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AISkill"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Instructions" = COALESCE(p_instructions, "Instructions"),
        "Status" = COALESCE(p_status, "Status"),
        "Category" = CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, "Category") END,
        "IconClass" = CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, "IconClass") END,
        "Color" = CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, "Color") END,
        "CreatedByUserID" = COALESCE(p_createdbyuserid, "CreatedByUserID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAISkills"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAISkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAISkill" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AISkill table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_skill"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_skill" ON __mj."AISkill";

CREATE TRIGGER "trg_update_ai_skill"
BEFORE UPDATE ON __mj."AISkill"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_skill"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Skills
-- Item: spDeleteAISkill
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AISkill
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAISkill'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAISkill"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."AISkill"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAISkill" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAISkill" TO "cdp_Integration";

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

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_parent_id"
    ON __mj."AIAgent" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_context_compression_prompt_id"
    ON __mj."AIAgent" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_type_id"
    ON __mj."AIAgent" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_artifact_type_id"
    ON __mj."AIAgent" ("DefaultArtifactTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_owner_user_id"
    ON __mj."AIAgent" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_attachment_storage_provider_id"
    ON __mj."AIAgent" ("AttachmentStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_category_id"
    ON __mj."AIAgent" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_storage_account_id"
    ON __mj."AIAgent" ("DefaultStorageAccountID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_co_agent_id"
    ON __mj."AIAgent" ("DefaultCoAgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_recording_storage_provider_id"
    ON __mj."AIAgent" ("RecordingStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_media_collection_id"
    ON __mj."AIAgent" ("DefaultMediaCollectionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fnAIAgentParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_parent_id_get_root_id"(
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
            __mj."AIAgent"
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
            __mj."AIAgent" c
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
-- Item: fnAIAgentDefaultCoAgentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.DefaultCoAgentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_default_co_agent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "DefaultCoAgentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgent"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."DefaultCoAgentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgent" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."DefaultCoAgentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "DefaultCoAgentID" IS NULL
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgents"
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
    root_ParentID.root_id AS "RootParentID",
    root_DefaultCoAgentID.root_id AS "RootDefaultCoAgentID"
FROM
    __mj."AIAgent" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_ParentID
  ON
    "a"."ParentID" = MJAIAgent_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ContextCompressionPromptID
  ON
    "a"."ContextCompressionPromptID" = MJAIPrompt_ContextCompressionPromptID."ID"
LEFT OUTER JOIN
    __mj."AIAgentType" AS MJAIAgentType_TypeID
  ON
    "a"."TypeID" = MJAIAgentType_TypeID."ID"
LEFT OUTER JOIN
    __mj."ArtifactType" AS MJArtifactType_DefaultArtifactTypeID
  ON
    "a"."DefaultArtifactTypeID" = MJArtifactType_DefaultArtifactTypeID."ID"
INNER JOIN
    __mj."User" AS MJUser_OwnerUserID
  ON
    "a"."OwnerUserID" = MJUser_OwnerUserID."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    "a"."AttachmentStorageProviderID" = MJFileStorageProvider_AttachmentStorageProviderID."ID"
LEFT OUTER JOIN
    __mj."AIAgentCategory" AS MJAIAgentCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIAgentCategory_CategoryID."ID"
LEFT OUTER JOIN
    __mj."FileStorageAccount" AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    "a"."DefaultStorageAccountID" = MJFileStorageAccount_DefaultStorageAccountID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_DefaultCoAgentID
  ON
    "a"."DefaultCoAgentID" = MJAIAgent_DefaultCoAgentID."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS MJFileStorageProvider_RecordingStorageProviderID
  ON
    "a"."RecordingStorageProviderID" = MJFileStorageProvider_RecordingStorageProviderID."ID"
LEFT OUTER JOIN
    __mj."Collection" AS MJCollection_DefaultMediaCollectionID
  ON
    "a"."DefaultMediaCollectionID" = MJCollection_DefaultMediaCollectionID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_parent_id_get_root_id"(a."ID", a."ParentID") AS root_id
) AS root_ParentID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_default_co_agent_id_get_root_id"(a."ID", a."DefaultCoAgentID") AS root_id
) AS root_DefaultCoAgentID ON true
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

  DROP VIEW IF EXISTS __mj."vwAIAgents" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Integration";

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

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
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
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration', 'AllowMemoryWrite', 'RecordingDefault', 'RecordingStorageProviderID', 'DefaultMediaCollectionID', 'SupportsPlanMode', 'AcceptsSkills']
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
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO __mj."AIAgent" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Integration";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgent: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIAgent"
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
    SELECT * FROM __mj."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent" ON __mj."AIAgent";

CREATE TRIGGER "trg_update_ai_agent"
BEFORE UPDATE ON __mj."AIAgent"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgent"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Actions.CreatedByAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Action"
        WHERE "CreatedByAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Action"
        SET "CreatedByAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Actions.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentAction"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentAction"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Artifact Types records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentArtifactType"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentArtifactType"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Client Tools records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentClientTool"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentClientTool"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Co Agents records via CoAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentCoAgent"
        WHERE "CoAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentCoAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Co Agents.TargetAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentCoAgent"
        WHERE "TargetAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentCoAgent"
        SET "TargetAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Configurations records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentConfiguration"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentConfiguration"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Data Sources records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentDataSource"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentDataSource"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Examples records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentExample"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Learning Cycles records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentLearningCycle"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentLearningCycle"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Modalities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentModality"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentModality"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Models.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentModel"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentModel"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Permissions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPermission"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPrompt"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRelationship"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRelationship"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Requests records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRequest"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Runs records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Search Scopes records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSearchScope"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSearchScope"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Sessions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSession"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSession"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Skills records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSkill"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSkill"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Steps records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.SubAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "SubAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentStep"
        SET "SubAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.DefaultCoAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "DefaultCoAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "DefaultCoAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Bridge Agent Identities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIBridgeAgentIdentity"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIBridgeAgentIdentity"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIResultCache"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Skill Sub Agents records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AISkillSubAgent"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAISkillSubAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ConversationDetail"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversations.DefaultAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Conversation"
        WHERE "DefaultAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Conversation"
        SET "DefaultAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Entity Documents.ReasoningAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityDocument"
        WHERE "ReasoningAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."EntityDocument"
        SET "ReasoningAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."RecordProcess"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."RecordProcess"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Search Execution Logs.AIAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."SearchExecutionLog"
        WHERE "AIAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."SearchExecutionLog"
        SET "AIAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Task"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Task"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgent"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_template_id"
    ON __mj."AIPrompt" ("TemplateID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_category_id"
    ON __mj."AIPrompt" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_type_id"
    ON __mj."AIPrompt" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_ai_model_type_id"
    ON __mj."AIPrompt" ("AIModelTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_result_selector_prompt_id"
    ON __mj."AIPrompt" ("ResultSelectorPromptID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: fnAIPromptResultSelectorPromptID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIPrompt.ResultSelectorPromptID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_prompt_result_selector_prompt_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ResultSelectorPromptID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIPrompt"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ResultSelectorPromptID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIPrompt" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ResultSelectorPromptID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ResultSelectorPromptID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIPrompts"
AS
SELECT
    a.*,
    MJTemplate_TemplateID."Name" AS "Template",
    MJAIPromptCategory_CategoryID."Name" AS "Category",
    MJAIPromptType_TypeID."Name" AS "Type",
    MJAIModelType_AIModelTypeID."Name" AS "AIModelType",
    MJAIPrompt_ResultSelectorPromptID."Name" AS "ResultSelectorPrompt",
    root_ResultSelectorPromptID.root_id AS "RootResultSelectorPromptID"
FROM
    __mj."AIPrompt" AS a
INNER JOIN
    __mj."Template" AS MJTemplate_TemplateID
  ON
    "a"."TemplateID" = MJTemplate_TemplateID."ID"
LEFT OUTER JOIN
    __mj."AIPromptCategory" AS MJAIPromptCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIPromptCategory_CategoryID."ID"
INNER JOIN
    __mj."AIPromptType" AS MJAIPromptType_TypeID
  ON
    "a"."TypeID" = MJAIPromptType_TypeID."ID"
LEFT OUTER JOIN
    __mj."AIModelType" AS MJAIModelType_AIModelTypeID
  ON
    "a"."AIModelTypeID" = MJAIModelType_AIModelTypeID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ResultSelectorPromptID
  ON
    "a"."ResultSelectorPromptID" = MJAIPrompt_ResultSelectorPromptID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_prompt_result_selector_prompt_id_get_root_id"(a."ID", a."ResultSelectorPromptID") AS root_id
) AS root_ResultSelectorPromptID ON true
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

  DROP VIEW IF EXISTS __mj."vwAIPrompts" CASCADE;
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
GRANT SELECT ON __mj."vwAIPrompts" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIPrompts" TO "cdp_Integration";
GRANT SELECT ON __mj."vwAIPrompts" TO "cdp_Developer";

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

CREATE OR REPLACE FUNCTION __mj."spCreateAIPrompt"(
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
    p_requirespecificmodels BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwAIPrompts" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIPrompt"
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
                "RequireSpecificModels"
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
                COALESCE(p_requirespecificmodels, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIPrompts"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIPrompt" TO "cdp_Developer";


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

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPrompt"(
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
    p_requirespecificmodels BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwAIPrompts" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIPrompt"
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
        "RequireSpecificModels" = COALESCE(p_requirespecificmodels, "RequireSpecificModels")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIPrompts"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPrompt" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_prompt"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt" ON __mj."AIPrompt";

CREATE TRIGGER "trg_update_ai_prompt"
BEFORE UPDATE ON __mj."AIPrompt"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_prompt"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPrompt"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Actions.DefaultCompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Action"
        WHERE "DefaultCompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Action"
        SET "DefaultCompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Actions.CompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentAction"
        WHERE "CompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentAction"
        SET "CompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPrompt"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentStep"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.SystemPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentType"
        WHERE "SystemPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentType"
        SET "SystemPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ContextCompressionPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "ContextCompressionPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "ContextCompressionPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextCompressionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIConfiguration"
        WHERE "DefaultPromptForContextCompressionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIConfiguration"
        SET "DefaultPromptForContextCompressionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextSummarizationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIConfiguration"
        WHERE "DefaultPromptForContextSummarizationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIConfiguration"
        SET "DefaultPromptForContextSummarizationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Models records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptModel"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIPromptModel"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Runs records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.JudgeID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "JudgeID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "JudgeID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ChildPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "ChildPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "ChildPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompts.ResultSelectorPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPrompt"
        WHERE "ResultSelectorPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPrompt"
        SET "ResultSelectorPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Result Cache records via AIPromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "AIPromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIResultCache"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Entity Documents.ReasoningPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityDocument"
        WHERE "ReasoningPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."EntityDocument"
        SET "ReasoningPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."RecordProcess"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."RecordProcess"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Scoped Prompt Parts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ScopedPromptPart"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteScopedPromptPart"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."AIPrompt"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer";
