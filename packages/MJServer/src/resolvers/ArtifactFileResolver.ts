import { Resolver, Query, Arg, Ctx } from 'type-graphql';
import { Metadata, RunView, IMetadataProvider } from '@memberjunction/core';
import { MJArtifactVersionEntity, MJFileEntity, MJFileStorageAccountEntity } from '@memberjunction/core-entities';
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

    /** Load the File + its storage account/provider and generate a signed URL. */
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

        // Find the storage account for this file's provider
        const rv = RunView.FromMetadataProvider(provider);
        const accountResult = await rv.RunView<MJFileStorageAccountEntity>({
            EntityName: 'MJ: File Storage Accounts',
            ExtraFilter: `ProviderID = '${fileEntity.ProviderID}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        }, user);

        if (!accountResult.Success || accountResult.Results.length === 0) {
            throw new Error(`No FileStorageAccount found for ProviderID ${fileEntity.ProviderID}. Cannot generate download URL.`);
        }

        await FileStorageEngine.Instance.Config(false, user!);
        const driver = await FileStorageEngine.Instance.GetDriver(accountResult.Results[0].ID, user!);
        return driver.CreatePreAuthDownloadUrl(fileEntity.ProviderKey ?? fileEntity.Name);
    }
}
