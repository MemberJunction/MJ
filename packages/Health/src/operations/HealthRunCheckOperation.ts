import { RegisterClass, MJGlobal } from '@memberjunction/global';
import { BaseRemotableOperation, DatabaseProviderBase, type IMetadataProvider, type RemoteOpServerContext, type UserInfo } from '@memberjunction/core';
import { MJHealthEngine } from '../MJHealthEngine';
import { LocalTelemetrySignalBridge } from '../telemetry/LocalTelemetrySignalBridge';
import { OtelMetrics } from '../otel/OtelMetrics';
import type { InstanceHealthReport } from '../types';
import type { HealthRunCheckInput } from './types';
import { AuthorizeHealthOperation } from './auth-helper';

@RegisterClass(BaseRemotableOperation, 'Health.RunCheck')
export class HealthRunCheckOperation extends BaseRemotableOperation<HealthRunCheckInput, InstanceHealthReport> {
    public readonly OperationKey = 'Health.RunCheck';
    public readonly RequiredScope = 'health:read';
    public readonly ExposeAsAgentTool = true;
    public readonly ExposeAsMCPTool = true;
    public readonly ToolDescription = 'Runs live health checks across registered probes and returns an InstanceHealthReport with signal matrix diagnostics.';
    public readonly ToolInputSchema = {
        type: 'object',
        properties: {
            CheckType: {
                type: 'string',
                enum: ['startup', 'readiness', 'live-test', 'passive'],
                description: 'Semantic check mode to evaluate',
            },
            AppFilter: {
                type: 'string',
                description: 'Optional application name filter',
            },
            TimeoutMs: {
                type: 'number',
                description: 'Execution timeout budget in milliseconds',
            },
        },
    };

    protected override async Authorize(_input: HealthRunCheckInput, user: UserInfo, context?: RemoteOpServerContext): Promise<boolean> {
        return AuthorizeHealthOperation(user, context?.provider);
    }

    protected override async InternalExecute(
        input: HealthRunCheckInput,
        provider: IMetadataProvider,
        user: UserInfo,
        context: RemoteOpServerContext,
    ): Promise<InstanceHealthReport> {
        const candidateDb = provider instanceof DatabaseProviderBase
            ? provider
            : context?.provider instanceof DatabaseProviderBase
              ? context.provider
              : (context?.provider && 'DatabaseProvider' in context.provider && context.provider.DatabaseProvider instanceof DatabaseProviderBase)
                ? context.provider.DatabaseProvider
                : MJGlobal.Instance.ClassFactory.CreateInstance<DatabaseProviderBase>(DatabaseProviderBase);
        const dbProvider = candidateDb;

        const report = await MJHealthEngine.Instance.RunCheck(input?.CheckType ?? 'passive', {
            DatabaseProvider: dbProvider,
            MetadataProvider: provider,
            SystemUser: user,
            AppFilter: input?.AppFilter,
            TimeoutMs: input?.TimeoutMs,
        });

        LocalTelemetrySignalBridge.Instance.RecordHealthReport(report);
        OtelMetrics.Instance.RecordHealthReport(report);

        return report;
    }
}
