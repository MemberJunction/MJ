import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

import { IsTeamsWebhookUrl } from '../custom/communication/teams-webhook.action';

describe('IsTeamsWebhookUrl (CodeQL js/incomplete-url-substring-sanitization)', () => {
    it('accepts https URLs on webhook.office.com and its subdomains', () => {
        expect(IsTeamsWebhookUrl('https://contoso.webhook.office.com/webhookb2/abc')).toBe(true);
        expect(IsTeamsWebhookUrl('https://webhook.office.com/webhookb2/abc')).toBe(true);
        expect(IsTeamsWebhookUrl('https://Contoso.Webhook.Office.com/webhookb2/abc')).toBe(true);
    });

    it('rejects the domain appearing outside the hostname', () => {
        expect(IsTeamsWebhookUrl('https://evil.example.com/?webhook.office.com')).toBe(false);
        expect(IsTeamsWebhookUrl('https://evil.example.com/webhook.office.com/x')).toBe(false);
        expect(IsTeamsWebhookUrl('https://webhook.office.com.evil.example.com/x')).toBe(false);
        expect(IsTeamsWebhookUrl('https://notwebhook.office.com/x')).toBe(false);
    });

    it('rejects non-https and unparseable URLs', () => {
        expect(IsTeamsWebhookUrl('http://contoso.webhook.office.com/webhookb2/abc')).toBe(false);
        expect(IsTeamsWebhookUrl('webhook.office.com')).toBe(false);
    });
});
