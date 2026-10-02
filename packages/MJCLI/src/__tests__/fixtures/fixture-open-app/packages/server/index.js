/**
 * Test fixture — the `server` bootstrap package of a fake Open App.
 *
 * Mirrors the shape of a real one (see `@mj-biz-apps/orders-server`): it imports the app's
 * entities package so the generated subclass registers FIRST, then registers a server-side
 * subclass for the same entity so it wins by ClassFactory load-order priority, and exports the
 * `startupExport` named in `mj-app.json` plus the `RESOLVER_PATHS` convention MJAPI reads.
 *
 * The relative import stands in for `import '@mj-fixture/app-entities'` — inside an unbuilt
 * workspace nothing can `require.resolve` the sibling package, which is exactly the situation
 * the loader's on-disk fallback exists for.
 */
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { FixtureWidgetEntity, FIXTURE_ENTITY_NAME } from '../entities/index.js';

/** Server-only subclass, as a real app's `-core-entities-server` package would provide. */
export class FixtureWidgetEntityServer extends FixtureWidgetEntity {
    static get FixtureTier() {
        return 'server';
    }
}

MJGlobal.Instance.ClassFactory.Register(BaseEntity, FixtureWidgetEntityServer, FIXTURE_ENTITY_NAME);

/** The startup export named in mj-app.json — a registration kicker that must never touch a provider. */
export function LoadFixtureAppServer() {
    globalThis.__mjFixtureStartupRuns = (globalThis.__mjFixtureStartupRuns ?? 0) + 1;
}

/** The convention MJAPI's bootstrap reads to glob an app's generated resolvers into the schema. */
export const RESOLVER_PATHS = [];

export { FIXTURE_ENTITY_NAME };
