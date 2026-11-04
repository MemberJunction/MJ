-- =============================================================================
-- Internal atomic sequence counter table for DocumentNumberingEngine (Track C2 / 3.3).
--
-- Deliberately excluded from CodeGen entity generation (NON_ENTITY_TABLES / excludeTables):
-- all mutations MUST flow through DocumentNumberingEngine's row/range-locked atomic SQL
-- (`UPDATE ... WITH (UPDLOCK, HOLDLOCK) ... OUTPUT` on SQL Server; `INSERT ... ON CONFLICT DO UPDATE`
-- on PostgreSQL) inside the caller's entity transaction so no GraphQL or BaseEntity caller can
-- overwrite CurrentValue out-of-band.
-- =============================================================================

CREATE TABLE [${flyway:defaultSchema}].[DocumentSequenceCounter] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SequenceKey] NVARCHAR(255) NOT NULL,
    [ScopeKey] NVARCHAR(255) NOT NULL,
    [CurrentValue] BIGINT NOT NULL,
    [CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_DocumentSequenceCounter] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_DocumentSequenceCounter_Key_Scope] UNIQUE ([SequenceKey], [ScopeKey])
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Internal atomic sequence counter storage for DocumentNumberingEngine, partitioned by (SequenceKey, ScopeKey). Excluded from BaseEntity CRUD so counters are mutated exclusively under UPDLOCK/HOLDLOCK or ON CONFLICT row locks.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'DocumentSequenceCounter';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Globally unique logical sequence identifier (for example Orders.OrderNumber or Accounting.JournalEntry.EntryNumber).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'DocumentSequenceCounter',
    @level2type = N'COLUMN', @level2name = 'SequenceKey';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Deterministic partition key combining tenant, scope fields, and reset period (or __GLOBAL__ for unpartitioned sequences).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'DocumentSequenceCounter',
    @level2type = N'COLUMN', @level2name = 'ScopeKey';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Most recently allocated integer value for this (SequenceKey, ScopeKey) partition.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'DocumentSequenceCounter',
    @level2type = N'COLUMN', @level2name = 'CurrentValue';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'UTC timestamp when this counter partition was first initialized.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'DocumentSequenceCounter',
    @level2type = N'COLUMN', @level2name = 'CreatedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'UTC timestamp when this counter partition was last incremented.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'DocumentSequenceCounter',
    @level2type = N'COLUMN', @level2name = 'UpdatedAt';
GO
