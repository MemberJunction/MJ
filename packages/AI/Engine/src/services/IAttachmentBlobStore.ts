import { UserInfo, IMetadataProvider } from '@memberjunction/core';

/**
 * @fileoverview The blob seam for conversation attachments.
 *
 * ## Why this exists
 *
 * `ConversationAttachmentService` is 859 lines of attachment *policy* — limit validation, the
 * inline-vs-storage threshold decision, modality resolution, thumbnails, content URLs for AI
 * consumption. None of that is platform-specific, and none of it needs a storage SDK. But the
 * service imported `@memberjunction/storage` directly for four members, and that package depends
 * on `@aws-sdk/client-s3`, `@azure/storage-blob`, `dropbox` and more. One import made the whole
 * package server-only: bundling it into a React Native or browser client drags every cloud SDK
 * along, and several will not run under Hermes at all.
 *
 * The result was three implementations of the same rules — this service, a 494-line Angular copy
 * in `@memberjunction/ng-conversations`, and a smaller one in the mobile app. Three copies of one
 * policy is how thresholds drift.
 *
 * Putting blob access behind this interface leaves the policy in one place and makes the *storage*
 * pluggable: the server binds an MJStorage implementation, a client binds a GraphQL-backed one,
 * and a host that supports only inline attachments binds nothing at all.
 *
 * ## What is NOT yet portable, stated plainly
 *
 * This removes the *storage SDKs* from the attachment service's dependency graph. It does not yet
 * make the containing package importable from a browser or React Native at runtime: this package's
 * entry point also exports `AIEngine`, which imports Node's `crypto` at module scope for an
 * embedding-cache key. A browser bundler cannot resolve that, so an Angular or RN host consumes the
 * *type* from here (`import type`, fully erased) and the placement *policy* from
 * `ConversationUtility` in `@memberjunction/ai-core-plus`, which is browser-safe — while holding its
 * own `IAttachmentBlobStore` implementation rather than reaching through `GetAttachmentService()`.
 *
 * Fixing that one import — or splitting this package's entry points — would let a non-Node host use
 * the shared service itself, not just the shared contract. It belongs to this package's owners
 * rather than to the branch that discovered it.
 *
 * ## Design notes
 *
 * **base64, never `Buffer`.** `Buffer` is a Node global; a base64 string crosses every runtime.
 * This is the same lesson the realtime runtime extraction learned when `Blob` had leaked into
 * session orchestration — the moment a binary type appears in a shared contract, that contract
 * belongs to one platform.
 *
 * **Optional by contract.** A service with no store is a supported configuration, not a broken
 * one. Inline attachments — the common case for an end user, who typically cannot write to
 * MJStorage at all — work without any store bound. Storage-backed operations then report that
 * storage is unavailable on this host rather than failing to import.
 */

/** Input for uploading attachment bytes to blob storage. */
export interface AttachmentBlobUploadInput {
    /** Display filename, used both for the object key and the `MJ: Files` record. */
    FileName: string;
    /** MIME type of the content. */
    MimeType: string;
    /** File contents, base64-encoded. */
    Base64Data: string;
    /**
     * Preferred `MJ: File Storage Accounts` id, when the caller knows one (an agent's
     * `DefaultStorageAccountID`). Implementations that support account-scoped credentials should
     * prefer this path.
     */
    StorageAccountID?: string | null;
    /**
     * Fallback `MJ: File Storage Providers` id, used when no account is available (an agent's
     * `AttachmentStorageProviderID`). Provider-only resolution has no account credentials and
     * relies on environment configuration.
     */
    StorageProviderID?: string | null;
    /** Optional path prefix within the store, for grouping. */
    PathPrefix?: string | null;
}

/** Result of an attachment blob upload. */
export interface AttachmentBlobUploadResult {
    /** Whether the bytes were stored and a `MJ: Files` record created. */
    Success: boolean;
    /** The created `MJ: Files` record id, when successful. */
    FileID?: string;
    /** Why it failed, when it did — surfaced to the caller rather than swallowed. */
    Error?: string;
}

/**
 * Blob operations an attachment needs, behind a seam so attachment policy does not depend on any
 * particular storage implementation — or on there being one.
 *
 * Implementations are responsible for the `MJ: Files` record alongside the bytes, because the two
 * must not diverge: a catalog row without content, or content without a row, is worse than a
 * failed upload.
 */
export interface IAttachmentBlobStore {
    /**
     * Stores bytes and creates the corresponding `MJ: Files` record.
     *
     * @returns The created file id, or a structured failure. Never throws for an expected
     *          condition such as a missing storage configuration.
     */
    Upload(
        input: AttachmentBlobUploadInput,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<AttachmentBlobUploadResult>;

    /**
     * Reads a stored file's content.
     *
     * @returns Base64-encoded content, or `null` when the file or its storage cannot be resolved.
     */
    Download(fileId: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<string | null>;

    /**
     * Mints a pre-authenticated download URL for a stored file.
     *
     * Preferred over {@link Download} when the consumer can fetch the URL itself — it avoids
     * moving the bytes through this process.
     *
     * @returns The URL, or `null` when one cannot be produced.
     */
    GetDownloadUrl(fileId: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<string | null>;

    /**
     * Deletes both the stored bytes and the `MJ: Files` record.
     *
     * @returns `true` when the blob was deleted. A `false` here means the caller should leave the
     *          attachment row alone rather than orphan it.
     */
    Delete(fileId: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<boolean>;
}

/**
 * The error an attachment operation reports when it needs storage and no store is bound.
 *
 * A distinct, recognizable message so a caller can tell "this host does not do storage-backed
 * attachments" apart from "storage is configured but failed" — the first is a deployment shape,
 * the second is an incident.
 */
export const AttachmentBlobStoreUnavailableError =
    'Storage-backed attachments are not available on this host. Only inline attachments are supported.';
