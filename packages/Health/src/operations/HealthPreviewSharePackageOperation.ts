import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, RemoteOperationError, type IMetadataProvider, type RemoteOpServerContext, type UserInfo } from '@memberjunction/core';
import { ShareLayerPackager } from '../telemetry/ShareLayerPackager';
import { LocalTelemetrySignalBridge } from '../telemetry/LocalTelemetrySignalBridge';
import type { ConsentTier } from '../telemetry/BaseTelemetrySink';
import type { HealthPreviewSharePackageInput, HealthPreviewSharePackageOutput } from './types';
import { AuthorizeHealthOperation } from './auth-helper';

@RegisterClass(BaseRemotableOperation, 'Health.PreviewSharePackage')
export class HealthPreviewSharePackageOperation extends BaseRemotableOperation<HealthPreviewSharePackageInput, HealthPreviewSharePackageOutput> {
    public readonly OperationKey = 'Health.PreviewSharePackage';
    public readonly RequiredScope = 'health:read';
    public readonly ExposeAsAgentTool = true;
    public readonly ExposeAsMCPTool = true;
    public readonly ToolDescription = 'Generates a deterministic dry-run preview of a Zero-Trust Opt-In Share Layer telemetry package without network transmission.';
    public readonly ToolInputSchema = {
        type: 'object',
        required: ['ConsentTier'],
        properties: {
            ConsentTier: {
                type: 'string',
                enum: ['Off', 'HealthOnly', 'HealthAndAggregatedUsage', 'HealthAndMetadataEvents'],
                description: 'Consent tier to preview',
            },
        },
    };

    protected override async Authorize(_input: HealthPreviewSharePackageInput, user: UserInfo, context?: RemoteOpServerContext): Promise<boolean> {
        return AuthorizeHealthOperation(user, context?.provider);
    }

    protected override async InternalExecute(
        input: HealthPreviewSharePackageInput,
        _provider: IMetadataProvider,
        _user: UserInfo,
        _context: RemoteOpServerContext,
    ): Promise<HealthPreviewSharePackageOutput> {
        if (!input?.ConsentTier || input.ConsentTier === 'Off') {
            throw new RemoteOperationError('INVALID_CONSENT_TIER', 'Cannot preview share package for consent tier "Off".');
        }

        const packager = ShareLayerPackager.Instance;
        const bridge = LocalTelemetrySignalBridge.Instance;
        const pkg = packager.PreviewNextPackage(input.ConsentTier as ConsentTier, bridge);

        return {
            ConsentTier: pkg.Payload.ConsentTier,
            GeneratedAtIso: pkg.Payload.GeneratedAtIso,
            PayloadHashHex: pkg.PayloadHashHex,
            PayloadJson: pkg.PayloadJson,
            HealthSignalsCount: pkg.Payload.HealthSignals?.Buckets?.length ?? 0,
            AggregatedUsageCount: pkg.Payload.AggregatedUsage?.Buckets?.length ?? 0,
            FeatureUsageCount: pkg.Payload.FeatureUsage?.DailyBuckets?.length ?? 0,
            AllowlistCompliant: true,
        };
    }
}
