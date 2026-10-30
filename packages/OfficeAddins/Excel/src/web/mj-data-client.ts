/**
 * Fetches a source's rows from MJAPI's GraphQL endpoint with the pane's scoped API key.
 *
 * GraphQL, not REST, on purpose: GraphQL's `RunViewByID` and `GetQueryData` enforce the key's
 * `view:run` / `query:run` scopes, and MJAPI's REST routes don't check API-key scopes at all.
 */
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

interface RunViewResponse {
    RunViewByID: { Success: boolean; ErrorMessage?: string | null; TotalRowCount?: number | null; Results: { Data: string }[] };
}

interface RunQueryResponse {
    GetQueryData: { Success: boolean; ErrorMessage?: string | null; TotalRowCount?: number | null; Results?: string | null };
}

const RUN_VIEW_QUERY = `query MJExcelRunView($input: RunViewByIDInput!) {
    RunViewByID(input: $input) { Success ErrorMessage TotalRowCount Results { Data } }
}`;

const RUN_QUERY_QUERY = `query MJExcelRunQuery($QueryID: String!, $Parameters: JSONObject, $MaxRows: Int, $AuditLogDescription: String) {
    GetQueryData(QueryID: $QueryID, Parameters: $Parameters, MaxRows: $MaxRows, AuditLogDescription: $AuditLogDescription) {
        Success ErrorMessage TotalRowCount Results
    }
}`;

const REFUSAL_PATTERN = /api key|apikey|unauthori[sz]ed|not authenticated|authentication|expired|revoked|inactive|scope/i;

/** Fetches the rows for one workbook source. */
export async function FetchSourceRows(connection: StoredConnection, source: ExcelWorkbookSource, maxRows: number): Promise<SourceRows> {
    return source.Kind === 'View'
        ? fetchViewRows(connection, source, maxRows)
        : fetchQueryRows(connection, source, maxRows);
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
    const result = data.RunViewByID;
    if (!result.Success) {
        throw new Error(result.ErrorMessage || 'The view could not be run.');
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
        throw new Error(result.ErrorMessage || 'The query could not be run.');
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
