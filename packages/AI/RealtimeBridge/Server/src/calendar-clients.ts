/**
 * @fileoverview Concrete production bindings for the calendar seams declared in
 * {@link ./calendar-source}. Each wraps an OPTIONAL PEER SDK behind the existing injected
 * surface (`IGraphCalendarLike` / `IGoogleCalendarLike`) so the package still builds and
 * unit-tests with no SDK installed and no network (CLAUDE rule 8, category 2 — optional peer
 * SDK loaded only when a calendar-backed identity is configured at deployment).
 *
 * Mirrors the Teams `RealGraphCallsClient` pattern: a lazy, memoized module loader + a structural
 * surface so the vendor SDK's real types never leak. Auth tokens are **pre-resolved upstream** (the
 * host acquires an app/delegated token from the provider `Configuration` via MJ's credential system
 * and injects it here) — token ACQUISITION is deliberately not this client's job, keeping it pure
 * and testable; the deployment-specific client-credentials flow lives in the host wiring.
 *
 * @module @memberjunction/ai-bridge-server
 */

import type {
    IGraphCalendarLike,
    GraphEventPage,
    GraphCalendarEvent,
    IGoogleCalendarLike,
    GoogleEventPage,
    GoogleCalendarEvent,
    GoogleListEventsArgs,
} from './calendar-source';

// ──────────────────────────────────────────────────────────────────────────────
// Microsoft Graph — concrete IGraphCalendarLike over @microsoft/microsoft-graph-client.
// ──────────────────────────────────────────────────────────────────────────────

/** One fluent Graph request — the subset of verbs/headers the calendar reader issues. */
export interface GraphCalendarRequestLike {
    /** Adds a request header (used for `Prefer: outlook.timezone="UTC"`); returns `this` for chaining. */
    header(name: string, value: string): GraphCalendarRequestLike;
    /** Issues `GET {path}`; resolves the parsed JSON response. */
    get(): Promise<unknown>;
}

/** The constructed Graph client surface — just the `api(path)` request-builder entry point. */
export interface GraphCalendarClientLike {
    /** Begins a fluent request against a Graph resource path (e.g. `/users/{id}/calendarView/delta`). */
    api(path: string): GraphCalendarRequestLike;
}

/** The `@microsoft/microsoft-graph-client` module surface we use (`Client.init({ authProvider })`). */
export interface GraphCalendarModuleLike {
    /** The `Client` class with its `init` static factory. */
    Client: { init(options: GraphCalendarInitOptions): GraphCalendarClientLike };
}

/** The `Client.init` options subset — just the bearer-token `authProvider` callback. */
export interface GraphCalendarInitOptions {
    /** The Graph auth-provider callback; the SDK calls it per request and expects `done(error, token)`. */
    authProvider(done: (error: Error | null, accessToken: string | null) => void): void;
}

/** Loads the `@microsoft/microsoft-graph-client` module. Overridable in tests; defaults to a lazy import. */
export type GraphCalendarModuleLoader = () => Promise<GraphCalendarModuleLike>;

/** Credentials the {@link GraphCalendarClient} authenticates with — a pre-resolved bearer token. */
export interface GraphCalendarCredentials {
    /** A pre-resolved OAuth bearer / application token with `Calendars.Read` scope (resolved upstream). */
    AccessToken: string;
}

/**
 * Options for {@link GraphCalendarClient}. The first-poll window bounds the initial
 * `calendarView` delta; subsequent polls follow the opaque `@odata.deltaLink` cursor.
 */
export interface GraphCalendarClientOptions {
    /** Pre-resolved Graph credentials. */
    Credentials: GraphCalendarCredentials;
    /** How far forward the FIRST poll's calendarView window extends (days). Defaults to 30. */
    LookaheadDays?: number;
    /** Test seam: override the module loader. Defaults to the lazy dynamic import. */
    ModuleLoader?: GraphCalendarModuleLoader;
    /** Test seam: a fixed "now" for the first-poll window (so window math is deterministic). */
    Now?: Date;
}

/** Lazily loads + memoizes `@microsoft/microsoft-graph-client`; throws a clear install hint on failure. */
export const defaultGraphCalendarModuleLoader: GraphCalendarModuleLoader = async () => {
    try {
        const mod: unknown = await import('@microsoft/microsoft-graph-client');
        const resolved = unwrap(mod);
        if (!isGraphModule(resolved)) {
            throw new Error('the @microsoft/microsoft-graph-client module did not export a Client.init factory');
        }
        return resolved;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            "GraphCalendarClient could not load '@microsoft/microsoft-graph-client'. Install it in the deployment " +
                `that polls Graph calendars (it is an optional peer dependency). Underlying error: ${message}`,
        );
    }
};

/**
 * A real {@link IGraphCalendarLike} over Microsoft Graph (`GET /users/{id}/calendarView/delta`).
 * The first poll requests a forward window (`startDateTime`..`endDateTime`) in UTC; later polls pass
 * the opaque cursor (`@odata.nextLink` within a poll, `@odata.deltaLink` between polls) straight back
 * to Graph. The constructed client is built once on first use and reused.
 */
export class GraphCalendarClient implements IGraphCalendarLike {
    private readonly options: GraphCalendarClientOptions;
    private readonly loadModule: GraphCalendarModuleLoader;
    private clientPromise?: Promise<GraphCalendarClientLike>;

    constructor(options: GraphCalendarClientOptions) {
        this.options = options;
        this.loadModule = options.ModuleLoader ?? defaultGraphCalendarModuleLoader;
    }

    /** @inheritdoc */
    public async listEvents(userId: string, cursor?: string): Promise<GraphEventPage> {
        const client = await this.client();
        // A cursor is a full Graph nextLink/deltaLink URL — request it verbatim. The first poll builds
        // a fresh calendarView/delta path with a UTC forward window and the UTC timezone preference.
        const path = cursor ?? this.firstPollPath(userId);
        const raw = await client.api(path).header('Prefer', 'outlook.timezone="UTC"').get();
        return this.toEventPage(raw);
    }

    /** Builds the first-poll `calendarView/delta` path with a UTC `[now, now+lookahead]` window. */
    private firstPollPath(userId: string): string {
        const now = this.options.Now ?? new Date();
        const lookaheadDays = this.options.LookaheadDays ?? DEFAULT_LOOKAHEAD_DAYS;
        const end = new Date(now.getTime() + lookaheadDays * MS_PER_DAY);
        const start = encodeURIComponent(now.toISOString());
        const finish = encodeURIComponent(end.toISOString());
        const id = encodeURIComponent(userId);
        return `/users/${id}/calendarView/delta?startDateTime=${start}&endDateTime=${finish}`;
    }

    /** Normalizes the raw Graph delta response to the seam's {@link GraphEventPage} shape. */
    private toEventPage(raw: unknown): GraphEventPage {
        const obj = (raw ?? {}) as Record<string, unknown>;
        const value = Array.isArray(obj.value) ? (obj.value as GraphCalendarEvent[]) : [];
        const nextLink = readString(obj['@odata.nextLink']);
        const deltaLink = readString(obj['@odata.deltaLink']);
        return {
            value,
            ...(nextLink ? { nextLink } : {}),
            ...(deltaLink ? { deltaLink } : {}),
        };
    }

    /** Builds (once) + memoizes the authenticated Graph client. */
    private client(): Promise<GraphCalendarClientLike> {
        if (!this.clientPromise) {
            this.clientPromise = this.loadModule().then((mod) =>
                mod.Client.init({
                    authProvider: (done) => done(null, this.options.Credentials.AccessToken),
                }),
            );
        }
        return this.clientPromise;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Google Calendar — concrete IGoogleCalendarLike over googleapis.
// ──────────────────────────────────────────────────────────────────────────────

/** The `calendar.events.list` surface we call — resolves a page of events. */
export interface GoogleEventsApiLike {
    /** Lists one page of events; resolves `{ data: { items, nextPageToken, nextSyncToken } }`. */
    list(params: Record<string, unknown>): Promise<{ data?: unknown }>;
}

/** The constructed Google Calendar client surface — `events.list`. */
export interface GoogleCalendarClientLike {
    /** The `events` resource collection. */
    events: GoogleEventsApiLike;
}

/** The `googleapis` module surface we use (`google.calendar({ version, auth })`). */
export interface GoogleApisModuleLike {
    /** The `google` namespace with the `calendar` client factory. */
    google: { calendar(options: { version: string; auth: unknown }): GoogleCalendarClientLike };
}

/** Loads the `googleapis` module. Overridable in tests; defaults to a lazy import. */
export type GoogleApisModuleLoader = () => Promise<GoogleApisModuleLike>;

/**
 * Options for {@link GoogleCalendarClient}. `Auth` is a pre-built `googleapis` auth client (an
 * OAuth2 client or a JWT/service-account client) resolved upstream from the provider `Configuration`
 * via MJ's credential system — token acquisition is not this client's job.
 */
export interface GoogleCalendarClientOptions {
    /** A pre-built googleapis auth client (OAuth2 / JWT / service-account), resolved upstream. */
    Auth: unknown;
    /** How far forward the FIRST poll's `timeMin`..`timeMax` window extends (days). Defaults to 30. */
    LookaheadDays?: number;
    /** Test seam: override the module loader. Defaults to the lazy dynamic import. */
    ModuleLoader?: GoogleApisModuleLoader;
    /** Test seam: a fixed "now" for the first-poll window. */
    Now?: Date;
}

/** Lazily loads + memoizes `googleapis`; throws a clear install hint on failure. */
export const defaultGoogleApisModuleLoader: GoogleApisModuleLoader = async () => {
    try {
        const mod: unknown = await import('googleapis');
        const resolved = unwrap(mod);
        if (!isGoogleModule(resolved)) {
            throw new Error('the googleapis module did not export a google.calendar factory');
        }
        return resolved;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            "GoogleCalendarClient could not load 'googleapis'. Install it in the deployment that polls Google " +
                `calendars (it is an optional peer dependency). Underlying error: ${message}`,
        );
    }
};

/**
 * A real {@link IGoogleCalendarLike} over `calendar.events.list`. The first poll requests a forward
 * window (`timeMin`..`timeMax`, `singleEvents`, ordered) so Google returns an initial `nextSyncToken`;
 * later polls pass the `syncToken` (between polls) or `pageToken` (within a poll) verbatim. The
 * constructed client is built once on first use and reused.
 */
export class GoogleCalendarClient implements IGoogleCalendarLike {
    private readonly options: GoogleCalendarClientOptions;
    private readonly loadModule: GoogleApisModuleLoader;
    private clientPromise?: Promise<GoogleCalendarClientLike>;

    constructor(options: GoogleCalendarClientOptions) {
        this.options = options;
        this.loadModule = options.ModuleLoader ?? defaultGoogleApisModuleLoader;
    }

    /** @inheritdoc */
    public async listEvents(args: GoogleListEventsArgs): Promise<GoogleEventPage> {
        const client = await this.client();
        const response = await client.events.list(this.buildListParams(args));
        return this.toEventPage(response?.data);
    }

    /**
     * Builds `events.list` params. A `syncToken`/`pageToken` poll passes only the token (Google
     * rejects window params alongside a sync token); a fresh poll sends the forward window + the
     * `singleEvents`/`orderBy` flags that make Google issue an initial `nextSyncToken`.
     */
    private buildListParams(args: GoogleListEventsArgs): Record<string, unknown> {
        const base = { calendarId: args.calendarId };
        if (args.pageToken) {
            return { ...base, pageToken: args.pageToken };
        }
        if (args.syncToken) {
            return { ...base, syncToken: args.syncToken };
        }
        const now = this.options.Now ?? new Date();
        const lookaheadDays = this.options.LookaheadDays ?? DEFAULT_LOOKAHEAD_DAYS;
        return {
            ...base,
            timeMin: now.toISOString(),
            timeMax: new Date(now.getTime() + lookaheadDays * MS_PER_DAY).toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        };
    }

    /** Normalizes the raw `events.list` data to the seam's {@link GoogleEventPage} shape. */
    private toEventPage(data: unknown): GoogleEventPage {
        const obj = (data ?? {}) as Record<string, unknown>;
        const items = Array.isArray(obj.items) ? (obj.items as GoogleCalendarEvent[]) : [];
        const nextPageToken = readString(obj.nextPageToken);
        const nextSyncToken = readString(obj.nextSyncToken);
        return {
            items,
            ...(nextPageToken ? { nextPageToken } : {}),
            ...(nextSyncToken ? { nextSyncToken } : {}),
        };
    }

    /** Builds (once) + memoizes the Google Calendar client. */
    private client(): Promise<GoogleCalendarClientLike> {
        if (!this.clientPromise) {
            this.clientPromise = this.loadModule().then((mod) =>
                mod.google.calendar({ version: 'v3', auth: this.options.Auth }),
            );
        }
        return this.clientPromise;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared helpers.
// ──────────────────────────────────────────────────────────────────────────────

/** Forward-window default (days) shared by both first-poll path builders. */
const DEFAULT_LOOKAHEAD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Returns a non-empty trimmed string, or `undefined` for anything else. */
function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Unwraps a module from CJS/ESM interop (`module` or `module.default`). */
function unwrap(mod: unknown): unknown {
    if (mod && typeof mod === 'object' && 'default' in mod) {
        const inner = (mod as { default: unknown }).default;
        if (inner && typeof inner === 'object') {
            return inner;
        }
    }
    return mod;
}

/** Structural guard: exposes `Client.init`. */
function isGraphModule(value: unknown): value is GraphCalendarModuleLike {
    const client = (value as { Client?: { init?: unknown } })?.Client;
    return client != null && typeof client.init === 'function';
}

/** Structural guard: exposes `google.calendar`. */
function isGoogleModule(value: unknown): value is GoogleApisModuleLike {
    const google = (value as { google?: { calendar?: unknown } })?.google;
    return google != null && typeof google.calendar === 'function';
}
