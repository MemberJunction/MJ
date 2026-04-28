-- =============================================================================
-- Migration: Search Scope Permission (RAG+ Phase 2A)
-- Version:   v5.30.x
-- Plan:      RAG_plan.md §3 Phase 2A.2, plans/search-scopes-rag-plus.md
-- =============================================================================
-- Per-user / per-role permission grant on a SearchScope. Each row authorizes
-- exactly one principal (User OR Role, not both) at one of four levels.
-- Permission resolution combines this table with AIAgent.SearchScopeAccess for
-- agent-side fallbacks. See SearchScopePermissionResolver in
-- packages/SearchEngine/src/permissions/.
--
-- Notes:
--   - No __mj_* timestamp columns, no FK indexes (CodeGen handles both)
--   - No seed data (admins author rows through the SearchScope/AIAgent forms)
--   - Extended properties follow at the bottom (MJ convention)
-- =============================================================================


-- =============================================================================
-- TABLE: SearchScopePermission
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.SearchScopePermission (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SearchScopeID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NULL,
    RoleID UNIQUEIDENTIFIER NULL,
    PermissionLevel NVARCHAR(20) NOT NULL,
    CONSTRAINT PK_SearchScopePermission PRIMARY KEY (ID),
    CONSTRAINT FK_SearchScopePermission_SearchScope FOREIGN KEY (SearchScopeID)
        REFERENCES ${flyway:defaultSchema}.SearchScope(ID),
    CONSTRAINT FK_SearchScopePermission_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_SearchScopePermission_Role FOREIGN KEY (RoleID)
        REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT CK_SearchScopePermission_Level
        CHECK (PermissionLevel IN ('None', 'Read', 'Search', 'Manage')),
    CONSTRAINT CK_SearchScopePermission_Principal
        CHECK ((UserID IS NOT NULL AND RoleID IS NULL)
            OR (UserID IS NULL AND RoleID IS NOT NULL)),
    CONSTRAINT UQ_SearchScopePermission_User
        UNIQUE (SearchScopeID, UserID),
    CONSTRAINT UQ_SearchScopePermission_Role
        UNIQUE (SearchScopeID, RoleID)
);
GO


-- =============================================================================
-- Extended Properties
-- =============================================================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-user or per-role permission grant on a SearchScope. Exactly one of UserID or RoleID is set on each row; the other is NULL. PermissionLevel is one of None, Read, Search, Manage. Combined with AIAgent.SearchScopeAccess for agent-side fallbacks via the SearchScopePermissionResolver.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key. Auto-generated.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission',
    @level2type = N'COLUMN', @level2name = N'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The SearchScope this permission row applies to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission',
    @level2type = N'COLUMN', @level2name = N'SearchScopeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user this permission applies to. Mutually exclusive with RoleID — exactly one must be set.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission',
    @level2type = N'COLUMN', @level2name = N'UserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The role this permission applies to. Mutually exclusive with UserID — exactly one must be set. Permissions granted via roles flow to all users in that role.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission',
    @level2type = N'COLUMN', @level2name = N'RoleID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Capability granted on this SearchScope. None = explicit deny (overrides role grants), Read = view scope metadata, Search = invoke ScopedSearchAction, Manage = full edit including authoring of permission rows. The resolver picks the highest level when multiple grants apply (direct + role).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission',
    @level2type = N'COLUMN', @level2name = N'PermissionLevel';
