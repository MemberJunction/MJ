/**
 * Fetches workbook rows and catalog metadata from MJAPI's GraphQL endpoint with the pane's scoped API key.
 *
 * GraphQL, not REST, on purpose: GraphQL's `RunViewByID`, `RunDynamicView`, `GetQueryData`, and
 * `ExecuteRemoteOperation` enforce the key's `view:run` / `query:run` scopes, whereas MJAPI's REST
 * routes don't check API-key scopes at all.
 */
import {
    EXCEL_ADDIN_OPERATION_KEYS,
    ExcelAddinCatalogOutput,
    ExcelAddinEntityViewsOutput,
    ExcelAddinResolveSourceOutput,
    ExcelResolvedWorkbookSource,
    ExcelWorkbookSourceRequest,
} from '../catalog-types';
import type { ExcelParameterValue, ExcelWorkbookSource } from '../contract';
import type { StoredConnection } from './connection-store';

/** The rows of one source, and how many there were in all. */
export interface SourceRows {
    Rows: Record<string, unknown>[];
    TotalRowCount: number;
}

/** The connection was refused: revoked, expired, or its user deactivated. Sign in again. */
export class ConnectionRefusedError extends Error {}

interface GraphQLResponse<T> {
    data?: T;
    errors?: { message: string }[];
}

interface RunViewResultPayload {
    Success: boolean;
    ErrorMessage?: string | null;
    TotalRowCount?: number | null;
    Results: { Data: string }[];
}

interface RunViewResponse {
    RunViewByID: RunViewResultPayload;
}

interface RunDynamicViewResponse {
    RunDynamicView: RunViewResultPayload;
}

interface RunQueryResponse {
    GetQueryData: { Success: boolean; ErrorMessage?: string | null; TotalRowCount?: number | null; Results?: string | null };
}

interface ExecuteRemoteOperationResponse {
    ExecuteRemoteOperation: {
        success: boolean;
        resultCode?: string | null;
        outputJSON?: string | null;
        errorMessage?: string | null;
    };
}

const RUN_VIEW_QUERY = `query MJExcelRunView($input: RunViewByIDInput!) {
    RunViewByID(input: $input) { Success ErrorMessage TotalRowCount Results { Data } }
}`;

const RUN_DYNAMIC_VIEW_QUERY = `query MJExcelRunDynamicView($input: RunDynamicViewInput!) {
    RunDynamicView(input: $input) { Success ErrorMessage TotalRowCount Results { Data } }
}`;

const RUN_QUERY_QUERY = `query MJExcelRunQuery($QueryID: String!, $Parameters: JSONObject, $MaxRows: Int, $AuditLogDescription: String) {
    GetQueryData(QueryID: $QueryID, Parameters: $Parameters, MaxRows: $MaxRows, AuditLogDescription: $AuditLogDescription) {
        Success ErrorMessage TotalRowCount Results
    }
}`;

const EXECUTE_REMOTE_OP_MUTATION = `mutation MJExcelExecuteOp($input: ExecuteRemoteOperationInput!) {
    ExecuteRemoteOperation(input: $input) { success resultCode outputJSON errorMessage }
}`;

const REFUSAL_PATTERN = /api key|apikey|unauthori[sz]ed|not authenticated|authentication|expired|revoked|inactive|scope/i;

/** Fetches the rows for one workbook source (`View`, `Entity`, or `Query`). */
export async function FetchSourceRows(connection: StoredConnection, source: ExcelWorkbookSource, maxRows: number): Promise<SourceRows> {
    switch (source.Kind) {
        case 'View':
            return fetchViewRows(connection, source, maxRows);
        case 'Entity':
            return fetchEntityRows(connection, source, maxRows);
        case 'Query':
            return fetchQueryRows(connection, source, maxRows);
    }
}

/** Loads the signed-in user's applications, readable entities, query categories, and runnable queries. */
export async function FetchCatalog(connection: StoredConnection): Promise<ExcelAddinCatalogOutput> {
    return ExecuteRemoteOp<ExcelAddinCatalogOutput>(connection, EXCEL_ADDIN_OPERATION_KEYS.GetCatalog, {});
}

/** Loads the saved `MJ: User Views` accessible to the signed-in user on `entityId`. */
export async function FetchEntityViews(connection: StoredConnection, entityId: string): Promise<ExcelAddinEntityViewsOutput> {
    return ExecuteRemoteOp<ExcelAddinEntityViewsOutput>(connection, EXCEL_ADDIN_OPERATION_KEYS.GetEntityViews, { EntityID: entityId });
}

/** Resolves a chosen view, entity, or saved query into its canonical columns and checked parameters. */
export async function ResolveWorkbookSourceOnServer(
    connection: StoredConnection,
    request: ExcelWorkbookSourceRequest,
): Promise<ExcelResolvedWorkbookSource> {
    const result = await ExecuteRemoteOp<ExcelAddinResolveSourceOutput>(
        connection,
        EXCEL_ADDIN_OPERATION_KEYS.ResolveSource,
        { Source: request },
    );
    return result.Source;
}

/** Calls a registered `ExcelAddin.*` Remote Operation over GraphQL with the pane's scoped API key. */
export async function ExecuteRemoteOp<TOutput>(
    connection: StoredConnection,
    operationKey: string,
    input: object,
): Promise<TOutput> {
    const data = await post<ExecuteRemoteOperationResponse>(connection, EXECUTE_REMOTE_OP_MUTATION, {
        input: {
            operationKey,
            inputJSON: JSON.stringify(input),
            invokeMode: 'Sync',
        },
    });
    const envelope = data.ExecuteRemoteOperation;
    if (!envelope.success) {
        const message = envelope.errorMessage || `Operation ${operationKey} failed.`;
        if (envelope.resultCode === 'NO_USER' || REFUSAL_PATTERN.test(message)) {
            throw new ConnectionRefusedError('MemberJunction refused this connection. Sign in again.');
        }
        throw new Error(message);
    }
    if (!envelope.outputJSON) {
        throw new Error(`MemberJunction returned no output for ${operationKey}.`);
    }
    return JSON.parse(envelope.outputJSON) as TOutput;
}

async function fetchViewRows(connection: StoredConnection, source: ExcelWorkbookSource, maxRows: number): Promise<SourceRows> {
    const input = {
        ViewID: source.ID,
        Fields: source.Columns.length > 0 ? source.Columns.map(c => c.Name) : null,
        MaxRows: maxRows,
        ResultType: 'simple',
        AuditLogDescription: 'Excel add-in refresh',
    };
    const data = await post<RunViewResponse>(connection, RUN_VIEW_QUERY, { input });
    return unpackRunViewResult(data.RunViewByID, 'The view could not be run.');
}

async function fetchEntityRows(connection: StoredConnection, source: ExcelWorkbookSource, maxRows: number): Promise<SourceRows> {
    if (!source.EntityName) {
        throw new Error(`The entity sheet "${source.Name}" is missing its EntityName.`);
    }
    const input = {
        EntityName: source.EntityName,
        Fields: source.Columns.length > 0 ? source.Columns.map(c => c.Name) : null,
        MaxRows: maxRows,
        ResultType: 'simple',
        AuditLogDescription: 'Excel add-in refresh',
    };
    const data = await post<RunDynamicViewResponse>(connection, RUN_DYNAMIC_VIEW_QUERY, { input });
    return unpackRunViewResult(data.RunDynamicView, `The entity "${source.Name}" could not be loaded.`);
}

function unpackRunViewResult(result: RunViewResultPayload, fallbackError: string): SourceRows {
    if (!result.Success) {
        const message = result.ErrorMessage || fallbackError;
        if (REFUSAL_PATTERN.test(message)) {
            throw new ConnectionRefusedError('MemberJunction refused this connection. Sign in again.');
        }
        throw new Error(message);
    }
    const rows = result.Results.map(r => JSON.parse(r.Data) as Record<string, unknown>);
    return { Rows: rows, TotalRowCount: result.TotalRowCount ?? rows.length };
}

async function fetchQueryRows(connection: StoredConnection, source: ExcelWorkbookSource, maxRows: number): Promise<SourceRows> {
    const parameters: Record<string, ExcelParameterValue> | null = source.Parameters ?? null;
    const data = await post<RunQueryResponse>(connection, RUN_QUERY_QUERY, {
        QueryID: source.ID,
        Parameters: parameters,
        MaxRows: maxRows,
        AuditLogDescription: 'Excel add-in refresh',
    });
    const result = data.GetQueryData;
    if (!result.Success) {
        const message = result.ErrorMessage || 'The query could not be run.';
        if (REFUSAL_PATTERN.test(message)) {
            throw new ConnectionRefusedError('MemberJunction refused this connection. Sign in again.');
        }
        throw new Error(message);
    }
    const rows = result.Results ? (JSON.parse(result.Results) as Record<string, unknown>[]) : [];
    return { Rows: rows, TotalRowCount: result.TotalRowCount ?? rows.length };
}

async function post<T>(connection: StoredConnection, query: string, variables: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
        response = await fetch(connection.GraphQLUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': connection.APIKey },
            body: JSON.stringify({ query, variables }),
        });
    } catch {
        throw new Error('MemberJunction couldn\'t be reached. Check your connection and try again.');
    }
    if (response.status === 401 || response.status === 403) {
        throw new ConnectionRefusedError('MemberJunction refused this connection. Sign in again.');
    }
    if (!response.ok) {
        throw new Error(`MemberJunction returned an error (HTTP ${response.status}).`);
    }
    const body = (await response.json()) as GraphQLResponse<T>;
    if (body.errors && body.errors.length > 0) {
        const message = body.errors.map(e => e.message).join('; ');
        if (REFUSAL_PATTERN.test(message)) {
            throw new ConnectionRefusedError('MemberJunction refused this connection. Sign in again.');
        }
        throw new Error(message);
    }
    if (!body.data) {
        throw new Error('MemberJunction returned no data.');
    }
    return body.data;
}
