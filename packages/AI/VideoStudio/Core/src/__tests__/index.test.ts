import { describe, it, expect } from 'vitest';
import { VIDEO_STUDIO_SPEC_VERSION } from '../index.js';

describe('@memberjunction/video-studio-core', () => {
    it('exports the canonical VideoGenerationSpec schema version', () => {
        expect(VIDEO_STUDIO_SPEC_VERSION).toBe('1.0');
    });
});
