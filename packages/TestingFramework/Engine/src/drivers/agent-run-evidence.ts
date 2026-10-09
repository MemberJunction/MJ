/**
 * @fileoverview Loads the evidence a judge needs about one agent run: its output artifacts, with
 * registry-hosted component specs resolved to their full specification.
 * @module @memberjunction/testing-engine
 *
 * An agent that builds an interactive component (Skip, for one) often stores only a registry
 * manifest — `{ location: "registry", registry, namespace, name, version, dependencies }` — in its
 * payload and in the artifact it attaches to the conversation. The code, data requirements and
 * queries live in the component registry. A judge shown only the manifest cannot tell whether the
 * component does what the user asked, so this module fetches the full spec through the
 * component registry client, the same way the server's registry resolver does.
 */

import { IMetadataProvider, LogError, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import {
    ComponentMetadataEngine,
    type MJArtifactEntity,
    type MJArtifactVersionEntity,
    type MJComponentRegistryEntity,
    type MJConversationDetailArtifactEntity,
} from '@memberjunction/core-entities';
import { ComponentRegistryClient } from '@memberjunction/component-registry-client-sdk';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { CredentialEngine } from '@memberjunction/credentials';
import { JudgeArtifactSource } from '../utils/judge-evidence';

/** What identifies one registry-hosted component. */
export interface RegistryComponentRef {
    /** The registry's name, as stored on the spec (`registry`). */
    Registry: string;
    /** The component namespace. */
    Namespace: string;
    /** The component name. */
    Name: string;
    /** The component version, when the spec pins one. */
    Version?: string;
}

/** Fetches a full component spec from its registry. Injectable so the expansion is testable without a registry. */
export interface IRegistryComponentFetcher {
    /**
     * @param ref - The component to fetch
     * @param contextUser - The user the fetch runs as
     * @returns The full spec
     * @throws When the registry is unknown or the fetch fails
     */
    Fetch(ref: RegistryComponentRef, contextUser: UserInfo): Promise<ComponentSpec>;
}

/** The most registry dependencies resolved per artifact; the rest stay as manifests. */
export const MAX_REGISTRY_DEPENDENCIES_RESOLVED = 12;

/** A manifest entry that points at a registry rather than carrying its own code. */
interface RegistryStub {
    location: 'registry';
    registry: string;
    namespace: string;
    name: string;
    version?: string;
    code?: string;
}

/** True when `value` is a registry manifest stub with no code of its own. */
export function IsRegistryComponentStub(value: unknown): value is RegistryStub {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    return candidate.location === 'registry'
        && typeof candidate.registry === 'string' && candidate.registry.length > 0
        && typeof candidate.namespace === 'string' && candidate.namespace.length > 0
        && typeof candidate.name === 'string' && candidate.name.length > 0
        && (typeof candidate.code !== 'string' || candidate.code.length === 0);
}

function refOf(stub: RegistryStub): RegistryComponentRef {
    return { Registry: stub.registry, Namespace: stub.namespace, Name: stub.name, Version: stub.version };
}

/**
 * Resolves the first {@link MAX_REGISTRY_DEPENDENCIES_RESOLVED} dependencies that are registry
 * manifests, in parallel. A dependency the registry cannot serve, and every one past the budget,
 * keeps its manifest. Order is preserved.
 */
async function resolveDependencies(
    dependencies: ComponentSpec[],
    fetcher: IRegistryComponentFetcher,
    contextUser: UserInfo,
): Promise<ComponentSpec[]> {
    let budget = MAX_REGISTRY_DEPENDENCIES_RESOLVED;
    return Promise.all(dependencies.map(async dependency => {
        if (budget <= 0 || !IsRegistryComponentStub(dependency)) {
            return dependency;
        }
        budget--;
        try {
            return await fetcher.Fetch(refOf(dependency), contextUser);
        } catch {
            return dependency;
        }
    }));
}

/**
 * Expands an artifact's content when it is a registry component manifest: the root spec is fetched
 * from its registry, and so are up to {@link MAX_REGISTRY_DEPENDENCIES_RESOLVED} dependencies that
 * are themselves registry manifests. Content that is not a manifest is returned unchanged.
 *
 * @param artifact - The artifact as stored
 * @param fetcher - Fetches specs from a registry
 * @param contextUser - The user the fetches run as
 * @returns The artifact, with `Content` replaced by the full spec and `ExpandedFrom` set on success,
 *   or with `ExpansionError` set and the stored content kept on failure
 */
export async function ExpandRegistryComponentArtifact(
    artifact: JudgeArtifactSource,
    fetcher: IRegistryComponentFetcher,
    contextUser: UserInfo,
): Promise<JudgeArtifactSource> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(artifact.Content);
    } catch {
        return artifact;
    }
    if (!IsRegistryComponentStub(parsed)) {
        return artifact;
    }

    try {
        const full = await fetcher.Fetch(refOf(parsed), contextUser);
        const resolvedDependencies = await resolveDependencies(full.dependencies ?? [], fetcher, contextUser);
        const expanded: ComponentSpec = { ...full, dependencies: resolvedDependencies };
        return { ...artifact, Content: JSON.stringify(expanded, null, 2), ExpandedFrom: `registry ${parsed.registry}`, ExpansionError: undefined };
    } catch (error) {
        return { ...artifact, ExpansionError: error instanceof Error ? error.message : String(error) };
    }
}

/** The env-var suffix the server's registry resolver uses for a URI override: every non-alphanumeric becomes `_`. */
function uriOverrideSuffix(value: string): string {
    return value.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
}

/** The env-var suffix the server's registry resolver uses for an API key: hyphens become `_`. */
function apiKeySuffix(value: string): string {
    return value.replace(/-/g, '_').toUpperCase();
}

/**
 * Fetches component specs through {@link ComponentRegistryClient}, configured the way the server's
 * registry resolver (`ComponentRegistryExtendedResolver`) configures it: the URI from
 * `REGISTRY_URI_OVERRIDE_<NAME>` or the registry row, the API key from `REGISTRY_API_KEY_<ID>`,
 * `REGISTRY_API_KEY_<NAME>`, or the credential named `Component Registry: <Name>`. The registry row
 * comes from {@link ComponentMetadataEngine}'s cache rather than a fresh query.
 */
export class ComponentRegistryFetcher implements IRegistryComponentFetcher {
    private readonly _clients = new Map<string, ComponentRegistryClient>();

    constructor(private readonly _provider: IMetadataProvider) {}

    public async Fetch(ref: RegistryComponentRef, contextUser: UserInfo): Promise<ComponentSpec> {
        const client = await this.clientFor(ref.Registry, contextUser);
        return client.GetComponent({
            registry: ref.Registry,
            namespace: ref.Namespace,
            name: ref.Name,
            version: ref.Version,
            userEmail: contextUser.Email,
        });
    }

    private async clientFor(registryName: string, contextUser: UserInfo): Promise<ComponentRegistryClient> {
        const cached = this._clients.get(registryName);
        if (cached) {
            return cached;
        }
        const registry = await this.findRegistry(registryName, contextUser);
        const baseUrl = process.env[`REGISTRY_URI_OVERRIDE_${uriOverrideSuffix(registry.Name)}`] || registry.URI;
        if (!baseUrl) {
            throw new Error(`Component registry "${registryName}" has no URI.`);
        }
        const apiKey = process.env[`REGISTRY_API_KEY_${apiKeySuffix(registry.ID)}`]
            || process.env[`REGISTRY_API_KEY_${apiKeySuffix(registry.Name)}`]
            || await this.credentialKey(registry.Name, contextUser);
        const client = new ComponentRegistryClient({ baseUrl, apiKey, timeout: 30_000 });
        this._clients.set(registryName, client);
        return client;
    }

    private async findRegistry(registryName: string, contextUser: UserInfo): Promise<MJComponentRegistryEntity> {
        const engine = ComponentMetadataEngine.Instance;
        await engine.Config(false, contextUser, this._provider);
        const wanted = registryName.trim().toLowerCase();
        const registry = (engine.ComponentRegistries ?? []).find(row => row.Name?.trim().toLowerCase() === wanted);
        if (!registry) {
            throw new Error(`Component registry "${registryName}" not found.`);
        }
        return registry;
    }

    private async credentialKey(registryName: string, contextUser: UserInfo): Promise<string | undefined> {
        try {
            await CredentialEngine.Instance.Config(false, contextUser);
            const resolved = await CredentialEngine.Instance.GetCredential<{ apiKey: string }>(
                `Component Registry: ${registryName}`,
                { contextUser, subsystem: 'TestingFramework' },
            );
            return resolved?.values?.apiKey || undefined;
        } catch {
            return undefined;
        }
    }
}

/** The fields read from `MJ: Conversation Detail Artifacts`. */
type ConversationDetailArtifactRow = Pick<MJConversationDetailArtifactEntity, 'ArtifactVersionID'>;

/** The fields read from `MJ: Artifact Versions`. */
type ArtifactVersionRow = Pick<MJArtifactVersionEntity, 'ID' | 'ArtifactID' | 'VersionNumber' | 'Content' | 'Artifact'>;

/** The fields read from `MJ: Artifacts`. */
type ArtifactRow = Pick<MJArtifactEntity, 'ID' | 'Type'>;

/** The rows of a view result, logging (and treating as empty) a failed read. */
function rowsOf<T>(result: RunViewResult<T>, entityName: string): T[] {
    if (!result.Success) {
        LogError(`Judge evidence: could not read ${entityName}: ${result.ErrorMessage ?? 'unknown error'}`);
        return [];
    }
    return result.Results ?? [];
}

/** A quoted, comma-separated list of ids for an `IN (...)` filter. */
function idList(ids: string[]): string {
    return ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
}

/**
 * Loads the output artifacts attached to an agent run's conversation detail.
 *
 * @param conversationDetailID - The agent run's `ConversationDetailID`
 * @param provider - The metadata provider to read through
 * @param contextUser - The user the reads run as
 * @returns The artifacts with their stored content, oldest attachment first; empty when there are none
 */
export async function LoadOutputArtifacts(
    conversationDetailID: string,
    provider: IMetadataProvider,
    contextUser: UserInfo,
): Promise<JudgeArtifactSource[]> {
    const view = RunView.FromMetadataProvider(provider);
    const links = await view.RunView<ConversationDetailArtifactRow>({
        EntityName: 'MJ: Conversation Detail Artifacts',
        ExtraFilter: `ConversationDetailID='${conversationDetailID.replace(/'/g, "''")}' AND Direction='Output'`,
        Fields: ['ArtifactVersionID'],
        OrderBy: '__mj_CreatedAt',
        ResultType: 'simple',
    }, contextUser);
    const versionIds = rowsOf(links, 'MJ: Conversation Detail Artifacts').map(link => link.ArtifactVersionID);
    if (versionIds.length === 0) {
        return [];
    }

    const versions = await view.RunView<ArtifactVersionRow>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ID IN (${idList(versionIds)})`,
        Fields: ['ID', 'ArtifactID', 'VersionNumber', 'Content', 'Artifact'],
        ResultType: 'simple',
    }, contextUser);
    const versionRows = rowsOf(versions, 'MJ: Artifact Versions');
    if (versionRows.length === 0) {
        return [];
    }

    const artifacts = await view.RunView<ArtifactRow>({
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `ID IN (${idList([...new Set(versionRows.map(row => row.ArtifactID))])})`,
        Fields: ['ID', 'Type'],
        ResultType: 'simple',
    }, contextUser);
    const typeByArtifact = new Map(rowsOf(artifacts, 'MJ: Artifacts').map(row => [row.ID.toUpperCase(), row.Type ?? undefined]));
    const versionById = new Map(versionRows.map(row => [row.ID.toUpperCase(), row]));

    return versionIds
        .map(id => versionById.get(id.toUpperCase()))
        .filter((row): row is ArtifactVersionRow => row !== undefined && !!row.Content)
        .map(row => ({
            Name: row.Artifact ?? 'Untitled artifact',
            TypeName: typeByArtifact.get(row.ArtifactID.toUpperCase()),
            VersionNumber: row.VersionNumber,
            Content: row.Content ?? '',
        }));
}

/**
 * Loads an agent run's output artifacts and expands registry component manifests to full specs.
 * Never throws: a failed load is logged and yields no artifacts, so judging proceeds on what is known.
 *
 * @param conversationDetailID - The agent run's `ConversationDetailID`, or null when it has none
 * @param provider - The metadata provider to read through
 * @param contextUser - The user the reads run as
 * @param fetcher - Fetches registry specs; when omitted, manifests are left as stored
 * @returns The artifacts the judge should see
 */
export async function LoadJudgeArtifacts(
    conversationDetailID: string | null | undefined,
    provider: IMetadataProvider,
    contextUser: UserInfo,
    fetcher?: IRegistryComponentFetcher,
): Promise<JudgeArtifactSource[]> {
    if (!conversationDetailID) {
        return [];
    }
    try {
        const stored = await LoadOutputArtifacts(conversationDetailID, provider, contextUser);
        if (!fetcher) {
            return stored;
        }
        const expanded: JudgeArtifactSource[] = [];
        for (const artifact of stored) {
            expanded.push(await ExpandRegistryComponentArtifact(artifact, fetcher, contextUser));
        }
        return expanded;
    } catch (error) {
        LogError(`Could not load output artifacts for judge evidence: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}
