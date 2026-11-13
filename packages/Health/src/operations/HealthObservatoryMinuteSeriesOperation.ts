import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, type IMetadataProvider, type RemoteOpServerContext, type TelemetryCategory, type UserInfo } from '@memberjunction/core';
import { LocalTelemetrySignalBridge } from '../telemetry/LocalTelemetrySignalBridge';
import type { HealthObservatoryMinuteSeriesInput, HealthObservatoryMinuteSeriesOutput } from './types';
import { AuthorizeHealthOperation } from './auth-helper';

@RegisterClass(BaseRemotableOperation, 'Health.GetObservatoryMinuteSeries')
export class HealthObservatoryMinuteSeriesOperation extends BaseRemotableOperation<HealthObservatoryMinuteSeriesInput, HealthObservatoryMinuteSeriesOutput> {
    public readonly OperationKey = 'Health.GetObservatoryMinuteSeries';
    public readonly RequiredScope = 'health:read';
    public readonly ExposeAsAgentTool = true;
    public readonly ExposeAsMCPTool = true;
    public readonly ToolDescription = 'Retrieves 24-hour minute-bucket telemetry and health signal time series from LocalTelemetrySignalBridge.';
    public readonly ToolInputSchema = {
        type: 'object',
        properties: {
            Category: {
                type: 'string',
                description: 'Optional telemetry category filter (e.g. RunView, RunQuery, AI, Engine)',
            },
            WindowMinutes: {
                type: 'number',
                description: 'Time window in minutes (up to 1440)',
            },
        },
    };

    protected override async Authorize(_input: HealthObservatoryMinuteSeriesInput, user: UserInfo, context?: RemoteOpServerContext): Promise<boolean> {
        return AuthorizeHealthOperation(user, context?.provider);
    }

    protected override async InternalExecute(
        input: HealthObservatoryMinuteSeriesInput,
        _provider: IMetadataProvider,
        _user: UserInfo,
        _context: RemoteOpServerContext,
    ): Promise<HealthObservatoryMinuteSeriesOutput> {
        const bridge = LocalTelemetrySignalBridge.Instance;
        const typedCategory = input?.Category as TelemetryCategory | undefined;

        const countBuckets = bridge.GetCountBuckets(typedCategory);
        const healthBuckets = bridge.GetHealthBuckets();
        const probeSignalBuckets = bridge.GetProbeSignalBuckets();
        const featureUsageBuckets = bridge.GetFeatureUsageBuckets();

        return {
            CountBuckets: countBuckets,
            HealthBuckets: healthBuckets,
            ProbeSignalBuckets: probeSignalBuckets,
            FeatureUsageBuckets: featureUsageBuckets,
        };
    }
}
