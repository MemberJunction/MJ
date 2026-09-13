import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';
import type {
    AttachmentBlobUploadInput,
    AttachmentBlobUploadResult,
    IAttachmentBlobStore,
} from '@memberjunction/aiengine';

/**
 * @fileoverview Browser-side implementation of the conversation-attachment blob seam.
 *
 * The server binds an MJStorage implementation that talks to S3/Azure/Dropbox directly. A browser
 * obviously cannot — and should not — hold those credentials, so it goes through MJAPI instead:
 * `GraphQLFileStorageClient` already exposes exactly the four operations the seam needs, backed by
 * the server's own storage subsystem and the caller's permissions.
 *
 * Binding this is what gives Explorer real large-attachment support. Before the seam existed, the
 * Angular attachment service stored **everything inline** — it never consulted
 * `ConversationUtility.ShouldStoreInline`, so a 5 MB image went into a database column rather than
 * MJStorage, silently contradicting the `MJ: Conversation Detail Attachments` contract that
 * `InlineData` is for small attachments and `FileID` for large ones. That is the concrete cost of
 * having had three implementations of one policy.
 */
export class GraphQLAttachmentBlobStore implements IAttachmentBlobStore {
    /**
     * Uploads bytes through MJAPI's storage subsystem, which creates the `MJ: Files` record.
     *
     * Storage account selection is the server's decision here: a browser has no business choosing
     * a storage backend, and `UploadFile` resolves a default when none is named.
     */
    public async Upload(
        input: AttachmentBlobUploadInput,
        _contextUser: UserInfo,
        _provider?: IMetadataProvider
    ): Promise<AttachmentBlobUploadResult> {
        try {
            const client = new GraphQLFileStorageClient(GraphQLDataProvider.Instance);
            const result = await client.UploadFile({
                FileName: input.FileName,
                Base64Data: input.Base64Data,
                MimeType: input.MimeType,
                AccountID: input.StorageAccountID ?? undefined,
            });
            if (!result?.Success || !result.FileID) {
                return { Success: false, Error: result?.ErrorMessage ?? 'Upload failed.' };
            }
            return { Success: true, FileID: result.FileID };
        } catch (err) {
            return { Success: false, Error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Not supported from the browser.
     *
     * Pulling file bytes through JavaScript only to re-encode them wastes memory and bandwidth for
     * no benefit — {@link GetDownloadUrl} gives the browser something it can hand straight to an
     * `<img>`, a download, or a fetch. Returning `null` makes the service fall back to exactly that.
     */
    public async Download(
        _fileId: string,
        _contextUser: UserInfo,
        _provider?: IMetadataProvider
    ): Promise<string | null> {
        return null;
    }

    /**
     * Not supported from the browser, deliberately.
     *
     * `CreatePreAuthDownloadUrl` is keyed by storage account + object name, not by an `MJ: Files`
     * id, so producing a URL here would mean the client resolving storage internals it should not
     * know about. Explorer already has the right answer for a file id — `mj-storage-media-player`
     * goes through `CreateMediaAccessToken` and the permission-gated, Range-streamed `/media`
     * route — so this returns `null` rather than growing a second, weaker path alongside it.
     */
    public async GetDownloadUrl(
        _fileId: string,
        _contextUser: UserInfo,
        _provider?: IMetadataProvider
    ): Promise<string | null> {
        return null;
    }

    /**
     * Not supported from the browser.
     *
     * Deleting stored bytes is a server-side concern with its own permission and retention rules;
     * a client requesting it directly would bypass them. Returning `false` leaves the attachment
     * row intact rather than orphaning it against content the client could not remove.
     */
    public async Delete(
        _fileId: string,
        _contextUser: UserInfo,
        _provider?: IMetadataProvider
    ): Promise<boolean> {
        return false;
    }
}
