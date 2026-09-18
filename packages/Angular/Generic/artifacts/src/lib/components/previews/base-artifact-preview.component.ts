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
     * True until {@link resolveContentUrl} has settled, one way or the other.
     *
     * Owned here, not per subclass, so that every media preview has a loading state by
     * construction. Each preview used to carry its own copy of this flag — or, before that, no
     * loading branch at all, which rendered nothing while the URL resolved and made a generated
     * image read as "never arrived". `resolveContentUrl` is async even for inline content, and
     * for `ContentMode === 'File'` it is a network round trip before the media fetch even starts.
     */
    public isLoading = true;

    /**
     * Resolve a URL to bind to a media element (`<img>`, `<video>`, `<audio>`):
     *   - `ContentMode === 'File'` → fetch a pre-authenticated download URL from MJStorage.
     *   - otherwise (`'Text'`)     → `Content` is already a `data:<mime>;base64,…` URI; bind directly.
     *
     * Returns `null` when there is no usable content (caller should show its own empty/error state).
     * Clears {@link isLoading} on every exit, including a throw, so a subclass cannot leave the
     * indicator spinning beside an error.
     */
    protected async resolveContentUrl(): Promise<string | null> {
        try {
            return await this.resolveContentUrlCore();
        } finally {
            this.isLoading = false;
        }
    }

    private async resolveContentUrlCore(): Promise<string | null> {
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
