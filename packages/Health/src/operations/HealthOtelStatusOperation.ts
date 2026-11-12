import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, type IMetadataProvider, type RemoteOpServerContext, type UserInfo } from '@memberjunction/core';
import { OtelSdk } from '../otel/OtelSdk';
import type { HealthOtelStatusInput, HealthOtelStatusOutput } from './types';
import { AuthorizeHealthOperation } from './auth-helper';

@RegisterClass(BaseRemotableOperation, 'Health.GetOtelStatus')
export class HealthOtelStatusOperation extends BaseRemotableOperation<HealthOtelStatusInput, HealthOtelStatusOutput> {
    public readonly OperationKey = 'Health.GetOtelStatus';
    public readonly RequiredScope = 'health:read';
    public readonly ExposeAsAgentTool = true;
    public readonly ExposeAsMCPTool = true;
    public readonly ToolDescription = 'Returns the OpenTelemetry SDK spine initialization state, endpoints, sampling ratio, and metric gauges.';
    public readonly ToolInputSchema = {
        type: 'object',
        properties: {},
    };

    protected override async Authorize(_input: HealthOtelStatusInput, user: UserInfo, context?: RemoteOpServerContext): Promise<boolean> {
        return AuthorizeHealthOperation(user, context?.provider);
    }

    protected override async InternalExecute(
        _input: HealthOtelStatusInput,
        _provider: IMetadataProvider,
        _user: UserInfo,
        _context: RemoteOpServerContext,
    ): Promise<HealthOtelStatusOutput> {
        const sdk = OtelSdk.Instance;
        const config = sdk.Config;

        return {
            Enabled: config?.Enabled ?? false,
            IsInitialized: sdk.IsInitialized,
            ServiceName: config?.ServiceName ?? 'memberjunction',
            ServiceVersion: config?.ServiceVersion ?? 'unknown',
            Environment: config?.Environment ?? 'production',
            OtlpEndpoint: config?.OtlpEndpoint,
            TracesEndpoint: config?.TracesEndpoint,
            MetricsEndpoint: config?.MetricsEndpoint,
            DatabasePlatform: config?.DatabasePlatform ?? 'sqlserver',
            SamplingRatio: config?.SamplingRatio ?? 1.0,
            SignalGaugesJson: JSON.stringify({}),
        };
    }
}
