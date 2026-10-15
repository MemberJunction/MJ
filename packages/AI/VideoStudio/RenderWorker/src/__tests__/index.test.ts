import { describe, it, expect } from 'vitest';
import { PACKAGE_NAME } from '../index.js';

describe('@memberjunction/video-studio-render-worker', () => {
    it('exports the canonical package identifier', () => {
        expect(PACKAGE_NAME).toBe('@memberjunction/video-studio-render-worker');
    });
});
