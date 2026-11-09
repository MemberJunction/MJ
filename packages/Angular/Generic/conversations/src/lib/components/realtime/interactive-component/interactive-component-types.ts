/**
 * @fileoverview Shared vocabulary of the **Interactive Component realtime channel**: names, the
 * channel's configuration, the artifact source port and the handle a rendered component exposes.
 *
 * Everything in this file is framework-free (no Angular, no DOM), so the channel's logic can be
 * tested without a browser and reused by a host that renders components some other way.
 *
 * @module @memberjunction/ng-conversations
 */

import type { ComponentSpec } from '@memberjunction/interactive-component-types';

/** The channel's key: the `target.channel` an agent addresses. */
export const INTERACTIVE_COMPONENT_CHANNEL_KEY = 'InteractiveComponent';

/** The `ClientPluginClass` of the channel's `MJ: AI Agent Channels` row (its ClassFactory key). */
export const INTERACTIVE_COMPONENT_CLIENT_PLUGIN_CLASS = 'RealtimeInteractiveComponentChannel';

/** The `ServerPluginClass` of the channel's `MJ: AI Agent Channels` row. */
export const INTERACTIVE_COMPONENT_SERVER_PLUGIN_CLASS = 'InteractiveComponentChannelServer';

/** The verbs every instance has, whatever its spec says. `open` is the dispatcher's reserved action, not a verb. */
export const BUILTIN_VERBS = {
    /** Swap an open instance to another version of its own artifact. */
    ShowVersion: 'show_version',
    /** Close an instance. */
    Close: 'close',
} as const;

/**
 * The verbs derived from a spec's *standard* methods. Their names are reserved: a custom method that
 * collides with one is exposed as `custom_<name>` instead (see `DeriveComponentContract`).
 */
export const STANDARD_VERBS = {
    Refresh: 'refresh',
    Print: 'print',
    Validate: 'validate',
    IsDirty: 'is_dirty',
    Reset: 'reset',
    ScrollTo: 'scroll_to',
    Focus: 'focus',
    GetDataState: 'get_data_state',
} as const;

/** Where in the channel's life a version swap came from. */
export type ComponentVersionChangeReason = 'agent' | 'newer-version';

/**
 * Per-channel configuration read from `channels.config.InteractiveComponent` in the config cascade.
 * It is operator-authored JSON of unknown shape, so every member is validated by `ParseInteractiveComponentConfig`;
 * these are the resolved, always-valid values.
 */
export interface InteractiveComponentConfig {
    /**
     * Whether component artifacts produced by a delegated run (the agent asked Skip or Sage to build
     * something) are opened automatically. Off by default: the channel is opt-in, and so is the behavior of
     * a tab appearing by itself. The channel cannot tell a component from another kind of artifact until it
     * has loaded it, so with this on it is mounted for ANY delegated artifact and ignores those that are not components.
     */
    AutoOpenDelegatedComponents: boolean;
    /** Whether a newer version of an artifact that is already open replaces it in place (default `true`); when `false` the agent is only told one exists. */
    SwapToNewerVersions: boolean;
    /** How many components may be open at once (1 to {@link MAX_INSTANCES_CEILING}; default 4). */
    MaxInstances: number;
    /** The most data rows per table described to the model (default 25). */
    MaxStateRows: number;
    /** The most characters of data-state JSON described to the model per component (default 6000). */
    MaxStateChars: number;
}

/** The highest `maxInstances` an operator may configure. */
export const MAX_INSTANCES_CEILING = 8;

/** The configuration used when none is supplied. */
export const DEFAULT_INTERACTIVE_COMPONENT_CONFIG: Readonly<InteractiveComponentConfig> = Object.freeze({
    AutoOpenDelegatedComponents: false,
    SwapToNewerVersions: true,
    MaxInstances: 4,
    MaxStateRows: 25,
    MaxStateChars: 6000,
});

/** A component artifact version, loaded and parsed, ready to render. */
export interface ResolvedComponentArtifact {
    /** The `MJ: Artifacts` id. */
    ArtifactID: string;
    /** The `MJ: Artifact Versions` id this was loaded from. */
    VersionID: string;
    /** The version number within the artifact. */
    VersionNumber: number;
    /** Display name (the version's name, else the artifact's, else the spec's). */
    Name: string;
    /** The parsed component specification. */
    Spec: ComponentSpec;
}

/** Why an artifact could not be loaded; each maps to a message the model can act on. */
export type ComponentArtifactErrorCode = 'invalid_id' | 'not_found' | 'access_denied' | 'not_a_component' | 'unreadable' | 'load_failed';

/** An artifact load that failed, thrown by an {@link IComponentArtifactSource}. */
export class ComponentArtifactError extends Error {
    /** @param Code A stable machine-readable reason. @param message A sentence the model can read. */
    public constructor(
        public readonly Code: ComponentArtifactErrorCode,
        message: string
    ) {
        super(message);
        this.name = 'ComponentArtifactError';
    }
}

/**
 * Loads component artifacts. The channel only ever asks this port, so what "the user's own access" means
 * (the user's own session, their read permission on the artifact) is the implementation's concern and the
 * channel is testable without a database.
 *
 * Implementations throw {@link ComponentArtifactError} for anything the agent can be told.
 */
export interface IComponentArtifactSource {
    /** Loads one specific version. */
    LoadVersion(versionId: string): Promise<ResolvedComponentArtifact>;
    /** Loads an artifact's latest version. */
    LoadLatest(artifactId: string): Promise<ResolvedComponentArtifact>;
}

/**
 * What the channel can do to a rendered component. The Angular host component implements it over
 * `mj-react-component`; tests implement it over a fake. Every member must tolerate being called before the
 * component finished initializing (return `undefined`/`false`, never throw).
 */
export interface IInteractiveComponentHandle {
    /** Whether the component has finished initializing and can be driven. */
    readonly IsReady: boolean;
    /** Whether the component implements `methodName`. */
    HasMethod(methodName: string): boolean;
    /** Calls one of the component's methods with positional arguments; resolves with its (possibly async) result. */
    InvokeMethod(methodName: string, args: readonly unknown[]): Promise<unknown>;
    /** The component's current data state (`getCurrentDataState`, or what it fetched), if it has one. */
    GetCurrentDataState(): object | undefined;
    /** Re-fetches / re-renders the component. */
    Refresh(): void;
    /** Prints the component. */
    Print(): void;
    /** `validate()`: a boolean or a validation result. */
    Validate(): unknown;
    /** `isDirty()`. */
    IsDirty(): boolean;
    /** `reset()`. */
    Reset(): void;
    /** `scrollTo(target)`. */
    ScrollTo(target: string | { top?: number; left?: number }): void;
    /** `focus(target?)`. */
    Focus(target?: string): void;
}

/** Something the user did inside a rendered component, reported by the host to the channel. */
export interface ComponentActivity {
    /**
     * `'event'` for a component event (the spec's `events`), `'state'` for a state change, `'initialized'` when it
     * finished loading, `'selected'` when the user switched to this component's tab, `'closed'` when the user closed it.
     */
    Kind: 'event' | 'state' | 'initialized' | 'selected' | 'closed';
    /** The event type or state path. */
    Name?: string;
    /** The event payload or new state value (already untyped JSON-ish; the channel bounds it). */
    Payload?: unknown;
}
