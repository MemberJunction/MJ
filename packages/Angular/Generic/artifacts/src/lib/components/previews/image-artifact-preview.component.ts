import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { BaseArtifactPreviewComponent } from './base-artifact-preview.component';

/**
 * Inline preview for image artifacts. Renders a single contained `<img>` (max 280px tall) inside
 * the conversation message card. Read-only — no toolbar, no zoom, no download. Clicking it bubbles
 * up through the card's clickable wrapper to open the full-size image viewer.
 */
@Component({
    standalone: false,
    selector: 'mj-image-artifact-preview',
    template: `
        @if (errorMessage) {
            <div class="image-preview image-preview--error">
                <i class="fa-solid fa-image"></i>
                <span>{{ errorMessage }}</span>
            </div>
        } @else if (imageUrl) {
            <img
                class="image-preview__img"
                [src]="imageUrl"
                [alt]="altText"
                (error)="onImageError()"
            />
        }
    `,
    styles: [
        `
            :host {
                display: block;
            }

            .image-preview__img {
                display: block;
                max-width: 100%;
                max-height: 280px;
                width: auto;
                height: auto;
                object-fit: contain;
                border-radius: 6px;
                background: var(--mj-bg-surface-sunken);
            }

            .image-preview--error {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                color: var(--mj-text-muted);
                font-size: 13px;
            }
        `,
    ],
})
export class ImageArtifactPreviewComponent extends BaseArtifactPreviewComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);

    /** Resolved URL bound to `<img src>` — data URI (inline) or pre-auth URL (file). */
    public imageUrl = '';

    /** Non-empty hides the image and shows a compact error line. */
    public errorMessage = '';

    /** Accessible alt text — prefers a descriptive name over a raw filename. */
    public get altText(): string {
        return this.artifactVersion?.Name || this.artifactVersion?.FileName || 'Image artifact';
    }

    async ngOnInit(): Promise<void> {
        try {
            const url = await this.resolveContentUrl();
            if (url) {
                this.imageUrl = url;
            } else {
                this.errorMessage = 'No image content.';
            }
        } catch {
            this.errorMessage = 'Could not load image.';
        }
        this.cdr.markForCheck();
    }

    public onImageError(): void {
        this.errorMessage = 'Image could not be displayed.';
        this.imageUrl = '';
        this.cdr.markForCheck();
    }
}
