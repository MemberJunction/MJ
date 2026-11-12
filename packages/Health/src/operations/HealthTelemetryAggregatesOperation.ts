import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, TelemetryManager, type IMetadataProvider, type RemoteOpServerContext, type UserInfo } from '@memberjunction/core';
import type { HealthTelemetryAggregatesInput, HealthTelemetryAggregatesOutput, HealthTelemetryCategoryAggregate } from './types';
import { AuthorizeHealthOperation } from './auth-helper';

@RegisterClass(BaseRemotableOperation, 'Health.GetTelemetryCategoryAggregates')
export class HealthTelemetryAggregatesOperation extends BaseRemotableOperation<HealthTelemetryAggregatesInput, HealthTelemetryAggregatesOutput> {
    public readonly OperationKey = 'Health.GetTelemetryCategoryAggregates';
    public readonly RequiredScope = 'health:read';
    public readonly ExposeAsAgentTool = true;
    public readonly ExposeAsMCPTool = true;
    public readonly ToolDescription = 'Computes aggregated percentiles, call volume, and AI token velocity from the in-memory telemetry ring buffer.';
    public readonly ToolInputSchema = {
        type: 'object',
        properties: {
            WindowMinutes: {
                type: 'number',
                description: 'Time window in minutes (default: 60)',
            },
        },
    };

    protected override async Authorize(_input: HealthTelemetryAggregatesInput, user: UserInfo, context?: RemoteOpServerContext): Promise<boolean> {
        return AuthorizeHealthOperation(user, context?.provider);
    }

    protected override async InternalExecute(
        input: HealthTelemetryAggregatesInput,
        _provider: IMetadataProvider,
        _user: UserInfo,
        _context: RemoteOpServerContext,
    ): Promise<HealthTelemetryAggregatesOutput> {
        const windowMinutes = input?.WindowMinutes && input.WindowMinutes > 0 ? input.WindowMinutes : 60;
        const since = Date.now() - windowMinutes * 60 * 1000;

        const events = TelemetryManager.Instance.GetEvents({ since });

        const groups = new Map<
            string,
            {
                elapsed: number[];
                totalElapsedMs: number;
                errorCount: number;
                totalInputTokens: number;
                totalOutputTokens: number;
            }
        >();

        for (const ev of events) {
            const cat = ev.category ?? 'Server';
            let entry = groups.get(cat);
            if (!entry) {
                entry = {
                    elapsed: [],
                    totalElapsedMs: 0,
                    errorCount: 0,
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                };
                groups.set(cat, entry);
            }

            const elapsed = ev.elapsedMs ?? 0;
            entry.elapsed.push(elapsed);
            entry.totalElapsedMs += elapsed;

            const params = (ev.params ?? {}) as Record<string, unknown>;
            if (params.error != null || params.success === false) {
                entry.errorCount++;
            }
            if (typeof params.inputTokens === 'number') {
                entry.totalInputTokens += params.inputTokens;
            }
            if (typeof params.outputTokens === 'number') {
                entry.totalOutputTokens += params.outputTokens;
            }
        }

        const aggregates: HealthTelemetryCategoryAggregate[] = [];
        for (const [category, data] of groups.entries()) {
            data.elapsed.sort((a, b) => a - b);
            const count = data.elapsed.length;
            const p50 = count > 0 ? data.elapsed[Math.floor(count * 0.5)] : 0;
            const p95 = count > 0 ? data.elapsed[Math.floor(count * 0.95)] : 0;
            const minElapsed = count > 0 ? data.elapsed[0] : 0;
            const maxElapsed = count > 0 ? data.elapsed[count - 1] : 0;
            const avgElapsed = count > 0 ? data.totalElapsedMs / count : 0;

            aggregates.push({
                Category: category,
                EventCount: count,
                TotalElapsedMs: data.totalElapsedMs,
                AvgElapsedMs: avgElapsed,
                MinElapsedMs: minElapsed,
                MaxElapsedMs: maxElapsed,
                P50ElapsedMs: p50,
                P95ElapsedMs: p95,
                ErrorCount: data.errorCount,
                TotalInputTokens: data.totalInputTokens,
                TotalOutputTokens: data.totalOutputTokens,
            });
        }

        aggregates.sort((a, b) => b.EventCount - a.EventCount);
        return { Aggregates: aggregates };
    }
}
