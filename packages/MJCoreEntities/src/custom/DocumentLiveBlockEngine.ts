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

/**
 * Extracted tabular/chart dataset returned by a registered spreadsheet chart extractor (`D5`).
 */
export interface SpreadsheetChartExtractResult {
    Columns: DocumentBlockColumn[];
    Rows: Array<Record<string, unknown>>;
}

/**
 * Callback registered by `SpreadsheetEngine` so `DocumentLiveBlockEngine` can resolve
 * embedded spreadsheet chart/range blocks without a circular module import (`D5`).
 */
export type SpreadsheetChartExtractorFn = (
    content: string,
    configuration: string | null,
    sheetId: string | undefined,
    chartId: string | undefined,
    sheetRange: string | undefined
) => SpreadsheetChartExtractResult | null;

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
    /** True when this column is the entity's primary key. */
    IsPrimaryKey?: boolean;
    /** True when this column is the entity's primary NameField (links to this record). */
    IsNameField?: boolean;
    /** True when this column is a foreign key or companion virtual name field for a foreign key. */
    IsForeignKey?: boolean;
    /** Target entity name to open when a cell in this column is clicked. */
    TargetEntityName?: string;
    /** Row field name holding the target record's primary key ID (e.g. `'ID'` or `'UserID'`). */
    RecordIDFieldName?: string;
    /** Optional Font Awesome icon class for the target entity. */
    TargetEntityIcon?: string;
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
    /** Deterministic SHA-256 content hash over the snapshot payload computed at freeze time (`B7`). */
    SnapshotContentHash?: string;
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

    // --- Row Limits, Pagination, Collapse & Frozen State ---
    /** Maximum rows to fetch in live mode (defaults to 100). */
    MaxRows?: number;
    /** Default client-side page size for tabular display (defaults to 10). */
    PageSize?: number;
    /** Whether the block starts collapsed by default in the document (`false` when omitted). */
    Collapsed?: boolean;
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
        SnapshotVerified?: boolean;
    };
    /** Verification summary for the frozen snapshot when `Mode === 'Frozen'` (`B7`). */
    FrozenSnapshot?: {
        SnapshotVerified: boolean;
        FrozenAt: string;
        FrozenByUserID: string;
        FrozenByUserName: string;
        SnapshotContentHash?: string;
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
        if (spec.Mode === 'Frozen') {
            return buildFrozenExecutionResult(spec);
        }

        const validation = this.ValidateSpec(spec);
        if (!validation.Valid) {
            return buildErrorResult(spec, validation.ErrorMessage ?? 'Invalid EntityView specification.');
        }

        let targetEntityName = (spec.EntityName ?? '').trim();
        let resolvedViewId = spec.ViewID;
        const rv = RunView.FromMetadataProvider(provider);

        // If ViewID or ViewName is provided without EntityName, look up the UserView's Entity first.
        if (!targetEntityName && (spec.ViewID || spec.ViewName)) {
            const viewFilter = spec.ViewID
                ? `ID='${EscapeSQLString(spec.ViewID)}'`
                : `Name='${EscapeSQLString(spec.ViewName ?? '')}'`;
            const viewLookup = await rv.RunView<{ ID: string; Entity?: string; EntityID?: string }>(
                {
                    EntityName: 'MJ: User Views',
                    ExtraFilter: viewFilter,
                    Fields: ['ID', 'Entity', 'EntityID'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                user
            );
            if (viewLookup.Success && viewLookup.Results && viewLookup.Results.length > 0) {
                const matchedView = viewLookup.Results[0];
                targetEntityName = (matchedView.Entity ?? '').trim();
                if (!targetEntityName && matchedView.EntityID) {
                    const matchedEntity = provider.Entities?.find((e) => UUIDsEqual(e.ID, matchedView.EntityID!));
                    if (matchedEntity) {
                        targetEntityName = matchedEntity.Name;
                    }
                }
                if (!resolvedViewId && matchedView.ID) {
                    resolvedViewId = matchedView.ID;
                }
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
            ? new Set(Array.from(entityInfo.GetDeniedReadFields(user)).map((f) => f.trim().toLowerCase()))
            : new Set<string>();

        if (typeof spec.OrderBy === 'string' && spec.OrderBy.trim().length > 0) {
            const orderCheck = validateEntityViewOrderBy(spec.OrderBy, entityInfo, deniedFields);
            if (!orderCheck.Valid) {
                return {
                    BlockID: spec.BlockID,
                    Kind: spec.Kind,
                    Mode: 'Live',
                    Success: false,
                    AccessDenied: true,
                    ErrorMessage: orderCheck.ErrorMessage ?? 'Invalid or unauthorized OrderBy expression.',
                    Columns: [],
                    Rows: [],
                    TotalRowCount: 0
                };
            }
        }

        if (typeof spec.ExtraFilter === 'string' && spec.ExtraFilter.trim().length > 0) {
            const filterCheck = validateEntityViewExtraFilter(spec.ExtraFilter, entityInfo, deniedFields);
            if (!filterCheck.Valid) {
                return {
                    BlockID: spec.BlockID,
                    Kind: spec.Kind,
                    Mode: 'Live',
                    Success: false,
                    AccessDenied: true,
                    ErrorMessage: filterCheck.ErrorMessage ?? 'Invalid or unauthorized ExtraFilter expression.',
                    Columns: [],
                    Rows: [],
                    TotalRowCount: 0
                };
            }
        }

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

        // Ensure Primary Key and companion FK ID columns are fetched so PK/FK cells are linkable
        const primaryKeys = entityInfo.PrimaryKeys ?? [];
        const singlePkFieldName = primaryKeys.length === 1 ? entityInfo.FirstPrimaryKey?.Name : primaryKeys.length === 0 ? 'ID' : undefined; // first-pk-ok: guarded by primaryKeys.length === 1
        const pkFieldNames = primaryKeys.length > 0 ? primaryKeys.map((pk) => pk.Name) : ['ID'];
        const fetchFieldSet = new Set<string>(visibleFieldNames);
        for (const pkName of pkFieldNames) {
            if (!deniedFields.has(pkName.trim().toLowerCase())) {
                fetchFieldSet.add(pkName);
            }
        }
        for (const fName of visibleFieldNames) {
            const companionFk = entityInfo.Fields.find(
                (f) => f.Name.trim().toLowerCase() === `${fName.trim().toLowerCase()}id` && Boolean(f.RelatedEntity)
            );
            if (companionFk && !deniedFields.has(companionFk.Name.trim().toLowerCase())) {
                fetchFieldSet.add(companionFk.Name);
            }
        }
        const fetchFields = Array.from(fetchFieldSet);

        const runParams: RunViewParams = {
            EntityName: entityInfo.Name,
            ViewID: resolvedViewId,
            ViewName: spec.ViewName,
            ExtraFilter: spec.ExtraFilter,
            OrderBy: spec.OrderBy,
            Fields: fetchFields.length > 0 ? fetchFields : undefined,
            MaxRows: clampBlockMaxRows(spec.MaxRows),
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
            const isPk =
                Boolean(fInfo?.IsPrimaryKey) ||
                Boolean(singlePkFieldName && fieldName.trim().toLowerCase() === singlePkFieldName.toLowerCase());
            const isNameField = Boolean(fInfo?.IsNameField) || fieldName.trim().toLowerCase() === 'name';
            const directFkEntity = fInfo?.RelatedEntity ? fInfo.RelatedEntity : undefined;
            const companionFkField = !directFkEntity
                ? entityInfo.Fields.find(
                      (f) =>
                          f.Name.trim().toLowerCase() === `${fieldName.trim().toLowerCase()}id` &&
                          Boolean(f.RelatedEntity)
                  )
                : undefined;

            const isFk = Boolean(directFkEntity || companionFkField?.RelatedEntity);
            const targetEntityName = isFk
                ? directFkEntity || companionFkField?.RelatedEntity
                : (isPk || isNameField) && singlePkFieldName
                  ? entityInfo.Name
                  : undefined;
            const recordIdFieldName = isFk
                ? fInfo?.Name && directFkEntity
                    ? fInfo.Name
                    : companionFkField?.Name
                : isPk || isNameField
                  ? singlePkFieldName
                  : undefined;

            return {
                Name: fInfo?.Name ?? fieldName,
                DisplayName: fInfo?.DisplayNameOrName ?? fieldName,
                Type: fInfo?.TSType?.toLowerCase() ?? 'string',
                IsPrimaryKey: isPk || undefined,
                IsNameField: isNameField || undefined,
                IsForeignKey: isFk || undefined,
                TargetEntityName: targetEntityName,
                RecordIDFieldName: recordIdFieldName,
                TargetEntityIcon: entityInfo.Icon || undefined
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
        if (spec.Mode === 'Frozen') {
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
            MaxRows: clampBlockMaxRows(spec.MaxRows)
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
        const primaryQueryEntity = referencedEntities[0];
        const hasIdCol = columnKeys.some((k) => k.trim().toLowerCase() === 'id');
        const columns: DocumentBlockColumn[] = columnKeys.map((key) => {
            const lowerKey = key.trim().toLowerCase();
            let isPk = false;
            let isName = false;
            let isFk = false;
            let targetEntityName: string | undefined;
            let recordIdFieldName: string | undefined;

            if (primaryQueryEntity) {
                const matchField = primaryQueryEntity.Fields.find((f) => f.Name.trim().toLowerCase() === lowerKey);
                if (matchField?.IsPrimaryKey || lowerKey === 'id') {
                    isPk = true;
                    targetEntityName = primaryQueryEntity.Name;
                    recordIdFieldName = key;
                } else if ((matchField?.IsNameField || lowerKey === 'name') && hasIdCol) {
                    isName = true;
                    targetEntityName = primaryQueryEntity.Name;
                    recordIdFieldName = columnKeys.find((k) => k.trim().toLowerCase() === 'id') ?? 'ID';
                } else if (matchField?.RelatedEntity) {
                    isFk = true;
                    targetEntityName = matchField.RelatedEntity;
                    recordIdFieldName = key;
                } else {
                    const companionFk = primaryQueryEntity.Fields.find(
                        (f) => f.Name.trim().toLowerCase() === `${lowerKey}id` && Boolean(f.RelatedEntity)
                    );
                    const companionColKey = companionFk
                        ? columnKeys.find((k) => k.trim().toLowerCase() === companionFk.Name.trim().toLowerCase())
                        : undefined;
                    if (companionFk?.RelatedEntity && companionColKey) {
                        isFk = true;
                        targetEntityName = companionFk.RelatedEntity;
                        recordIdFieldName = companionColKey;
                    }
                }
            }

            return {
                Name: key,
                DisplayName: key,
                Type:
                    typeof firstRow[key] === 'number'
                        ? 'number'
                        : typeof firstRow[key] === 'boolean'
                          ? 'boolean'
                          : 'string',
                IsPrimaryKey: isPk || undefined,
                IsNameField: isName || undefined,
                IsForeignKey: isFk || undefined,
                TargetEntityName: targetEntityName,
                RecordIDFieldName: recordIdFieldName
            };
        });

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
        if (spec.Mode === 'Frozen') {
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
        if (spec.Mode === 'Frozen') {
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
        if (spec.Mode === 'Frozen') {
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
            const dataset = DocumentLiveBlockEngine.Instance.ExtractSpreadsheetChartDataset(
                versionRow?.Content ?? '',
                versionRow?.Configuration ?? null,
                spec.SheetID,
                spec.SheetChartID,
                spec.SheetRange
            );
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
    private _spreadsheetChartExtractor: SpreadsheetChartExtractorFn | null = null;
    private _signingSecret: string | null = null;

    protected constructor() {
        super();
    }

    /** Returns the process-wide singleton instance of {@link DocumentLiveBlockEngine}. */
    public static get Instance(): DocumentLiveBlockEngine {
        return super.getInstance<DocumentLiveBlockEngine>();
    }

    /**
     * Configures an explicit server HMAC signing secret for {@link FreezeBlock},
     * {@link ComputeFrozenSnapshotHash}, and {@link ValidateFrozenBlockSnapshot} (`B7`).
     */
    public SetSigningSecret(secret: string | null): void {
        const trimmed = secret?.trim() || '';
        this._signingSecret = trimmed.length > 0 ? trimmed : null;
    }

    /**
     * Returns the explicitly configured server HMAC signing secret, if any (`B7`).
     */
    public GetSigningSecret(): string | null {
        return this._signingSecret;
    }

    /**
     * Resolves the active `>= 32`-byte HMAC signing secret using consistent `.trim() || ...` fallback
     * semantics across explicit secret, configured secret, `MJ_FROZEN_BLOCK_HMAC_SECRET`, and
     * `MJ_FROZEN_SNAPSHOT_SECRET` (`R5-8`).
     */
    public ResolveSigningSecret(explicitSecret?: string): string | null {
        return this.getSigningSecret(explicitSecret);
    }

    /**
     * Checks whether a valid `>= 32`-byte frozen-block HMAC signing secret is configured at startup (`E1` / `R5-8`),
     * using the exact same `.trim() || ...` resolution rules as runtime signing/verification so empty or
     * whitespace-only environment variables are treated identically as unset.
     */
    public CheckStartupSecrets(): {
        FrozenBlockSecretConfigured: boolean;
        Warnings: string[];
    } {
        const warnings: string[] = [];
        const secret = this.getSigningSecret();
        const frozenBlockSecretConfigured = secret !== null;
        if (!frozenBlockSecretConfigured) {
            warnings.push(
                '[DocumentLiveBlockEngine] Startup warning: MJ_FROZEN_BLOCK_HMAC_SECRET is unset or shorter than 32 UTF-8 bytes; frozen-snapshot signing is disabled until a >= 32-byte secret is configured.'
            );
        }
        return {
            FrozenBlockSecretConfigured: frozenBlockSecretConfigured,
            Warnings: warnings
        };
    }

    private getSigningSecret(explicitSecret?: string): string | null {
        return resolveFrozenSnapshotSigningSecret(explicitSecret);
    }

    /**
     * Registers the spreadsheet chart/range dataset extractor (`SpreadsheetEngine`), avoiding a circular
     * module import between `DocumentLiveBlockEngine` and `SpreadsheetEngine` (`D5`).
     */
    public RegisterSpreadsheetChartExtractor(fn: SpreadsheetChartExtractorFn): void {
        this._spreadsheetChartExtractor = fn;
    }

    /**
     * Invokes the registered spreadsheet chart/range dataset extractor if available (`D5`).
     */
    public ExtractSpreadsheetChartDataset(
        content: string,
        configuration: string | null,
        sheetId?: string,
        chartId?: string,
        sheetRange?: string
    ): SpreadsheetChartExtractResult | null {
        if (!this._spreadsheetChartExtractor) {
            return null;
        }
        return this._spreadsheetChartExtractor(content, configuration, sheetId, chartId, sheetRange);
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
        if (!user) {
            return buildErrorResult(spec, 'Authenticated user context is required to execute a block.');
        }
        if (spec.Mode === 'Frozen') {
            return buildFrozenExecutionResult(spec);
        }
        const activeProvider = provider ?? Metadata.Provider;
        if (!activeProvider) {
            return buildErrorResult(spec, 'Metadata provider is not initialized.');
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
        provider?: IMetadataProvider | null,
        signingSecret?: string
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

        const snapshotBase: FrozenBlockSnapshot = {
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
        const snapshot: FrozenBlockSnapshot = {
            ...snapshotBase,
            SnapshotContentHash: ComputeFrozenSnapshotHash(snapshotBase, signingSecret)
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
     *
     * Respects fenced code blocks (` ``` ` / ` ~~~ ` of length >= 3) so example `:::mj-block`
     * snippets inside code fences are never parsed as live directives, and treats unterminated
     * `:::mj-block` fences as plain `'markdown'` without fabricating a closing `:::` (`D6`).
     */
    public ParseMarkdownDirectives(markdown: string): ParsedDocumentSegment[] {
        const lines = (markdown ?? '').split(/\r?\n/);
        const segments: ParsedDocumentSegment[] = [];
        let proseLines: string[] = [];
        let proseStartLine = 1;
        let activeFenceChar: '`' | '~' | null = null;
        let activeFenceLen = 0;

        let i = 0;
        while (i < lines.length) {
            const rawLine = lines[i];
            const trimmed = rawLine.trim();

            if (activeFenceChar !== null) {
                if (proseLines.length === 0) {
                    proseStartLine = i + 1;
                }
                proseLines.push(rawLine);
                const closeFenceMatch = /^\s*(`{3,}|~{3,})\s*$/.exec(rawLine);
                if (
                    closeFenceMatch &&
                    closeFenceMatch[1][0] === activeFenceChar &&
                    closeFenceMatch[1].length >= activeFenceLen
                ) {
                    activeFenceChar = null;
                    activeFenceLen = 0;
                }
                i++;
                continue;
            }

            const openFenceMatch = /^\s*(`{3,}|~{3,})/.exec(rawLine);
            if (openFenceMatch) {
                activeFenceChar = openFenceMatch[1][0] as '`' | '~';
                activeFenceLen = openFenceMatch[1].length;
                if (proseLines.length === 0) {
                    proseStartLine = i + 1;
                }
                proseLines.push(rawLine);
                i++;
                continue;
            }

            if (trimmed === ':::mj-block' || trimmed.startsWith(':::mj-block ')) {
                // Scan ahead to verify a matching closing ':::' exists before EOF
                let closeIdx = i + 1;
                while (closeIdx < lines.length && lines[closeIdx].trim() !== ':::') {
                    closeIdx++;
                }

                // Unterminated :::mj-block reaching EOF: emit raw lines verbatim as markdown without fabricating ':::'
                if (closeIdx >= lines.length) {
                    if (proseLines.length === 0) {
                        proseStartLine = i + 1;
                    }
                    while (i < lines.length) {
                        proseLines.push(lines[i]);
                        i++;
                    }
                    break;
                }

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
                const blockJsonLines = lines.slice(i + 1, closeIdx);
                const blockEndLine = closeIdx + 1;
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
                const rawDirective = [rawLine, ...blockJsonLines, lines[closeIdx]].join('\n');
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
                i = closeIdx + 1;
                proseStartLine = i + 1;
            } else {
                if (proseLines.length === 0) {
                    proseStartLine = i + 1;
                }
                proseLines.push(rawLine);
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

    /**
     * Validates an `EntityView` `ExtraFilter` predicate against SQL injection, disallowed SQL globals/functions
     * (on either side of an operator), and optional entity/FLS field allowlists.
     */
    public ValidateExtraFilter(
        extraFilter: string,
        entityInfo?: EntityInfo,
        deniedFields: ReadonlySet<string> = new Set<string>()
    ): { Valid: boolean; ErrorMessage?: string } {
        return validateEntityViewExtraFilter(extraFilter, entityInfo, deniedFields);
    }
}

/**
 * Validates the structure, security acknowledgement, and HMAC-SHA256 signature of a {@link FrozenBlockSnapshot} (`B7`).
 */
export function ValidateFrozenBlockSnapshot(
    snap: FrozenBlockSnapshot | null | undefined,
    signingSecret?: string
): {
    Valid: boolean;
    SnapshotVerified: boolean;
    ErrorMessage?: string;
} {
    if (!snap || typeof snap !== 'object') {
        return {
            Valid: false,
            SnapshotVerified: false,
            ErrorMessage: 'Frozen block is missing a valid FrozenSnapshot payload.'
        };
    }
    if (snap.SecurityWarningAcknowledged !== true) {
        return {
            Valid: false,
            SnapshotVerified: false,
            ErrorMessage:
                'Security violation: Frozen block snapshots require explicit acknowledgement of the RLS/FLS security warning (SecurityWarningAcknowledged: true).'
        };
    }
    if (typeof snap.FrozenByUserID !== 'string' || snap.FrozenByUserID.trim().length === 0) {
        return {
            Valid: false,
            SnapshotVerified: false,
            ErrorMessage: 'Invalid FrozenSnapshot: FrozenByUserID is required.'
        };
    }
    if (
        typeof snap.FrozenAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T/.test(snap.FrozenAt.trim()) ||
        Number.isNaN(Date.parse(snap.FrozenAt))
    ) {
        return {
            Valid: false,
            SnapshotVerified: false,
            ErrorMessage: 'Invalid FrozenSnapshot: FrozenAt must be a valid ISO 8601 timestamp.'
        };
    }
    if (!Array.isArray(snap.Columns) || !Array.isArray(snap.Rows)) {
        return {
            Valid: false,
            SnapshotVerified: false,
            ErrorMessage: 'Invalid FrozenSnapshot: Columns and Rows must be arrays.'
        };
    }

    if (
        typeof snap.SnapshotContentHash !== 'string' ||
        !snap.SnapshotContentHash.startsWith('hmac-sha256:')
    ) {
        return {
            Valid: true,
            SnapshotVerified: false
        };
    }

    const secret = resolveFrozenSnapshotSigningSecret(signingSecret);
    if (!secret) {
        return {
            Valid: true,
            SnapshotVerified: false
        };
    }

    const expectedHash = ComputeFrozenSnapshotHash(snap, secret);
    const snapshotVerified = constantTimeStringEqual(snap.SnapshotContentHash, expectedHash);
    return {
        Valid: true,
        SnapshotVerified: snapshotVerified
    };
}

/**
 * Computes an HMAC-SHA256 signature (`'hmac-sha256:<hex>'`) over the canonical payload of a
 * {@link FrozenBlockSnapshot}, including `FrozenByUserName` (`B7`).
 */
export function ComputeFrozenSnapshotHash(
    snap: Pick<
        FrozenBlockSnapshot,
        | 'FrozenAt'
        | 'FrozenByUserID'
        | 'FrozenByUserName'
        | 'Columns'
        | 'Rows'
        | 'TotalRowCount'
        | 'ArtifactContentSnapshot'
        | 'ArtifactTypeSnapshot'
        | 'SecurityWarningAcknowledged'
    >,
    signingSecret?: string
): string {
    const secret = resolveFrozenSnapshotSigningSecret(signingSecret);
    if (!secret) {
        throw new Error(
            'MJ_FROZEN_BLOCK_HMAC_SECRET (>= 32 bytes) must be configured on the server before signing or verifying frozen block snapshots.'
        );
    }
    const payload = canonicalizeForHash({
        FrozenAt: snap.FrozenAt,
        FrozenByUserID: snap.FrozenByUserID,
        FrozenByUserName: snap.FrozenByUserName ?? null,
        Columns: snap.Columns,
        Rows: snap.Rows,
        TotalRowCount: snap.TotalRowCount,
        ArtifactContentSnapshot: snap.ArtifactContentSnapshot ?? null,
        ArtifactTypeSnapshot: snap.ArtifactTypeSnapshot ?? null,
        SecurityWarningAcknowledged: snap.SecurityWarningAcknowledged === true
    });
    return `hmac-sha256:${hmacSha256HexUtf8(secret, payload)}`;
}

const MIN_FROZEN_SNAPSHOT_SECRET_BYTES = 32;

function resolveFrozenSnapshotSigningSecret(explicitSecret?: string): string | null {
    const enc = new TextEncoder();
    const explicitTrimmed = explicitSecret?.trim() || '';
    if (explicitTrimmed.length > 0) {
        return enc.encode(explicitTrimmed).length >= MIN_FROZEN_SNAPSHOT_SECRET_BYTES ? explicitTrimmed : null;
    }
    const configuredTrimmed = DocumentLiveBlockEngine.Instance.GetSigningSecret()?.trim() || '';
    if (configuredTrimmed.length > 0) {
        return enc.encode(configuredTrimmed).length >= MIN_FROZEN_SNAPSHOT_SECRET_BYTES ? configuredTrimmed : null;
    }
    const env =
        typeof globalThis !== 'undefined' && 'process' in globalThis
            ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
            : undefined;
    const candidate = env?.MJ_FROZEN_BLOCK_HMAC_SECRET?.trim() || env?.MJ_FROZEN_SNAPSHOT_SECRET?.trim() || '';
    if (enc.encode(candidate).length < MIN_FROZEN_SNAPSHOT_SECRET_BYTES) {
        return null;
    }
    return candidate;
}

function constantTimeStringEqual(a: string, b: string): boolean {
    const enc = new TextEncoder();
    const aBytes = enc.encode(a);
    const bBytes = enc.encode(b);
    if (aBytes.length !== bBytes.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < aBytes.length; i++) {
        diff |= aBytes[i] ^ bBytes[i];
    }
    return diff === 0;
}

function canonicalizeForHash(value: unknown): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalizeForHash(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
        const rec = value as Record<string, unknown>;
        const keys = Object.keys(rec)
            .filter((k) => rec[k] !== undefined)
            .sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeForHash(rec[k])}`).join(',')}}`;
    }
    return JSON.stringify(String(value));
}

const SHA256_K: ReadonlyArray<number> = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256Bytes(bytes: Uint8Array): Uint8Array {
    const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000);
    const bitLenLo = (bytes.length * 8) >>> 0;
    const paddedLen = ((bytes.length + 9 + 63) >>> 6) << 6;
    const buf = new Uint8Array(paddedLen);
    buf.set(bytes, 0);
    buf[bytes.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(paddedLen - 8, bitLenHi, false);
    dv.setUint32(paddedLen - 4, bitLenLo, false);

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;
    const w = new Uint32Array(64);

    const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

    for (let offset = 0; offset < paddedLen; offset += 64) {
        for (let i = 0; i < 16; i++) {
            w[i] = dv.getUint32(offset + i * 4, false);
        }
        for (let i = 16; i < 64; i++) {
            const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
            const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }

        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;
        let f = h5;
        let g = h6;
        let h = h7;

        for (let i = 0; i < 64; i++) {
            const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
            const ch = ((e & f) ^ (~e & g)) >>> 0;
            const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
            const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
            const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
            const temp2 = (S0 + maj) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
        h5 = (h5 + f) >>> 0;
        h6 = (h6 + g) >>> 0;
        h7 = (h7 + h) >>> 0;
    }

    const digest = new Uint8Array(32);
    const outView = new DataView(digest.buffer);
    outView.setUint32(0, h0, false);
    outView.setUint32(4, h1, false);
    outView.setUint32(8, h2, false);
    outView.setUint32(12, h3, false);
    outView.setUint32(16, h4, false);
    outView.setUint32(20, h5, false);
    outView.setUint32(24, h6, false);
    outView.setUint32(28, h7, false);
    return digest;
}

function hmacSha256HexUtf8(key: string, message: string): string {
    const enc = new TextEncoder();
    const rawKey = enc.encode(key);
    const msgBytes = enc.encode(message);
    const keyBlock = new Uint8Array(64);
    if (rawKey.length > 64) {
        keyBlock.set(sha256Bytes(rawKey), 0);
    } else {
        keyBlock.set(rawKey, 0);
    }

    const ipadMsg = new Uint8Array(64 + msgBytes.length);
    const opadInner = new Uint8Array(64 + 32);
    for (let i = 0; i < 64; i++) {
        ipadMsg[i] = keyBlock[i] ^ 0x36;
        opadInner[i] = keyBlock[i] ^ 0x5c;
    }
    ipadMsg.set(msgBytes, 64);
    const innerDigest = sha256Bytes(ipadMsg);
    opadInner.set(innerDigest, 64);
    const finalDigest = sha256Bytes(opadInner);
    return Array.from(finalDigest, (b) => b.toString(16).padStart(2, '0')).join('');
}

function clampBlockMaxRows(rawMaxRows?: number): number {
    if (typeof rawMaxRows !== 'number' || !Number.isFinite(rawMaxRows) || rawMaxRows <= 0) {
        return 100;
    }
    return Math.min(500, Math.max(1, Math.floor(rawMaxRows)));
}

function validateEntityViewOrderBy(
    orderBy: string,
    entityInfo: EntityInfo,
    deniedFields: ReadonlySet<string>
): { Valid: boolean; ErrorMessage?: string } {
    const allowedFieldNames = new Set(entityInfo.Fields.map((f) => f.Name.trim().toLowerCase()));
    const clauses = orderBy.split(',');
    for (const rawClause of clauses) {
        const clause = rawClause.trim();
        if (!clause) {
            return { Valid: false, ErrorMessage: 'Invalid empty clause in OrderBy.' };
        }
        const match = /^(?:\[([A-Za-z_][A-Za-z0-9_]*)\]|([A-Za-z_][A-Za-z0-9_]*))(?:\s+(ASC|DESC))?$/i.exec(clause);
        if (!match) {
            return { Valid: false, ErrorMessage: `Invalid OrderBy clause '${clause}'.` };
        }
        const fieldName = (match[1] || match[2]).toLowerCase();
        if (!allowedFieldNames.has(fieldName) || deniedFields.has(fieldName)) {
            return {
                Valid: false,
                ErrorMessage: `Field '${match[1] || match[2]}' is not permitted or does not exist in OrderBy.`
            };
        }
    }
    return { Valid: true };
}

function validateEntityViewExtraFilter(
    extraFilter: string,
    entityInfo?: EntityInfo,
    deniedFields: ReadonlySet<string> = new Set<string>()
): { Valid: boolean; ErrorMessage?: string } {
    if (/--|\/\*|\*\/|;/.test(extraFilter)) {
        return { Valid: false, ErrorMessage: 'SQL comments and statement terminators are not permitted in ExtraFilter.' };
    }

    // Verify balanced single quotes and mask string literals before inspecting SQL keywords, globals, and column identifiers
    let inSingleQuote = false;
    for (let i = 0; i < extraFilter.length; i++) {
        if (extraFilter[i] === "'") {
            if (inSingleQuote && extraFilter[i + 1] === "'") {
                i++;
                continue;
            }
            inSingleQuote = !inSingleQuote;
        }
    }
    if (inSingleQuote) {
        return { Valid: false, ErrorMessage: 'Unclosed string literal in ExtraFilter.' };
    }

    const masked = extraFilter.replace(/'(?:''|[^'])*'/g, () => "'__STR__'");

    if (
        /\b(SELECT|UNION|DROP|DELETE|UPDATE|INSERT|EXEC|EXECUTE|ALTER|CREATE|TRUNCATE|MERGE|GRANT|REVOKE|WAITFOR|OPENROWSET|OPENQUERY|OPENDATASOURCE)\b/i.test(
            masked
        ) ||
        /\bxp_[A-Za-z0-9_]*/i.test(masked)
    ) {
        return { Valid: false, ErrorMessage: 'Subqueries, DDL, DML, and system procedures are not permitted in ExtraFilter.' };
    }

    // Reject SQL global/local variables anywhere outside string literals (e.g. 'M' < @@VERSION, @@SERVERNAME, @var)
    if (/@@?[A-Za-z_]/.test(masked)) {
        return {
            Valid: false,
            ErrorMessage: 'SQL global and local variables (e.g. @@VERSION) are not permitted in ExtraFilter.'
        };
    }

    // Reject disallowed SQL system globals / niladic built-ins anywhere outside string literals (both LHS and RHS, e.g. 'sa' = SYSTEM_USER)
    const maskedUnbracketed = masked.replace(/\[[^\]]*\]/g, () => '__BRACKET_IDENT__');
    if (
        /\b(SYSTEM_USER|CURRENT_USER|SESSION_USER|SUSER_SNAME|SUSER_NAME|SUSER_ID|SUSER_SID|ORIGINAL_LOGIN|USER_NAME|USER_ID|USER|HOST_NAME|HOST_ID|APP_NAME|DB_NAME|DB_ID|OBJECT_NAME|OBJECT_ID|SCHEMA_NAME|PERMISSIONS|HAS_PERMS_BY_NAME|IS_MEMBER|IS_SRVROLEMEMBER)\b/i.test(
            maskedUnbracketed
        )
    ) {
        return {
            Valid: false,
            ErrorMessage: 'Disallowed SQL system globals and functions (e.g. SYSTEM_USER) are not permitted in ExtraFilter.'
        };
    }

    // Reject schema/table-qualified identifiers (e.g. __mj.fnSecret(ID) or dbo.Users.ID) and SQL function calls (e.g. REPLICATE('a', 1e8))
    if (/[A-Za-z_][A-Za-z0-9_]*\s*\.\s*[A-Za-z_]/.test(masked)) {
        return {
            Valid: false,
            ErrorMessage: 'Schema- or table-qualified identifiers and user-defined functions are not permitted in ExtraFilter.'
        };
    }
    const allowedLogicalParenKeywords = new Set(['AND', 'OR', 'NOT', 'IN']);
    if (/\]\s*\(/.test(masked)) {
        return {
            Valid: false,
            ErrorMessage: 'Scalar or user-defined SQL function calls are not permitted in ExtraFilter.'
        };
    }
    const fnCallRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    let fnMatch: RegExpExecArray | null;
    while ((fnMatch = fnCallRegex.exec(masked)) !== null) {
        if (!allowedLogicalParenKeywords.has(fnMatch[1].toUpperCase())) {
            return {
                Valid: false,
                ErrorMessage: 'Scalar or user-defined SQL function calls are not permitted in ExtraFilter.'
            };
        }
    }

    const allowedSqlPredicateKeywords = new Set([
        'and',
        'or',
        'not',
        'in',
        'is',
        'null',
        'like',
        'between',
        'escape',
        'true',
        'false'
    ]);
    const allowedFieldNames = entityInfo
        ? new Set(entityInfo.Fields.map((f) => f.Name.trim().toLowerCase()))
        : null;

    // Verify EVERY identifier token anywhere outside string literals (both LHS and RHS) against FLS deniedFields and entityInfo.Fields
    const allIdentsRegex = /(?<![0-9])(?:\[([A-Za-z_][A-Za-z0-9_]*)\]|([A-Za-z_][A-Za-z0-9_]*))/g;
    let identMatch: RegExpExecArray | null;
    while ((identMatch = allIdentsRegex.exec(masked)) !== null) {
        const isBracketed = Boolean(identMatch[1]);
        const rawIdent = identMatch[1] || identMatch[2];
        const token = rawIdent.toLowerCase();
        if (token === '__str__') continue;
        if (!isBracketed && allowedSqlPredicateKeywords.has(token)) continue;
        if (deniedFields.has(token)) {
            return {
                Valid: false,
                ErrorMessage: `Access denied: ExtraFilter cannot reference restricted field '${rawIdent}'.`
            };
        }
        if (allowedFieldNames && !allowedFieldNames.has(token)) {
            return {
                Valid: false,
                ErrorMessage: `Field '${rawIdent}' in ExtraFilter does not exist on ${entityInfo?.Name ?? 'entity'} or access is denied.`
            };
        }
    }

    return { Valid: true };
}

function buildFrozenExecutionResult(spec: DocumentBlockSpec): DocumentBlockExecutionResult {
    const validation = ValidateFrozenBlockSnapshot(spec.FrozenSnapshot);
    if (!validation.Valid || !spec.FrozenSnapshot) {
        return {
            BlockID: spec.BlockID,
            Kind: spec.Kind,
            Mode: 'Frozen',
            Success: false,
            ErrorMessage: validation.ErrorMessage ?? 'Invalid FrozenSnapshot.',
            Columns: [],
            Rows: [],
            TotalRowCount: 0
        };
    }

    const snap = spec.FrozenSnapshot;
    const frozenByUserName = snap.FrozenByUserName || snap.FrozenByUserID;
    return {
        BlockID: spec.BlockID,
        Kind: spec.Kind,
        Mode: 'Frozen',
        Success: true,
        Columns: snap.Columns,
        Rows: snap.Rows,
        TotalRowCount: snap.TotalRowCount ?? snap.Rows.length,
        ArtifactContent: snap.ArtifactContentSnapshot,
        ArtifactType: snap.ArtifactTypeSnapshot ?? spec.ArtifactType,
        CanEditArtifact: false,
        FrozenMetadata: {
            FrozenAt: snap.FrozenAt,
            FrozenByUserID: snap.FrozenByUserID,
            FrozenByUserName: frozenByUserName,
            SnapshotVerified: validation.SnapshotVerified
        },
        FrozenSnapshot: {
            SnapshotVerified: validation.SnapshotVerified,
            FrozenAt: snap.FrozenAt,
            FrozenByUserID: snap.FrozenByUserID,
            FrozenByUserName: frozenByUserName,
            SnapshotContentHash: snap.SnapshotContentHash
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
