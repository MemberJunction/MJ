/**
 * @fileoverview Server bodies of the `ExcelAddin.*` Remote Operations.
 *
 * Each subclass extends the typed base from `@memberjunction/excel-addin` and registers under the
 * same key, so a browser's `new ExcelAddinBuildWorkbookOperation().Execute(...)` or the Excel
 * pane's `ExecuteRemoteOperation` GraphQL mutation lands here. All operations read
 * {@link ExcelAddinRuntime}: on a host whose Server Extension isn't configured, status says the
 * add-in is off and the other operations refuse.
 *
 * @module @memberjunction/excel-addin-server
 */
import { BaseRemotableOperation, IMetadataProvider, IRunQueryProvider, ProjectEntityValueRowsForUser, RunQuery, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    EXCEL_WORKBOOK_CONTRACT_VERSION,
    ExcelAddinBuildWorkbookInput,
    ExcelAddinBuildWorkbookOperation,
    ExcelAddinBuildWorkbookOutput,
    ExcelAddinCatalogInput,
    ExcelAddinCatalogOutput,
    ExcelAddinCreateConnectionInput,
    ExcelAddinCreateConnectionOperation,
    ExcelAddinCreateConnectionOutput,
    ExcelAddinEntityViewsInput,
    ExcelAddinEntityViewsOutput,
    ExcelAddinEvaluateCustomFunctionInput,
    ExcelAddinEvaluateCustomFunctionOperation,
    ExcelAddinEvaluateCustomFunctionOutput,
    ExcelAddinGetCatalogOperation,
    ExcelAddinGetEntityViewsOperation,
    ExcelAddinGetStatusOperation,
    ExcelAddinResolveSourceInput,
    ExcelAddinResolveSourceOperation,
    ExcelAddinResolveSourceOutput,
    ExcelAddinStatusInput,
    ExcelAddinStatusOutput,
    ExcelParameterValue,
    ExcelWorkbookManifest,
    ExcelWorkbookSource,
    FormatRowsForExcelCustomFunction,
} from '@memberjunction/excel-addin';
import { BuildExcelCatalog, LoadExcelEntityViews } from './catalog';
import { CreateExcelConnectionKey } from './connection';
import { ExcelAddinRuntime } from './runtime';
import { ResolveSingleWorkbookSource, ResolveWorkbookSources } from './sources';
import { BuildConnectedWorkbook } from './workbook-builder';

const MAX_FILE_NAME_LENGTH = 100;

/** Reports whether this host serves the Excel add-in. */
@RegisterClass(BaseRemotableOperation, 'ExcelAddin.GetStatus')
export class ExcelAddinGetStatusServerOperation extends ExcelAddinGetStatusOperation {
    protected async InternalExecute(_input: ExcelAddinStatusInput, _provider: IMetadataProvider, _user: UserInfo): Promise<ExcelAddinStatusOutput> {
        const runtime = ExcelAddinRuntime.Instance;
        const settings = runtime.Settings;
        if (!runtime.IsEnabled || !settings) {
            return { Enabled: false, ServerName: '', ConnectedPageUrl: '', ManifestUrl: '', KeyLifetimeDays: 0 };
        }
        return {
            Enabled: true,
            ServerName: settings.ServerName,
            ConnectedPageUrl: runtime.ConnectedPageUrl,
            ManifestUrl: runtime.ManifestUrl,
            KeyLifetimeDays: settings.KeyLifetimeDays,
        };
    }
}

/** Mints the caller's Excel connection key. */
@RegisterClass(BaseRemotableOperation, 'ExcelAddin.CreateConnection')
export class ExcelAddinCreateConnectionServerOperation extends ExcelAddinCreateConnectionOperation {
    protected async Authorize(_input: ExcelAddinCreateConnectionInput, _user: UserInfo): Promise<boolean> {
        return ExcelAddinRuntime.Instance.IsEnabled;
    }

    protected async InternalExecute(_input: ExcelAddinCreateConnectionInput, provider: IMetadataProvider, user: UserInfo): Promise<ExcelAddinCreateConnectionOutput> {
        const settings = ExcelAddinRuntime.Instance.RequireSettings();
        const key = await CreateExcelConnectionKey(user, provider, settings.KeyLifetimeDays);
        return { APIKey: key.APIKey, APIKeyID: key.APIKeyID, ExpiresAt: key.ExpiresAt.toISOString(), Label: key.Label };
    }
}

/** Builds a connected workbook (headings, no rows) for saved views, entities, and queries the caller can see. */
@RegisterClass(BaseRemotableOperation, 'ExcelAddin.BuildWorkbook')
export class ExcelAddinBuildWorkbookServerOperation extends ExcelAddinBuildWorkbookOperation {
    protected async Authorize(_input: ExcelAddinBuildWorkbookInput, _user: UserInfo): Promise<boolean> {
        return ExcelAddinRuntime.Instance.IsEnabled;
    }

    protected async InternalExecute(input: ExcelAddinBuildWorkbookInput, provider: IMetadataProvider, user: UserInfo): Promise<ExcelAddinBuildWorkbookOutput> {
        const runtime = ExcelAddinRuntime.Instance;
        const settings = runtime.RequireSettings();
        const sources = await ResolveWorkbookSources(input?.Sources ?? [], provider, user);
        const manifest: ExcelWorkbookManifest = {
            ContractVersion: EXCEL_WORKBOOK_CONTRACT_VERSION,
            ServerName: settings.ServerName,
            AddinUrl: runtime.AddinUrl,
            GeneratedAt: new Date().toISOString(),
            Sources: sources,
        };
        const workbook = await BuildConnectedWorkbook(manifest, {
            AddinId: settings.AddinId,
            Version: settings.Version,
            Store: settings.Store,
            StoreType: settings.StoreType,
        });
        return { FileName: MakeWorkbookFileName(sources), ContentBase64: workbook.toString('base64') };
    }
}

/** Lists the applications, readable entities, query categories, and runnable queries for the Excel picker. */
@RegisterClass(BaseRemotableOperation, 'ExcelAddin.GetCatalog')
export class ExcelAddinGetCatalogServerOperation extends ExcelAddinGetCatalogOperation {
    protected async Authorize(_input: ExcelAddinCatalogInput, _user: UserInfo): Promise<boolean> {
        return ExcelAddinRuntime.Instance.IsEnabled;
    }

    protected async InternalExecute(_input: ExcelAddinCatalogInput, provider: IMetadataProvider, user: UserInfo): Promise<ExcelAddinCatalogOutput> {
        ExcelAddinRuntime.Instance.RequireSettings();
        return BuildExcelCatalog(provider, user);
    }
}

/** Lists the accessible saved `MJ: User Views` records on a chosen entity for the Excel picker. */
@RegisterClass(BaseRemotableOperation, 'ExcelAddin.GetEntityViews')
export class ExcelAddinGetEntityViewsServerOperation extends ExcelAddinGetEntityViewsOperation {
    protected async Authorize(_input: ExcelAddinEntityViewsInput, _user: UserInfo): Promise<boolean> {
        return ExcelAddinRuntime.Instance.IsEnabled;
    }

    protected async InternalExecute(input: ExcelAddinEntityViewsInput, provider: IMetadataProvider, user: UserInfo): Promise<ExcelAddinEntityViewsOutput> {
        ExcelAddinRuntime.Instance.RequireSettings();
        return LoadExcelEntityViews(input?.EntityID ?? '', provider, user);
    }
}

/** Resolves a single chosen view, entity, or saved query into its canonical columns and checked parameters. */
@RegisterClass(BaseRemotableOperation, 'ExcelAddin.ResolveSource')
export class ExcelAddinResolveSourceServerOperation extends ExcelAddinResolveSourceOperation {
    protected async Authorize(_input: ExcelAddinResolveSourceInput, _user: UserInfo): Promise<boolean> {
        return ExcelAddinRuntime.Instance.IsEnabled;
    }

    protected async InternalExecute(input: ExcelAddinResolveSourceInput, provider: IMetadataProvider, user: UserInfo): Promise<ExcelAddinResolveSourceOutput> {
        ExcelAddinRuntime.Instance.RequireSettings();
        const source = await ResolveSingleWorkbookSource(input?.Source, provider, user);
        return { Source: source };
    }
}

/**
 * Evaluates an Excel `=MJ.QUERY(...)` or `=MJ.VIEW(...)` custom function under the caller's
 * permissions, enforcing `IsServerSet` parameter refusal and RLS + FLS projection (`§ 7.1`, `§ 7.2`, `O8`).
 */
@RegisterClass(BaseRemotableOperation, 'ExcelAddin.EvaluateCustomFunction')
export class ExcelAddinEvaluateCustomFunctionServerOperation extends ExcelAddinEvaluateCustomFunctionOperation {
    protected async Authorize(_input: ExcelAddinEvaluateCustomFunctionInput, _user: UserInfo): Promise<boolean> {
        return ExcelAddinRuntime.Instance.IsEnabled;
    }

    protected async InternalExecute(
        input: ExcelAddinEvaluateCustomFunctionInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<ExcelAddinEvaluateCustomFunctionOutput> {
        const settings = ExcelAddinRuntime.Instance.RequireSettings();
        const maxRows = Math.min(Math.max(1, input?.MaxRows ?? settings.MaxRows), settings.MaxRows);

        if (input?.Kind === 'Query') {
            const target = (input.Target ?? '').trim();
            const query = (provider.Queries ?? []).find(
                q => UUIDsEqual(q.ID, target) || q.Name.toLowerCase() === target.toLowerCase()
            );
            if (!query) {
                throw new Error(`The saved query "${target}" doesn't exist, or you don't have access to it.`);
            }
            // Map positional arguments to caller-settable parameters when needed
            const mergedParams: Record<string, ExcelParameterValue> = { ...(input.Parameters ?? {}) };
            if (Array.isArray(input.PositionalArguments) && input.PositionalArguments.length > 0) {
                const callerParams = (query.Parameters ?? []).filter(p => !p.IsServerSet);
                for (let i = 0; i < input.PositionalArguments.length && i < callerParams.length; i++) {
                    const pName = callerParams[i].Name;
                    if (mergedParams[pName] === undefined) {
                        mergedParams[pName] = input.PositionalArguments[i];
                    }
                }
            }
            const resolved = await ResolveSingleWorkbookSource(
                { Kind: 'Query', ID: query.ID, Parameters: mergedParams },
                provider,
                user
            );
            const rq = new RunQuery(provider as unknown as IRunQueryProvider);
            const qRes = await rq.RunQuery(
                {
                    QueryID: query.ID,
                    Parameters: resolved.Parameters ?? undefined,
                    MaxRows: maxRows,
                },
                user
            );
            if (!qRes.Success) {
                throw new Error(qRes.ErrorMessage || `The query "${query.Name}" could not be run.`);
            }
            const rows = (qRes.Results ?? []) as Record<string, unknown>[];
            const formatted = FormatRowsForExcelCustomFunction(resolved.Columns, rows, input.IncludeHeaders);
            return {
                Columns: resolved.Columns,
                Matrix: formatted.Matrix,
                ScalarValue: formatted.ScalarValue,
                TotalRowCount: qRes.TotalRowCount ?? rows.length,
            };
        }

        if (input?.Kind === 'View') {
            const target = (input.Target ?? '').trim();
            const entity = (provider.Entities ?? []).find(
                e => UUIDsEqual(e.ID, target) || e.Name.toLowerCase() === target.toLowerCase()
            );
            if (!entity || !entity.GetUserPermisions(user).CanRead) {
                throw new Error(`You don't have access to the entity "${target}".`);
            }
            const viewRef = (input.ViewNameOrId ?? '').trim();
            const isDefault = !viewRef || viewRef.toLowerCase() === '(default)';
            const resolved = await ResolveSingleWorkbookSource(
                isDefault
                    ? { Kind: 'Entity', ID: entity.ID }
                    : { Kind: 'View', ID: viewRef },
                provider,
                user
            );
            const rv = RunView.FromMetadataProvider(provider);
            const vRes = await rv.RunView(
                isDefault
                    ? {
                          EntityName: entity.Name,
                          Fields: resolved.Columns.map(c => c.Name),
                          MaxRows: maxRows,
                          ResultType: 'simple',
                      }
                    : {
                          ViewID: resolved.ID,
                          Fields: resolved.Columns.map(c => c.Name),
                          MaxRows: maxRows,
                          ResultType: 'simple',
                      },
                user
            );
            if (!vRes.Success) {
                throw new Error(vRes.ErrorMessage || `The view could not be run.`);
            }
            const rawRows = (vRes.Results ?? []) as Record<string, unknown>[];
            const projectedRows = ProjectEntityValueRowsForUser(provider, entity, rawRows, user) ?? [];
            const formatted = FormatRowsForExcelCustomFunction(
                resolved.Columns,
                projectedRows,
                input.IncludeHeaders ?? true
            );
            return {
                Columns: resolved.Columns,
                Matrix: formatted.Matrix,
                ScalarValue: formatted.ScalarValue,
                TotalRowCount: vRes.TotalRowCount ?? projectedRows.length,
            };
        }

        throw new Error('Only Query and View custom functions are supported.');
    }
}

/** A file name safe on every desktop platform, from the first source's name. */
export function MakeWorkbookFileName(sources: Pick<ExcelWorkbookSource, 'Name'>[]): string {
    const first = sources[0]?.Name ?? '';
    // Drop characters Windows, macOS or a browser download refuse, and control characters.
    const collapsed = Array.from(first)
        .filter(ch => ch.charCodeAt(0) >= 32 && !'\\/:*?"<>|'.includes(ch))
        .join('')
        .replace(/\s+/g, ' ');
    const cleaned = trimDotsAndWhitespace(collapsed)
        .slice(0, MAX_FILE_NAME_LENGTH)
        .trim();
    const base = cleaned || 'MemberJunction';
    return sources.length > 1 ? `${base} and ${sources.length - 1} more.xlsx` : `${base}.xlsx`;
}

function trimDotsAndWhitespace(value: string): string {
    let start = 0;
    let end = value.length;
    while (start < end && (value[start] === '.' || value[start].trim() === '')) {
        start++;
    }
    while (end > start && (value[end - 1] === '.' || value[end - 1].trim() === '')) {
        end--;
    }
    return value.slice(start, end);
}
