-- Migration: Create EntityFormOverride table
-- Description: Bridge table that points an Entity at a Component to serve as
--   its form at runtime, scoped to User > Role > Global with priority-based
--   resolution. Foundation for Run-Time/Interactive Forms (plan PR #2609).
--
-- Resolution semantics (implemented client-side in form-resolver.service.ts):
--   1. Find Status='Active' rows for the entity matching the caller's scope.
--   2. Order by scope tier (User > Role > Global), then Priority DESC, then
--      __mj_CreatedAt DESC. First row wins.
--   3. If no row matches, fall through to the existing @RegisterClass /
--      CodeGen-generated form path — zero behavior change for entities with
--      no override.

CREATE TABLE ${flyway:defaultSchema}.EntityFormOverride (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    ComponentID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Scope NVARCHAR(20) NOT NULL DEFAULT 'Global',
    UserID UNIQUEIDENTIFIER NULL,
    RoleID UNIQUEIDENTIFIER NULL,
    Priority INT NOT NULL DEFAULT 0,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_EntityFormOverride PRIMARY KEY (ID),
    CONSTRAINT FK_EntityFormOverride_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID) ON DELETE CASCADE,
    CONSTRAINT FK_EntityFormOverride_Component FOREIGN KEY (ComponentID)
        REFERENCES ${flyway:defaultSchema}.Component(ID) ON DELETE CASCADE,
    CONSTRAINT FK_EntityFormOverride_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_EntityFormOverride_Role FOREIGN KEY (RoleID)
        REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT CK_EntityFormOverride_Scope
        CHECK (Scope IN ('User', 'Role', 'Global')),
    CONSTRAINT CK_EntityFormOverride_Status
        CHECK (Status IN ('Active', 'Inactive', 'Pending')),
    CONSTRAINT CK_EntityFormOverride_Scope_Consistency
        CHECK (
            (Scope = 'User'   AND UserID IS NOT NULL AND RoleID IS NULL) OR
            (Scope = 'Role'   AND RoleID IS NOT NULL AND UserID IS NULL) OR
            (Scope = 'Global' AND UserID IS NULL     AND RoleID IS NULL)
        )
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Points an Entity at a Component to serve as its form at runtime. Scoped to User > Role > Global with priority-based resolution. When present and Active, takes precedence over the entity''s @RegisterClass-registered or CodeGen-generated Angular form.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Entity — which entity this override is for.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'EntityID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Foreign key to Component — the component that renders the form. Must declare componentRole=''form'' and implement the FormHostProps contract.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'ComponentID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Human-readable label for this override (e.g., "CSR Customer Form", "Compact Mobile Variant").',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'Name';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Optional longer description of what this override is for and when it applies.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'Description';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Resolution tier: User (requires UserID), Role (requires RoleID), or Global. The resolver evaluates in that order — a User row beats a Role row beats a Global row.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'Scope';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Required when Scope=''User''. The single user this override applies to.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'UserID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Required when Scope=''Role''. The role whose members see this override.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'RoleID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Higher value wins within a scope tier. Ties broken by __mj_CreatedAt DESC. No IsDefault — Priority is the only mechanism.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'Priority';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Active = eligible for resolution. Inactive = ignored. Pending = AI-authored, awaiting human activation (resolver treats as Inactive).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityFormOverride',
    @level2type=N'COLUMN', @level2name=N'Status';
