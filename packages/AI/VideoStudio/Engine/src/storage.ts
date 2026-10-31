/**
 * @fileoverview Shared file storage helper for MemberJunction Video Studio Engine.
 *
 * @module @memberjunction/video-studio
 */

import { randomUUID } from 'node:crypto';
import { IMetadataProvider, IRunViewProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID } from '@memberjunction/global';
import { FileStorageEngine, StorageFileLocation } from '@memberjunction/storage';

/**
 * Prefix applied to ephemeral in-process file identifiers minted when no
 * `FileStorageAccount` resolves during a run (Plan §11.2, §14).
 */
export const INLINE_EPHEMERAL_FILE_PREFIX = 'inline:' as const;

const MAX_EPHEMERAL_FILES = 256;

/**
 * Metadata and content stored in the bounded in-process ephemeral file store.
 */
export interface EphemeralFileEntry {
    /** Raw file content bytes. */
    Bytes: Buffer;
    /** Optional MIME type recorded when the file was stored. */
    ContentType?: string;
    /** Optional file name recorded when the file was stored. */
    FileName?: string;
}

const ephemeralFiles = new Map<string, EphemeralFileEntry>();

/**
 * Returns `true` when `fileId` is a valid in-process ephemeral file identifier (`inline:<uuid>`).
 */
export function IsEphemeralFileID(fileId: unknown): fileId is string {
    if (typeof fileId !== 'string') {
        return false;
    }
    const trimmed = fileId.trim();
    if (!trimmed.startsWith(INLINE_EPHEMERAL_FILE_PREFIX)) {
        return false;
    }
    const uuidPart = trimmed.slice(INLINE_EPHEMERAL_FILE_PREFIX.length);
    return IsValidUUID(uuidPart);
}

/**
 * Stores a file buffer in the bounded in-process ephemeral store when no persistent
 * `FileStorageAccount` resolves, returning an `inline:<uuid>` identifier that can be
 * read by downstream stages (`Render`, `Critic`) within the same process.
 */
export function StoreEphemeralFile(
    content: Buffer,
    contentType?: string,
    fileName?: string,
): string {
    if (ephemeralFiles.size >= MAX_EPHEMERAL_FILES) {
        const oldestKey = ephemeralFiles.keys().next().value;
        if (oldestKey !== undefined) {
            ephemeralFiles.delete(oldestKey);
        }
    }
    const id = `${INLINE_EPHEMERAL_FILE_PREFIX}${randomUUID()}`;
    const trimmedType = typeof contentType === 'string' && contentType.trim().length > 0
        ? contentType.trim()
        : undefined;
    const trimmedName = typeof fileName === 'string' && fileName.trim().length > 0
        ? fileName.trim()
        : undefined;
    ephemeralFiles.set(id, {
        Bytes: Buffer.from(content),
        ...(trimmedType ? { ContentType: trimmedType } : {}),
        ...(trimmedName ? { FileName: trimmedName } : {}),
    });
    return id;
}

/**
 * Returns the optional `ContentType` and `FileName` for an in-process ephemeral file if still in memory.
 */
export function GetEphemeralFileMetadata(
    fileId: string,
): { ContentType?: string; FileName?: string } | undefined {
    const entry = ephemeralFiles.get(fileId.trim());
    if (!entry) {
        return undefined;
    }
    return {
        ...(entry.ContentType ? { ContentType: entry.ContentType } : {}),
        ...(entry.FileName ? { FileName: entry.FileName } : {}),
    };
}

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

/**
 * Result returned by {@link ReadStoredFileWithType}.
 */
export interface StoredFileWithType {
    /** Raw file content bytes. */
    Bytes: Buffer;
    /** Non-empty MIME type from `MJ: Files.ContentType`, when present on the record. */
    ContentType?: string;
}

type StoredFileLocationRow = StorageFileLocation & {
    ContentType?: string | null;
};

/**
 * Loads an `MJ: Files` row (including `ContentType`) as `contextUser` and reads its bytes
 * through `FileStorageEngine.ResolveFileObject(..., 'Read')` and `Driver.GetObject`, or reads
 * from the in-process ephemeral store when `fileId` has the `inline:` prefix.
 *
 * Throws when `fileId` is not a valid UUID (or `inline:<uuid>`), when the `MJ: Files` row is
 * missing or denied, when no storage account resolves for the provider, or when storage access
 * is refused.
 *
 * @param fileId - The `MJ: Files` record ID or `inline:<uuid>` ephemeral ID to read.
 * @param contextUser - The caller whose entity and storage permissions govern the read.
 * @param provider - Optional metadata provider override.
 * @returns The file content `Buffer` and optional `ContentType` from `MJ: Files.ContentType`.
 */
export async function ReadStoredFileWithType(
    fileId: string,
    contextUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<StoredFileWithType> {
    if (IsEphemeralFileID(fileId)) {
        const ephemeral = ephemeralFiles.get(fileId.trim());
        if (!ephemeral) {
            throw new Error(`Ephemeral inline file not found in memory: ${fileId}`);
        }
        return {
            Bytes: Buffer.from(ephemeral.Bytes),
            ...(ephemeral.ContentType ? { ContentType: ephemeral.ContentType } : {}),
        };
    }
    if (!IsValidUUID(fileId)) {
        throw new Error(`Invalid file ID: ${fileId}`);
    }
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const fileResult = await rv.RunView<StoredFileLocationRow>(
        {
            EntityName: 'MJ: Files',
            ExtraFilter: `ID = '${EscapeSQLString(fileId)}'`,
            Fields: ['ProviderID', 'ProviderKey', 'Name', 'ContentType'],
            ResultType: 'simple',
        },
        contextUser,
    );

    if (!fileResult.Success || fileResult.Results.length === 0) {
        throw new Error(
            fileResult.ErrorMessage
                ? `File not found or denied in MJ: Files (${fileId}): ${fileResult.ErrorMessage}`
                : `File not found in MJ: Files: ${fileId}`,
        );
    }

    const file = fileResult.Results[0];
    const resolved = await FileStorageEngine.Instance.ResolveFileObject(
        file,
        contextUser,
        'Read',
        provider,
    );
    if (!resolved) {
        throw new Error(`No FileStorageAccount found for ProviderID ${file.ProviderID}`);
    }

    const content = await resolved.Driver.GetObject({ fullPath: resolved.ObjectKey });
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const contentType =
        typeof file.ContentType === 'string' && file.ContentType.trim().length > 0
            ? file.ContentType.trim()
            : undefined;
    return {
        Bytes: bytes,
        ...(contentType ? { ContentType: contentType } : {}),
    };
}

/**
 * Loads an `MJ: Files` row as `contextUser` and reads its bytes through
 * `FileStorageEngine.ResolveFileObject(..., 'Read')` and `Driver.GetObject`.
 *
 * Throws when `fileId` is not a valid UUID, when the `MJ: Files` row is missing or denied,
 * when no storage account resolves for the provider, or when storage access is refused.
 *
 * @param fileId - The `MJ: Files` record ID to read.
 * @param contextUser - The caller whose entity and storage permissions govern the read.
 * @param provider - Optional metadata provider override.
 * @returns The file content as a `Buffer`.
 */
export async function ReadStoredFile(
    fileId: string,
    contextUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<Buffer> {
    const stored = await ReadStoredFileWithType(fileId, contextUser, provider);
    return stored.Bytes;
}
