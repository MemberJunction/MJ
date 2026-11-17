import { describe, it, expect } from 'vitest';
import { IsAzureADIssuer } from '../auth/ProtectedResourceMetadata.js';

describe('IsAzureADIssuer (CodeQL js/incomplete-url-substring-sanitization)', () => {
    it('accepts Azure AD issuer hosts', () => {
        expect(IsAzureADIssuer('https://login.microsoftonline.com/tenant-id/v2.0')).toBe(true);
        expect(IsAzureADIssuer('https://sts.windows.net/tenant-id/')).toBe(true);
    });

    it('rejects the domain appearing outside the hostname', () => {
        expect(IsAzureADIssuer('https://auth.example.com/microsoftonline.com')).toBe(false);
        expect(IsAzureADIssuer('https://microsoftonline.com.example.com/')).toBe(false);
        expect(IsAzureADIssuer('https://example.auth0.com/?sts.windows.net')).toBe(false);
    });

    it('rejects an unparseable issuer', () => {
        expect(IsAzureADIssuer('login.microsoftonline.com')).toBe(false);
    });
});
