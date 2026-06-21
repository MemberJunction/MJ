/**
 * @fileoverview Typed client for running a `MJ: Record Processes` definition from the browser — the
 * client half of the Record Process Transport-Layer seam. Wraps the `RunRecordProcess` mutation so UI
 * code never inlines `gql`. Follows the same construction convention as the other GraphQL clients in this
 * package (`GraphQLClusterClient`, `GraphQLActionClient`, etc.).
 * @module @memberjunction/graphql-dataprovider
 */
import { gql } from 'graphql-request';
import { LogError } from '@memberjunction/core';
import { GraphQLDataProvider } from './graphQLDataProvider';

/**
 * Runtime scope for a run — the rows the UI is operating on. Mirrors the engine's
 * `RecordProcessScopeOverride`. Serialized to JSON and sent as the `scope` argument.
 */
export type RecordProcessScope =
    | { Kind: 'records'; RecordIDs: string[] }
    | { Kind: 'view'; ViewID: string }
    | { Kind: 'list'; ListID: string }
    | { Kind: 'filter'; Filter?: string };

/** Parameters for {@link GraphQLRecordProcessClient.RunRecordProcess}. */
export interface RunRecordProcessParams {
    /** The `MJ: Record Processes` ID to run. */
    RecordProcessID: string;
    /** Optional runtime scope (selection / view / list / filter). Omit to use the process's stored Scope. */
    Scope?: RecordProcessScope;
    /** When true, compute the per-record diff without writing (the preview step). */
    DryRun?: boolean;
}

/**
 * Result of a run. Mirrors the server `RunRecordProcessResult`. For a dry-run, the rich per-record diff is
 * read separately via `RunView` over `MJ: Process Run Details` (filter `ProcessRunID = ProcessRunID`); its
 * `ResultPayload` carries the `FieldChange[]`.
 */
export interface RunRecordProcessResult {
    /** True when the run completed (status `Completed`). */
    Success: boolean;
    /** ID of the persisted `MJ: Process Runs` row (present once the run started). */
    ProcessRunID?: string;
    /** Records the run touched. */
    Processed: number;
    /** Records that succeeded (in dry-run, records with a computed preview). */
    Succeeded: number;
    /** Records that errored. */
    Errored: number;
    /** Records skipped (e.g. no rule matched / nothing changed). */
    Skipped: number;
    /** Total matching rows in the source, when known. */
    Total?: number;
    /** True when this was a dry-run. */
    DryRun: boolean;
    /** Run-level status (`Completed` / `Failed` / `Cancelled` / …). */
    Status?: string;
    /** Error detail when the run failed. */
    ErrorMessage?: string;
    /** Wall-clock execution time in ms. */
    ExecutionTimeMs?: number;
}

/** Raw server payload (lowercased field names from the resolver). */
interface RawRunRecordProcessResult {
    success: boolean;
    processRunID?: string;
    processed: number;
    succeeded: number;
    errored: number;
    skipped: number;
    total?: number;
    dryRun: boolean;
    status?: string;
    error?: string;
    executionTimeMs?: number;
}

/**
 * Strongly-typed transport for running a Record Process.
 *
 * @example
 * ```typescript
 * const client = new GraphQLRecordProcessClient(GraphQLDataProvider.Instance);
 * const preview = await client.RunRecordProcess({
 *   RecordProcessID: rpId,
 *   Scope: { Kind: 'records', RecordIDs: selectedIds },
 *   DryRun: true,
 * });
 * if (preview.Success) {
 *   // read MJ: Process Run Details where ProcessRunID = preview.ProcessRunID for the diff
 * }
 * ```
 */
export class GraphQLRecordProcessClient {
    /** The GraphQLDataProvider instance used to execute GraphQL requests. */
    private _dataProvider: GraphQLDataProvider;

    /**
     * @param dataProvider The GraphQL data provider to use for the mutation.
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Run a Record Process against a runtime scope, optionally as a dry-run.
     *
     * @param params The process ID, optional scope, and dry-run flag.
     * @returns A Promise resolving to the typed {@link RunRecordProcessResult}.
     */
    public async RunRecordProcess(params: RunRecordProcessParams): Promise<RunRecordProcessResult> {
        try {
            const mutation = gql`
                mutation RunRecordProcess($recordProcessID: String!, $scope: String, $dryRun: Boolean) {
                    RunRecordProcess(recordProcessID: $recordProcessID, scope: $scope, dryRun: $dryRun) {
                        success
                        processRunID
                        processed
                        succeeded
                        errored
                        skipped
                        total
                        dryRun
                        status
                        error
                        executionTimeMs
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(mutation, {
                recordProcessID: params.RecordProcessID,
                scope: params.Scope ? JSON.stringify(params.Scope) : null,
                dryRun: params.DryRun ?? false,
            });

            const raw: RawRunRecordProcessResult | undefined = result?.RunRecordProcess;
            if (!raw) {
                throw new Error('Invalid response from server');
            }
            return this.toResult(raw);
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLRecordProcessClient.RunRecordProcess failed', undefined, e);
            return {
                Success: false, Processed: 0, Succeeded: 0, Errored: 0, Skipped: 0,
                DryRun: params.DryRun ?? false, ErrorMessage: e.message || 'Unknown error occurred',
            };
        }
    }

    /** Maps the raw (lowercased) server payload to the typed PascalCase result. */
    private toResult(raw: RawRunRecordProcessResult): RunRecordProcessResult {
        return {
            Success: raw.success,
            ProcessRunID: raw.processRunID,
            Processed: raw.processed,
            Succeeded: raw.succeeded,
            Errored: raw.errored,
            Skipped: raw.skipped,
            Total: raw.total,
            DryRun: raw.dryRun,
            Status: raw.status,
            ErrorMessage: raw.error,
            ExecutionTimeMs: raw.executionTimeMs,
        };
    }
}
