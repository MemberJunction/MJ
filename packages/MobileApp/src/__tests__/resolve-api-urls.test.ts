import { describe, it, expect } from 'vitest';
import { DeriveWsUrl, DevFallbackGraphqlUrl, ResolveApiUrls } from '@/config/resolve-api-urls';

const dev = { Platform: 'ios', IsDev: true };
const release = { Platform: 'ios', IsDev: false };

describe('ResolveApiUrls', () => {
    describe('explicit EXPO_PUBLIC_MJ_GRAPHQL_URL', () => {
        it('is used as-is and derives wss:// from https://', () => {
            expect(ResolveApiUrls({ ...release, GraphqlUrl: 'https://api.example.com/graphql' })).toEqual({
                GraphqlUrl: 'https://api.example.com/graphql',
                GraphqlWsUrl: 'wss://api.example.com/graphql',
            });
        });

        it('prefers an explicit EXPO_PUBLIC_MJ_WS_URL over derivation', () => {
            const r = ResolveApiUrls({ ...release, GraphqlUrl: 'https://api.example.com/graphql', WsUrl: 'wss://ws.example.com/graphql' });
            expect(r.GraphqlWsUrl).toBe('wss://ws.example.com/graphql');
        });

        it('allows http:// in a dev build (LAN / tunnel testing)', () => {
            const r = ResolveApiUrls({ ...dev, GraphqlUrl: 'http://192.168.1.20:4000/graphql' });
            expect(r.GraphqlWsUrl).toBe('ws://192.168.1.20:4000/graphql');
        });

        it('rejects a non-https URL in a release build', () => {
            expect(() => ResolveApiUrls({ ...release, GraphqlUrl: 'http://api.example.com/graphql' })).toThrow(/https:\/\//);
        });

        it('treats a blank value as unset', () => {
            expect(ResolveApiUrls({ ...dev, GraphqlUrl: '   ' }).GraphqlUrl).toBe('http://localhost:4000/graphql');
        });
    });

    describe('no explicit URL', () => {
        it('falls back to localhost:4000 on iOS in dev', () => {
            expect(ResolveApiUrls(dev)).toEqual({
                GraphqlUrl: 'http://localhost:4000/graphql',
                GraphqlWsUrl: 'ws://localhost:4000/graphql',
            });
        });

        it('uses the emulator host alias on Android in dev', () => {
            expect(ResolveApiUrls({ Platform: 'android', IsDev: true }).GraphqlUrl).toBe('http://10.0.2.2:4000/graphql');
        });

        it('honours EXPO_PUBLIC_MJ_API_HOST and _PORT in dev', () => {
            expect(ResolveApiUrls({ ...dev, ApiHost: '192.168.1.20', ApiPort: '4001' }).GraphqlUrl).toBe('http://192.168.1.20:4001/graphql');
        });

        it('throws in a release build instead of silently targeting localhost', () => {
            expect(() => ResolveApiUrls(release)).toThrow(/EXPO_PUBLIC_MJ_GRAPHQL_URL is not set/);
        });
    });
});

describe('helpers', () => {
    it('DeriveWsUrl maps both schemes and leaves others alone', () => {
        expect(DeriveWsUrl('https://a/graphql')).toBe('wss://a/graphql');
        expect(DeriveWsUrl('http://a/graphql')).toBe('ws://a/graphql');
        expect(DeriveWsUrl('wss://a/graphql')).toBe('wss://a/graphql');
    });

    it('DevFallbackGraphqlUrl defaults per platform', () => {
        expect(DevFallbackGraphqlUrl('ios')).toBe('http://localhost:4000/graphql');
        expect(DevFallbackGraphqlUrl('android')).toBe('http://10.0.2.2:4000/graphql');
    });
});
