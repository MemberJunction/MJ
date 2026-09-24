/**
 * Test fixture — the `shared` entities package of a fake Open App.
 *
 * Mirrors what a CodeGen-generated `@mj-biz-apps/<app>-entities` package does: importing it
 * registers a `BaseEntity` subclass for the app's entity with the ClassFactory. It is plain
 * ESM JavaScript (no build step) so the loader can import it straight from the workspace, the
 * way it imports an unpublished workspace member found through `mj-app.json`.
 *
 * `@memberjunction/core` / `@memberjunction/global` resolve from `packages/MJCLI/node_modules`
 * (Node walks up from this file), so the classes registered here are the SAME `BaseEntity` and
 * the SAME ClassFactory the test process uses.
 */
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

/** The entity name the fixture app owns. */
export const FIXTURE_ENTITY_NAME = 'MJ_Fixture: Widgets';

/** Generated-style subclass: the shared (client + server) class for the entity. */
export class FixtureWidgetEntity extends BaseEntity {
    /** Marker so a test can tell which class the ClassFactory resolved. */
    static get FixtureTier() {
        return 'entities';
    }
}

MJGlobal.Instance.ClassFactory.Register(BaseEntity, FixtureWidgetEntity, FIXTURE_ENTITY_NAME);

/** Import-count marker, so a test can prove the module evaluated once. */
globalThis.__mjFixtureEntitiesLoads = (globalThis.__mjFixtureEntitiesLoads ?? 0) + 1;
