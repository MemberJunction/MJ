import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError, LogStatus, RunView } from '@memberjunction/core';
import { ArchiveEngine } from '@memberjunction/archiving-engine';
import { ArchiveRunResult } from '@memberjunction/archiving-engine';

/**
 * Action that discovers all active ArchiveConfigurations and executes each one.
 * Designed for scheduled daily/weekly runs where all active configurations should
 * be processed in a single invocation.
 *
 * No parameters required — the action queries for active configurations automatically.
 */
@RegisterClass(BaseAction, 'Run All Active Archives')
export class RunAllActiveArchivesAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const configIds = await this.LoadActiveConfigurationIds(params);
            if (configIds.length === 0) {
                return {
                    Success: true,
                    ResultCode: 'NO_ACTIVE_CONFIGS',
                    Message: 'No active archive configurations found. Nothing to do.',
                };
            }

            LogStatus(`RunAllActiveArchives: Found ${configIds.length} active configuration(s). Starting execution...`);

            const results = await this.ExecuteAllConfigurations(configIds, params);
            return this.BuildSummaryResult(results);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`RunAllActiveArchives failed: ${message}`);
            return {
                Success: false,
                ResultCode: 'ARCHIVE_BATCH_ERROR',
                Message: message,
            };
        }
    }

    /**
     * Queries the database for all active ArchiveConfiguration IDs.
     */
    private async LoadActiveConfigurationIds(params: RunActionParams): Promise<string[]> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Archive Configurations',
            ExtraFilter: `IsActive=1 AND Status <> 'Running'`,
            Fields: ['ID'],
            ResultType: 'simple',
        }, params.ContextUser);

        if (!result.Success) {
            throw new Error(`Failed to query active configurations: ${result.ErrorMessage}`);
        }

        return result.Results.map(r => r.ID);
    }

    /**
     * Executes all configurations sequentially. Sequential execution prevents
     * overwhelming the storage backend and database with concurrent archive runs.
     */
    private async ExecuteAllConfigurations(
        configIds: string[],
        params: RunActionParams
    ): Promise<ConfigRunOutcome[]> {
        const outcomes: ConfigRunOutcome[] = [];

        for (const configId of configIds) {
            try {
                LogStatus(`RunAllActiveArchives: Running configuration ${configId}`);
                const result = await ArchiveEngine.Instance.RunArchive(configId, params.ContextUser);
                outcomes.push({ ConfigId: configId, Result: result });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                LogError(`RunAllActiveArchives: Configuration ${configId} threw an error: ${message}`);
                outcomes.push({
                    ConfigId: configId,
                    Result: {
                        Success: false,
                        ArchiveRunId: '',
                        TotalRecords: 0,
                        ArchivedRecords: 0,
                        FailedRecords: 0,
                        SkippedRecords: 0,
                        TotalBytesArchived: 0,
                        ErrorMessage: message,
                    },
                });
            }
        }

        return outcomes;
    }

    /**
     * Aggregates individual run results into a single ActionResultSimple.
     */
    private BuildSummaryResult(outcomes: ConfigRunOutcome[]): ActionResultSimple {
        const succeeded = outcomes.filter(o => o.Result.Success).length;
        const failed = outcomes.length - succeeded;
        const totalArchived = outcomes.reduce((sum, o) => sum + o.Result.ArchivedRecords, 0);
        const totalFailed = outcomes.reduce((sum, o) => sum + o.Result.FailedRecords, 0);
        const totalBytes = outcomes.reduce((sum, o) => sum + o.Result.TotalBytesArchived, 0);

        const allSucceeded = failed === 0;
        const resultCode = allSucceeded ? 'ALL_ARCHIVES_COMPLETE' : 'SOME_ARCHIVES_FAILED';

        const lines = outcomes.map(o => {
            const status = o.Result.Success ? 'OK' : 'FAILED';
            return `  [${status}] ${o.ConfigId}: archived=${o.Result.ArchivedRecords}, failed=${o.Result.FailedRecords}${o.Result.ErrorMessage ? `, error=${o.Result.ErrorMessage}` : ''}`;
        });

        const message =
            `Ran ${outcomes.length} configuration(s): ${succeeded} succeeded, ${failed} failed. ` +
            `Total archived: ${totalArchived}, total failed: ${totalFailed}, total bytes: ${totalBytes}\n` +
            lines.join('\n');

        return {
            Success: allSucceeded,
            ResultCode: resultCode,
            Message: message,
        };
    }
}

interface ConfigRunOutcome {
    ConfigId: string;
    Result: ArchiveRunResult;
}
