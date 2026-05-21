-- ============================================================================
-- Add UNIQUE constraints to junction-style metadata tables in __mj.
--
-- Background
-- ----------
-- The __mj.Entity table protects its natural key via UQ_Entity_Name (UNIQUE on
-- Name), so two entities with the same Name cannot be inserted even if the
-- application code's gating fails. The closely-related junction tables that
-- associate an entity (or other primary record) with another record had no
-- equivalent enforcement at the schema level. Their "natural keys" — typically
-- a pair of foreign-key columns — are expected to be unique in practice (an
-- entity belongs to an application once, an action belongs to a library once,
-- etc.) but were not enforced.
--
-- This asymmetry has bitten production before: when entities get
-- delete-and-recreated during early bootstrap, when multiple bootstrap scripts
-- run in succession, or when CodeGen's input-gating fails for any reason, these
-- tables can silently accumulate semantic duplicates that the application UI
-- then treats as collisions.
--
-- Scope
-- -----
-- The 17 tables below are all "pure junction" tables in __mj — they consist of
-- two foreign-key columns plus ID/Sequence/timestamps, with no other meaningful
-- data columns, and they're populated either exclusively by CodeGen / metadata
-- sync (no runtime UI/API writers) or by first-creation-only paths that should
-- never produce duplicates if working correctly. Adding the constraint here
-- protects against bugs in those writers — if a writer ever tries to produce a
-- duplicate, the failure surfaces immediately instead of silently corrupting
-- metadata.
--
-- Pre-flight: this migration assumes the affected tables are already free of
-- duplicate natural-key pairs. Verified on nsta-nsta-environment-dev-db
-- (2026-05-21): 0 duplicates across all 17 tables. If applying to a database
-- with pre-existing duplicates, dedup before running this migration.
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.ActionAuthorization
    ADD CONSTRAINT UQ_ActionAuthorization_ActionID_AuthorizationID
    UNIQUE (ActionID, AuthorizationID);

ALTER TABLE ${flyway:defaultSchema}.ActionContext
    ADD CONSTRAINT UQ_ActionContext_ActionID_ContextTypeID
    UNIQUE (ActionID, ContextTypeID);

ALTER TABLE ${flyway:defaultSchema}.ActionLibrary
    ADD CONSTRAINT UQ_ActionLibrary_ActionID_LibraryID
    UNIQUE (ActionID, LibraryID);

ALTER TABLE ${flyway:defaultSchema}.AIAgentArtifactType
    ADD CONSTRAINT UQ_AIAgentArtifactType_AgentID_ArtifactTypeID
    UNIQUE (AgentID, ArtifactTypeID);

ALTER TABLE ${flyway:defaultSchema}.AIModelAction
    ADD CONSTRAINT UQ_AIModelAction_AIActionID_AIModelID
    UNIQUE (AIActionID, AIModelID);

ALTER TABLE ${flyway:defaultSchema}.APIKeyApplication
    ADD CONSTRAINT UQ_APIKeyApplication_APIKeyID_ApplicationID
    UNIQUE (APIKeyID, ApplicationID);

ALTER TABLE ${flyway:defaultSchema}.ApplicationEntity
    ADD CONSTRAINT UQ_ApplicationEntity_ApplicationID_EntityID
    UNIQUE (ApplicationID, EntityID);

ALTER TABLE ${flyway:defaultSchema}.AuthorizationRole
    ADD CONSTRAINT UQ_AuthorizationRole_AuthorizationID_RoleID
    UNIQUE (AuthorizationID, RoleID);

ALTER TABLE ${flyway:defaultSchema}.ComponentDependency
    ADD CONSTRAINT UQ_ComponentDependency_ComponentID_DependencyComponentID
    UNIQUE (ComponentID, DependencyComponentID);

ALTER TABLE ${flyway:defaultSchema}.ComponentLibraryLink
    ADD CONSTRAINT UQ_ComponentLibraryLink_ComponentID_LibraryID
    UNIQUE (ComponentID, LibraryID);

ALTER TABLE ${flyway:defaultSchema}.EmployeeRole
    ADD CONSTRAINT UQ_EmployeeRole_EmployeeID_RoleID
    UNIQUE (EmployeeID, RoleID);

ALTER TABLE ${flyway:defaultSchema}.EmployeeSkill
    ADD CONSTRAINT UQ_EmployeeSkill_EmployeeID_SkillID
    UNIQUE (EmployeeID, SkillID);

ALTER TABLE ${flyway:defaultSchema}.EntityAction
    ADD CONSTRAINT UQ_EntityAction_ActionID_EntityID
    UNIQUE (ActionID, EntityID);

ALTER TABLE ${flyway:defaultSchema}.EntityCommunicationMessageType
    ADD CONSTRAINT UQ_EntityCommunicationMessageType_BaseMessageTypeID_EntityID
    UNIQUE (BaseMessageTypeID, EntityID);

ALTER TABLE ${flyway:defaultSchema}.FileEntityRecordLink
    ADD CONSTRAINT UQ_FileEntityRecordLink_EntityID_FileID
    UNIQUE (EntityID, FileID);

ALTER TABLE ${flyway:defaultSchema}.QueryPermission
    ADD CONSTRAINT UQ_QueryPermission_QueryID_RoleID
    UNIQUE (QueryID, RoleID);

ALTER TABLE ${flyway:defaultSchema}.UserApplicationEntity
    ADD CONSTRAINT UQ_UserApplicationEntity_UserApplicationID_EntityID
    UNIQUE (UserApplicationID, EntityID);
