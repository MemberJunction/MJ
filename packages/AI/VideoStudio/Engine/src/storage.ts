/**
 * @fileoverview Shared file storage helper for MemberJunction Video Studio Engine.
 *
 * @module @memberjunction/video-studio
 */

import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { FileStorageEngine } from '@memberjunction/storage';

/**
 * Input parameters for {@link StoreFile}.
 */
export interface StoreFileInput {
    /** Raw file bytes to upload. */
    Content: Buffer;
    /** Target file name (e.g., `narration-line-1.mp3` or `captions.vtt`). */
    FileName: string;
    /** MIME type of the uploaded content (e.g., `audio/mpeg` or `text/vtt`). */
    MimeType: string;
    /** Optional provenance or human-readable description stored on the `MJ: Files` row. */
    Description?: string;
    /** Server-side user context governing storage access and entity creation. */
    ContextUser: UserInfo;
    /** Optional `MJ: File Storage Accounts` ID to target; falls back to the engine's default account. */
    StorageAccountID?: string;
    /** Optional metadata provider override for multi-provider environments. */
    Provider?: IMetadataProvider;
}

/**
 * Uploads a buffer to `FileStorageEngine` and returns the created `MJ: Files` ID.
 *
 * Returns `undefined` when no storage accounts are configured or when `Config` / `UploadFile`
 * throws. Never throws so callers can fall back to inline payloads or emit non-fatal warnings.
 */
export async function StoreFile(input: StoreFileInput): Promise<string | undefined> {
    try {
        await FileStorageEngine.Instance.Config(false, input.ContextUser, input.Provider);
        if (!FileStorageEngine.Instance.HasStorageAccounts) {
            return undefined;
        }
        const result = await FileStorageEngine.Instance.UploadFile({
            content: input.Content,
            fileName: input.FileName,
            mimeType: input.MimeType,
            description: input.Description,
            contextUser: input.ContextUser,
            storageAccountId: input.StorageAccountID,
            provider: input.Provider,
        });
        return result.FileID;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`VideoStudio StoreFile failed for "${input.FileName}": ${message}`);
        return undefined;
    }
}
