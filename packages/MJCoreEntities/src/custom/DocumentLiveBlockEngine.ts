import {
    EntityInfo,
    IMetadataProvider,
    IRunQueryProvider,
    Metadata,
    ProjectEntityValueRowsForUser,
    QueryInfo,
    RunQuery,
    RunQueryParams,
    RunView,
    RunViewParams,
    StripServerOnlyRunQueryParams,
    UserInfo
} from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, IndexByUUID, MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { ArtifactPermissionEngine } from './ArtifactPermissionDelegate';
import { SpreadsheetEngine } from './SpreadsheetEngine';

/**
 * Discriminator for the 5 canonical block types embeddable across MJ Docs, Slides, and Sheets.
 */
export type DocumentBlockKind =
    | 'EntityView'
    | 'SavedQuery'
    | 'DashboardPart'
    | 'InteractiveComponent'
    | 'Artifact';

/**
 * Execution mode of an embedded MJ block:
 * - `'Live'`: Evaluates dynamically as the viewing user (`contextUser`) on open/refresh.
 * - `'Frozen'`: Renders a static point-in-time snapshot captured by a specific user.
 */
export type DocumentBlockMode = 'Live' | 'Frozen';

/**
 * OLE embedding mode for `Kind === 'Artifact'` blocks:
 * - `'Link'`: Links to an existing standalone `MJ: Artifacts` record.
 * - `'Inline'`: Owns a child `MJ: Artifacts` record whose `DelegateEntityID = 'MJ: Artifacts'`
 *   and `DelegateRecordID` points to the host document/slide/sheet artifact.
 */
export type ArtifactEmbedMode = 'Link' | 'Inline';

/**
 * Column descriptor for tabular/chart live block results and frozen snapshots.
 */
export interface DocumentBlockColumn {
    /** Field or column programmatic name. */
    Name: string;
    /** Human-readable column header. */
    DisplayName: string;
    /** Optional data type hint (`'string' | 'number' | 'boolean' | 'date'`). */
    Type?: string;
}

/**
 * Static snapshot stored inside a block when `Mode === 'Frozen'` (`O5`).
 *
 * Freezing bakes the freezing user's visible rows into the artifact payload so any user
 * who can read the artifact will see those frozen values. Freezing therefore requires
 * explicit user acknowledgment (`SecurityWarningAcknowledged: true`).
 */
export interface FrozenBlockSnapshot {
    /** ISO 8601 UTC timestamp when the snapshot was captured. */
    FrozenAt: string;
    /** `UserInfo.ID` of the user who froze the block. */
    FrozenByUserID: string;
    /** Display name of the user who froze the block. */
    FrozenByUserName: string;
    /** Projected column definitions at freeze time. */
    Columns: DocumentBlockColumn[];
    /** Projected data rows at freeze time (already FLS-filtered for the freezing user). */
    Rows: Array<Record<string, unknown>>;
    /** Total row count at freeze time. */
    TotalRowCount: number;
    /** Serialized artifact content snapshot when freezing an `Artifact` block (e.g., Whiteboard JSON). */
    ArtifactContentSnapshot?: string;
    /** Content type / artifact type name for `ArtifactContentSnapshot`. */
    ArtifactTypeSnapshot?: string;
    /** Must be `true` to confirm the user accepted the RLS/FLS visibility warning modal (`O5`). */
    SecurityWarningAcknowledged: boolean;
}

/**
 * Serializable specification for an embedded MJ block inside a Document (`:::mj-block`),
 * Slide region, or Sheet workbook.
 */
export interface DocumentBlockSpec {
    /** Stable unique identifier for this block instance within the host artifact. */
    BlockID: string;
    /** Block type discriminator. */
    Kind: DocumentBlockKind;
    /** Optional display title shown in the block header bar. */
    Title?: string;
    /** `'Live'` (viewer-scoped dynamic evaluation) or `'Frozen'` (static snapshot). */
    Mode: DocumentBlockMode;

    // --- EntityView Configuration ---
    /** Target MJ entity name when `Kind === 'EntityView'`. */
    EntityName?: string;
    /** Optional saved `MJ: User Views` ID when `Kind === 'EntityView'`. */
    ViewID?: string;
    /** Optional saved `MJ: User Views` name when `Kind === 'EntityView'`. */
    ViewName?: string;
    /** Optional SQL filter expression (`ExtraFilter`) when `Kind === 'EntityView'`. */
    ExtraFilter?: string;
    /** Optional `OrderBy` clause when `Kind === 'EntityView'`. */
    OrderBy?: string;
    /** Explicit list of field names to project when `Kind === 'EntityView'`. */
    Fields?: string[];
    /** Presentation layout for `EntityView` or `SavedQuery` (`'grid' | 'cards' | 'summary' | 'table' | 'chart' | 'kpi'`). */
    DisplayMode?: 'grid' | 'cards' | 'summary' | 'table' | 'chart' | 'kpi';

    // --- SavedQuery Configuration ---
    /** Target `MJ: Queries` ID when `Kind === 'SavedQuery'`. */
    QueryID?: string;
    /** Target `MJ: Queries` name when `Kind === 'SavedQuery'`. */
    QueryName?: string;
    /** Optional query category path for disambiguation when `Kind === 'SavedQuery'`. */
    CategoryPath?: string;
    /** User-supplied query parameters (`IsServerSet` parameters are stripped automatically). */
    Parameters?: Record<string, unknown>;
    /** Chart type when `DisplayMode === 'chart'`. */
    ChartType?: 'bar' | 'line' | 'pie' | 'area';

    // --- DashboardPart Configuration ---
    /** Target `MJ: Dashboards` ID when `Kind === 'DashboardPart'`. */
    DashboardID?: string;
    /** Optional sub-part identifier within the dashboard. */
    DashboardPartID?: string;
    /** Display name of the referenced dashboard. */
    DashboardName?: string;

    // --- InteractiveComponent Configuration ---
    /** Target `MJ: Components` ID when `Kind === 'InteractiveComponent'`. */
    ComponentID?: string;
    /** Target component name when `Kind === 'InteractiveComponent'`. */
    ComponentName?: string;
    /** Serialized component specification/inputs when `Kind === 'InteractiveComponent'`. */
    ComponentSpec?: Record<string, unknown>;

    // --- OLE Artifact Configuration (§ 3.4.1) ---
    /** Target `MJ: Artifacts` ID when `Kind === 'Artifact'`. */
    ArtifactID?: string;
    /** Target artifact type name (e.g., `'Whiteboard'`, `'Presentation'`, `'Excel Spreadsheet'`). */
    ArtifactType?: string;
    /** Optional pinned `MJ: Artifact Versions` ID (`null`/`undefined` tracks latest version). */
    VersionID?: string | null;
    /** `'Link'` (standalone artifact) or `'Inline'` (delegated child artifact). */
    EmbedMode?: ArtifactEmbedMode;
    /** Optional height in pixels for inline canvas/viewer rendering. */
    HeightPx?: number;
    /** Optional worksheet ID or name when embedding a chart or cell range from an `Excel Spreadsheet` artifact (`§ 6.3`, `Accept #5`). */
    SheetID?: string;
    /** Optional A1 range (`'A1:C6'`) when embedding a range or chart from an `Excel Spreadsheet` artifact (`§ 6.3`, `Accept #5`). */
    SheetRange?: string;
    /** Optional chart ID (`'chart-1'`) when embedding a range chart from an `Excel Spreadsheet` artifact (`§ 6.3`, `Accept #5`). */
    SheetChartID?: string;

    // --- Row Limits & Frozen State ---
    /** Maximum rows to fetch in live mode (defaults to 100). */
    MaxRows?: number;
    /** Point-in-time snapshot used when `Mode === 'Frozen'`. */
    FrozenSnapshot?: FrozenBlockSnapshot | null;
}

/**
 * Standardized execution result returned when evaluating a {@link DocumentBlockSpec} for a viewer.
 */
export interface DocumentBlockExecutionResult {
    /** Block identifier echoed from the input spec. */
    BlockID: string;
    /** Block kind echoed from the input spec. */
    Kind: DocumentBlockKind;
    /** Effective mode (`'Live'` or `'Frozen'`). */
    Mode: DocumentBlockMode;
    /** Whether execution succeeded. */
    Success: boolean;
    /** True when the block failed specifically due to RLS, entity permission, or artifact permission denial. */
    AccessDenied?: boolean;
    /** Human-readable error or permission denial message when `Success === false`. */
    ErrorMessage?: string;
    /** Visible columns after FLS projection. */
    Columns: DocumentBlockColumn[];
    /** Visible rows after RLS + FLS projection. */
    Rows: Array<Record<string, unknown>>;
    /** Total matching rows. */
    TotalRowCount: number;
    /** Names of any client-supplied parameters that were stripped because `IsServerSet === true`. */
    StrippedServerSetParameters?: string[];
    /** Resolved artifact content when `Kind === 'Artifact'`. */
    ArtifactContent?: string;
    /** Resolved artifact type name when `Kind === 'Artifact'`. */
    ArtifactType?: string;
    /** Resolved artifact display name when `Kind === 'Artifact'`. */
    ArtifactName?: string;
    /** Resolved artifact version number when `Kind === 'Artifact'`. */
    ArtifactVersionNumber?: number;
    /** Whether the current viewer may edit the embedded artifact inline (`Kind === 'Artifact'`). */
    CanEditArtifact?: boolean;
    /** Metadata about the frozen snapshot when `Mode === 'Frozen'`. */
    FrozenMetadata?: {
        FrozenAt: string;
        FrozenByUserID: string;
        FrozenByUserName: string;
    };
}

/**
 * Base class for pluggable block handlers registered via `@RegisterClass(BaseDocumentBlock, '<Kind>')`.
 */
export abstract class BaseDocumentBlock {
    public abstract readonly Kind: DocumentBlockKind;

    /**
     * Validates a block specification prior to insertion or execution.
     */
    public abstract ValidateSpec(spec: DocumentBlockSpec): { Valid: boolean; ErrorMessage?: string };

    /**
     * Executes or resolves the block for `user` using `provider`.
     */
    public abstract Execute(
        spec: DocumentBlockSpec,
        provider: IMetadataProvider,
        user: UserInfo,
        serverParameters?: Record<string, unknown>
    ): Promise<DocumentBlockExecutionResult>;
}

/**
 * Handler for `Kind === 'EntityView'` live blocks.
 * Enforces entity `CanRead`, Row-Level Security (via `RunView`), and Field-Level Security
 * (via `ProjectEntityValueRowsForUser` + column header filtering).
 */
@RegisterClass(BaseDocumentBlock, 'EntityView')
export class EntityViewDocumentBlock extends BaseDocumentBlock {
    public readonly Kind: DocumentBlockKind = 'EntityView';

    public ValidateSpec(spec: DocumentBlockSpec): { Valid: boolean; ErrorMessage?: string } {
        if (!spec.EntityName && !spec.ViewID && !spec.ViewName) {
            return {
                Valid: false,
                ErrorMessage: 'EntityView block requires at least one of EntityName, ViewID, or ViewName.'
            };
        }
        return { Valid: true };
    }

    public async Execute(
        spec: DocumentBlockSpec,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<DocumentBlockExecutionResult> {
        if (spec.Mode === 'Frozen' && spec.FrozenSnapshot) {
            return buildFrozenExecutionResult(spec);
        }

        const validation = this.ValidateSpec(spec);
        if (!validation.Valid) {
            return buildErrorResult(spec, validation.ErrorMessage ?? 'Invalid EntityView specification.');
        }

        let targetEntityName = (spec.EntityName ?? '').trim();
        const rv = RunView.FromMetadataProvider(provider);

        // If ViewID is provided without EntityName, look up the UserView's Entity name first.
        if (!targetEntityName && spec.ViewID) {
            const viewLookup = await rv.RunView<{ ID: string; Entity: string }>(
                {
                    EntityName: 'MJ: User Views',
                    ExtraFilter: `ID='${EscapeSQLString(spec.ViewID)}'`,
                    Fields: ['ID', 'Entity'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                user
            );
            if (viewLookup.Success && viewLookup.Results && viewLookup.Results.length > 0) {
                targetEntityName = viewLookup.Results[0].Entity;
            }
        }

        const entityInfo = targetEntityName
            ? provider.Entities?.find((e) => e.Name.trim().toLowerCase() === targetEntityName.toLowerCase())
            : undefined;

        if (!entityInfo) {
            return buildErrorResult(spec, `Entity '${targetEntityName || spec.ViewName || spec.ViewID}' was not found.`);
        }

        const perms = entityInfo.GetUserPermisions(user);
        if (!perms?.CanRead) {
            return {
                BlockID: spec.BlockID,
                Kind: spec.Kind,
                Mode: 'Live',
                Success: false,
                AccessDenied: true,
                ErrorMessage: `You do not have permission to read ${entityInfo.DisplayNameOrName} records.`,
                Columns: [],
                Rows: [],
                TotalRowCount: 0
            };
        }

        // Determine allowed fields after FLS denied-read filtering
        // fls-guard: filter EntityView live block columns and rows using GetDeniedReadFields + ProjectEntityValueRowsForUser
        const deniedFields = entityInfo.FieldLevelSecurityApplies
            ? entityInfo.GetDeniedReadFields(user)
            : new Set<string>();

        let requestedFields: string[] = [];
        if (Array.isArray(spec.Fields) && spec.Fields.length > 0) {
            requestedFields = spec.Fields;
        } else {
            const defaultInView = entityInfo.Fields.filter((f) => f.DefaultInView && !f.IsBinaryFieldType);
            if (defaultInView.length > 0) {
                requestedFields = defaultInView.slice(0, 12).map((f) => f.Name);
            } else {
                const nonSystemFields = entityInfo.Fields.filter(
                    (f) => !f.IsBinaryFieldType && !f.Name.startsWith('__mj_') && f.Name !== 'ID'
                );
                requestedFields = (nonSystemFields.length > 0 ? nonSystemFields : entityInfo.Fields.filter((f) => !f.IsBinaryFieldType))
                    .slice(0, 8)
                    .map((f) => f.Name);
            }
        }

        const visibleFieldNames = requestedFields.filter((f) => !deniedFields.has(f.trim().toLowerCase()));

        const runParams: RunViewParams = {
            EntityName: entityInfo.Name,
            ViewID: spec.ViewID,
            ViewName: spec.ViewName,
            ExtraFilter: spec.ExtraFilter,
            OrderBy: spec.OrderBy,
            Fields: visibleFieldNames.length > 0 ? visibleFieldNames : undefined,
            MaxRows: spec.MaxRows ?? 100,
            ResultType: 'simple'
        };

        const viewResult = await rv.RunView<Record<string, unknown>>(runParams, user);
        if (!viewResult.Success) {
            return buildErrorResult(spec, viewResult.ErrorMessage || `Failed to run view on ${entityInfo.Name}.`);
        }

        const rawRows = viewResult.Results ?? [];
        // fls-guard: project EntityView live block rows for viewer FLS
        const projectedRows = (ProjectEntityValueRowsForUser(provider, entityInfo, rawRows, user) ?? []) as Array<
            Record<string, unknown>
        >;

        const columns: DocumentBlockColumn[] = visibleFieldNames.map((fieldName) => {
            const fInfo = entityInfo.Fields.find((f) => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
            return {
                Name: fInfo?.Name ?? fieldName,
                DisplayName: fInfo?.DisplayNameOrName ?? fieldName,
                Type: fInfo?.TSType?.toLowerCase() ?? 'string'
            };
        });

        return {
            BlockID: spec.BlockID,
            Kind: spec.Kind,
            Mode: 'Live',
            Success: true,
            Columns: columns,
            Rows: projectedRows,
            TotalRowCount: viewResult.TotalRowCount ?? projectedRows.length
        };
    }
}

/**
 * Handler for `Kind === 'SavedQuery'` live blocks.
 * Enforces query execution permissions, strips `SERVER_ONLY_RUN_QUERY_PARAMS` and any parameter
 * marked `IsServerSet === true` on `MJ: Query Parameters`, and applies FLS output projection
 * across any entities referenced by the query (`QueryInfo.Entities`).
 */
@RegisterClass(BaseDocumentBlock, 'SavedQuery')
export class SavedQueryDocumentBlock extends BaseDocumentBlock {
    public readonly Kind: DocumentBlockKind = 'SavedQuery';

    public ValidateSpec(spec: DocumentBlockSpec): { Valid: boolean; ErrorMessage?: string } {
        if (!spec.QueryID && !spec.QueryName) {
            return {
                Valid: false,
                ErrorMessage: 'SavedQuery block requires either QueryID or QueryName.'
            };
        }
        return { Valid: true };
    }

    public async Execute(
        spec: DocumentBlockSpec,
        provider: IMetadataProvider,
        user: UserInfo,
        serverParameters?: Record<string, unknown>
    ): Promise<DocumentBlockExecutionResult> {
        if (spec.Mode === 'Frozen' && spec.FrozenSnapshot) {
            return buildFrozenExecutionResult(spec);
        }

        const validation = this.ValidateSpec(spec);
        if (!validation.Valid) {
            return buildErrorResult(spec, validation.ErrorMessage ?? 'Invalid SavedQuery specification.');
        }

        const queryInfo = resolveQueryInfo(provider, spec.QueryID, spec.QueryName, spec.CategoryPath);
        if (queryInfo && !queryInfo.UserCanRun(user)) {
            return {
                BlockID: spec.BlockID,
                Kind: spec.Kind,
                Mode: 'Live',
                Success: false,
                AccessDenied: true,
                ErrorMessage: `You do not have permission to run query '${queryInfo.Name}'.`,
                Columns: [],
                Rows: [],
                TotalRowCount: 0
            };
        }

        const { cleanParameters, strippedNames } = sanitizeClientQueryParameters(queryInfo, spec.Parameters);

        const baseRunParams = StripServerOnlyRunQueryParams({
            QueryID: spec.QueryID,
            QueryName: spec.QueryName,
            CategoryPath: spec.CategoryPath,
            Parameters: cleanParameters,
            MaxRows: spec.MaxRows ?? 100
        });

        const finalRunParams: RunQueryParams =
            serverParameters && Object.keys(serverParameters).length > 0
                ? { ...baseRunParams, ServerParameters: serverParameters }
                : baseRunParams;

        const rq = new RunQuery(provider as unknown as IRunQueryProvider);
        const queryResult = await rq.RunQuery(finalRunParams, user);
        if (!queryResult.Success) {
            return {
                BlockID: spec.BlockID,
                Kind: spec.Kind,
                Mode: 'Live',
                Success: false,
                ErrorMessage: queryResult.ErrorMessage || 'SavedQuery execution failed.',
                Columns: [],
                Rows: [],
                TotalRowCount: 0,
                StrippedServerSetParameters: strippedNames
            };
        }

        let rows = (queryResult.Results ?? []) as Array<Record<string, unknown>>;

        // Apply FLS output projection for every entity referenced by the query
        const referencedEntities = resolveReferencedEntitiesForQuery(provider, queryInfo);
        const deniedColumnNames = new Set<string>();
        for (const entityInfo of referencedEntities) {
            // fls-guard: project SavedQuery live block rows against referenced entity FLS
            if (entityInfo.FieldLevelSecurityApplies) {
                for (const denied of entityInfo.GetDeniedReadFields(user)) {
                    deniedColumnNames.add(denied);
                }
                rows = (ProjectEntityValueRowsForUser(provider, entityInfo, rows, user) ?? []) as Array<
                    Record<string, unknown>
                >;
            }
        }

        const firstRow = rows[0] ?? {};
        const columnKeys = Object.keys(firstRow).filter((k) => !deniedColumnNames.has(k.trim().toLowerCase()));
        const columns: DocumentBlockColumn[] = columnKeys.map((key) => ({
            Name: key,
            DisplayName: key,
            Type: typeof firstRow[key] === 'number' ? 'number' : typeof firstRow[key] === 'boolean' ? 'boolean' : 'string'
        }));

        return {
            BlockID: spec.BlockID,
            Kind: spec.Kind,
            Mode: 'Live',
            Success: true,
            Columns: columns,
            Rows: rows,
            TotalRowCount: queryResult.TotalRowCount ?? rows.length,
            StrippedServerSetParameters: strippedNames
        };
    }
}

/**
 * Handler for `Kind === 'DashboardPart'` blocks.
 */
@RegisterClass(BaseDocumentBlock, 'DashboardPart')
export class DashboardPartDocumentBlock extends BaseDocumentBlock {
    public readonly Kind: DocumentBlockKind = 'DashboardPart';

    public ValidateSpec(spec: DocumentBlockSpec): { Valid: boolean; ErrorMessage?: string } {
        if (!spec.DashboardID && !spec.DashboardName) {
            return { Valid: false, ErrorMessage: 'DashboardPart block requires DashboardID or DashboardName.' };
        }
        return { Valid: true };
    }

    public async Execute(
        spec: DocumentBlockSpec,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<DocumentBlockExecutionResult> {
        if (spec.Mode === 'Frozen' && spec.FrozenSnapshot) {
            return buildFrozenExecutionResult(spec);
        }
        const validation = this.ValidateSpec(spec);
        if (!validation.Valid) {
            return buildErrorResult(spec, validation.ErrorMessage ?? 'Invalid DashboardPart specification.');
        }

        const rv = RunView.FromMetadataProvider(provider);
        const filter = spec.DashboardID
            ? `ID='${EscapeSQLString(spec.DashboardID)}'`
            : `Name='${EscapeSQLString(spec.DashboardName ?? '')}'`;
        const res = await rv.RunView<{ ID: string; Name: string; Description?: string | null }>(
            {
                EntityName: 'MJ: Dashboards',
                ExtraFilter: filter,
                Fields: ['ID', 'Name', 'Description'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple'
            },
            user
        );
        if (!res.Success || !res.Results || res.Results.length === 0) {
            return {
                BlockID: spec.BlockID,
                Kind: spec.Kind,
                Mode: 'Live',
                Success: false,
                AccessDenied: true,
                ErrorMessage: 'Dashboard not found or access denied.',
                Columns: [],
                Rows: [],
                TotalRowCount: 0
            };
        }
        const dash = res.Results[0];
        return {
            BlockID: spec.BlockID,
            Kind: spec.Kind,
            Mode: 'Live',
            Success: true,
            Columns: [
                { Name: 'ID', DisplayName: 'Dashboard ID' },
                { Name: 'Name', DisplayName: 'Dashboard Name' },
                { Name: 'PartID', DisplayName: 'Part ID' }
            ],
            Rows: [{ ID: dash.ID, Name: dash.Name, PartID: spec.DashboardPartID ?? 'default' }],
            TotalRowCount: 1
        };
    }
}

/**
 * Handler for `Kind === 'InteractiveComponent'` blocks.
 */
@RegisterClass(BaseDocumentBlock, 'InteractiveComponent')
export class InteractiveComponentDocumentBlock extends BaseDocumentBlock {
    public readonly Kind: DocumentBlockKind = 'InteractiveComponent';

    public ValidateSpec(spec: DocumentBlockSpec): { Valid: boolean; ErrorMessage?: string } {
        if (!spec.ComponentID && !spec.ComponentName && !spec.ComponentSpec) {
            return {
                Valid: false,
                ErrorMessage: 'InteractiveComponent block requires ComponentID, ComponentName, or ComponentSpec.'
            };
        }
        return { Valid: true };
    }

    public async Execute(
        spec: DocumentBlockSpec,
        _provider: IMetadataProvider,
        _user: UserInfo
    ): Promise<DocumentBlockExecutionResult> {
        if (spec.Mode === 'Frozen' && spec.FrozenSnapshot) {
            return buildFrozenExecutionResult(spec);
        }
        const validation = this.ValidateSpec(spec);
        if (!validation.Valid) {
            return buildErrorResult(spec, validation.ErrorMessage ?? 'Invalid InteractiveComponent specification.');
        }
        return {
            BlockID: spec.BlockID,
            Kind: spec.Kind,
            Mode: 'Live',
            Success: true,
            Columns: [{ Name: 'ComponentName', DisplayName: 'Component' }],
            Rows: [{ ComponentID: spec.ComponentID ?? null, ComponentName: spec.ComponentName ?? 'Interactive Component' }],
            TotalRowCount: 1
        };
    }
}

/**
 * Handler for `Kind === 'Artifact'` ("MS OLE" Inline Artifact Blocks, § 3.4.1).
 * Evaluates viewer permissions on the target artifact via {@link ArtifactPermissionEngine}
 * (including parent-artifact delegation for inline Whiteboards) and loads the pinned or latest
 * `MJ: Artifact Versions` payload.
 */
@RegisterClass(BaseDocumentBlock, 'Artifact')
export class ArtifactDocumentBlock extends BaseDocumentBlock {
    public readonly Kind: DocumentBlockKind = 'Artifact';

    public ValidateSpec(spec: DocumentBlockSpec): { Valid: boolean; ErrorMessage?: string } {
        if (!spec.ArtifactID) {
            return { Valid: false, ErrorMessage: 'Artifact block requires an ArtifactID.' };
        }
        return { Valid: true };
    }

    public async Execute(
        spec: DocumentBlockSpec,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<DocumentBlockExecutionResult> {
        if (spec.Mode === 'Frozen' && spec.FrozenSnapshot) {
            return buildFrozenExecutionResult(spec);
        }

        const validation = this.ValidateSpec(spec);
        if (!validation.Valid) {
            return buildErrorResult(spec, validation.ErrorMessage ?? 'Invalid Artifact block specification.');
        }

        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, spec.ArtifactID, user);
        if (!perms.CanRead) {
            return {
                BlockID: spec.BlockID,
                Kind: spec.Kind,
                Mode: 'Live',
                Success: false,
                AccessDenied: true,
                ErrorMessage: perms.Reason || 'You do not have permission to view this embedded artifact.',
                Columns: [],
                Rows: [],
                TotalRowCount: 0
            };
        }

        const rv = RunView.FromMetadataProvider(provider);
        const safeArtifactId = EscapeSQLString(spec.ArtifactID!);
        const versionFilter = spec.VersionID
            ? `ArtifactID='${safeArtifactId}' AND ID='${EscapeSQLString(spec.VersionID)}'`
            : `ArtifactID='${safeArtifactId}'`;

        const [artifactRes, versionRes] = await rv.RunViews(
            [
                {
                    EntityName: 'MJ: Artifacts',
                    ExtraFilter: `ID='${safeArtifactId}'`,
                    Fields: ['ID', 'Name', 'Type'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: versionFilter,
                    OrderBy: 'VersionNumber DESC',
                    Fields: ['ID', 'ArtifactID', 'VersionNumber', 'Content', 'Configuration'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                }
            ],
            user
        );

        const artifactRow = (artifactRes.Results?.[0] as { ID: string; Name: string; Type: string } | undefined) ?? null;
        const versionRow =
            (versionRes.Results?.[0] as
                | { ID: string; VersionNumber: number; Content?: string | null; Configuration?: string | null }
                | undefined) ?? null;

        if (!artifactRow) {
            return buildErrorResult(spec, `Embedded artifact '${spec.ArtifactID}' was not found.`);
        }

        const resolvedType = artifactRow.Type || spec.ArtifactType || '';
        if (
            (spec.SheetChartID || spec.SheetRange || resolvedType === 'Excel Spreadsheet') &&
            (spec.SheetChartID || spec.SheetRange)
        ) {
            const wb = SpreadsheetEngine.Instance.ParseWorkbook(
                versionRow?.Content ?? '',
                versionRow?.Configuration ?? null
            );
            const targetSheetId = spec.SheetID || wb.ActiveSheetID;
            let dataset = spec.SheetChartID
                ? SpreadsheetEngine.Instance.ExtractChartDataset(wb, targetSheetId, spec.SheetChartID)
                : null;
            if (!dataset && spec.SheetRange) {
                dataset = SpreadsheetEngine.Instance.ExtractChartDataset(wb, targetSheetId, spec.SheetRange);
            }
            if (dataset) {
                return {
                    BlockID: spec.BlockID,
                    Kind: spec.Kind,
                    Mode: 'Live',
                    Success: true,
                    Columns: dataset.Columns,
                    Rows: dataset.Rows,
                    TotalRowCount: dataset.Rows.length,
                    ArtifactContent: versionRow?.Content ?? '',
                    ArtifactType: resolvedType,
                    ArtifactName: artifactRow.Name,
                    ArtifactVersionNumber: versionRow?.VersionNumber ?? 1,
                    CanEditArtifact: perms.CanEdit && !spec.VersionID
                };
            }
        }

        return {
            BlockID: spec.BlockID,
            Kind: spec.Kind,
            Mode: 'Live',
            Success: true,
            Columns: [
                { Name: 'ArtifactID', DisplayName: 'Artifact ID' },
                { Name: 'Name', DisplayName: 'Name' },
                { Name: 'Type', DisplayName: 'Type' },
                { Name: 'VersionNumber', DisplayName: 'Version' }
            ],
            Rows: [
                {
                    ArtifactID: artifactRow.ID,
                    Name: artifactRow.Name,
                    Type: artifactRow.Type,
                    VersionNumber: versionRow?.VersionNumber ?? 1
                }
            ],
            TotalRowCount: 1,
            ArtifactContent: versionRow?.Content ?? '',
            ArtifactType: artifactRow.Type || spec.ArtifactType,
            ArtifactName: artifactRow.Name,
            ArtifactVersionNumber: versionRow?.VersionNumber ?? 1,
            CanEditArtifact: perms.CanEdit && !spec.VersionID
        };
    }
}

/**
 * Segment produced when parsing a Markdown Document containing `:::mj-block` directives.
 */
export interface ParsedDocumentSegment {
    /** `'markdown'` for standard prose or `'mj-block'` for an embedded MJ live/frozen block. */
    Type: 'markdown' | 'mj-block';
    /** Raw Markdown text for `'markdown'` segments, or raw directive string for `'mj-block'`. */
    RawText: string;
    /** Parsed {@link DocumentBlockSpec} when `Type === 'mj-block'`. */
    BlockSpec?: DocumentBlockSpec;
    /** Line number (1-based) where the segment starts in the source Markdown. */
    StartLine: number;
    /** Line number (1-based) where the segment ends in the source Markdown. */
    EndLine: number;
}

/**
 * Central engine for validating, executing, freezing, unfreezing, and serializing
 * embedded MJ blocks (`EntityView`, `SavedQuery`, `DashboardPart`, `InteractiveComponent`, `Artifact`)
 * across MJ Docs, Slides, and Sheets.
 */
export class DocumentLiveBlockEngine extends BaseSingleton<DocumentLiveBlockEngine> {
    protected constructor() {
        super();
    }

    /** Returns the process-wide singleton instance of {@link DocumentLiveBlockEngine}. */
    public static get Instance(): DocumentLiveBlockEngine {
        return super.getInstance<DocumentLiveBlockEngine>();
    }

    /**
     * Resolves the registered {@link BaseDocumentBlock} handler for `kind`.
     */
    public GetBlockHandler(kind: DocumentBlockKind): BaseDocumentBlock | null {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDocumentBlock>(BaseDocumentBlock, kind);
        if (instance && instance.constructor !== BaseDocumentBlock) {
            return instance;
        }
        switch (kind) {
            case 'EntityView':
                return new EntityViewDocumentBlock();
            case 'SavedQuery':
                return new SavedQueryDocumentBlock();
            case 'DashboardPart':
                return new DashboardPartDocumentBlock();
            case 'InteractiveComponent':
                return new InteractiveComponentDocumentBlock();
            case 'Artifact':
                return new ArtifactDocumentBlock();
            default:
                return null;
        }
    }

    /**
     * Executes a {@link DocumentBlockSpec} as `user` with full RLS, FLS, and `IsServerSet` parameter protection.
     */
    public async ExecuteBlock(
        spec: DocumentBlockSpec,
        user: UserInfo,
        provider?: IMetadataProvider | null,
        serverParameters?: Record<string, unknown>
    ): Promise<DocumentBlockExecutionResult> {
        const activeProvider = provider ?? Metadata.Provider;
        if (!activeProvider) {
            return buildErrorResult(spec, 'Metadata provider is not initialized.');
        }
        if (!user) {
            return buildErrorResult(spec, 'Authenticated user context is required to execute a block.');
        }
        const handler = this.GetBlockHandler(spec.Kind);
        if (!handler) {
            return buildErrorResult(spec, `Unsupported block kind '${spec.Kind}'.`);
        }
        return await handler.Execute(spec, activeProvider, user, serverParameters);
    }

    /**
     * Freezes a live block into a point-in-time snapshot (`Mode = 'Frozen'`, `O5`).
     *
     * Requires `acknowledgeSecurityWarning === true` to confirm the user accepted the modal
     * warning that freezing bakes their currently visible rows into the artifact.
     */
    public async FreezeBlock(
        spec: DocumentBlockSpec,
        user: UserInfo,
        acknowledgeSecurityWarning: boolean,
        provider?: IMetadataProvider | null
    ): Promise<{ Success: boolean; UpdatedSpec?: DocumentBlockSpec; ErrorMessage?: string }> {
        if (!acknowledgeSecurityWarning) {
            return {
                Success: false,
                ErrorMessage:
                    'Freezing a live block requires explicit acknowledgment (acknowledgeSecurityWarning = true) because frozen data is visible to all readers of this artifact.'
            };
        }

        const liveSpec: DocumentBlockSpec = { ...spec, Mode: 'Live' };
        const result = await this.ExecuteBlock(liveSpec, user, provider);
        if (!result.Success) {
            return {
                Success: false,
                ErrorMessage: result.ErrorMessage || 'Cannot freeze block because live execution failed.'
            };
        }

        const snapshot: FrozenBlockSnapshot = {
            FrozenAt: new Date().toISOString(),
            FrozenByUserID: user.ID,
            FrozenByUserName: user.Name || user.Email || user.ID,
            Columns: result.Columns,
            Rows: result.Rows,
            TotalRowCount: result.TotalRowCount,
            ArtifactContentSnapshot: result.ArtifactContent,
            ArtifactTypeSnapshot: result.ArtifactType,
            SecurityWarningAcknowledged: true
        };

        return {
            Success: true,
            UpdatedSpec: {
                ...spec,
                Mode: 'Frozen',
                FrozenSnapshot: snapshot
            }
        };
    }

    /**
     * Converts a frozen block back to `'Live'` mode, clearing its static `FrozenSnapshot`.
     */
    public UnfreezeBlock(spec: DocumentBlockSpec): DocumentBlockSpec {
        const copy: DocumentBlockSpec = {
            ...spec,
            Mode: 'Live'
        };
        delete copy.FrozenSnapshot;
        return copy;
    }

    /**
     * Serializes a {@link DocumentBlockSpec} into a canonical Markdown `:::mj-block` fenced directive.
     */
    public SerializeBlockToMarkdownDirective(spec: DocumentBlockSpec): string {
        const json = JSON.stringify(spec, null, 2);
        return `:::mj-block\n${json}\n:::`;
    }

    /**
     * Parses a Markdown document into alternating `'markdown'` prose segments and `'mj-block'`
     * embedded block segments.
     */
    public ParseMarkdownDirectives(markdown: string): ParsedDocumentSegment[] {
        const lines = (markdown ?? '').split(/\r?\n/);
        const segments: ParsedDocumentSegment[] = [];
        let proseLines: string[] = [];
        let proseStartLine = 1;

        let i = 0;
        while (i < lines.length) {
            const trimmed = lines[i].trim();
            if (trimmed === ':::mj-block' || trimmed.startsWith(':::mj-block ')) {
                if (proseLines.length > 0) {
                    segments.push({
                        Type: 'markdown',
                        RawText: proseLines.join('\n'),
                        StartLine: proseStartLine,
                        EndLine: i
                    });
                    proseLines = [];
                }
                const blockStartLine = i + 1;
                const blockJsonLines: string[] = [];
                i++;
                while (i < lines.length && lines[i].trim() !== ':::') {
                    blockJsonLines.push(lines[i]);
                    i++;
                }
                const blockEndLine = Math.min(i + 1, lines.length);
                const rawJson = blockJsonLines.join('\n').trim();
                let parsedSpec: DocumentBlockSpec | undefined;
                try {
                    const candidate = JSON.parse(rawJson) as DocumentBlockSpec;
                    if (candidate && typeof candidate === 'object' && candidate.BlockID && candidate.Kind) {
                        parsedSpec = candidate;
                    }
                } catch {
                    parsedSpec = undefined;
                }
                const rawDirective = [':::mj-block', ...blockJsonLines, ':::'].join('\n');
                if (parsedSpec) {
                    segments.push({
                        Type: 'mj-block',
                        RawText: rawDirective,
                        BlockSpec: parsedSpec,
                        StartLine: blockStartLine,
                        EndLine: blockEndLine
                    });
                } else {
                    segments.push({
                        Type: 'markdown',
                        RawText: rawDirective,
                        StartLine: blockStartLine,
                        EndLine: blockEndLine
                    });
                }
                i++;
                proseStartLine = i + 1;
            } else {
                if (proseLines.length === 0) {
                    proseStartLine = i + 1;
                }
                proseLines.push(lines[i]);
                i++;
            }
        }

        if (proseLines.length > 0) {
            segments.push({
                Type: 'markdown',
                RawText: proseLines.join('\n'),
                StartLine: proseStartLine,
                EndLine: lines.length
            });
        }

        return segments;
    }

    /**
     * Replaces or deletes an embedded `:::mj-block` in `markdown` by `blockId`.
     */
    public UpdateBlockInMarkdown(
        markdown: string,
        blockId: string,
        updatedSpec: DocumentBlockSpec | null
    ): { Found: boolean; Markdown: string } {
        const segments = this.ParseMarkdownDirectives(markdown);
        let found = false;
        const outputParts: string[] = [];

        for (const seg of segments) {
            if (seg.Type === 'mj-block' && seg.BlockSpec && seg.BlockSpec.BlockID === blockId) {
                found = true;
                if (updatedSpec) {
                    outputParts.push(this.SerializeBlockToMarkdownDirective(updatedSpec));
                }
            } else {
                outputParts.push(seg.RawText);
            }
        }

        return {
            Found: found,
            Markdown: outputParts.join('\n')
        };
    }
}

function buildFrozenExecutionResult(spec: DocumentBlockSpec): DocumentBlockExecutionResult {
    const snap = spec.FrozenSnapshot!;
    if (snap.SecurityWarningAcknowledged !== true) {
        return {
            BlockID: spec.BlockID,
            Kind: spec.Kind,
            Mode: 'Frozen',
            Success: false,
            ErrorMessage:
                'Security violation: Frozen block snapshots require explicit acknowledgement of the RLS/FLS security warning (SecurityWarningAcknowledged: true).',
            Columns: [],
            Rows: [],
            TotalRowCount: 0
        };
    }
    return {
        BlockID: spec.BlockID,
        Kind: spec.Kind,
        Mode: 'Frozen',
        Success: true,
        Columns: snap.Columns ?? [],
        Rows: snap.Rows ?? [],
        TotalRowCount: snap.TotalRowCount ?? (snap.Rows ? snap.Rows.length : 0),
        ArtifactContent: snap.ArtifactContentSnapshot,
        ArtifactType: snap.ArtifactTypeSnapshot ?? spec.ArtifactType,
        CanEditArtifact: false,
        FrozenMetadata: {
            FrozenAt: snap.FrozenAt,
            FrozenByUserID: snap.FrozenByUserID,
            FrozenByUserName: snap.FrozenByUserName
        }
    };
}

function buildErrorResult(spec: DocumentBlockSpec, message: string): DocumentBlockExecutionResult {
    return {
        BlockID: spec.BlockID,
        Kind: spec.Kind,
        Mode: spec.Mode ?? 'Live',
        Success: false,
        ErrorMessage: message,
        Columns: [],
        Rows: [],
        TotalRowCount: 0
    };
}

function resolveQueryInfo(
    provider: IMetadataProvider,
    queryId?: string,
    queryName?: string,
    categoryPath?: string
): QueryInfo | undefined {
    const queries = provider.Queries ?? [];
    if (queryId) {
        const byId = queries.find((q) => UUIDsEqual(q.ID, queryId));
        if (byId) {
            return byId;
        }
    }
    if (queryName) {
        const lowerName = queryName.trim().toLowerCase();
        if (categoryPath) {
            const lowerCat = categoryPath.trim().toLowerCase();
            const byCat = queries.find(
                (q) => q.Name.trim().toLowerCase() === lowerName && (q.CategoryPath ?? '').trim().toLowerCase() === lowerCat
            );
            if (byCat) {
                return byCat;
            }
        }
        return queries.find((q) => q.Name.trim().toLowerCase() === lowerName);
    }
    return undefined;
}

function sanitizeClientQueryParameters(
    queryInfo: QueryInfo | undefined,
    rawParameters: Record<string, unknown> | undefined
): { cleanParameters: Record<string, unknown>; strippedNames: string[] } {
    if (!rawParameters || typeof rawParameters !== 'object') {
        return { cleanParameters: {}, strippedNames: [] };
    }

    const serverSetNamesLower = new Set<string>(['context']);
    if (queryInfo && Array.isArray(queryInfo.Parameters)) {
        for (const param of queryInfo.Parameters) {
            if (param.IsServerSet) {
                serverSetNamesLower.add(param.Name.trim().toLowerCase());
            }
        }
    }

    const cleanParameters: Record<string, unknown> = {};
    const strippedNames: string[] = [];

    for (const [key, value] of Object.entries(rawParameters)) {
        if (serverSetNamesLower.has(key.trim().toLowerCase())) {
            strippedNames.push(key);
        } else {
            cleanParameters[key] = value;
        }
    }

    return { cleanParameters, strippedNames };
}

function resolveReferencedEntitiesForQuery(provider: IMetadataProvider, queryInfo: QueryInfo | undefined): EntityInfo[] {
    if (!queryInfo || !Array.isArray(queryInfo.Entities) || !provider.Entities) {
        return [];
    }
    const entityById = IndexByUUID(provider.Entities);
    const entityByName = new Map<string, EntityInfo>();
    for (const e of provider.Entities) {
        entityByName.set(e.Name, e);
    }
    const results: EntityInfo[] = [];
    for (const qe of queryInfo.Entities) {
        const found = (qe.EntityID ? entityById.Get(qe.EntityID) : undefined) ?? entityByName.get(qe.Entity);
        if (found) {
            results.push(found);
        }
    }
    return results;
}

/** Tree-shaking prevention loader for {@link BaseDocumentBlock} registrations. */
export function LoadDocumentLiveBlocks(): void {
    // Intentionally empty — ensures @RegisterClass decorators in this module execute.
}
