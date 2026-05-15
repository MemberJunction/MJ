import { BaseEntity, EntitySaveOptions, IMetadataProvider, LogError, LogStatus, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    ArtifactMetadataEngine,
    MJArtifactEntity,
    MJArtifactVersionEntity,
    MJConversationDetailArtifactEntity,
    MJConversationDetailAttachmentEntity,
    buildUnregisteredMimeError,
    decideInlineStorage,
} from '@memberjunction/core-entities';

/**
 * Server-side hook for `MJ: Conversation Detail Attachments` that:
 *
 *   1. Rejects uploads whose MIME type is not registered in the Artifact
 *      Type registry (and whose extension hint also fails to resolve via
 *      the wildcard resolver). Failure surfaces through ValidateAsync so
 *      the client gets a structured error rather than a silent skip.
 *
 *   2. After the attachment row is saved, creates a paired Artifact +
 *      ArtifactVersion (v1) + ConversationDetailArtifact junction so the
 *      attachment participates in the artifact-tool dispatch path. The
 *      attachment's ArtifactVersionID is set as a back-link; the
 *      RunAIAgentResolver uses that link to dedupe between the attachment
 *      and its artifact partner.
 *
 * Both legs run on every NEW save. Updates to an already-paired attachment
 * (ArtifactVersionID already populated) skip the pairing step but still go
 * through validation.
 */
@RegisterClass(BaseEntity, 'MJ: Conversation Detail Attachments')
export class MJConversationDetailAttachmentEntityServer extends MJConversationDetailAttachmentEntity {

    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // Skip the MIME gate for already-saved rows being updated for
        // unrelated reasons (e.g. DisplayOrder reorder, FileID rebind).
        if (!this.IsSaved) {
            const gateError = await this.checkMimeRegistered();
            if (gateError) {
                result.Success = false;
                (result.Errors ??= []).push(gateError);
            }
        }
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isNewSave = !this.IsSaved;
        const saved = await super.Save(options);
        if (!saved) return false;

        // Pair the attachment with an Artifact/Version/junction on creation.
        // Existing rows or rows already linked are skipped.
        if (isNewSave && !this.ArtifactVersionID) {
            try {
                const versionId = await this.createArtifactPair();
                if (versionId) {
                    this.ArtifactVersionID = versionId;
                    if (!(await super.Save(options))) {
                        LogError(`[MJConversationDetailAttachmentEntityServer] failed to backlink attachment ${this.ID} to artifact version ${versionId}: ${this.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    }
                }
            } catch (err) {
                LogError(`[MJConversationDetailAttachmentEntityServer] storage unification failed for attachment ${this.ID}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        return true;
    }

    private async checkMimeRegistered(): Promise<ValidationErrorInfo | null> {
        const mime = this.MimeType ?? '';
        if (!mime) {
            return new ValidationErrorInfo(
                'MimeType',
                'A MIME type is required when uploading an attachment.',
                this.MimeType,
                ValidationErrorType.Failure,
            );
        }

        await ArtifactMetadataEngine.Instance.Config(false, this.ContextCurrentUser);
        const ext = this.FileName?.includes('.') ? this.FileName.split('.').pop() : undefined;
        const artifactType = ArtifactMetadataEngine.Instance.GetArtifactTypeByMimeType(mime, ext);
        if (!artifactType) {
            return new ValidationErrorInfo(
                'MimeType',
                buildUnregisteredMimeError(this.FileName, mime),
                mime,
                ValidationErrorType.Failure,
            );
        }
        return null;
    }

    private async createArtifactPair(): Promise<string | null> {
        const mime = this.MimeType;
        if (!mime) return null;

        await ArtifactMetadataEngine.Instance.Config(false, this.ContextCurrentUser);
        const ext = this.FileName?.includes('.') ? this.FileName.split('.').pop() : undefined;
        const artifactType = ArtifactMetadataEngine.Instance.GetArtifactTypeByMimeType(mime, ext);
        if (!artifactType) {
            // Validation should have caught this. Log and bail rather than panic.
            LogStatus(`[MJConversationDetailAttachmentEntityServer] no artifact type for MIME "${mime}" on attachment ${this.ID}; skipping pair creation.`);
            return null;
        }

        // Use this entity's own provider rather than `new Metadata()` — keeps
        // the artifact pair on the same provider as the originating attachment
        // in multi-provider clients (per @memberjunction/global multi-provider
        // compliance rule).
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const userId = this.ContextCurrentUser?.ID;
        if (!userId) {
            LogError(`[MJConversationDetailAttachmentEntityServer] no context user for attachment ${this.ID}; cannot create artifact.`);
            return null;
        }

        const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', this.ContextCurrentUser);
        artifact.Name = this.FileName || `attachment_${this.ID}`;
        artifact.TypeID = artifactType.ID;
        artifact.UserID = userId;
        artifact.Visibility = 'Always';
        if (!(await artifact.Save())) {
            LogError(`[MJConversationDetailAttachmentEntityServer] failed to save artifact for attachment ${this.ID}: ${artifact.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        }

        const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', this.ContextCurrentUser);
        version.ArtifactID = artifact.ID;
        version.VersionNumber = 1;
        version.MimeType = mime;
        version.FileName = this.FileName ?? null;
        version.ContentSizeBytes = this.FileSizeBytes ?? null;
        version.UserID = userId;
        if (this.FileID) {
            version.ContentMode = 'File';
            version.FileID = this.FileID;
        } else {
            // Single source of truth for the inline-storage decision — pure
            // helper so both upload-path and tests share the same logic.
            const stored = decideInlineStorage(mime, this.InlineData);
            version.ContentMode = stored.contentMode;
            version.Content = stored.content;
        }
        if (!(await version.Save())) {
            LogError(`[MJConversationDetailAttachmentEntityServer] failed to save artifact version for attachment ${this.ID}: ${version.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        }

        const junction = await md.GetEntityObject<MJConversationDetailArtifactEntity>(
            'MJ: Conversation Detail Artifacts',
            this.ContextCurrentUser,
        );
        junction.ConversationDetailID = this.ConversationDetailID;
        junction.ArtifactVersionID = version.ID;
        junction.Direction = 'Input';
        if (!(await junction.Save())) {
            LogError(`[MJConversationDetailAttachmentEntityServer] failed to link artifact ${artifact.ID} to detail ${this.ConversationDetailID}: ${junction.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        return version.ID;
    }
}
