/**
 * @fileoverview The database-backed {@link IComponentArtifactSource}: loads component artifacts through the
 * SESSION'S OWN provider and the signed-in user's own read access.
 *
 * Nothing here widens access. The channel runs in the user's browser, the provider is the one that
 * authenticates their session, and an artifact is loaded only if the user may read it by the same rules the
 * rest of the conversation UI applies (owner, an explicit grant, or a collection they can read).
 *
 * @module @memberjunction/ng-conversations
 */

import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { MJArtifactEntity, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { ArtifactPermissionService } from '../../../services/artifact-permission.service';
import { CollectionPermissionService } from '../../../services/collection-permission.service';
import { ParseComponentSpecContent } from './component-spec-content';
import {
    ComponentArtifactError,
    type IComponentArtifactSource,
    type ResolvedComponentArtifact,
} from './interactive-component-types';

/** A UUID in any case, with or without braces. Ids reach SQL filters, so anything else is refused before it is built into one. */
const UUID_PATTERN = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

/** The artifact type name that marks a component artifact. */
const COMPONENT_ARTIFACT_TYPE = 'Component';

/** Validates an id the model supplied. */
function requireUuid(value: string, what: string): string {
    const trimmed = value.trim();
    if (!UUID_PATTERN.test(trimmed)) {
        throw new ComponentArtifactError('invalid_id', `"${value}" is not a valid ${what} id.`);
    }
    return trimmed.replace(/[{}]/g, '');
}

/** Loads component artifacts with the user's own access. */
export class RunViewComponentArtifactSource implements IComponentArtifactSource {
    private readonly permissions: ArtifactPermissionService;

    /**
     * @param provider The session's metadata provider (the one that authenticates the user).
     * @param user The signed-in user.
     */
    public constructor(
        private readonly provider: IMetadataProvider,
        private readonly user: UserInfo
    ) {
        this.permissions = new ArtifactPermissionService(new CollectionPermissionService());
        this.permissions.Provider = provider;
    }

    /** @inheritdoc */
    public async LoadVersion(versionId: string): Promise<ResolvedComponentArtifact> {
        const id = requireUuid(versionId, 'artifact version');
        const version = await this.queryOne<MJArtifactVersionEntity>('MJ: Artifact Versions', `ID='${id}'`, 'artifact version');
        return this.resolve(version);
    }

    /** @inheritdoc */
    public async LoadLatest(artifactId: string): Promise<ResolvedComponentArtifact> {
        const id = requireUuid(artifactId, 'artifact');
        const version = await this.queryOne<MJArtifactVersionEntity>(
            'MJ: Artifact Versions',
            `ArtifactID='${id}'`,
            'artifact',
            'VersionNumber DESC'
        );
        return this.resolve(version);
    }

    /** Loads one row by filter, mapping an empty result to `not_found` and a failed query to `load_failed`. */
    private async queryOne<T>(entityName: string, filter: string, what: string, orderBy?: string): Promise<T> {
        const rv = RunView.FromMetadataProvider(this.provider);
        const result = await rv.RunView<T>(
            { EntityName: entityName, ExtraFilter: filter, OrderBy: orderBy, MaxRows: 1, ResultType: 'entity_object' },
            this.user
        );
        if (!result.Success) {
            LogError(`[InteractiveComponent] Loading ${what} failed: ${result.ErrorMessage}`);
            throw new ComponentArtifactError('load_failed', `The ${what} could not be loaded.`);
        }
        if (!result.Results || result.Results.length === 0) {
            throw new ComponentArtifactError('not_found', `No ${what} with that id exists, or you cannot see it.`);
        }
        return result.Results[0];
    }

    /** Checks access and type, then parses the content. */
    private async resolve(version: MJArtifactVersionEntity): Promise<ResolvedComponentArtifact> {
        const artifactId = version.ArtifactID;
        const canRead = await this.permissions.CheckPermission(artifactId, this.user.ID, 'read', this.user);
        if (!canRead) {
            throw new ComponentArtifactError('access_denied', 'You do not have access to that artifact.');
        }
        const artifact = await this.queryOne<MJArtifactEntity>('MJ: Artifacts', `ID='${requireUuid(artifactId, 'artifact')}'`, 'artifact');
        if (!UUIDsEqual(artifact.ID, artifactId) || artifact.Type !== COMPONENT_ARTIFACT_TYPE) {
            throw new ComponentArtifactError('not_a_component', `"${artifact.Name}" is a ${artifact.Type} artifact, not an interactive component.`);
        }
        const name = version.Name ?? artifact.Name;
        return {
            ArtifactID: artifact.ID,
            VersionID: version.ID,
            VersionNumber: version.VersionNumber,
            Name: name,
            Spec: ParseComponentSpecContent(version.Content, `"${name}"`),
        };
    }
}
