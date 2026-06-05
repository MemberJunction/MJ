import { Component, inject, Input } from '@angular/core';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { IArtifactPreviewComponent } from '../../interfaces/artifact-viewer-plugin.interface';
import { ArtifactFileService } from '../../services/artifact-file.service';

/**
 * Thin abstract base for inline artifact PREVIEW components.
 *
 * Deliberately does NOT extend the heavy {@link BaseArtifactViewerPluginComponent} — previews
 * are lightweight, read-only, and have no toolbar / feedback / tabs / snapshot contract. They
 * render a compact representation of the artifact inside a conversation message card.
 *
 * Content resolution (inline data-URL vs. file-storage download URL) is shared with the full
 * viewers via the injected {@link ArtifactFileService}, so previews and viewers load bytes the
 * same way. Subclasses call {@link resolveContentUrl} in their `ngOnInit`.
 */
@Component({
    standalone: false,
    template: '',
})
export abstract class BaseArtifactPreviewComponent extends BaseAngularComponent implements IArtifactPreviewComponent {
    /** The artifact version to preview. Set by the resolver before the component renders. */
    @Input() artifactVersion!: MJArtifactVersionEntity;

    /** Shared service used by both previews and full viewers to fetch file-mode download URLs. */
    protected readonly fileService = inject(ArtifactFileService);

    /**
     * Resolve a URL to bind to a media element (`<img>`, `<video>`, `<audio>`):
     *   - `ContentMode === 'File'` → fetch a pre-authenticated download URL from MJStorage.
     *   - otherwise (`'Text'`)     → `Content` is already a `data:<mime>;base64,…` URI; bind directly.
     *
     * Returns `null` when there is no usable content (caller should show its own empty/error state).
     */
    protected async resolveContentUrl(): Promise<string | null> {
        const version = this.artifactVersion;
        if (!version?.ID) {
            return null;
        }

        if (version.ContentMode === 'File') {
            return this.fileService.getDownloadUrl(version.ID);
        }

        const content = version.Content;
        return content && content.length > 0 ? content : null;
    }
}
