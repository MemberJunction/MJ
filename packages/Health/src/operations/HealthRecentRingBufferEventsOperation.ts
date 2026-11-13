import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, TelemetryManager, type IMetadataProvider, type RemoteOpServerContext, type TelemetryCategory, type UserInfo } from '@memberjunction/core';
import type { HealthRecentRingBufferEventsInput, HealthRecentRingBufferEventsOutput, HealthRingBufferEventSnapshot } from './types';
import { AuthorizeHealthOperation } from './auth-helper';

@RegisterClass(BaseRemotableOperation, 'Health.GetRecentRingBufferEvents')
export class HealthRecentRingBufferEventsOperation extends BaseRemotableOperation<HealthRecentRingBufferEventsInput, HealthRecentRingBufferEventsOutput> {
    public readonly OperationKey = 'Health.GetRecentRingBufferEvents';
    public readonly RequiredScope = 'health:read';
    public readonly ExposeAsAgentTool = true;
    public readonly ExposeAsMCPTool = true;
    public readonly ToolDescription = 'Returns recent PII-scrubbed telemetry events from the in-memory ring buffer with execution timings and tokens.';
    public readonly ToolInputSchema = {
        type: 'object',
        properties: {
            Limit: {
                type: 'number',
                description: 'Maximum number of events to return (default: 50, maximum: 200)',
            },
            Category: {
                type: 'string',
                description: 'Optional telemetry category filter',
            },
        },
    };

    protected override async Authorize(_input: HealthRecentRingBufferEventsInput, user: UserInfo, context?: RemoteOpServerContext): Promise<boolean> {
        return AuthorizeHealthOperation(user, context?.provider);
    }

    protected override async InternalExecute(
        input: HealthRecentRingBufferEventsInput,
        _provider: IMetadataProvider,
        _user: UserInfo,
        _context: RemoteOpServerContext,
    ): Promise<HealthRecentRingBufferEventsOutput> {
        const boundedLimit = Math.min(Math.max(input?.Limit ?? 50, 1), 200);
        const typedCategory = input?.Category as TelemetryCategory | undefined;

        const events = TelemetryManager.Instance.GetEvents({
            category: typedCategory,
            limit: boundedLimit,
        });

        const snapshots: HealthRingBufferEventSnapshot[] = events.map((ev) => {
            const params = (ev.params ?? {}) as Record<string, unknown>;
            const isError = params.error != null || params.success === false;
            const errorMessage =
                typeof params.errorMessage === 'string'
                    ? params.errorMessage
                    : params.error instanceof Error
                      ? params.error.message
                      : isError
                        ? String(params.error ?? 'Unknown error')
                        : undefined;

            return {
                ID: ev.id,
                Category: ev.category,
                Operation: ev.operation,
                Fingerprint: ev.fingerprint,
                StartTime: ev.startTime,
                ElapsedMs: ev.elapsedMs,
                UserID: ev.userId,
                Success: !isError,
                ErrorMessage: errorMessage,
                ParamsJson: JSON.stringify(params),
                InputTokens: typeof params.inputTokens === 'number' ? params.inputTokens : undefined,
                OutputTokens: typeof params.outputTokens === 'number' ? params.outputTokens : undefined,
            };
        });

        return { Events: snapshots };
    }
}
