import { describe, it, expect } from 'vitest';
import type { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import {
    ClassifyJoinUrl,
    ResolveProviderFromJoinUrl,
    JoinUrlPlatform,
} from '../join-url-resolver';

/** Builds a minimal provider row with just the fields the resolver reads. */
function provider(
    name: string,
    status: 'Active' | 'Disabled' = 'Active',
): MJAIBridgeProviderEntity {
    return { ID: `id-${name}`, Name: name, Status: status } as unknown as MJAIBridgeProviderEntity;
}

describe('ClassifyJoinUrl — platform classification by hostname', () => {
    const cases: ReadonlyArray<[string, JoinUrlPlatform]> = [
        ['https://us02web.zoom.us/j/8675309?pwd=abc', 'Zoom'],
        ['https://example.zoomgov.com/j/123', 'Zoom'],
        ['https://teams.microsoft.com/l/meetup-join/19%3ameeting', 'Microsoft Teams'],
        ['https://teams.live.com/meet/9999', 'Microsoft Teams'],
        ['https://meet.google.com/abc-defg-hij', 'Google Meet'],
        ['https://acme.webex.com/meet/room', 'Cisco Webex'],
        ['https://app.slack.com/huddle/T123/C456', 'Slack'],
        ['https://discord.com/channels/1/2', 'Discord'],
        ['https://discord.gg/invite', 'Discord'],
        ['https://v.ringcentral.com/join/123', 'RingCentral'],
        ['https://meet.rcv.io/abc', 'RingCentral'],
        ['https://www.goto.com/meeting/123', 'GoTo Meeting'],
        ['https://global.gotomeeting.com/join/123', 'GoTo Meeting'],
        ['https://acme.bluejeans.com/123', 'BlueJeans'],
    ];

    it.each(cases)('classifies %s as %s', (url, expected) => {
        expect(ClassifyJoinUrl(url)).toBe(expected);
    });

    it('parses a scheme-less URL (bare host)', () => {
        expect(ClassifyJoinUrl('zoom.us/j/123')).toBe('Zoom');
    });

    it('returns null for an unrecognised host', () => {
        expect(ClassifyJoinUrl('https://meet.unknown-platform.io/x')).toBeNull();
    });

    it('returns null for empty / whitespace / malformed input', () => {
        expect(ClassifyJoinUrl('')).toBeNull();
        expect(ClassifyJoinUrl('   ')).toBeNull();
        expect(ClassifyJoinUrl('not a url at all %%%')).toBeNull();
    });

    it('does NOT match a deceptive subdomain attack (zoom.us.attacker.com)', () => {
        expect(ClassifyJoinUrl('https://zoom.us.attacker.com/j/123')).toBeNull();
    });

    it('does NOT match a known token only in the path', () => {
        expect(ClassifyJoinUrl('https://evil.com/zoom.us/j/123')).toBeNull();
    });
});

describe('ResolveProviderFromJoinUrl — URL → active provider', () => {
    const providers = [
        provider('Zoom'),
        provider('Microsoft Teams'),
        provider('Google Meet'),
        provider('Cisco Webex', 'Disabled'),
    ];

    it('resolves to the matching active provider (case-insensitive name match)', () => {
        const p = ResolveProviderFromJoinUrl('https://us02web.zoom.us/j/1', providers);
        expect(p?.Name).toBe('Zoom');
    });

    it('resolves Teams', () => {
        const p = ResolveProviderFromJoinUrl('https://teams.microsoft.com/l/meetup-join/x', providers);
        expect(p?.Name).toBe('Microsoft Teams');
    });

    it('returns null when the URL is unrecognised', () => {
        expect(ResolveProviderFromJoinUrl('https://meet.unknown.io/x', providers)).toBeNull();
    });

    it('returns null when the platform is known but no ACTIVE provider is configured', () => {
        // Webex provider exists but is Disabled → no active match.
        expect(ResolveProviderFromJoinUrl('https://acme.webex.com/meet/r', providers)).toBeNull();
    });

    it('returns null when the platform is known but no provider row exists at all', () => {
        // Google Meet URL against a provider set lacking Google Meet.
        const onlyZoom = [provider('Zoom')];
        expect(ResolveProviderFromJoinUrl('https://meet.google.com/abc', onlyZoom)).toBeNull();
    });

    it('returns null on empty url', () => {
        expect(ResolveProviderFromJoinUrl('', providers)).toBeNull();
    });
});
