-- ============================================================================
-- v6.2.x — Project.OwnerUserID: conversation folders can be PERSONAL
--
-- WHY. `Project` is the conversation sidebar's folder. Its entire column list is
-- ID, EnvironmentID, ParentID, Name, Description, Color, Icon, IsArchived — there is
-- no owner. Folders are therefore environment-wide by construction:
-- ConversationEngine.LoadProjects reads them with
-- `EnvironmentID='…' AND (IsArchived IS NULL OR IsArchived=0)` and its own docstring
-- states the consequence plainly — "Projects are environment-scoped (not
-- user-scoped)".
--
-- That is fine for a single-team environment and wrong for two things people are
-- actually asking for:
--
--   1. PERSONAL FOLDERS. There is nothing to toggle. "My drafts" cannot exist,
--      because every folder is everyone's folder.
--   2. MULTI-TENANT HOSTS. An application serving several customers from one
--      environment leaks folder NAMES between them. Conversations do not leak —
--      they carry UserID and hosts row-level-secure them — but the folder holding
--      them is readable by everyone with Read on the entity. Names are user-authored
--      free text, so "Q3 Layoff Comms" or "Acquisition — Project Bluebird" is one
--      folder away from being visible to the wrong customer. Reported from a
--      white-label deployment (Betty) where three customer-created folders were
--      readable by all 26 users across 5 organizations.
--
-- Both are the same missing column, approached from different directions, which is
-- why one column answers both.
--
-- WHAT. One additive, NULLABLE column, so nothing existing changes behaviour:
--
--   Project.OwnerUserID   UNIQUEIDENTIFIER NULL   FK -> __mj.User(ID)
--       NULL (default for every existing row) — SHARED: the folder is visible to the
--             environment, exactly as today.
--       set                                      — PERSONAL: the folder belongs to
--             that user. Consumers filter it to its owner.
--
-- NULL-means-shared is deliberate. The inverse (owner required, a sentinel for
-- shared) would need a backfill, would make every existing folder personal to
-- whoever happened to create it, and would give "shared" no honest representation.
-- This way the migration is a pure add: every folder that exists stays shared, and
-- personal is opt-in at create time.
--
-- Named OwnerUserID rather than UserID to match MJ's existing spelling for exactly
-- this relationship — AIAgent.OwnerUserID, ScheduledJob.OwnerUserID,
-- SearchScope.OwnerUserID, each a nullable-or-defaulted owner with an
-- FK_<table>_OwnerUserID constraint. `UserID` in MJ (Conversation, ActionExecutionLog)
-- is a different, NOT NULL "whose row is this" semantic and would read as a
-- required field here.
--
-- WHAT THIS DOES NOT DO. A column is not a policy. This migration only makes
-- ownership expressible; it changes no read path, so a host that does nothing sees no
-- difference. Two follow-ons belong with it, deliberately kept out of the schema
-- change so the column can land and be adopted independently:
--
--   - ConversationEngine.LoadProjects gains `AND (OwnerUserID IS NULL OR
--     OwnerUserID='<contextUser.ID>')`, so a personal folder reaches only its owner,
--     and the folder-create dialog offers personal vs shared.
--   - TENANT scoping is NOT addressed here and should not be. Multi-tenant hosts
--     separate customers by Environment (which Project is already keyed on) or by
--     their own row-level security; an OrganizationID on a core MJ table would be
--     inventing a tenancy model MJ does not have. The leak described above is closed
--     for personal folders by this column, and for shared folders by the host's
--     environment or RLS choice.
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.Project
    ADD OwnerUserID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.Project
    ADD CONSTRAINT FK_Project_OwnerUserID
        FOREIGN KEY (OwnerUserID) REFERENCES ${flyway:defaultSchema}.[User] (ID);
GO

-- No index here on purpose: CodeGen creates IDX_AUTO_MJ_FKEY_Project_OwnerUserID for
-- the new foreign key, the same way it did for AIAgent.OwnerUserID.

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The user who owns this folder, or NULL when the folder is shared with the whole environment. NULL (the value every pre-existing folder carries) means SHARED: visible to anyone who can read projects in the environment, which was the only possible behaviour before this column existed. A set value means PERSONAL: the folder belongs to that user and consumers filter it to them, so it stays out of other people''s sidebars. Personal is opt-in at create time; nothing is migrated.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Project', @level2type = N'COLUMN', @level2name = N'OwnerUserID';
GO
