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
import { AuthorizationEvaluator, CONTEXT_TOKEN_CONTRACT_VERSION } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
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

/**
 * A query's material fields on its own row: what decides what it runs. The fingerprint covers
 * these with the query's dialect and parameter rows.
 */
export const QUERY_DEFINITION_FIELD_NAMES = ['SQL', 'UsesTemplate', 'ExternalDataSourceID'] as const;

/**
 * A query's fields that decide what other queries compose when they reference it. Composition
 * resolves `{{query:"Category/Name"}}` by path when the composing query runs, and only a
 * `Reusable` query can be composed, so renaming or moving an Approved query, or making it
 * reusable, changes what other Approved queries run. These are not in the fingerprint (a rename
 * does not change what the query itself runs), but a change to them by a user who does not hold
 * `Queries: Approve` returns an Approved query to Pending, like a definition change.
 */
export const QUERY_COMPOSITION_FIELD_NAMES = ['Name', 'CategoryID', 'Reusable'] as const;

/** A query's material fields. */
export type QueryDefinitionFields = Pick<MJQueryEntity, typeof QUERY_DEFINITION_FIELD_NAMES[number]>;

/** A query's child rows that are part of its definition: dialect variants and the parameter contract. */
export interface QueryDefinitionRows {
    SQLs: ReadonlyArray<Pick<MJQuerySQLEntity, 'SQLDialectID' | 'SQL'>>;
    Parameters: ReadonlyArray<Pick<MJQueryParameterEntity, 'Name' | 'Type' | 'IsRequired' | 'ValidationFilters' | 'IsServerSet'>>;
}

/** A user view's material fields: what decides which rows it returns. */
export type UserViewDefinitionFields = Pick<MJUserViewEntity, 'EntityID' | 'WhereClause' | 'CustomWhereClause' | 'SmartFilterWhereClause' | 'Properties'> & {
    /**
     * The alternate base view the view reads from (`MJUserViewEntityExtended.AlternateBaseView`).
     * It decides which rows the view returns, so it is part of the definition when set.
     */
    AlternateBaseView?: string | null;
};

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
        Properties: text(view.Properties),
        // Only when set, so a view without one keeps the fingerprint it already had.
        ...alternateBaseViewPart(view.AlternateBaseView)
    });
}

/** Alternate base view names are case-insensitive, so the fingerprint uses the lowercased name. */
function alternateBaseViewPart(name: string | null | undefined): { AlternateBaseView?: string } {
    const trimmed = name?.trim();
    return trimmed ? { AlternateBaseView: trimmed.toLowerCase() } : {};
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

/**
 * The authorization that lets a user approve a query. Any user with Create on `MJ: Queries` can
 * save one, as a draft (`Pending`); approving it, which makes it MJ canon, needs this.
 */
export const APPROVE_QUERIES_AUTHORIZATION = 'Queries: Approve';

/** Why the server refused a save that would approve a query. */
export const QUERY_APPROVAL_REFUSAL =
    `Approving a query needs the '${APPROVE_QUERIES_AUTHORIZATION}' authorization. Save it as Pending, and someone who holds it can approve it.`;

/**
 * Why the server refused a save that sets a query's `CacheValidationSQL`. That SQL runs as written
 * when a client checks its cache, outside the checks the query's own SQL goes through, so only a
 * user who could approve the query may write it.
 */
export const QUERY_VALIDATION_SQL_REFUSAL =
    `Setting a query's cache validation SQL needs the '${APPROVE_QUERIES_AUTHORIZATION}' authorization. Save it without one, and someone who holds it can add it.`;

/** Why the server refused a save that changes who owns an existing query. */
export const QUERY_OWNER_REFUSAL =
    `Changing who owns a query needs the '${APPROVE_QUERIES_AUTHORIZATION}' authorization.`;

/**
 * Why the server refused to delete a query that other records use: another query composes it, or
 * another user's list is sourced from it. Deleting it would remove the composing queries'
 * dependency rows and unlink those lists, records the deleting user could not write themselves.
 */
export const QUERY_DELETE_IN_USE_REFUSAL =
    `This query is used by other queries or by other users' lists, so deleting it needs the '${APPROVE_QUERIES_AUTHORIZATION}' authorization.`;

/** Why the server refused to replace a query's role permissions. */
export const QUERY_PERMISSIONS_REFUSAL =
    `Changing which roles may run a query needs Create and Delete permission on MJ: Query Permissions.`;

/**
 * Whether this user may approve queries: they hold {@link APPROVE_QUERIES_AUTHORIZATION}, directly
 * or through an ancestor authorization, or they are an `Owner`-type user (the platform's top
 * authority, never locked out of this).
 *
 * False without a user or when the authorization is not defined, so a deployment that has not
 * synced the authorization yet fails closed. The server enforces this on save; clients use it to
 * decide whether to offer approving at all.
 */
export function UserCanApproveQueries(
    user: UserInfo | null | undefined,
    provider: Pick<IMetadataProvider, 'Authorizations'> | null | undefined,
): boolean {
    if (!user) return false;
    if (user.Type?.trim().toLowerCase() === 'owner') return true;
    const authorizations = provider?.Authorizations ?? [];
    const grant = authorizations.find((a) =>
        a.Name?.trim().toLowerCase() === APPROVE_QUERIES_AUTHORIZATION.toLowerCase());
    if (!grant) return false;
    return new AuthorizationEvaluator().UserCanExecuteWithAncestors(grant, user, authorizations);
}

/** Empty text means the same as no text. */
function text(value: string | null | undefined): string | null {
    return value ? value : null;
}

/** IDs compare case-insensitively (SQL Server and PostgreSQL differ in case). */
function normalizeID(id: string | null | undefined): string | null {
    return id ? NormalizeUUID(id) : null;
}
