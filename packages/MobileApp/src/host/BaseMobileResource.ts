import type { ComponentType } from 'react';
import { MJGlobal } from '@memberjunction/global';
import type { MJApplicationEntity_IDefaultNavItem } from '@memberjunction/core-entities';

/**
 * @fileoverview The extension point that lets the mobile app **host** applications rather than
 * hard-code screens.
 *
 * MJ Explorer is not a monolithic product — it is a shell that runs many applications, each
 * declared as an `MJ: Applications` row whose nav items name a `DriverClass`, resolved at runtime
 * through `MJGlobal.ClassFactory` against `BaseResourceComponent`. The mobile app expresses the
 * same paradigm with a different deployment: the **same** metadata rows, the **same** registry,
 * resolved against {@link BaseMobileResource} instead.
 *
 * That symmetry is the whole point. An application already running in MJ Explorer does not need a
 * parallel mobile definition, a second nav model, or a fork of this app — it registers one more
 * class under the driver name it already has, and its screen appears.
 *
 * @example Registering a mobile surface for an existing nav item
 * ```tsx
 * @RegisterClass(BaseMobileResource, 'DataExplorerResource')
 * export class DataExplorerMobileResource extends BaseMobileResource {
 *     public get Component(): ComponentType<MobileResourceProps> {
 *         return DataExplorerScreen;
 *     }
 * }
 * ```
 */

/**
 * Props handed to every hosted resource screen.
 *
 * Deliberately small. A resource gets the context it is being shown in and nothing else — no
 * navigation object, no shell internals — so that a screen written for one host is not quietly
 * coupled to that host's chrome.
 */
export type MobileResourceProps = {
    /** `MJ: Applications` row id this resource is being rendered inside. */
    ApplicationID: string;
    /** Display name of the hosting application, for headers and empty states. */
    ApplicationName: string;
    /** The nav item that opened this resource. */
    NavItem: MobileNavItem;
};

/**
 * One entry in an application's navigation, parsed from `MJ: Applications.DefaultNavItems`.
 *
 * Every field's type is derived from `MJApplicationEntity_IDefaultNavItem` — the CodeGen-emitted
 * shape for that JSON column — rather than restated here, so a metadata change flows through
 * instead of silently diverging. The only differences are deliberate: `Icon` and `ResourceType` are
 * widened to optional because real metadata omits them (`Home`'s single nav item has no icon), and
 * `Status` is added because it is present on the runtime shape Explorer filters on and absent from
 * the generated interface.
 */
export type MobileNavItem = Pick<MJApplicationEntity_IDefaultNavItem, 'RecordID' | 'DriverClass' | 'isDefault'> & {
    /** Display label, e.g. `"Queries"`. */
    Label: MJApplicationEntity_IDefaultNavItem['Label'];
    /** Font Awesome class from the metadata, e.g. `"fa-solid fa-database"`. */
    Icon?: MJApplicationEntity_IDefaultNavItem['Icon'];
    /**
     * What kind of thing this opens. `Custom` — which every application MJ ships uses for every
     * item — resolves a {@link BaseMobileResource} by {@link MobileNavItem.DriverClass}. The generic
     * types resolve the same way, by the type name itself; see {@link ResolveMobileResource}.
     */
    ResourceType?: MJApplicationEntity_IDefaultNavItem['ResourceType'];
    /** `'Active'`, or absent meaning active. Anything else means the item is hidden. */
    Status?: string;
};

/**
 * Base class for a screen that a hosted application contributes to the mobile shell.
 *
 * Subclasses are registered with `@RegisterClass(BaseMobileResource, '<DriverClass>')`, using the
 * **same driver name** the application already declares in its `MJ: Applications` metadata for the
 * web. Nothing in the shell imports a subclass directly; resolution is entirely by that name.
 *
 * Why a class wrapping a component, rather than registering the component itself: `ClassFactory`
 * instantiates what it resolves, and React function components must not be called as constructors.
 * The class is a thin, inert holder — it exists so registration and rendering stay separate
 * concerns.
 */
export abstract class BaseMobileResource {
    /**
     * The React component that renders this resource.
     *
     * Implementations return a reference, never a freshly-created component — returning a new
     * function on each access would remount the screen on every render and discard its state.
     */
    public abstract get Component(): ComponentType<MobileResourceProps>;

    /**
     * Optional header title override.
     *
     * `null` (the default) means the shell uses the nav item's `Label`, which is almost always
     * right because it is the label the user just tapped.
     */
    public get Title(): string | null {
        return null;
    }

    /**
     * Whether this resource is usable in the current session.
     *
     * Lets a resource decline politely — a feature switched off for the deployment, a capability
     * the device lacks — and get the shell's "not available" treatment instead of rendering a
     * broken screen. Returning `false` is a normal outcome, not an error.
     */
    public get IsAvailable(): boolean {
        return true;
    }
}

/**
 * Resolves a registered mobile resource by name.
 *
 * One lookup serves both kinds of nav item, which is why generic resource types are not a separate
 * code path: a `Custom` item is resolved by its `DriverClass`, and a generic item (`Dashboards`,
 * `Reports`, …) by its `ResourceType`. A generic type this build renders is simply a
 * {@link BaseMobileResource} registered under that type name — see `src/host/generic-resources.tsx`
 * — so adding one is a registration, never a change to the shell.
 *
 * @param key The `DriverClass` for a `Custom` item, or the `ResourceType` name for a generic one.
 * @returns The resource instance, or `null` when this build ships no mobile surface for it —
 *          which is an expected, well-handled state, not a failure. The shell renders an
 *          "open on desktop" card, the same honest fallback the dashboard renderer already uses.
 */
export function ResolveMobileResource(key: string | undefined | null): BaseMobileResource | null {
    const driverClass = key;
    if (!driverClass) return null;
    try {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseMobileResource>(
            BaseMobileResource,
            driverClass,
        );
        // ClassFactory falls back to instantiating the base class when nothing is registered under
        // the key. The base is abstract in TypeScript only, so guard on the subclass contract
        // rather than trusting that a non-null result means a real registration.
        if (!instance || instance.constructor === BaseMobileResource) return null;
        return instance.IsAvailable ? instance : null;
    } catch {
        return null;
    }
}
