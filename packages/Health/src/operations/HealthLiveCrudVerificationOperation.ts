import { RegisterClass, MJGlobal } from '@memberjunction/global';
import { BaseRemotableOperation, DatabaseProviderBase, type IMetadataProvider, type RemoteOpServerContext, type UserInfo } from '@memberjunction/core';
import { MJHealthEngine } from '../MJHealthEngine';
import { LocalTelemetrySignalBridge } from '../telemetry/LocalTelemetrySignalBridge';
import { OtelMetrics } from '../otel/OtelMetrics';
import type { InstanceHealthReport } from '../types';
import type { HealthLiveCrudVerificationInput } from './types';
import { AuthorizeHealthOperation } from './auth-helper';

@RegisterClass(BaseRemotableOperation, 'Health.ExecuteLiveCrudVerification')
export class HealthLiveCrudVerificationOperation extends BaseRemotableOperation<HealthLiveCrudVerificationInput, InstanceHealthReport> {
    public readonly OperationKey = 'Health.ExecuteLiveCrudVerification';
    public readonly RequiredScope = 'health:execute';
    public readonly ExposeAsAgentTool = true;
    public readonly ExposeAsMCPTool = true;
    public readonly ToolDescription = 'Executes active live CRUD functional verification with transactional rollback isolation and returns an InstanceHealthReport.';
    public readonly ToolInputSchema = {
        type: 'object',
        properties: {
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

    protected override async Authorize(_input: HealthLiveCrudVerificationInput, user: UserInfo, context?: RemoteOpServerContext): Promise<boolean> {
        return AuthorizeHealthOperation(user, context?.provider);
    }

    protected override async InternalExecute(
        input: HealthLiveCrudVerificationInput,
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

        const report = await MJHealthEngine.Instance.RunCheck('live-test', {
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
