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
import type { ExcelParameterValue, ExcelSourceKind } from './contract';

/** The operations' stable keys. */
export const EXCEL_ADDIN_OPERATION_KEYS = {
    GetStatus: 'ExcelAddin.GetStatus',
    CreateConnection: 'ExcelAddin.CreateConnection',
    BuildWorkbook: 'ExcelAddin.BuildWorkbook',
} as const;

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

/** One sheet to put in a workbook. */
export interface ExcelWorkbookSourceRequest {
    Kind: ExcelSourceKind;
    /** The saved view's or saved query's ID. */
    ID: string;
    /** Query parameter values; ignored for a view. Server-set parameters are refused. */
    Parameters?: Record<string, ExcelParameterValue>;
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
