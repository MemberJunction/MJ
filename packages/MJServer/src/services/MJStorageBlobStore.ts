import { LogError, UserInfo, IMetadataProvider, Metadata } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import type { MJFileEntity, MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import { FileStorageBase, FileStorageEngine } from '@memberjunction/storage';
import type {
    AttachmentBlobUploadInput,
    AttachmentBlobUploadResult,
    IAttachmentBlobStore,
} from '@memberjunction/aiengine';

/**
 * @fileoverview MJStorage-backed implementation of the conversation-attachment blob seam.
 *
 * This is where `@memberjunction/storage` — and with it the AWS, Azure and Dropbox SDKs — now
 * lives, instead of inside `@memberjunction/aiengine`. That single import previously made the
 * whole attachment service server-only: no browser or React Native client could consume it, which
 * is why the same attachment rules ended up reimplemented three times across the estate.
 *
 * The bodies here are the ones lifted out of `ConversationAttachmentService`, unchanged in
 * behaviour. Only two things differ, both forced by the seam being runtime-neutral:
 *
 *  - content crosses as **base64**, not `Buffer`;
 *  - account-versus-provider resolution is this implementation's business, because only it knows
 *    how its credentials work.
 */
export class MJStorageBlobStore implements IAttachmentBlobStore {
    /**
     * Uploads bytes and creates the `MJ: Files` record.
     *
     * Prefers account-scoped upload through `FileStorageEngine` when an account id is supplied —
     * that path handles OAuth credentials properly. Falls back to provider-only resolution, which
     * relies on environment configuration and has no account credentials.
     */
    public async Upload(
        input: AttachmentBlobUploadInput,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<AttachmentBlobUploadResult> {
        const md = provider ?? Metadata.Provider;

        if (input.StorageAccountID) {
            try {
                await FileStorageEngine.Instance.Config(false, contextUser);
                const result = await FileStorageEngine.Instance.UploadFile({
                    content: Buffer.from(input.Base64Data, 'base64'),
                    fileName: input.FileName,
                    mimeType: input.MimeType,
                    contextUser,
                    storageAccountId: input.StorageAccountID,
                    provider: md,
                    pathPrefix: input.PathPrefix ?? undefined,
                });
                return { Success: true, FileID: result.FileID };
            } catch (err) {
                return { Success: false, Error: (err as Error).message };
            }
        }

        if (!input.StorageProviderID) {
            return { Success: false, Error: 'No storage provider configured for attachments' };
        }

        const storageProviderEntity = await md.GetEntityObject<MJFileStorageProviderEntity>(
            'MJ: File Storage Providers',
            contextUser
        );
        if (!(await storageProviderEntity.Load(input.StorageProviderID))) {
            return { Success: false, Error: 'Failed to load storage provider' };
        }

        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
            FileStorageBase,
            storageProviderEntity.ServerDriverKey
        );

        const objectName = `${input.PathPrefix ?? 'conversation-attachments'}/${input.FileName}`;
        const uploaded = await driver.PutObject(objectName, Buffer.from(input.Base64Data, 'base64'), input.MimeType);
        if (!uploaded) {
            return { Success: false, Error: 'Failed to upload file to storage' };
        }

        const file = await md.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
        file.NewRecord();
        file.Name = input.FileName;
        file.ProviderID = input.StorageProviderID;
        file.ContentType = input.MimeType;
        file.ProviderKey = objectName;
        file.Status = 'Uploaded';
        if (!(await file.Save())) {
            // The bytes are already in the bucket and nothing will ever point at them, so remove
            // them before reporting the failure. Without this compensation an RLS rejection or a
            // transient SQL error leaves a permanently orphaned object with no catalog row — the
            // failure mode this seam's contract calls out by name.
            const compensated = await driver.DeleteObject(objectName);
            if (!compensated) {
                LogError(
                    `[MJStorageBlobStore] Orphaned object '${objectName}': the MJ: Files row failed to save ` +
                        `and the compensating delete also failed.`
                );
            }
            return {
                Success: false,
                Error: file.LatestResult?.CompleteMessage ?? 'Failed to create the file record',
            };
        }
        return { Success: true, FileID: file.ID };
    }

    /** @inheritdoc */
    public async Download(
        fileId: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<string | null> {
        try {
            const resolved = await this.resolveFileAndDriver(fileId, contextUser, provider);
            if (!resolved) return null;

            const content = await resolved.driver.GetObject({ fullPath: resolved.objectKey });
            // The seam is base64 so it stays runtime-neutral; the Buffer never leaves this file.
            return content ? content.toString('base64') : null;
        } catch (err) {
            LogError(`[MJStorageBlobStore] Failed to download file ${fileId}: ${err}`);
            return null;
        }
    }

    /** @inheritdoc */
    public async GetDownloadUrl(
        fileId: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<string | null> {
        try {
            const resolved = await this.resolveFileAndDriver(fileId, contextUser, provider);
            if (!resolved) return null;
            return resolved.driver.CreatePreAuthDownloadUrl(resolved.objectKey);
        } catch (err) {
            LogError(`[MJStorageBlobStore] Failed to create download URL for ${fileId}: ${err}`);
            return null;
        }
    }

    /** @inheritdoc */
    public async Delete(
        fileId: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<boolean> {
        try {
            const resolved = await this.resolveFileAndDriver(fileId, contextUser, provider);
            if (!resolved) return false;

            const deleted = await resolved.driver.DeleteObject(resolved.objectKey);
            // Only remove the catalog row once the bytes are gone — a row without content is
            // recoverable, content without a row is orphaned storage nobody will find again.
            if (deleted) {
                await resolved.file.Delete();
            }
            return deleted;
        } catch (err) {
            LogError(`[MJStorageBlobStore] Failed to delete file ${fileId}: ${err}`);
            return false;
        }
    }

    /**
     * Loads a file, its storage provider, and a driver able to act on it.
     *
     * Shared by download, URL and delete, which previously repeated this block three times with
     * subtly different fallbacks — the account-credential path existed in only one of them.
     */
    private async resolveFileAndDriver(
        fileId: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<{ file: MJFileEntity; driver: FileStorageBase; objectKey: string } | null> {
        const md = provider ?? Metadata.Provider;

        // Load the engine before asking it anything. `Accounts` returns an empty array when it has
        // not been configured, so on a cold process the account-credential branch below would be
        // skipped silently and the driver would fall back to environment-only credentials — which
        // then fails to read a file that is perfectly readable. Every other MJServer call site
        // configures immediately before use for the same reason.
        await FileStorageEngine.Instance.Config(false, contextUser);

        const file = await md.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
        if (!(await file.Load(fileId))) return null;

        const storageProvider = await md.GetEntityObject<MJFileStorageProviderEntity>(
            'MJ: File Storage Providers',
            contextUser
        );
        if (!(await storageProvider.Load(file.ProviderID))) return null;

        // Prefer account-scoped credentials when an account links to this provider; fall back to
        // environment-configured credentials otherwise.
        const matchingAccounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
        const driver =
            matchingAccounts.length > 0
                ? await FileStorageEngine.Instance.GetDriver(matchingAccounts[0].ID, contextUser)
                : MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
                      FileStorageBase,
                      storageProvider.ServerDriverKey
                  );

        return { file, driver, objectKey: file.ProviderKey || file.Name };
    }
}
