-- Migration: OpenApp.LastCompletedStep + LastCompletedStepTargetVersion
-- Description: Adds a checkpoint so a crashed/failed `mj app install|upgrade|remove` can be
--              resumed on retry instead of restarting from scratch. The orchestrator persists
--              the name of the last step that completed successfully while an app's Status is
--              Installing/Upgrading/Removing, and reads it back on re-entry to skip steps that
--              already succeeded.
--
--              LastCompletedStepTargetVersion pairs with the checkpoint for Upgrade specifically:
--              Version stays at the PRE-upgrade value until the very end of a successful upgrade,
--              so the checkpoint alone can't tell "resume THIS upgrade" apart from "a fresh
--              upgrade request arrived to a DIFFERENT target version while one was mid-flight."
--              Without it, interrupting an upgrade to 1.2 after PackagesInstalled and then running
--              `mj app upgrade` targeting 1.3 would skip 1.3's migrations/packages (the checkpoint
--              says PackagesInstalled) yet still stamp Version=1.3 — the app ends up claiming 1.3
--              while running 1.2's packages. The orchestrator only trusts a checkpoint when this
--              column matches the version it is about to upgrade to.

ALTER TABLE [${flyway:defaultSchema}].[OpenApp] ADD
    [LastCompletedStep] NVARCHAR(50) NULL,
    [LastCompletedStepTargetVersion] NVARCHAR(20) NULL;
GO

-- Value-list CHECK per repo convention: the CHECK is the source of truth CodeGen derives the
-- generated TS union from, so InstallStep|UpgradeStep|RemoveStep in open-app-types.ts can't
-- silently drift from what the column actually accepts. Union of every step name across all
-- three operations (RecordCreated/PackagesInstalled/ConfigUpdated/AngularExcludesUpdated/
-- Finalized/HooksRun for Install; MigrationsApplied/RecordUpdated/DependenciesReplaced added for
-- Upgrade; DbCleanupDone/FilesRemoved for Remove) plus NULL for "no operation in flight."
ALTER TABLE [${flyway:defaultSchema}].[OpenApp] ADD CONSTRAINT [CK_OpenApp_LastCompletedStep]
    CHECK ([LastCompletedStep] IS NULL OR [LastCompletedStep] IN (
        N'RecordCreated', N'PackagesInstalled', N'ConfigUpdated', N'AngularExcludesUpdated', N'Finalized', N'HooksRun',
        N'MigrationsApplied', N'RecordUpdated', N'DependenciesReplaced',
        N'DbCleanupDone', N'FilesRemoved'
    ));

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The last install/upgrade/remove step that completed successfully for this app while Status is Installing, Upgrading, or Removing. Used to resume a crashed or failed operation from the correct point instead of restarting it entirely. Cleared (NULL) once the operation reaches a terminal state (Active/Disabled/Removed/Error).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'LastCompletedStep';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The version this app was being upgraded TO when LastCompletedStep was last written, for Upgrade only. A resume only trusts LastCompletedStep when this matches the version currently being requested — otherwise a checkpoint from an interrupted upgrade to a different version could wrongly skip steps for the new target. Cleared alongside LastCompletedStep.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'LastCompletedStepTargetVersion';
