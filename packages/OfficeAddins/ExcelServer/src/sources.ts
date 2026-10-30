/**
 * @fileoverview Resolves the saved views and queries an Open in Excel request names into workbook
 * sources: their names, columns and data types, and a query's checked parameter values.
 *
 * Everything is read AS the caller, so a view or query they can't see is refused here, before a
 * workbook exists. This reads metadata only (no rows); the add-in pane fetches rows later, as
 * whoever opens the file, through GraphQL operations that check permissions again.
 *
 * @module @memberjunction/excel-addin-server
 */
import {
    EntityFieldInfo,
    EntityFieldTSType,
    IMetadataProvider,
    QueryFieldInfo,
    QueryInfo,
    QueryParameterInfo,
    TypeScriptTypeFromSQLType,
    UserInfo,
} from '@memberjunction/core';
import { MJUserViewEntityExtended, ViewColumnInfo } from '@memberjunction/core-entities';
import { IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import {
    EXCEL_MAX_SOURCES_PER_WORKBOOK,
    ExcelColumnDataType,
    ExcelParameterValue,
    ExcelSourceColumn,
    ExcelWorkbookSource,
    ExcelWorkbookSourceRequest,
    MakeUniqueSheetName,
} from '@memberjunction/excel-addin';

/** A refusal whose message is safe to show the person who asked. */
export class ExcelSourceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExcelSourceError';
    }
}

/** A source before it has its place in the workbook. */
type ResolvedSource = Omit<ExcelWorkbookSource, 'Key' | 'SheetName'>;

const MAX_PARAMETER_TEXT = 32767;

/**
 * Resolves and checks every requested source, in order. Throws {@link ExcelSourceError} for the
 * first one the caller can't use.
 */
export async function ResolveWorkbookSources(
    requests: ExcelWorkbookSourceRequest[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ExcelWorkbookSource[]> {
    validateRequests(requests);
    const usedSheetNames = new Set<string>();
    const sources: ExcelWorkbookSource[] = [];
    // At most EXCEL_MAX_SOURCES_PER_WORKBOOK iterations; each view is loaded AS the user because that
    // load is what sets the permission context UserCanView reads.
    for (const [index, request] of requests.entries()) {
        const resolved = request.Kind === 'View'
            ? await resolveView(request.ID, provider, user)
            : resolveQuery(request, provider, user);
        sources.push({ ...resolved, Key: `s${index + 1}`, SheetName: MakeUniqueSheetName(resolved.Name, usedSheetNames) });
    }
    return sources;
}

/** The data type the pane uses for an entity field's values. */
export function DataTypeForEntityField(field: EntityFieldInfo): ExcelColumnDataType {
    switch (field.TSType) {
        case EntityFieldTSType.Number:
            return 'Number';
        case EntityFieldTSType.Boolean:
            return 'Boolean';
        case EntityFieldTSType.Date:
            return isDateOnlySQLType(field.Type) ? 'Date' : 'DateTime';
        default:
            return 'Text';
    }
}

/** The data type the pane uses for a query field, from its SQL base type; `Text` when unknown. */
export function DataTypeForSQLType(sqlType: string | null | undefined): ExcelColumnDataType {
    const trimmed = (sqlType ?? '').trim();
    if (!trimmed) {
        return 'Text';
    }
    switch (TypeScriptTypeFromSQLType(trimmed)) {
        case 'number':
            return 'Number';
        case 'boolean':
            return 'Boolean';
        case 'Date':
            return isDateOnlySQLType(trimmed) ? 'Date' : 'DateTime';
        default:
            return 'Text';
    }
}

function validateRequests(requests: ExcelWorkbookSourceRequest[]): void {
    if (!Array.isArray(requests) || requests.length === 0) {
        throw new ExcelSourceError('Choose at least one view or query to open in Excel.');
    }
    if (requests.length > EXCEL_MAX_SOURCES_PER_WORKBOOK) {
        throw new ExcelSourceError(`A workbook can hold at most ${EXCEL_MAX_SOURCES_PER_WORKBOOK} views and queries.`);
    }
    for (const request of requests) {
        if (request?.Kind !== 'View' && request?.Kind !== 'Query') {
            throw new ExcelSourceError('Only saved views and saved queries can be opened in Excel.');
        }
        if (!IsValidUUID(request.ID)) {
            throw new ExcelSourceError('That view or query ID is not valid.');
        }
    }
}

async function resolveView(viewID: string, provider: IMetadataProvider, user: UserInfo): Promise<ResolvedSource> {
    const view = await provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', user);
    const loaded = await view.Load(viewID);
    if (!loaded || !view.UserCanView) {
        throw new ExcelSourceError('That saved view doesn\'t exist, or you don\'t have access to it.');
    }
    const entity = view.ViewEntityInfo;
    if (!entity || !entity.GetUserPermisions(user).CanRead) {
        throw new ExcelSourceError(`You don't have access to the data in the view "${view.Name}".`);
    }
    const columns = viewColumns(view.Columns, entity.Fields);
    if (columns.length === 0) {
        throw new ExcelSourceError(`The view "${view.Name}" has no columns to show.`);
    }
    return { Kind: 'View', ID: view.ID, Name: view.Name, Columns: columns };
}

/** The view's visible columns in display order, or the entity's default columns when it records none. */
function viewColumns(columns: ViewColumnInfo[], fields: EntityFieldInfo[]): ExcelSourceColumn[] {
    const visible = columns
        .filter(c => c && !c.hidden && c.EntityField && !c.EntityField.IsBinaryFieldType)
        .sort((a, b) => orderOf(a) - orderOf(b));
    if (visible.length > 0) {
        return visible.map(c => ({
            Name: c.EntityField.Name,
            Header: c.userDisplayName || c.DisplayName || c.EntityField.DisplayNameOrName || c.Name,
            DataType: DataTypeForEntityField(c.EntityField),
        }));
    }
    return fields
        .filter(f => f.DefaultInView && !f.IsBinaryFieldType)
        .sort((a, b) => a.Sequence - b.Sequence)
        .map(f => ({ Name: f.Name, Header: f.DisplayNameOrName, DataType: DataTypeForEntityField(f) }));
}

function orderOf(column: ViewColumnInfo): number {
    return typeof column.orderIndex === 'number' ? column.orderIndex : Number.MAX_SAFE_INTEGER;
}

function resolveQuery(request: ExcelWorkbookSourceRequest, provider: IMetadataProvider, user: UserInfo): ResolvedSource {
    // Roles-only check (QueryInfo.UserCanRun). No rows are read here; GetQueryData runs the full check on refresh.
    const query = provider.Queries.find(q => UUIDsEqual(q.ID, request.ID));
    if (!query || !query.UserCanRun(user)) {
        throw new ExcelSourceError('That saved query doesn\'t exist, or you don\'t have access to it.');
    }
    const source: ResolvedSource = { Kind: 'Query', ID: query.ID, Name: query.Name, Columns: queryColumns(query.Fields) };
    const parameters = checkParameters(query, request.Parameters);
    if (parameters) {
        source.Parameters = parameters;
    }
    return source;
}

function queryColumns(fields: QueryFieldInfo[]): ExcelSourceColumn[] {
    return [...fields]
        .sort((a, b) => (a.Sequence ?? 0) - (b.Sequence ?? 0))
        .map(f => ({ Name: f.Name, Header: f.Name, DataType: DataTypeForSQLType(f.SQLBaseType) }));
}

/** Keeps only the query's own, caller-settable parameters, under their canonical names. */
function checkParameters(query: QueryInfo, supplied: Record<string, ExcelParameterValue> | undefined): Record<string, ExcelParameterValue> | undefined {
    if (!supplied || Object.keys(supplied).length === 0) {
        return undefined;
    }
    const result: Record<string, ExcelParameterValue> = {};
    for (const [name, value] of Object.entries(supplied)) {
        const parameter = findParameter(query.Parameters, name);
        if (!parameter) {
            throw new ExcelSourceError(`The query "${query.Name}" has no parameter "${name}".`);
        }
        if (parameter.IsServerSet) {
            throw new ExcelSourceError(`The parameter "${parameter.Name}" of the query "${query.Name}" is set by the server and can't be supplied.`);
        }
        if (!isParameterValue(value)) {
            throw new ExcelSourceError(`The value for the parameter "${parameter.Name}" isn't valid.`);
        }
        result[parameter.Name] = value;
    }
    return result;
}

function findParameter(parameters: QueryParameterInfo[], name: string): QueryParameterInfo | undefined {
    const wanted = name.trim().toLowerCase();
    return parameters.find(p => p.Name.trim().toLowerCase() === wanted);
}

function isParameterValue(value: unknown): value is ExcelParameterValue {
    if (value === null || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (typeof value === 'string') {
        return value.length <= MAX_PARAMETER_TEXT;
    }
    return Array.isArray(value) && value.every(v => typeof v === 'string' && v.length <= MAX_PARAMETER_TEXT);
}

function isDateOnlySQLType(sqlType: string | null | undefined): boolean {
    return (sqlType ?? '').trim().toLowerCase() === 'date';
}
