import { UserInfo, IMetadataProvider, LogError } from '@memberjunction/core';
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
/**
 * Mints a short-lived, permission-checked URL for one `MJ: Files` record.
 *
 * The server resolves the storage account and object name behind the token and serves the bytes
 * through its Range-capable `/media` route, so the browser never learns either.
 */
const CreateMediaAccessTokenMutation = `
    mutation CreateMediaAccessToken($fileId: String!) {
        CreateMediaAccessToken(fileId: $fileId) {
            Success
            Url
            MimeType
            ErrorMessage
        }
    }
`;

/** The shape `CreateMediaAccessToken` returns, narrowed once at this boundary. */
type MediaAccessTokenResponse = {
    CreateMediaAccessToken?: {
        Success?: boolean;
        Url?: string | null;
        MimeType?: string | null;
        ErrorMessage?: string | null;
    } | null;
};

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
     * Not supported from the browser, deliberately.
     *
     * Pulling file bytes through JavaScript only to re-encode them as base64 wastes memory and
     * bandwidth for no benefit — {@link GetDownloadUrl} gives the browser something it can hand
     * straight to an `<img>`, a download, or a fetch, and the service falls back to exactly that
     * when this returns `null`. This is the one operation where "not supported" is the better
     * answer rather than a gap.
     */
    public async Download(
        _fileId: string,
        _contextUser: UserInfo,
        _provider?: IMetadataProvider
    ): Promise<string | null> {
        return null;
    }

    /**
     * Mints a permission-gated, time-limited URL for a stored file.
     *
     * Goes through `CreateMediaAccessToken` rather than `CreatePreAuthDownloadUrl`: the latter is
     * keyed by storage account + object name, so using it would mean the client resolving storage
     * internals it has no business knowing. The media route is keyed by `MJ: Files` id, checks the
     * caller's permissions server-side, and Range-streams — it is the same path
     * `mj-storage-media-player` already uses, so this adds a caller rather than a second mechanism.
     *
     * This is what makes the write path readable. Explorer only started producing storage-backed
     * attachments when this seam was bound; without a URL here, every attachment over the inline
     * threshold would upload successfully and then be permanently undisplayable.
     */
    public async GetDownloadUrl(
        fileId: string,
        _contextUser: UserInfo,
        _provider?: IMetadataProvider
    ): Promise<string | null> {
        try {
            const result = (await GraphQLDataProvider.Instance.ExecuteGQL(CreateMediaAccessTokenMutation, {
                fileId,
            })) as MediaAccessTokenResponse;
            const minted = result?.CreateMediaAccessToken;
            if (!minted?.Success || !minted.Url) {
                LogError(
                    `[GraphQLAttachmentBlobStore] Could not mint a media URL for file ${fileId}: ` +
                        `${minted?.ErrorMessage ?? 'no URL returned'}`
                );
                return null;
            }
            return minted.Url;
        } catch (err) {
            LogError(`[GraphQLAttachmentBlobStore] Failed to mint a media URL for file ${fileId}: ${err}`);
            return null;
        }
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
