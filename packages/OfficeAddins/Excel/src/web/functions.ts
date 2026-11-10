/**
 * Browser runtime entrypoint for Excel Custom Functions (`=MJ.QUERY(...)` and `=MJ.VIEW(...)`).
 *
 * Bundled to `dist/web/functions.js` (`format: 'iife'`) for Excel's dedicated CustomFunctions runtime
 * and also invoked from `taskpane.ts` when `CustomFunctions` is present under SharedRuntime (`A5`).
 */
import type { ExcelCellValue } from '../contract';
import {
    EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED,
    ExcelAddinEvaluateCustomFunctionInput,
    ExcelAddinEvaluateCustomFunctionOutput,
    ExcelCancelableInvocation,
    ExcelCustomFunctionCoordinator,
    ValidateExcelViewFilter,
} from '../custom-functions';
import {
    HydrateConnectionsFromOfficeStorage,
    LoadConnection,
    OnConnectionChanged,
    StoredConnection,
} from './connection-store';
import { EvaluateCustomFunctionOnServer } from './mj-data-client';
import {
    HydrateServerUrlFromOfficeStorage,
    LoadPaneConfig,
    LoadSavedServerUrl,
    ResolveCustomPaneConfig,
    SameAddinUrl,
} from './pane-config';

interface OfficeCustomFunctionsApi {
    associate(id: string, callback: (...args: readonly unknown[]) => Promise<ExcelCellValue[][]>): void;
}

/** Resolved viewer-scoped connection context memoized across custom function cell evaluations. */
export interface ResolvedCustomFunctionContext {
    ScopeKey: string;
    Connection: StoredConnection;
}

const BLOCKED_SQL_METADATA_IDENTIFIER_RE =
    /\b(?:SYSTEM_USER|CURRENT_USER|SESSION_USER|USER_NAME|SUSER_NAME|SUSER_SNAME|ORIGINAL_LOGIN|DB_NAME|HOST_NAME|APP_NAME|SCHEMA_NAME|OBJECT_NAME|OBJECT_DEFINITION|HAS_PERMS_BY_NAME)\b/i;

const BLOCKED_SQL_GLOBAL_VARIABLE_RE = /@@[A-Za-z_][A-Za-z0-9_]*/i;

let cachedAddinUrlPromise: Promise<string> | null = null;
let cachedContextPromise: Promise<ResolvedCustomFunctionContext> | null = null;
let sharedCoordinator: ExcelCustomFunctionCoordinator<StoredConnection> | null = null;
let functionsAssociated = false;
let connectionListenerRegistered = false;

function ensureConnectionListenerRegistered(): void {
    if (!connectionListenerRegistered) {
        OnConnectionChanged(() => {
            InvalidateCustomFunctionContext();
            sharedCoordinator?.ClearCache();
        });
        connectionListenerRegistered = true;
    }
}

function fingerprintToken(token: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < token.length; i++) {
        const ch = token.charCodeAt(i);
        h1 ^= ch;
        h1 = Math.imul(h1, 0x01000193) >>> 0;
        h2 ^= ch + i;
        h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

async function resolveActiveAddinUrl(): Promise<string> {
    await Promise.all([HydrateServerUrlFromOfficeStorage(), HydrateConnectionsFromOfficeStorage()]);
    const savedUrl = LoadSavedServerUrl();
    if (!cachedAddinUrlPromise) {
        cachedAddinUrlPromise = LoadPaneConfig()
            .then(cfg => cfg.AddinUrl)
            .catch(() => '');
    }
    const hostAddinUrl = await cachedAddinUrlPromise;
    if (savedUrl && (!hostAddinUrl || !SameAddinUrl(savedUrl, hostAddinUrl))) {
        try {
            const custom = await ResolveCustomPaneConfig(savedUrl);
            return custom.AddinUrl;
        } catch {
            return savedUrl;
        }
    }
    return hostAddinUrl || savedUrl || '';
}

/**
 * Resolves the active server connection ONCE for the workbook's configured server URL (`Round 3 Item 17`).
 * Never falls back to an unrelated server's stored connection (`FindFirstStoredConnection`), preventing
 * cross-environment data leakage (e.g. a prod workbook serving dev data).
 */
export async function ResolveActiveCustomFunctionConnection(): Promise<StoredConnection> {
    const addinUrl = await resolveActiveAddinUrl();
    if (addinUrl) {
        const connection = LoadConnection(addinUrl);
        if (connection && connection.APIKey) {
            return connection;
        }
    }
    throw new Error(EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED);
}

/** Derives the deterministic cache scope key directly from a resolved {@link StoredConnection}. */
export function BuildConnectionScopeKey(conn: StoredConnection): string {
    return `${conn.AddinUrl}::${conn.UserEmail || conn.UserName || 'user'}::${fingerprintToken(conn.APIKey)}`;
}

/**
 * Invalidates the memoized custom-function connection context so the next cell evaluation
 * re-reads the active server URL and connection (invoked automatically on `OnConnectionChanged`).
 */
export function InvalidateCustomFunctionContext(): void {
    cachedContextPromise = null;
    cachedAddinUrlPromise = null;
}

/**
 * Resolves and memoizes the active `{ ScopeKey, Connection }` context until invalidated
 * by {@link InvalidateCustomFunctionContext} or an {@link OnConnectionChanged} event.
 * Rejections are cleared immediately so subsequent cells retry cleanly after sign-in.
 */
export function ResolveCustomFunctionContext(): Promise<ResolvedCustomFunctionContext> {
    ensureConnectionListenerRegistered();
    if (!cachedContextPromise) {
        cachedContextPromise = (async (): Promise<ResolvedCustomFunctionContext> => {
            const conn = await ResolveActiveCustomFunctionConnection();
            return {
                ScopeKey: BuildConnectionScopeKey(conn),
                Connection: conn,
            };
        })().catch((err: Error) => {
            cachedContextPromise = null;
            throw err;
        });
    }
    return cachedContextPromise;
}

/**
 * Validates an `=MJ.VIEW` filter expression, blocking SQL Server system/metadata functions
 * (`SYSTEM_USER`, `CURRENT_USER`, `SESSION_USER`, `USER_NAME`, `SUSER_NAME`, `SUSER_SNAME`,
 * `ORIGINAL_LOGIN`, `DB_NAME`, `HOST_NAME`, `APP_NAME`, `SCHEMA_NAME`, `OBJECT_NAME`,
 * `OBJECT_DEFINITION`, `HAS_PERMS_BY_NAME`) and `@@` global variables (`@@VERSION`,
 * `@@SERVERNAME`, `@@SERVICENAME`, `@@SPID`, `@@LANGUAGE`) outside single-quoted string literals
 * so they cannot be used as boolean oracles. Throws a `#VALUE!` error when rejected.
 */
export function ValidateExtraFilter(rawFilter: string | undefined): string | undefined {
    const trimmed = (rawFilter ?? '').trim();
    if (!trimmed) {
        return undefined;
    }
    const strippedEscapedQuotes = trimmed.replace(/''/g, () => '');
    const singleQuoteCount = strippedEscapedQuotes.match(/'/g)?.length ?? 0;
    if (singleQuoteCount % 2 !== 0) {
        throw new Error('#VALUE! Unterminated string literal in =MJ.VIEW filter.');
    }

    // Mask ONLY single-quoted string literals so unquoted or double-quoted SQL metadata tokens are caught
    const outsideSingleQuotes = trimmed.replace(/'(?:''|[^'])*'/g, () => '__MJ_SQ_LIT__');
    if (
        BLOCKED_SQL_GLOBAL_VARIABLE_RE.test(outsideSingleQuotes) ||
        BLOCKED_SQL_METADATA_IDENTIFIER_RE.test(outsideSingleQuotes)
    ) {
        throw new Error('#VALUE! Unsafe SQL Server metadata function or variable refused in =MJ.VIEW.');
    }

    return ValidateExcelViewFilter(trimmed);
}

/** Clears the shared custom function result cache and memoized connection context (called automatically on sign-in, account switch, or sign-out). */
export function ClearCustomFunctionCache(): void {
    InvalidateCustomFunctionContext();
    sharedCoordinator?.ClearCache();
}

export function GetOrCreateCustomFunctionCoordinator(): ExcelCustomFunctionCoordinator<StoredConnection> {
    ensureConnectionListenerRegistered();
    if (!sharedCoordinator) {
        sharedCoordinator = new ExcelCustomFunctionCoordinator<StoredConnection>(
            async (
                input: ExcelAddinEvaluateCustomFunctionInput,
                options?: { signal?: AbortSignal; connection?: StoredConnection },
            ): Promise<ExcelAddinEvaluateCustomFunctionOutput> => {
                const validatedInput =
                    input.Kind === 'View'
                        ? { ...input, Filter: ValidateExtraFilter(input.Filter) }
                        : input;
                const conn = options?.connection ?? (await ResolveCustomFunctionContext()).Connection;
                return EvaluateCustomFunctionOnServer(conn, validatedInput, options);
            },
            {
                ResolveContext: () => ResolveCustomFunctionContext(),
            },
        );
    }
    return sharedCoordinator;
}

/**
 * Associates `QUERY` and `VIEW` under the `MJ` namespace when `CustomFunctions` is available.
 */
export function RegisterMjExcelCustomFunctions(customFunctionsOverride?: OfficeCustomFunctionsApi): boolean {
    const cf =
        customFunctionsOverride ??
        (globalThis as { CustomFunctions?: OfficeCustomFunctionsApi }).CustomFunctions;
    if (!cf || typeof cf.associate !== 'function') {
        return false;
    }
    if (!customFunctionsOverride && functionsAssociated) {
        return true;
    }
    const coordinator = GetOrCreateCustomFunctionCoordinator();
    cf.associate('QUERY', (queryNameOrId: unknown, ...params: readonly unknown[]) =>
        coordinator.EvaluateQuery(String(queryNameOrId ?? ''), ...params),
    );
    cf.associate(
        'VIEW',
        async (
            entityNameOrId: unknown,
            viewNameOrId?: unknown,
            filter?: unknown,
            includeHeaders?: unknown,
            invocation?: unknown,
        ) => {
            let safeFilterArg: string | boolean | ExcelCancelableInvocation | undefined;
            if (typeof filter === 'boolean') {
                safeFilterArg = filter;
            } else if (typeof filter === 'string') {
                try {
                    safeFilterArg = ValidateExtraFilter(filter);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : '#VALUE!';
                    return [[msg.startsWith('#VALUE!') ? msg.slice(0, 80) : `#VALUE! ${msg}`.slice(0, 80)]];
                }
            } else if (filter !== undefined && filter !== null) {
                safeFilterArg = filter as ExcelCancelableInvocation;
            }
            return coordinator.EvaluateView(
                String(entityNameOrId ?? ''),
                viewNameOrId !== undefined && viewNameOrId !== null
                    ? (viewNameOrId as string | ExcelCancelableInvocation)
                    : undefined,
                safeFilterArg,
                typeof includeHeaders === 'boolean'
                    ? includeHeaders
                    : (includeHeaders as ExcelCancelableInvocation | undefined),
                invocation as ExcelCancelableInvocation | undefined,
            );
        },
    );
    if (!customFunctionsOverride) {
        functionsAssociated = true;
    }
    return true;
}

// Automatically associate when loaded inside Excel's dedicated CustomFunctions runtime
RegisterMjExcelCustomFunctions();
