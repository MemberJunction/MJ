import { describe, it, expect } from 'vitest';
import { IsGraphQLWsPath } from '../telephony/media-upgrade-router.js';

describe('IsGraphQLWsPath', () => {
    describe('bare-root default (GRAPHQL_ROOT_PATH unset — the stock-install case)', () => {
        it('accepts an exact match on the bare root', () => {
            expect(IsGraphQLWsPath('/', '/')).toBe(true);
        });

        it('accepts the conventional /graphql suffix as an alias of the bare root', () => {
            // This is the fix: MJExplorer's shipped environment.ts hardcodes
            // GRAPHQL_WS_URI: 'ws://<host>/graphql', which never matched the server's
            // bare-root default before this alias existed — every subscription upgrade
            // was silently rejected (400) on a stock install with no .env overrides.
            expect(IsGraphQLWsPath('/graphql', '/')).toBe(true);
        });

        it('rejects an unrelated path', () => {
            expect(IsGraphQLWsPath('/telephony/twilio/media', '/')).toBe(false);
        });

        it('rejects a path that merely starts with /graphql (no accidental prefix match)', () => {
            expect(IsGraphQLWsPath('/graphql-admin', '/')).toBe(false);
        });
    });

    describe('non-default configured root (custom GRAPHQL_ROOT_PATH — unchanged behavior)', () => {
        it('accepts an exact match on the configured root', () => {
            expect(IsGraphQLWsPath('/api/graphql', '/api/graphql')).toBe(true);
        });

        it('does NOT apply the /graphql alias when the configured root is not the bare root', () => {
            // The alias is scoped to the bare-root default only — a deployment that has
            // deliberately set a custom root keeps requiring an exact match, so this
            // fix can't silently widen what a custom-configured server accepts.
            expect(IsGraphQLWsPath('/graphql', '/api/graphql')).toBe(false);
        });

        it('rejects a mismatched custom path', () => {
            expect(IsGraphQLWsPath('/', '/api/graphql')).toBe(false);
        });
    });
});
