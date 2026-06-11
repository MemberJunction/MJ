-- Agent In-Flight Memory Writes
--
-- Lets agents commit durable memories mid-run (the `memoryWrites` loop-response
-- field). In-flight notes land with the new Status='Provisional' — immediately
-- injectable into future runs — and are later hardened (Status -> 'Active') or
-- pruned by the MemoryManagerAgent. See plans/agent-inflight-memory-writes.md.
--
-- DDL only: CodeGen regenerates the EntityFieldValue lists + typed unions from
-- these constraints and the extended properties below.

-- 1. Widen AIAgentNote.Status CHECK to include 'Provisional'.
--    Drop by dynamic lookup since system-generated constraint names vary per database.
DECLARE @NoteStatusConstraint NVARCHAR(200);
SELECT @NoteStatusConstraint = cc.name
FROM sys.check_constraints cc
JOIN sys.columns c ON cc.parent_object_id = c.object_id AND cc.parent_column_id = c.column_id
WHERE c.name = 'Status'
  AND cc.parent_object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentNote');

IF @NoteStatusConstraint IS NOT NULL
    EXEC('ALTER TABLE ${flyway:defaultSchema}.AIAgentNote DROP CONSTRAINT [' + @NoteStatusConstraint + ']');

ALTER TABLE ${flyway:defaultSchema}.AIAgentNote
    ADD CONSTRAINT CK_AIAgentNote_Status
    CHECK (Status IN ('Active', 'Pending', 'Revoked', 'Archived', 'Provisional'));
GO

-- 2. AuthoredBy: explicit provenance for who created the note. SourceAIAgentRunID
--    alone can't distinguish written-in-flight-by-agent from extracted-from-a-run-
--    by-MemoryManager (both carry a run ID). Default 'MemoryManager' backfills all
--    legacy rows correctly (every existing auto-generated note came from MM).
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD
    AuthoredBy NVARCHAR(20) NOT NULL
    CONSTRAINT DF_AIAgentNote_AuthoredBy DEFAULT 'MemoryManager'
    CONSTRAINT CK_AIAgentNote_AuthoredBy CHECK (AuthoredBy IN ('Agent', 'MemoryManager', 'User'));
GO

-- 3. AllowMemoryWrite: per-agent opt-in gate for in-flight memory writes,
--    following the InjectNotes gating pattern. Off by default.
ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    AllowMemoryWrite BIT NOT NULL
    CONSTRAINT DF_AIAgent_AllowMemoryWrite DEFAULT 0;
GO

-- 4. Extended properties (CodeGen reads these for entity metadata descriptions)

-- AIAgentNote.Status gains the Provisional value — refresh its description.
EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle status of the note. Pending = awaiting approval, Active = vetted and injectable, Provisional = written in-flight by an agent (immediately injectable, awaiting Memory Manager hardening to Active), Revoked = superseded/withdrawn, Archived = retired by consolidation or decay.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentNote',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provenance of the note: Agent = written in-flight during an agent run, MemoryManager = extracted/consolidated by the scheduled Memory Manager, User = manually created by a person.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentNote',
    @level2type = N'COLUMN', @level2name = N'AuthoredBy';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When enabled, the agent may commit durable memories mid-run via the memoryWrites loop-response field. Writes are framework-guarded (type restriction, scope clamp, near-duplicate check, per-run cap) and land as Provisional notes pending Memory Manager hardening. Off by default.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'AllowMemoryWrite';
GO
