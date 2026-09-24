/**
 * `ExecuteAdhocQuery` runs a raw `SELECT` straight on the read-only pool: no `RunView`, no
 * entity permissions, no row-level security, and therefore no magic-link scope. The
 * confinement a scope-limited session relies on is expressed purely as RLS filter tokens
 * substituted on the entity-read path, so on this path it simply does not exist — a
 * scope-limited principal reaching it would read the whole database.
 *
 * These tests pin the predicate that classifies such principals, and that the resolver
 * consults it before it touches a data source. The resolver itself needs a very heavy mock
 * graph to instantiate (type-graphql decorators, mssql, AppContext, config, providers), so
 * the ordering assertion is a source-shape test — the same hybrid strategy the existing
 * `AdhocQueryResolver.bugs.test.ts` uses for this resolver.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { UserInfo } from '@memberjunction/core';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';

const ADHOC_RESOLVER_PATH = resolve(__dirname, '../resolvers/AdhocQueryResolver.ts');

/** A principal with nothing set — the shape of an ordinary authenticated user. */
function plainUser(): UserInfo {
    const u = new UserInfo();
    u.ID = 'D1F1A0C4-0000-4000-8000-000000000001';
    u.Email = 'user@example.com';
    return u;
}

describe('IsScopeLimitedPrincipal', () => {
    it('does not limit an ordinary authenticated user', () => {
        expect(IsScopeLimitedPrincipal(plainUser())).toBe(false);
    });

    it('limits an anonymous magic-link guest', () => {
        const guest = plainUser();
        guest.IsMagicLinkAnonymous = true;
        expect(IsScopeLimitedPrincipal(guest)).toBe(true);
    });

    it('limits a resource-scoped magic-link session (ResourceID)', () => {
        const scoped = plainUser();
        scoped.MagicLinkScope = { ResourceID: 'A0000000-0000-4000-8000-000000000009' };
        expect(IsScopeLimitedPrincipal(scoped)).toBe(true);
    });

    it('limits a resource-scoped magic-link session carrying only a ResourceType', () => {
        const scoped = plainUser();
        scoped.MagicLinkScope = { ResourceType: 'Dashboards' };
        expect(IsScopeLimitedPrincipal(scoped)).toBe(true);
    });

    it('does NOT limit a session whose scope object is empty', () => {
        // An empty object carries no confinement. Testing the object's truthiness rather
        // than its contents would lock out a session that is not actually scoped.
        const notReallyScoped = plainUser();
        notReallyScoped.MagicLinkScope = {};
        expect(IsScopeLimitedPrincipal(notReallyScoped)).toBe(false);
    });

    it('fails closed when there is no principal at all', () => {
        expect(IsScopeLimitedPrincipal(undefined)).toBe(true);
        expect(IsScopeLimitedPrincipal(null)).toBe(true);
    });
});

describe('AdhocQueryResolver scope guard placement', () => {
    const src = readFileSync(ADHOC_RESOLVER_PATH, 'utf8');

    it('consults IsScopeLimitedPrincipal', () => {
        expect(/\bIsScopeLimitedPrincipal\s*\(/.test(src)).toBe(true);
    });

    it('refuses the principal BEFORE acquiring a data source', () => {
        // Authorization must gate the work, not run alongside it: if the guard landed after
        // the pool were acquired (or the SQL executed), a scope-limited caller would already
        // have reached the database.
        const guardAt = src.indexOf('IsScopeLimitedPrincipal(');
        const dataSourceAt = src.indexOf('GetReadOnlyDataSource(');
        expect(guardAt).toBeGreaterThan(-1);
        expect(dataSourceAt).toBeGreaterThan(-1);
        expect(guardAt).toBeLessThan(dataSourceAt);
    });
});
