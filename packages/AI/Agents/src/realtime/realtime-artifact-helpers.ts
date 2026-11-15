import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { ArtifactMetadataEngine, MJArtifactEntity } from '@memberjunction/core-entities';
import { ActionParam } from '@memberjunction/actions-base';
import { ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { NormalizeUUID } from '@memberjunction/global';
import type { DelegatedRunArtifact } from './realtime-tool-broker';

/**
 * Normalized action names whose successful execution can create or mutate a visible governed artifact
 * for the realtime call overlay. Read-only inspection/discovery actions are intentionally excluded.
 */
export const MUTATING_OR_CREATING_ARTIFACT_ACTION_NAMES: ReadonlySet<string> = new Set([
    'create governed artifact',
    'mutate governed artifact',
    'refresh and snapshot artifact',
]);

function normalizeActionName(name: string): string {
    return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveDriverClass(typeName?: string, explicitDriverClass?: string): string | undefined {
    if (explicitDriverClass) {
        return explicitDriverClass;
    }
    if (!typeName) {
        return undefined;
    }
    return ArtifactMetadataEngine.Instance.FindArtifactType(typeName)?.DriverClass ?? undefined;
}

/**
 * Extracts artifact descriptors from a direct realtime action execution only when the action
 * succeeded and is an artifact-creating or artifact-mutating action (never on failures or read-only calls).
 */
export function ExtractDirectActionArtifacts(
    actionName: string,
    actionSuccess: boolean,
    params?: ActionParam[],
): DelegatedRunArtifact[] | undefined {
    if (!actionSuccess || !params?.length) {
        return undefined;
    }
    if (!MUTATING_OR_CREATING_ARTIFACT_ACTION_NAMES.has(normalizeActionName(actionName))) {
        return undefined;
    }

    const readStr = (name: string): string | undefined => {
        const match = params.find((p) => p.Name.toLowerCase() === name.toLowerCase());
        return typeof match?.Value === 'string' && match.Value.trim() ? match.Value.trim() : undefined;
    };

    const artifactId = readStr('ArtifactID');
    if (!artifactId) {
        return undefined;
    }
    const versionId = readStr('VersionID') ?? '';
    const name = readStr('ArtifactName') ?? readStr('Title') ?? 'Untitled Artifact';
    const typeName = readStr('ArtifactTypeName') ?? readStr('ArtifactType');
    const driverClass = resolveDriverClass(typeName, readStr('DriverClass'));

    return [
        {
            ArtifactID: artifactId,
            ArtifactVersionID: versionId,
            Name: name,
            ...(typeName ? { ArtifactTypeName: typeName } : {}),
            ...(driverClass ? { DriverClass: driverClass } : {}),
        },
    ];
}

export interface CollectDelegatedRunArtifactsParams {
    Result: ExecuteAgentResult;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
    ProcessPayloadArtifacts?: (
        result: ExecuteAgentResult,
    ) => Promise<{ artifactId: string; versionId: string } | null>;
}

/**
 * Collects touched governed artifacts and non-system payload artifacts from a delegated target agent run
 * for propagation across both server-bridged (`BaseAgent`) and client-direct (`RealtimeClientSessionService`) paths.
 */
export async function CollectDelegatedRunArtifacts(
    params: CollectDelegatedRunArtifactsParams,
): Promise<DelegatedRunArtifact[] | undefined> {
    const {
        Result: result,
        ContextUser: contextUser,
        Provider: provider,
        ProcessPayloadArtifacts: processPayloadArtifacts,
    } = params;
    const collected: DelegatedRunArtifact[] = [];
    const seen = new Set<string>();

    if (result.touchedArtifacts?.length) {
        for (const touched of result.touchedArtifacts) {
            const artId = (touched.ArtifactID ?? '').trim();
            const normId = NormalizeUUID(artId);
            if (!artId || seen.has(normId)) {
                continue;
            }
            seen.add(normId);
            collected.push({
                ArtifactID: artId,
                ArtifactVersionID: touched.ArtifactVersionID ?? '',
                Name: touched.Name || 'Untitled Artifact',
                ArtifactTypeName: touched.ArtifactTypeName,
                DriverClass: resolveDriverClass(touched.ArtifactTypeName, touched.DriverClass),
            });
        }
    }

    const payload = result.payload;
    const hasPayload =
        payload != null &&
        typeof payload === 'object' &&
        Object.keys(payload).length > 0;

    if (hasPayload && processPayloadArtifacts) {
        const info = await processPayloadArtifacts(result);
        const infoNorm = info?.artifactId ? NormalizeUUID(info.artifactId) : '';
        if (info && infoNorm && !seen.has(infoNorm)) {
            const artifact = await provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', contextUser);
            if ((await artifact.Load(info.artifactId)) && artifact.Visibility !== 'System Only') {
                const typeName = artifact.Type ?? undefined;
                seen.add(infoNorm);
                collected.push({
                    ArtifactID: info.artifactId,
                    ArtifactVersionID: info.versionId,
                    Name: artifact.Name,
                    ArtifactTypeName: typeName,
                    DriverClass: resolveDriverClass(typeName),
                });
            }
        }
    }

    return collected.length > 0 ? collected : undefined;
}

/**
 * Best-effort wrapper around {@link CollectDelegatedRunArtifacts} for realtime delegation paths:
 * skips paused/failed runs and logs errors without failing the delegation response.
 */
export async function CollectDelegatedRunArtifactsSafely(
    params: CollectDelegatedRunArtifactsParams & { logLabel: string },
): Promise<DelegatedRunArtifact[] | undefined> {
    const { Result: result, logLabel } = params;
    const paused = result.agentRun?.Status === 'AwaitingFeedback';
    const payload = result.payload;
    const hasPayload =
        payload != null &&
        typeof payload === 'object' &&
        Object.keys(payload).length > 0;
    const hasTouched = (result.touchedArtifacts?.length ?? 0) > 0;

    if (!result.success || paused || (!hasPayload && !hasTouched)) {
        return undefined;
    }

    try {
        return await CollectDelegatedRunArtifacts(params);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`${logLabel} artifact collection failed (delegation continues): ${message}`);
        return undefined;
    }
}
