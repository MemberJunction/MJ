import { describe, it, expect } from 'vitest';
import { DiagnosticSessionManager } from '../sessionManager.js';

describe('download token bundle ID check', () => {
    it('accepts a token minted for an upper-case bundle ID when checked against the lower-case ID', () => {
        const manager = DiagnosticSessionManager.Instance;
        const bundleId = '9F2C4E1A-7B3D-4C5E-8A6F-1D2E3F4A5B6C';
        const token = manager.MintDownloadToken(bundleId, 'user-1');

        const check = manager.VerifyDownloadToken(token, bundleId.toLowerCase());

        expect(check).toEqual({ valid: true, userId: 'user-1' });
    });
});
