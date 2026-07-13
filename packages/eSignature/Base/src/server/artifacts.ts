import { IMetadataProvider, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import {
    ArtifactMetadataEngine,
    MJArtifactEntity,
    MJArtifactVersionEntity,
    MJEnvironmentEntityExtended,
    MJFileEntity,
} from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { SignatureDocumentInput } from '../types';

/**
 * Artifact <-> eSignature glue. Two server-side flows:
 *   - {@link loadArtifactVersionBytes}: read the bytes of an existing Artifact Version so a caller
 *     can send a document already in MJ for signature (instead of re-uploading base64).
 *   - {@link writeSignedArtifact}: persist a downloaded, executed PDF back into the Artifacts
 *     subsystem as a new Artifact + Version, so the signed document is first-class (agents,
 *     viewers, downstream automation can consume it).
 *
 * Both use @memberjunction/storage for the File-mode byte transfer — the same path the file
 * resolvers use — so there's no bespoke storage handling here.
 */

/** Outcome of writing a signed document back to the Artifacts subsystem. */
export interface WriteSignedArtifactResult {
    /** New Artifact created to hold the signed document. */
    artifactId: string;
    /** New Artifact Version holding the signed PDF bytes. */
    artifactVersionId: string;
    /** Backing File row. */
    fileId: string;
}

/**
 * Resolve the raw bytes of an Artifact Version. Supports both content modes:
 *   - `Text`  — bytes come from the inline `Content` column.
 *   - `File`  — bytes are fetched from the backing storage provider via the File's ProviderKey.
 * Returns null if the version can't be loaded or yields no content.
 */
export async function loadArtifactVersionBytes(
    artifactVersionId: string,
    contextUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<SignatureDocumentInput | null> {
    const md = provider ?? Metadata.Provider;
    const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', contextUser);
    if (!(await version.Load(artifactVersionId))) {
        return null;
    }

    const filename = version.FileName || version.Name || `${artifactVersionId}.bin`;
    const contentType = version.MimeType || 'application/octet-stream';

    if (version.ContentMode === 'Text') {
        if (version.Content == null) {
            return null;
        }
        return { bytes: Buffer.from(version.Content, 'utf8'), filename, contentType };
    }

    // File mode — pull the bytes from storage.
    if (!version.FileID) {
        return null;
    }
    const bytes = await readFileBytes(version.FileID, contextUser, provider);
    return bytes ? { bytes, filename, contentType } : null;
}

/** Read a File row's bytes from its storage provider. Null if the file/account can't be resolved. */
async function readFileBytes(fileId: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<Buffer | null> {
    const md = provider ?? Metadata.Provider;
    const file = await md.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
    if (!(await file.Load(fileId))) {
        return null;
    }

    await FileStorageEngine.Instance.Config(false, contextUser, provider);
    const accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
    if (accounts.length === 0) {
        LogStatus(`[eSignature] No storage account for provider '${file.ProviderID}'; cannot read file '${fileId}'.`);
        return null;
    }

    const driver = await FileStorageEngine.Instance.GetDriver(accounts[0].ID, contextUser);
    return driver.GetObject({ fullPath: file.ProviderKey ?? file.Name });
}

/**
 * Write an executed document back into the Artifacts subsystem as a new Artifact + Version.
 * Returns null (and logs) when no File Storage Account is configured — callers treat this as a
 * soft failure so a successful download is never lost just because artifact storage isn't set up.
 */
export async function writeSignedArtifact(
    options: {
        filename: string;
        bytes: Buffer;
        contentType: string;
        /** Names the new Artifact; defaults to the filename. */
        title?: string;
        contextUser: UserInfo;
        provider?: IMetadataProvider;
    },
): Promise<WriteSignedArtifactResult | null> {
    const { filename, bytes, contentType, contextUser, provider } = options;
    const md = provider ?? Metadata.Provider;

    await FileStorageEngine.Instance.Config(false, contextUser, provider);
    if (!FileStorageEngine.Instance.ResolveStorageAccount()) {
        LogStatus('[eSignature] No File Storage Account configured; skipping signed-document artifact write-back.');
        return null;
    }

    const upload = await FileStorageEngine.Instance.UploadFile({
        content: bytes,
        fileName: filename,
        mimeType: contentType,
        contextUser,
        provider,
    });

    const artifact = await createArtifact(options.title ?? filename, contentType, filename, contextUser, provider);
    const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', contextUser);
    version.ArtifactID = artifact.ID;
    version.VersionNumber = 1;
    version.ContentMode = 'File';
    version.FileID = upload.FileID;
    version.MimeType = contentType;
    version.FileName = filename;
    version.ContentSizeBytes = bytes.length;
    version.UserID = contextUser.ID;
    if (!(await version.Save())) {
        throw new Error(`writeSignedArtifact: failed to save Artifact Version: ${version.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    return { artifactId: artifact.ID, artifactVersionId: version.ID, fileId: upload.FileID };
}

/** Create the parent Artifact row, typed from the document MIME (falls back to Generic Binary). */
async function createArtifact(
    name: string,
    contentType: string,
    filename: string,
    contextUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<MJArtifactEntity> {
    const md = provider ?? Metadata.Provider;
    const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', contextUser);
    artifact.Name = name;
    artifact.TypeID = await resolveArtifactTypeId(contentType, filename, contextUser, provider);
    artifact.EnvironmentID = MJEnvironmentEntityExtended.DefaultEnvironmentID;
    artifact.UserID = contextUser.ID;
    if (!(await artifact.Save())) {
        throw new Error(`writeSignedArtifact: failed to save Artifact: ${artifact.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return artifact;
}

/** Resolve an Artifact Type for the document, preferring a MIME match, then a Generic Binary fallback. */
async function resolveArtifactTypeId(
    contentType: string,
    filename: string,
    contextUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<string> {
    await ArtifactMetadataEngine.Instance.Config(false, contextUser, provider);
    const ext = filename.split('.').pop();
    const byMime = ArtifactMetadataEngine.Instance.GetArtifactTypeByMimeType(contentType, ext);
    const fallback = ArtifactMetadataEngine.Instance.FindArtifactType('Generic Binary');
    const type = byMime ?? fallback;
    if (!type) {
        throw new Error("writeSignedArtifact: no Artifact Type resolved (neither a MIME match nor 'Generic Binary').");
    }
    return type.ID;
}
