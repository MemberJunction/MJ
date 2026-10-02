/**
 * @fileoverview Report command implementation
 * @module @memberjunction/testing-cli
 */

import { UserInfo, RunView } from '@memberjunction/core';
import { ReportFlags } from '../types';
import { OutputFormatter } from '../utils/output-formatter';
import { InitializeMJProvider, GetContextUser } from '../lib/mj-provider';
import { FormatCriterionReport } from './rubric-cli';

/**
 * Report command - Generate test run reports
 *
 * Note: This is a placeholder implementation. Full reporting requires
 * querying Test Run Results entities and aggregating historical data.
 */
export class ReportCommand {
    /**
     * Execute the report command
     *
     * @param flags - Command flags
     * @param contextUser - User context
     */
    async Execute(runId: string | undefined, _flags: ReportFlags, contextUser?: UserInfo): Promise<void> {
        try {
            await InitializeMJProvider();
            contextUser = contextUser ?? await GetContextUser();
            if (!runId) {
                console.error(OutputFormatter.formatError('Pass a test run id. mj test report <run-id> prints each criterion.'));
                process.exit(1);
                return;
            }
            const view = new RunView();
            const escaped = runId.replace(/'/g, "''");
            const found = await view.RunView({
                EntityName: 'MJ: Test Runs',
                ExtraFilter: `ID='${escaped}'`,
                ResultType: 'simple',
                MaxRows: 1,
            }, contextUser);
            if (!found.Success) throw new Error(found.ErrorMessage || 'Could not read MJ: Test Runs.');
            const row = (found.Results ?? [])[0] as { ResultDetails?: string | null } | undefined;
            if (!row) {
                console.error(OutputFormatter.formatError(`Test run "${runId}" was not found.`));
                process.exit(1);
                return;
            }
            const details = row.ResultDetails ? JSON.parse(row.ResultDetails) : [];
            console.log(FormatCriterionReport(Array.isArray(details) ? details : []));
        } catch (error) {
            console.error(OutputFormatter.formatError('Failed to generate report', error as Error));
            process.exit(1);
        }
    }

    /** @deprecated Use {@link Execute}. */
    async execute(runId: string | undefined, flags: ReportFlags, contextUser: UserInfo): Promise<void> {
        return this.Execute(runId, flags, contextUser);
    }
}
