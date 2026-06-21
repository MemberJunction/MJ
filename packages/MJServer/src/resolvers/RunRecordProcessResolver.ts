import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Int } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { RecordProcessExecutor, type RecordProcessScopeOverride } from '@memberjunction/record-set-processor';

/**
 * Result of running a Record Process. Mirrors the engine's `ProcessRunResult` (run-level status + counts +
 * the persisted `MJ: Process Runs` ID). For a dry-run the counts describe what WOULD happen and the rich
 * per-record diff is read separately by the client via `RunView` over `MJ: Process Run Details`
 * (`ResultPayload` carries the `FieldChange[]`) — keeping this transport thin and reusing existing reads.
 */
@ObjectType()
export class RunRecordProcessResult {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    processRunID?: string;

    @Field(() => Int)
    processed: number;

    @Field(() => Int)
    succeeded: number;

    @Field(() => Int)
    errored: number;

    @Field(() => Int)
    skipped: number;

    @Field(() => Int, { nullable: true })
    total?: number;

    @Field()
    dryRun: boolean;

    @Field({ nullable: true })
    status?: string;

    @Field({ nullable: true })
    error?: string;

    @Field(() => Int, { nullable: true })
    executionTimeMs?: number;
}

/**
 * Runs a `MJ: Record Processes` definition against a runtime scope (the rows a UI is looking at / selected,
 * or a view / list / filter), optionally as a dry-run. This is the browser-facing Transport-Layer seam for
 * the bulk-update UX; all logic lives in the `RecordProcessExecutor` engine (this resolver only marshals
 * inputs, resolves the user, and shapes the result).
 */
@Resolver()
export class RunRecordProcessResolver extends ResolverBase {
    @Mutation(() => RunRecordProcessResult)
    async RunRecordProcess(
        @Arg('recordProcessID') recordProcessID: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('scope', { nullable: true }) scopeJSON?: string,
        @Arg('dryRun', { nullable: true }) dryRun?: boolean,
    ): Promise<RunRecordProcessResult> {
        await this.CheckAPIKeyScopeAuthorization('recordprocess:execute', recordProcessID, userPayload);
        const startTime = Date.now();
        const fail = (error: string): RunRecordProcessResult => ({
            success: false, processed: 0, succeeded: 0, errored: 0, skipped: 0, dryRun: !!dryRun, error,
            executionTimeMs: Date.now() - startTime,
        });
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return fail('Unable to determine current user');
            }

            let scope: RecordProcessScopeOverride | undefined;
            if (scopeJSON) {
                try {
                    scope = JSON.parse(scopeJSON) as RecordProcessScopeOverride;
                } catch (e) {
                    return fail(`Invalid JSON in scope: ${(e as Error).message}`);
                }
            }

            LogStatus(`=== RUN RECORD PROCESS ${recordProcessID}${dryRun ? ' (dry-run)' : ''} ===`);
            const provider = GetReadWriteProvider(providers);
            const result = await new RecordProcessExecutor().RunByID(recordProcessID, {
                contextUser: currentUser,
                provider,
                scope,
                dryRun,
                triggeredBy: 'OnDemand',
            });

            return {
                success: result.Status === 'Completed',
                processRunID: result.ProcessRunID,
                processed: result.Processed,
                succeeded: result.Success,
                errored: result.Error,
                skipped: result.Skipped,
                total: result.Total ?? undefined,
                dryRun: !!dryRun,
                status: result.Status,
                error: result.ErrorMessage,
                executionTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            LogError(`RunRecordProcess failed:`, undefined, error);
            return fail((error as Error).message || 'Unknown error occurred');
        }
    }
}
