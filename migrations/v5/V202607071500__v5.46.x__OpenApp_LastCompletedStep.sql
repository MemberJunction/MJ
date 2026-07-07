-- Migration: OpenApp.LastCompletedStep
-- Description: Adds a checkpoint column so a crashed/failed `mj app install|upgrade|remove`
--              can be resumed on retry instead of restarting from scratch. The orchestrator
--              persists the name of the last step that completed successfully while an app's
--              Status is Installing/Upgrading/Removing, and reads it back on re-entry to skip
--              steps that already succeeded.

ALTER TABLE [${flyway:defaultSchema}].[OpenApp] ADD
    [LastCompletedStep] NVARCHAR(50) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The last install/upgrade/remove step that completed successfully for this app while Status is Installing, Upgrading, or Removing. Used to resume a crashed or failed operation from the correct point instead of restarting it entirely. Cleared (NULL) once the operation reaches a terminal state (Active/Disabled/Removed/Error).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'LastCompletedStep';
