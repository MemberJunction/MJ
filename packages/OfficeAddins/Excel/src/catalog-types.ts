/**
 * @fileoverview Dependency-free catalog and source-resolution DTOs shared between the Excel task pane
 * (`src/web`), `@memberjunction/excel-addin`, and `@memberjunction/excel-addin-server`.
 *
 * Kept free of `@memberjunction/core` runtime imports so `src/web` stays a small, self-contained
 * browser bundle.
 *
 * @module @memberjunction/excel-addin
 */
import type { ExcelParameterValue, ExcelSourceKind, ExcelWorkbookSource } from './contract';

/** The Remote Operations' stable keys. */
export const EXCEL_ADDIN_OPERATION_KEYS = {
    GetStatus: 'ExcelAddin.GetStatus',
    CreateConnection: 'ExcelAddin.CreateConnection',
    BuildWorkbook: 'ExcelAddin.BuildWorkbook',
    GetCatalog: 'ExcelAddin.GetCatalog',
    GetEntityViews: 'ExcelAddin.GetEntityViews',
    ResolveSource: 'ExcelAddin.ResolveSource',
} as const;

/** One sheet to put in a workbook or resolve inside the Excel task pane. */
export interface ExcelWorkbookSourceRequest {
    Kind: ExcelSourceKind;
    /** The saved view's, entity's, or saved query's ID. */
    ID: string;
    /** Query parameter values; ignored unless `Kind === 'Query'`. Server-set parameters are refused. */
    Parameters?: Record<string, ExcelParameterValue>;
}

/** A resolved workbook source before a sheet name and table key (`s1`, ...) are assigned. */
export type ExcelResolvedWorkbookSource = Omit<ExcelWorkbookSource, 'Key' | 'SheetName'>;

/** An active MemberJunction application grouping readable entities in the Excel picker. */
export interface ExcelCatalogApplication {
    ID: string;
    Name: string;
    Description: string;
    EntityIDs: string[];
}

/** An entity the signed-in user has Read permission on. */
export interface ExcelCatalogEntity {
    ID: string;
    Name: string;
    DisplayName: string;
    Description: string;
}

/** A saved `MJ: User Views` record the signed-in user can view for an entity. */
export interface ExcelCatalogView {
    ID: string;
    Name: string;
    Description: string;
    IsOwned: boolean;
    IsShared: boolean;
    IsDefault: boolean;
}

/** A query category folder containing runnable saved queries. */
export interface ExcelCatalogQueryCategory {
    ID: string;
    Name: string;
    ParentID: string | null;
    Path: string;
}

/** Supported parameter value types on a saved query. */
export type ExcelQueryParameterType = 'string' | 'number' | 'date' | 'boolean' | 'array';

/** A caller-settable parameter on a saved query (`IsServerSet === false`). */
export interface ExcelCatalogQueryParameter {
    Name: string;
    Type: ExcelQueryParameterType;
    IsRequired: boolean;
    DefaultValue: string | null;
    Description: string;
    SampleValue: string;
}

/** A saved query the signed-in user has permission to run. */
export interface ExcelCatalogQuery {
    ID: string;
    Name: string;
    Description: string;
    CategoryID: string | null;
    CategoryPath: string;
    Parameters: ExcelCatalogQueryParameter[];
}

/** Input for `ExcelAddin.GetCatalog`; takes no arguments. */
export type ExcelAddinCatalogInput = Record<string, never>;

/** Output of `ExcelAddin.GetCatalog`, filtered to what the caller is permitted to read/run. */
export interface ExcelAddinCatalogOutput {
    Applications: ExcelCatalogApplication[];
    Entities: ExcelCatalogEntity[];
    QueryCategories: ExcelCatalogQueryCategory[];
    Queries: ExcelCatalogQuery[];
}

/** Input for `ExcelAddin.GetEntityViews`. */
export interface ExcelAddinEntityViewsInput {
    EntityID: string;
}

/** Output of `ExcelAddin.GetEntityViews`. */
export interface ExcelAddinEntityViewsOutput {
    EntityID: string;
    Views: ExcelCatalogView[];
}

/** Input for `ExcelAddin.ResolveSource`. */
export interface ExcelAddinResolveSourceInput {
    Source: ExcelWorkbookSourceRequest;
}

/** Output of `ExcelAddin.ResolveSource`. */
export interface ExcelAddinResolveSourceOutput {
    Source: ExcelResolvedWorkbookSource;
}
