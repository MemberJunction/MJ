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

let cachedAddinUrlPromise: Promise<string> | null = null;
let sharedCoordinator: ExcelCustomFunctionCoordinator<StoredConnection> | null = null;
let functionsAssociated = false;
let connectionListenerRegistered = false;

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

/** Clears the shared custom function result cache (called automatically on sign-in, account switch, or sign-out). */
export function ClearCustomFunctionCache(): void {
    sharedCoordinator?.ClearCache();
}

export function GetOrCreateCustomFunctionCoordinator(): ExcelCustomFunctionCoordinator<StoredConnection> {
    if (!connectionListenerRegistered) {
        OnConnectionChanged(() => {
            ClearCustomFunctionCache();
        });
        connectionListenerRegistered = true;
    }
    if (!sharedCoordinator) {
        sharedCoordinator = new ExcelCustomFunctionCoordinator<StoredConnection>(
            async (
                input: ExcelAddinEvaluateCustomFunctionInput,
                options?: { signal?: AbortSignal; connection?: StoredConnection },
            ): Promise<ExcelAddinEvaluateCustomFunctionOutput> => {
                const conn = options?.connection ?? (await ResolveActiveCustomFunctionConnection());
                return EvaluateCustomFunctionOnServer(conn, input, options);
            },
            {
                ResolveContext: async () => {
                    const conn = await ResolveActiveCustomFunctionConnection();
                    return {
                        ScopeKey: BuildConnectionScopeKey(conn),
                        Connection: conn,
                    };
                },
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
        (
            entityNameOrId: unknown,
            viewNameOrId?: unknown,
            filter?: unknown,
            includeHeaders?: unknown,
            invocation?: unknown,
        ) =>
            coordinator.EvaluateView(
                String(entityNameOrId ?? ''),
                viewNameOrId !== undefined && viewNameOrId !== null
                    ? (viewNameOrId as string | ExcelCancelableInvocation)
                    : undefined,
                typeof filter === 'boolean'
                    ? filter
                    : filter !== undefined && filter !== null
                      ? (filter as string | ExcelCancelableInvocation)
                      : undefined,
                typeof includeHeaders === 'boolean'
                    ? includeHeaders
                    : (includeHeaders as ExcelCancelableInvocation | undefined),
                invocation as ExcelCancelableInvocation | undefined,
            ),
    );
    if (!customFunctionsOverride) {
        functionsAssociated = true;
    }
    return true;
}

// Automatically associate when loaded inside Excel's dedicated CustomFunctions runtime
RegisterMjExcelCustomFunctions();
