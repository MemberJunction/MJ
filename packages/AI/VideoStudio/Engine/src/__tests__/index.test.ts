import { describe, it, expect } from 'vitest';
import { PACKAGE_NAME } from '../index.js';

describe('@memberjunction/video-studio', () => {
    it('exports the canonical package identifier', () => {
        expect(PACKAGE_NAME).toBe('@memberjunction/video-studio');
    });
});
