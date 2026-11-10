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
    ExcelCustomFunctionCoordinator,
} from '../custom-functions';
import { LoadConnection, StoredConnection } from './connection-store';
import { EvaluateCustomFunctionOnServer } from './mj-data-client';
import { LoadPaneConfig, LoadSavedServerUrl, ResolveCustomPaneConfig, SameAddinUrl } from './pane-config';

interface OfficeCustomFunctionsApi {
    associate(id: string, callback: (...args: readonly unknown[]) => Promise<ExcelCellValue[][]>): void;
}

let cachedAddinUrlPromise: Promise<string> | null = null;
let sharedCoordinator: ExcelCustomFunctionCoordinator | null = null;
let functionsAssociated = false;

async function resolveActiveAddinUrl(): Promise<string> {
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

async function resolveActiveConnection(): Promise<StoredConnection> {
    const addinUrl = await resolveActiveAddinUrl();
    if (!addinUrl) {
        throw new Error(EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED);
    }
    const connection = LoadConnection(addinUrl);
    if (!connection) {
        throw new Error(EXCEL_CUSTOM_FUNCTION_AUTH_REQUIRED);
    }
    return connection;
}

function readCurrentViewerScopeKey(): string {
    const savedUrl = LoadSavedServerUrl();
    if (savedUrl) {
        const conn = LoadConnection(savedUrl);
        if (conn) {
            return `${conn.AddinUrl}::${conn.UserEmail || conn.UserName || conn.APIKey.slice(0, 12)}`;
        }
    }
    // Check default connection map via window.localStorage key inspection through LoadConnection if known,
    // otherwise fall back to 'pending-config' so evaluateInput resolves connection cleanly inside executor.
    return 'session-scope';
}

export function GetOrCreateCustomFunctionCoordinator(): ExcelCustomFunctionCoordinator {
    if (!sharedCoordinator) {
        sharedCoordinator = new ExcelCustomFunctionCoordinator(
            async (input: ExcelAddinEvaluateCustomFunctionInput): Promise<ExcelAddinEvaluateCustomFunctionOutput> => {
                const conn = await resolveActiveConnection();
                return EvaluateCustomFunctionOnServer(conn, input);
            },
            {
                ViewerScopeKey: readCurrentViewerScopeKey,
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
        (entityNameOrId: unknown, viewNameOrId?: unknown, filter?: unknown, includeHeaders?: unknown) =>
            coordinator.EvaluateView(
                String(entityNameOrId ?? ''),
                viewNameOrId !== undefined && viewNameOrId !== null ? String(viewNameOrId) : undefined,
                typeof filter === 'boolean'
                    ? filter
                    : filter !== undefined && filter !== null
                      ? String(filter)
                      : undefined,
                typeof includeHeaders === 'boolean' ? includeHeaders : undefined,
            ),
    );
    if (!customFunctionsOverride) {
        functionsAssociated = true;
    }
    return true;
}

// Automatically associate when loaded inside Excel's dedicated CustomFunctions runtime
RegisterMjExcelCustomFunctions();
