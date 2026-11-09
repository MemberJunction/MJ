import { Resolver, Query, Arg, Ctx } from 'type-graphql';
import { Metadata, IMetadataProvider } from '@memberjunction/core';
import { MJArtifactVersionEntity, MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';
import { GetReadWriteProvider } from '../util.js';

/**
 * GraphQL resolver that produces a short-lived download URL for an artifact version
 * stored as a binary file (ContentMode = 'File').
 *
 * Separating this from the generated FileResolver keeps the artifact-specific
 * logic in one place and avoids mixing concerns in the large FileResolver class.
 */
@Resolver()
export class ArtifactFileResolver extends ResolverBase {

    @Query(() => String, { description: 'Returns a pre-authenticated download URL for an artifact version whose ContentMode is "File".' })
    async ArtifactFileDownloadUrl(
        @Arg('artifactVersionId', () => String) artifactVersionId: string,
        @Ctx() context: AppContext,
    ): Promise<string> {
        const user = this.GetUserFromPayload(context.userPayload);
        if (!user) {
            throw new Error('Unauthorized');
        }

        const p = GetReadWriteProvider(context.providers);

        // Load the artifact version
        const artifactVersion = await p.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
        const loaded = await artifactVersion.Load(artifactVersionId);
        if (!loaded) {
            throw new Error(`Artifact version ${artifactVersionId} not found`);
        }

        if (artifactVersion.ContentMode !== 'File') {
            throw new Error(`Artifact version ${artifactVersionId} is not a file artifact (ContentMode=${artifactVersion.ContentMode})`);
        }

        if (!artifactVersion.FileID) {
            throw new Error(`Artifact version ${artifactVersionId} has no associated file`);
        }

        return this.buildDownloadUrl(artifactVersion.FileID, user, p);
    }

    /**
     * Load the File (as the caller) and generate a signed URL — after the storage gate: the caller must be able to read
     * the account the file's provider resolves to and every `MJ: Files` row that tracks its object
     * (`FileStorageEngine.ResolveFileObject`), so an artifact cannot sign an object in an account the caller is refused.
     */
    private async buildDownloadUrl(
        fileId: string,
        user: ReturnType<ResolverBase['GetUserFromPayload']>,
        provider: IMetadataProvider,
    ): Promise<string> {
        const fileEntity = await provider.GetEntityObject<MJFileEntity>('MJ: Files', user);
        const fileLoaded = await fileEntity.Load(fileId);
        if (!fileLoaded) {
            throw new Error(`File record ${fileId} not found`);
        }

        // Resolve the storage account for this file's provider, gated for the caller (throws on refusal)
        const resolved = await FileStorageEngine.Instance.ResolveFileObject(fileEntity, user!, 'Read', provider);
        if (!resolved) {
            throw new Error(`No FileStorageAccount found for ProviderID ${fileEntity.ProviderID}. Cannot generate download URL.`);
        }
        return resolved.Driver.CreatePreAuthDownloadUrl(resolved.ObjectKey);
    }
}
