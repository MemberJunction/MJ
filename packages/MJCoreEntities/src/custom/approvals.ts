/**
 * Approval fingerprints for queries, user views, dashboards and components.
 *
 * An approval names the definition that was approved, not just the record: when a record is
 * approved, the server stores a fingerprint of its material fields (what decides what it runs or
 * returns). The approval is current only while the record's status is Approved AND that stored
 * fingerprint equals the fingerprint of the definition as it stands now. Edit a material field
 * and the approval goes stale; restore it exactly and the approval is current again.
 *
 * Each fingerprint is `ComputeContentHashAsync` (SHA-256 over canonical JSON) of the material
 * fields only, so a change to a description or a name never makes an approval stale. Child rows
 * (a query's dialect variants and parameters) are sorted by a semantic key first, so the same
 * rows read back in a different order give the same fingerprint.
 */
import { CONTEXT_TOKEN_CONTRACT_VERSION } from '@memberjunction/core';
import { ComputeContentHashAsync, NormalizeUUID, OrdinalCompare, UUIDsEqual } from '@memberjunction/global';
import type {
    MJComponentEntity,
    MJDashboardEntity,
    MJQueryEntity,
    MJQueryParameterEntity,
    MJQuerySQLEntity,
    MJUserViewEntity
} from '../generated/entity_subclasses';
import { QueryEngine } from '../engines/QueryEngine';

/**
 * Where a record's approval stands.
 * - `Current`: Approved, and the stored fingerprint matches the definition as it stands now.
 * - `NotApproved`: the status is not Approved.
 * - `Stale`: Approved, but the definition changed since (or no fingerprint was stored).
 */
export type ApprovalState = 'Current' | 'NotApproved' | 'Stale';

/** A query's material fields. */
export type QueryDefinitionFields = Pick<MJQueryEntity, 'SQL' | 'UsesTemplate' | 'ExternalDataSourceID'>;

/** A query's child rows that are part of its definition: dialect variants and the parameter contract. */
export interface QueryDefinitionRows {
    SQLs: ReadonlyArray<Pick<MJQuerySQLEntity, 'SQLDialectID' | 'SQL'>>;
    Parameters: ReadonlyArray<Pick<MJQueryParameterEntity, 'Name' | 'Type' | 'IsRequired' | 'ValidationFilters' | 'IsServerSet'>>;
}

/** A user view's material fields: what decides which rows it returns. */
export type UserViewDefinitionFields = Pick<MJUserViewEntity, 'EntityID' | 'WhereClause' | 'CustomWhereClause' | 'SmartFilterWhereClause' | 'Properties'>;

/** A dashboard's material fields: what it renders and runs. */
export type DashboardDefinitionFields = Pick<MJDashboardEntity, 'Type' | 'UIConfigDetails' | 'Code' | 'DriverClass'>;

/** A component version's material fields. */
export type ComponentDefinitionFields = Pick<MJComponentEntity, 'Specification' | 'Version'>;

/** The approval columns a state is worked out from. */
interface StoredApproval {
    Status: string | null;
    ApprovedFingerprint: string | null;
}

/** Where an approval stands, given its stored status and fingerprint and the current fingerprint. */
export function ApprovalStateOf(stored: StoredApproval, currentFingerprint: string): ApprovalState {
    if (stored.Status !== 'Approved') {
        return 'NotApproved';
    }
    return stored.ApprovedFingerprint === currentFingerprint ? 'Current' : 'Stale';
}

/**
 * The fingerprint of a query's definition: its SQL, whether it is a template, its external data
 * source, each dialect variant (by dialect), each parameter's contract (by name), and the context
 * token contract version, so a change to what `Context.*` means makes old approvals stale.
 */
export async function ComputeQueryFingerprintAsync(query: QueryDefinitionFields, rows: QueryDefinitionRows): Promise<string> {
    const sqls = rows.SQLs
        .map(s => ({ SQLDialectID: normalizeID(s.SQLDialectID), SQL: text(s.SQL) }))
        .sort((a, b) => OrdinalCompare(a.SQLDialectID, b.SQLDialectID) || OrdinalCompare(a.SQL, b.SQL));
    const parameters = rows.Parameters
        .map(p => ({
            Name: p.Name,
            Type: p.Type,
            IsRequired: !!p.IsRequired,
            ValidationFilters: text(p.ValidationFilters),
            IsServerSet: !!p.IsServerSet
        }))
        .sort((a, b) => OrdinalCompare(a.Name, b.Name));
    return ComputeContentHashAsync({
        Kind: 'MJ: Queries',
        ContextTokenContract: CONTEXT_TOKEN_CONTRACT_VERSION,
        SQL: text(query.SQL),
        UsesTemplate: !!query.UsesTemplate,
        ExternalDataSourceID: normalizeID(query.ExternalDataSourceID),
        SQLs: sqls,
        Parameters: parameters
    });
}

/** The fingerprint of a user view's definition: its entity, where clauses and properties. */
export async function ComputeUserViewFingerprintAsync(view: UserViewDefinitionFields): Promise<string> {
    return ComputeContentHashAsync({
        Kind: 'MJ: User Views',
        ContextTokenContract: CONTEXT_TOKEN_CONTRACT_VERSION,
        EntityID: normalizeID(view.EntityID),
        WhereClause: text(view.WhereClause),
        CustomWhereClause: !!view.CustomWhereClause,
        SmartFilterWhereClause: text(view.SmartFilterWhereClause),
        Properties: text(view.Properties)
    });
}

/** The fingerprint of a dashboard's definition: its type, configuration (parts, mappings, wires) and code. */
export async function ComputeDashboardFingerprintAsync(dashboard: DashboardDefinitionFields): Promise<string> {
    return ComputeContentHashAsync({
        Kind: 'MJ: Dashboards',
        ContextTokenContract: CONTEXT_TOKEN_CONTRACT_VERSION,
        Type: dashboard.Type,
        UIConfigDetails: text(dashboard.UIConfigDetails),
        Code: text(dashboard.Code),
        DriverClass: text(dashboard.DriverClass)
    });
}

/** The fingerprint of a component version's definition: its specification and version. */
export async function ComputeComponentFingerprintAsync(component: ComponentDefinitionFields): Promise<string> {
    return ComputeContentHashAsync({
        Kind: 'MJ: Components',
        Specification: text(component.Specification),
        Version: text(component.Version)
    });
}

/** A query's dialect variants and parameters as the `QueryEngine` holds them: what a run executes. */
export function QueryDefinitionRowsFromEngine(queryID: string): QueryDefinitionRows {
    const engine = QueryEngine.Instance;
    return {
        SQLs: engine.QuerySQLs.filter(s => UUIDsEqual(s.QueryID, queryID)),
        Parameters: engine.GetQueryParameters(queryID)
    };
}

/**
 * Where a query's approval stands. The child rows default to the `QueryEngine`'s, the ones a run
 * executes.
 */
export async function GetQueryApprovalStateAsync(
    query: QueryDefinitionFields & Pick<MJQueryEntity, 'ID' | 'Status' | 'ApprovedFingerprint'>,
    rows?: QueryDefinitionRows
): Promise<ApprovalState> {
    const fingerprint = await ComputeQueryFingerprintAsync(query, rows ?? QueryDefinitionRowsFromEngine(query.ID));
    return ApprovalStateOf(query, fingerprint);
}

/** Where a user view's approval stands. */
export async function GetUserViewApprovalStateAsync(view: UserViewDefinitionFields & Pick<MJUserViewEntity, 'ApprovalStatus' | 'ApprovedFingerprint'>): Promise<ApprovalState> {
    return ApprovalStateOf({ Status: view.ApprovalStatus, ApprovedFingerprint: view.ApprovedFingerprint }, await ComputeUserViewFingerprintAsync(view));
}

/** Where a dashboard's approval stands. */
export async function GetDashboardApprovalStateAsync(dashboard: DashboardDefinitionFields & Pick<MJDashboardEntity, 'ApprovalStatus' | 'ApprovedFingerprint'>): Promise<ApprovalState> {
    return ApprovalStateOf({ Status: dashboard.ApprovalStatus, ApprovedFingerprint: dashboard.ApprovedFingerprint }, await ComputeDashboardFingerprintAsync(dashboard));
}

/** Where a component version's approval stands. */
export async function GetComponentApprovalStateAsync(component: ComponentDefinitionFields & Pick<MJComponentEntity, 'ApprovalStatus' | 'ApprovedFingerprint'>): Promise<ApprovalState> {
    return ApprovalStateOf({ Status: component.ApprovalStatus, ApprovedFingerprint: component.ApprovedFingerprint }, await ComputeComponentFingerprintAsync(component));
}

/** Empty text means the same as no text. */
function text(value: string | null | undefined): string | null {
    return value ? value : null;
}

/** IDs compare case-insensitively (SQL Server and PostgreSQL differ in case). */
function normalizeID(id: string | null | undefined): string | null {
    return id ? NormalizeUUID(id) : null;
}
