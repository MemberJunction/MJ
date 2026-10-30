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
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
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
    ExcelAddinGetCatalogOperation,
    ExcelAddinGetEntityViewsOperation,
    ExcelAddinGetStatusOperation,
    ExcelAddinResolveSourceInput,
    ExcelAddinResolveSourceOperation,
    ExcelAddinResolveSourceOutput,
    ExcelAddinStatusInput,
    ExcelAddinStatusOutput,
    ExcelWorkbookManifest,
    ExcelWorkbookSource,
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

/** A file name safe on every desktop platform, from the first source's name. */
export function MakeWorkbookFileName(sources: Pick<ExcelWorkbookSource, 'Name'>[]): string {
    const first = sources[0]?.Name ?? '';
    // Drop characters Windows, macOS or a browser download refuse, and control characters.
    const cleaned = Array.from(first)
        .filter(ch => ch.charCodeAt(0) >= 32 && !'\\/:*?"<>|'.includes(ch))
        .join('')
        .replace(/\s+/g, ' ')
        .replace(/^[\s.]+|[\s.]+$/g, '')
        .slice(0, MAX_FILE_NAME_LENGTH)
        .trim();
    const base = cleaned || 'MemberJunction';
    return sources.length > 1 ? `${base} and ${sources.length - 1} more.xlsx` : `${base}.xlsx`;
}
