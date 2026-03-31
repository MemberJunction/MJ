import { Resolver, Query, Arg, Ctx } from 'type-graphql';
import { Metadata, RunView } from '@memberjunction/core';
import { MJArtifactVersionEntity, MJFileEntity, MJFileStorageAccountEntity, MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import { initializeDriverWithAccountCredentials } from '@memberjunction/storage';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';

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

        const md = new Metadata();

        // Load the artifact version
        const artifactVersion = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
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

        return this.buildDownloadUrl(artifactVersion.FileID, user, md);
    }

    /** Load the File + its storage account/provider and generate a signed URL. */
    private async buildDownloadUrl(
        fileId: string,
        user: ReturnType<ResolverBase['GetUserFromPayload']>,
        md: Metadata,
    ): Promise<string> {
        const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
        const fileLoaded = await fileEntity.Load(fileId);
        if (!fileLoaded) {
            throw new Error(`File record ${fileId} not found`);
        }

        const providerEntity = await md.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', user);
        await providerEntity.Load(fileEntity.ProviderID);

        // Load the storage account so we can use the credential engine for OAuth providers (e.g. Box)
        const rv = new RunView();
        const accountResult = await rv.RunView<MJFileStorageAccountEntity>({
            EntityName: 'MJ: File Storage Accounts',
            ExtraFilter: `ProviderID = '${fileEntity.ProviderID}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        }, user);

        if (!accountResult.Success || accountResult.Results.length === 0) {
            throw new Error(`No FileStorageAccount found for ProviderID ${fileEntity.ProviderID}. Cannot generate download URL.`);
        }

        const accountEntity = accountResult.Results[0];
        const driver = await initializeDriverWithAccountCredentials({
            accountEntity,
            providerEntity,
            contextUser: user!,
        });
        return driver.CreatePreAuthDownloadUrl(fileEntity.ProviderKey ?? fileEntity.Name);
    }
}
