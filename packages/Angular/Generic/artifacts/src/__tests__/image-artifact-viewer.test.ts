import { describe, it, expect } from 'vitest';
import {
    IMAGE_MIME_EXTENSION_MAP,
    buildImageDownloadFileName,
} from '../lib/components/plugins/image-artifact-viewer.component';

/**
 * Unit tests for the pure helpers exported from the image-artifact viewer
 * plugin. The plugin's Angular component itself can't be rendered under the
 * package's `node`-environment vitest config (no DOM, no TestBed), so the
 * tests focus on the deterministic, side-effect-free logic that the component
 * delegates to — exactly the boundary that has historically caused user-visible
 * bugs (filename sanitization, MIME → extension mapping).
 */

describe('IMAGE_MIME_EXTENSION_MAP', () => {
    it('covers the MIMEs that the seed Image artifact type advertises', () => {
        // The metadata seed declares ContentType "image/*". These are the
        // common raster MIMEs that Generate Image and uploaded files produce.
        const required = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        for (const mime of required) {
            expect(IMAGE_MIME_EXTENSION_MAP[mime]).toBeTruthy();
        }
    });

    it('returns the canonical short extension for JPEG (jpg, not jpeg)', () => {
        expect(IMAGE_MIME_EXTENSION_MAP['image/jpeg']).toBe('jpg');
    });

    it('is frozen (read-only) so callers cannot mutate the shared map', () => {
        // Object.freeze guarantees runtime immutability — if a future refactor
        // removes the freeze this test will catch it.
        expect(Object.isFrozen(IMAGE_MIME_EXTENSION_MAP)).toBe(true);
    });
});

describe('buildImageDownloadFileName', () => {
    it('combines a clean name and the right extension', () => {
        expect(buildImageDownloadFileName('mountain', 'image/png')).toBe('mountain.png');
    });

    it('uses jpg for jpeg even when input is uppercase', () => {
        expect(buildImageDownloadFileName('photo', 'IMAGE/JPEG')).toBe('photo.jpg');
    });

    it('strips characters that are unsafe on common filesystems', () => {
        // Spaces, slashes, colons, and emoji should all be normalized to underscores.
        expect(buildImageDownloadFileName('Generated image 1', 'image/jpeg')).toBe('Generated_image_1.jpg');
        expect(buildImageDownloadFileName('a/b:c\\d', 'image/png')).toBe('a_b_c_d.png');
    });

    it('preserves dots, dashes, and underscores (filesystem-safe)', () => {
        expect(buildImageDownloadFileName('snapshot_v2-final.draft', 'image/png')).toBe(
            'snapshot_v2-final.draft.png',
        );
    });

    it('falls back to "image" when no name is supplied', () => {
        expect(buildImageDownloadFileName(null, 'image/png')).toBe('image.png');
        expect(buildImageDownloadFileName(undefined, 'image/webp')).toBe('image.webp');
        expect(buildImageDownloadFileName('', 'image/gif')).toBe('image.gif');
    });

    it('falls back to "img" extension when the MIME type is missing or unknown', () => {
        expect(buildImageDownloadFileName('thing', null)).toBe('thing.img');
        expect(buildImageDownloadFileName('thing', undefined)).toBe('thing.img');
        expect(buildImageDownloadFileName('thing', '')).toBe('thing.img');
        expect(buildImageDownloadFileName('thing', 'application/json')).toBe('thing.img');
    });

    it('does not double-append the extension when the name already has it', () => {
        // The agent sometimes hands us labels like "Generated image 1.png" — we
        // shouldn't end up with "Generated_image_1.png.png" in the user's downloads.
        expect(buildImageDownloadFileName('photo.png', 'image/png')).toBe('photo.png');
        expect(buildImageDownloadFileName('shot.JPG', 'image/jpeg')).toBe('shot.JPG');
    });
});
