/**
 * @fileoverview The Excel add-in's Remote Operations — the typed bases browser and server share.
 *
 * Code-only operations (no `MJ: Remote Operations` row): the metadata gate lets a code-only op
 * through (guides/REMOTE_OPERATIONS_GUIDE.md, "Authorization"). These bases are deliberately NOT
 * `@RegisterClass`'d: a browser calls `new ExcelAddinBuildWorkbookOperation().Execute(input)` and the
 * call is routed by `OperationKey`, while `@memberjunction/excel-addin-server` registers subclasses
 * with the server bodies. When that package isn't loaded or its Server Extension isn't configured,
 * the operations report the add-in as off.
 *
 * @module @memberjunction/excel-addin
 */
import { BaseRemotableOperation } from '@memberjunction/core';
import {
    EXCEL_ADDIN_OPERATION_KEYS,
    ExcelAddinCatalogInput,
    ExcelAddinCatalogOutput,
    ExcelAddinEntityViewsInput,
    ExcelAddinEntityViewsOutput,
    ExcelAddinResolveSourceInput,
    ExcelAddinResolveSourceOutput,
    ExcelWorkbookSourceRequest,
} from './catalog-types';

/** Input for {@link ExcelAddinGetStatusOperation}; it takes none. */
export type ExcelAddinStatusInput = Record<string, never>;

/** Whether the host serves the Excel add-in, and where. */
export interface ExcelAddinStatusOutput {
    /** True when the host has configured the add-in's Server Extension. */
    Enabled: boolean;
    /** The host's display name. */
    ServerName: string;
    /** The add-in page Explorer's connect page returns to. Empty when not enabled. */
    ConnectedPageUrl: string;
    /** The manifest an administrator deploys. Empty when not enabled. */
    ManifestUrl: string;
    /** How long a connection key lasts. */
    KeyLifetimeDays: number;
}

/** Input for {@link ExcelAddinCreateConnectionOperation}; it takes none. */
export type ExcelAddinCreateConnectionInput = Record<string, never>;

/** A new connection key. The raw key is returned exactly once. */
export interface ExcelAddinCreateConnectionOutput {
    APIKey: string;
    APIKeyID: string;
    /** ISO timestamp. */
    ExpiresAt: string;
    /** The label the key carries on the API Keys page. */
    Label: string;
}

/** Input for {@link ExcelAddinBuildWorkbookOperation}. */
export interface ExcelAddinBuildWorkbookInput {
    Sources: ExcelWorkbookSourceRequest[];
}

/** A connected workbook, ready to download. */
export interface ExcelAddinBuildWorkbookOutput {
    /** A safe file name ending in `.xlsx`. */
    FileName: string;
    /** The `.xlsx` bytes, base64. */
    ContentBase64: string;
}

/** Reports whether this host serves the Excel add-in. Safe for any signed-in user. */
export class ExcelAddinGetStatusOperation extends BaseRemotableOperation<ExcelAddinStatusInput, ExcelAddinStatusOutput> {
    public readonly OperationKey: string = EXCEL_ADDIN_OPERATION_KEYS.GetStatus;
    public readonly ExecutionMode = 'Sync' as const;
}

/**
 * Mints the signed-in user's Excel connection key: an MJ API key that can only run views and
 * queries, and expires. An API-key caller needs `apikey:create`, so a key minted here can't mint more.
 */
export class ExcelAddinCreateConnectionOperation extends BaseRemotableOperation<ExcelAddinCreateConnectionInput, ExcelAddinCreateConnectionOutput> {
    public readonly OperationKey: string = EXCEL_ADDIN_OPERATION_KEYS.CreateConnection;
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope: string = 'apikey:create';
}

/** Builds a connected workbook for saved views and queries: headings, no rows. */
export class ExcelAddinBuildWorkbookOperation extends BaseRemotableOperation<ExcelAddinBuildWorkbookInput, ExcelAddinBuildWorkbookOutput> {
    public readonly OperationKey: string = EXCEL_ADDIN_OPERATION_KEYS.BuildWorkbook;
    public readonly ExecutionMode = 'Sync' as const;
}

/**
 * Lists the applications, readable entities, query categories and runnable saved queries the caller
 * may pick from inside the Excel task pane. Callable with an Excel connection key (`view:run` scope).
 */
export class ExcelAddinGetCatalogOperation extends BaseRemotableOperation<ExcelAddinCatalogInput, ExcelAddinCatalogOutput> {
    public readonly OperationKey: string = EXCEL_ADDIN_OPERATION_KEYS.GetCatalog;
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope: string = 'view:run';
}

/**
 * Lists the saved `MJ: User Views` records the caller can view on a specific entity.
 */
export class ExcelAddinGetEntityViewsOperation extends BaseRemotableOperation<ExcelAddinEntityViewsInput, ExcelAddinEntityViewsOutput> {
    public readonly OperationKey: string = EXCEL_ADDIN_OPERATION_KEYS.GetEntityViews;
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope: string = 'view:run';
}

/**
 * Resolves a single chosen view, entity, or saved query into its canonical `ExcelResolvedWorkbookSource`
 * (columns, data types, and checked query parameters) before the Excel pane writes it into `MJ_Sources`.
 */
export class ExcelAddinResolveSourceOperation extends BaseRemotableOperation<ExcelAddinResolveSourceInput, ExcelAddinResolveSourceOutput> {
    public readonly OperationKey: string = EXCEL_ADDIN_OPERATION_KEYS.ResolveSource;
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope: string = 'view:run';
}
