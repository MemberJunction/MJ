/**
 * Inside MJAPI an API key in the URL query string is refused: URLs land in proxy and access logs,
 * and the MCP spec forbids credentials in the query string. The standalone server keeps accepting
 * it for existing clients.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage } from 'http';

vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: () => ({ IsValidAPIKeyFormat: () => false }),
}));

import { ExtractCredentials } from '../auth/AuthGate.js';

function requestWith(url: string, headers: Record<string, string> = {}): IncomingMessage {
    return { url, headers: { host: 'example.test', ...headers } } as unknown as IncomingMessage;
}

describe('ExtractCredentials query-string API keys', () => {
    it('reads apiKey from the query string by default (standalone back-compat)', () => {
        const creds = ExtractCredentials(requestWith('/mcp?apiKey=mj_sk_abc'));
        expect(creds).toMatchObject({ apiKey: 'mj_sk_abc', apiKeySource: 'query' });
    });

    it('ignores apiKey and api_key in the query string when query keys are disabled', () => {
        expect(ExtractCredentials(requestWith('/mcp?apiKey=mj_sk_abc'), { AllowQueryStringApiKey: false }).apiKey).toBeUndefined();
        expect(ExtractCredentials(requestWith('/mcp?api_key=mj_sk_abc'), { AllowQueryStringApiKey: false }).apiKey).toBeUndefined();
    });

    it('still reads header keys when query keys are disabled', () => {
        const creds = ExtractCredentials(requestWith('/mcp', { 'x-api-key': 'mj_sk_hdr' }), { AllowQueryStringApiKey: false });
        expect(creds).toMatchObject({ apiKey: 'mj_sk_hdr', apiKeySource: 'x-api-key' });
    });
});
