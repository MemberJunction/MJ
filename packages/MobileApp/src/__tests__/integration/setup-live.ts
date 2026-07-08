/**
 * Shared setup for the LIVE integration suite.
 *
 * These helpers boot the real MJ GraphQL data provider against a running MJAPI
 * (the same `setupGraphQLClient(new GraphQLProviderConfigData(...))` path the app
 * uses in src/providers/mj-provider.tsx) so the service layer under test routes
 * through the real backend rather than a mock.
 *
 * Auth: a JWT is read from `process.env.MJ_TEST_JWT`. The refresh function simply
 * returns the same token — long-lived enough for a test run; there is no OAuth
 * round-trip here.
 *
 * The whole integration suite is GATED on this token: when `MJ_TEST_JWT` is unset
 * (or the backend is unreachable) tests skip rather than fail, so CI stays green
 * with no backend present. See the README in this directory.
 */

import { Metadata } from '@memberjunction/core';
import { GraphQLProviderConfigData, setupGraphQLClient } from '@memberjunction/graphql-dataprovider';
import { Env } from '@/config/env';

/** True when a test JWT is present in the environment. Used to gate `describe.skipIf`. */
export function hasToken(): boolean {
    return !!process.env.MJ_TEST_JWT && process.env.MJ_TEST_JWT.trim().length > 0;
}

/** The email of the user the test JWT is expected to authenticate as. */
export const EXPECTED_USER_EMAIL = 'da-robot-tester@bluecypress.io';

/** Memoized boot promise so repeated `initLiveProvider()` calls share one setup. */
let bootPromise: Promise<boolean> | null = null;

/**
 * Boot the real GraphQL provider once for the whole run and resolve when
 * `Metadata` is ready (its provider is set). Idempotent + memoized: every test
 * file can `await initLiveProvider()` in `beforeAll` and share the single setup.
 *
 * @returns `true` when the provider booted and Metadata is ready; `false` when
 *          there is no token (the suite should skip). Throws only if a token IS
 *          present but the backend rejects it / is unreachable — that's a real
 *          failure worth surfacing.
 */
export async function initLiveProvider(): Promise<boolean> {
    if (!hasToken()) return false;
    if (bootPromise) return bootPromise;

    bootPromise = (async () => {
        const token = process.env.MJ_TEST_JWT as string;
        const config = new GraphQLProviderConfigData(
            token,
            Env.graphqlUrl,
            Env.graphqlWsUrl,
            // Refresh function: reuse the same token for the duration of the run.
            async () => token,
        );

        await setupGraphQLClient(config);

        // Metadata shares the provider SetProvider() established inside
        // setupGraphQLClient. Confirm it's wired before any test proceeds.
        if (!Metadata.Provider) {
            throw new Error('Live provider setup completed but Metadata.Provider is not set.');
        }
        return true;
    })();

    return bootPromise;
}

/**
 * Convenience accessor for the booted metadata. Assumes {@link initLiveProvider}
 * has already resolved `true`.
 */
export function md(): Metadata {
    return new Metadata();
}
