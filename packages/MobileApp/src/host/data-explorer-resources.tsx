import { RegisterClass } from '@memberjunction/global';
import { BaseMobileResource } from './BaseMobileResource';
import { DashboardList, EntityList, QueryList } from '@/explorer/ExplorerLists';

/**
 * @fileoverview Data Explorer's mobile surfaces, registered by driver class.
 *
 * ## The gap this closes
 *
 * This app has had a native Data Explorer since early on — reachable from Home, with entity
 * browsing, saved queries and dashboards. Opening the same application from **Apps** showed
 * "Queries opens on desktop" instead, because nothing had claimed the driver classes the
 * application's nav metadata names. The capability existed; the wiring did not.
 *
 * ## Why registration rather than a special case in the host
 *
 * `MJ: Applications.DefaultNavItems` declares each item's `DriverClass` — `DataExplorerResource`,
 * `QueryBrowserResource`, `DashboardBrowserResource` — and the web shell resolves those same
 * strings against `BaseResourceComponent`. Resolving them here through `MJGlobal.ClassFactory`
 * means one navigation model with two hosts, and no branch anywhere that says "if this is Data
 * Explorer".
 *
 * It also means a deployment can override any of these: register a subclass at a higher priority
 * for the same driver name and it wins, exactly as it would on the web. Teaching the host to
 * recognise Data Explorer by name would have made that impossible.
 *
 * ## Body only
 *
 * Each `Component` renders a list and no chrome. The host already draws the header, the back
 * button and the nav-item chips; a screen with its own header would stack two. The same components
 * back the Home routes, so the two entry points cannot drift.
 */

/** The `Data` nav item — browse entities and their records. */
@RegisterClass(BaseMobileResource, 'DataExplorerResource')
export class DataExplorerMobileResource extends BaseMobileResource {
    /** @inheritdoc */
    public get Component() {
        return EntityList;
    }

    /** @inheritdoc */
    public override get Title(): string | null {
        return 'Data';
    }
}

/** The `Queries` nav item — run a saved query. */
@RegisterClass(BaseMobileResource, 'QueryBrowserResource')
export class QueryBrowserMobileResource extends BaseMobileResource {
    /** @inheritdoc */
    public get Component() {
        return QueryList;
    }

    /** @inheritdoc */
    public override get Title(): string | null {
        return 'Queries';
    }
}

/** The `Dashboards` nav item — the `Config` dashboards this app can open. */
@RegisterClass(BaseMobileResource, 'DashboardBrowserResource')
export class DashboardBrowserMobileResource extends BaseMobileResource {
    /** @inheritdoc */
    public get Component() {
        return DashboardList;
    }

    /** @inheritdoc */
    public override get Title(): string | null {
        return 'Dashboards';
    }
}

/**
 * Tree-shaking guard.
 *
 * `@RegisterClass` runs as a module side effect, and a bundler that sees no import of this module
 * eliminates it — the classes never register and every Data Explorer nav item silently falls back
 * to "opens on desktop", working in development and failing in a production build.
 */
export function LoadDataExplorerMobileResources(): void {
    /* intentionally empty — see the doc comment */
}
