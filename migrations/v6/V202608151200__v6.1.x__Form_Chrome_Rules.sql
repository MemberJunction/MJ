/* ============================================================================
   MJ: Form Chrome Rules — install overlay for generated-form membership

   One row pins a parent form's related entity or contribution to Primary,
   More, or None. Site admin writes this table. OpenApp metadata sync never
   includes it.

   CodeGen handles automatically (intentionally omitted):
     - __mj_CreatedAt / __mj_UpdatedAt columns + triggers
     - Foreign-key indexes (IDX_AUTO_MJ_FKEY_*)
     - Entity / EntityField metadata (default schema EntityNamePrefix
       yields "MJ: Form Chrome Rules")
   ============================================================================ */

CREATE TABLE ${flyway:defaultSchema}.FormChromeRule (
    ID                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityID           UNIQUEIDENTIFIER NOT NULL,
    TargetKind         NVARCHAR(20)     NOT NULL,
    RelatedEntityID    UNIQUEIDENTIFIER NULL,
    ContributionKey    NVARCHAR(256)    NULL,
    Inclusion          NVARCHAR(20)     NOT NULL,
    JoinFields         NVARCHAR(MAX)    NULL,
    Sequence           INT              NOT NULL DEFAULT 0,

    CONSTRAINT PK_FormChromeRule PRIMARY KEY (ID),
    CONSTRAINT FK_FormChromeRule_Entity
        FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_FormChromeRule_RelatedEntity
        FOREIGN KEY (RelatedEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT CK_FormChromeRule_TargetKind
        CHECK (TargetKind IN ('Relationship', 'Contribution')),
    CONSTRAINT CK_FormChromeRule_Inclusion
        CHECK (Inclusion IN ('Primary', 'More', 'None')),
    CONSTRAINT CK_FormChromeRule_TargetShape
        CHECK (
            (TargetKind = 'Relationship' AND RelatedEntityID IS NOT NULL AND ContributionKey IS NULL)
            OR
            (TargetKind = 'Contribution' AND ContributionKey IS NOT NULL AND RelatedEntityID IS NULL)
        )
);

CREATE UNIQUE INDEX UQ_FormChromeRule_Relationship
    ON ${flyway:defaultSchema}.FormChromeRule (EntityID, RelatedEntityID)
    WHERE TargetKind = 'Relationship';

CREATE UNIQUE INDEX UQ_FormChromeRule_Contribution
    ON ${flyway:defaultSchema}.FormChromeRule (EntityID, ContributionKey)
    WHERE TargetKind = 'Contribution';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Install-overlay (L3) pins for generated-form chrome. One row sets Primary / More / None for a parent form''s related entity or contribution. Not app-synced — site admin only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormChromeRule';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Parent form entity this rule applies to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormChromeRule',
    @level2type = N'COLUMN', @level2name = N'EntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'''Relationship'' targets a related entity on the parent form. ''Contribution'' targets a form contribution by key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormChromeRule',
    @level2type = N'COLUMN', @level2name = N'TargetKind';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Related entity to pin when TargetKind is Relationship. Null for Contribution rows.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormChromeRule',
    @level2type = N'COLUMN', @level2name = N'RelatedEntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Contribution key to pin when TargetKind is Contribution. Null for Relationship rows.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormChromeRule',
    @level2type = N'COLUMN', @level2name = N'ContributionKey';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How the target appears on the parent form: Primary (first-class rail), More (parked), or None (not a candidate).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormChromeRule',
    @level2type = N'COLUMN', @level2name = N'Inclusion';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON string array of join field names for a same-table OR filter (Bill-To OR Ship-To). Null keeps the L1 join, if any.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormChromeRule',
    @level2type = N'COLUMN', @level2name = N'JoinFields';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tie-break when more than one rule matches the same target. Higher Sequence wins.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormChromeRule',
    @level2type = N'COLUMN', @level2name = N'Sequence';
