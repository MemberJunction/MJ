/**
 * @fileoverview The Server Extension that serves the Excel add-in from an MJ host.
 *
 * Pre-auth on purpose: Excel loads the manifest, the pane and its sign-in pages without an MJ
 * session. Nothing mounted here returns data or accepts a credential. The pane reads MJ data only
 * through GraphQL, with the API key the person approves in Explorer.
 *
 * Configure it in `mj.config.cjs`:
 *
 * ```js
 * serverExtensions: [{
 *     Name: 'ExcelAddin',
 *     DriverClass: 'ExcelAddinServerExtension',
 *     PackagePath: '@memberjunction/excel-addin-server',
 *     RootPath: '/office/excel',
 *     Phase: 'pre-auth',
 *     Enabled: true,
 *     Settings: { ExplorerUrl: 'https://explorer.example.org', ServerName: 'Example Association' },
 * }]
 * ```
 *
 * @module @memberjunction/excel-addin-server
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import express, { Application, Router } from 'express';
import { LogError } from '@memberjunction/core';
import { RegisterClass, TrimTrailingSlashes } from '@memberjunction/global';
import {
    BaseServerExtension,
    ExtensionHealthResult,
    ExtensionInitResult,
    ServerExtensionConfig,
    ServerExtensionInitContext,
    ServerExtensionPhase,
} from '@memberjunction/server-extensions-core';
import { EXCEL_WORKBOOK_CONTRACT_VERSION } from '@memberjunction/excel-addin';
import { BuildExcelAddinManifest } from './manifest-builder';
import { EXCEL_ADDIN_PATHS, EXCEL_CONNECT_ROUTE, ExcelAddinRuntime } from './runtime';
import { ExcelAddinSettings, ParseExcelAddinSettings } from './settings';

/** The `@RegisterClass` key hosts name as `DriverClass`. */
export const EXCEL_ADDIN_EXTENSION_DRIVER = 'ExcelAddinServerExtension';

/** What the pane reads from `config.json`. */
export interface ExcelAddinPaneConfig {
    ContractVersion: number;
    ServerName: string;
    /** The add-in's public base URL on this host. */
    AddinUrl: string;
    /** Explorer's connect page. */
    ExplorerConnectUrl: string;
    /** The most rows the pane writes for one source. */
    MaxRows: number;
}

/** Everything the router needs, resolved at startup. */
export interface ExcelAddinRouterOptions {
    Settings: ExcelAddinSettings;
    AddinUrl: string;
    /** The directory holding the built pane (`taskpane.html`, `assets/`, ...). */
    WebRoot: string;
}

/**
 * The add-in's public base URL: MJAPI's public URL plus the extension's RootPath relative to MJAPI's
 * base path (guides/SERVER_EXTENSIONS_GUIDE.md: `publicUrl` already carries that prefix, so the
 * composed RootPath is never appended to it whole).
 */
export function ComputeAddinPublicUrl(publicUrl: string, apiRootPath: string, rootPath: string): string {
    const base = TrimTrailingSlashes(apiRootPath ?? '');
    const path = normalizeRootPath(rootPath);
    const relative = base && path.toLowerCase().startsWith(base.toLowerCase()) ? path.slice(base.length) : path;
    return `${TrimTrailingSlashes(publicUrl)}${relative.startsWith('/') ? relative : `/${relative}`}`;
}

/** The router serving the manifest, the pane's config and the pane's files. */
export function CreateExcelAddinRouter(options: ExcelAddinRouterOptions): Router {
    const manifest = BuildExcelAddinManifest({
        AddinId: options.Settings.AddinId,
        Version: options.Settings.Version,
        ServerName: options.Settings.ServerName,
        AddinUrl: options.AddinUrl,
        ExplorerUrl: options.Settings.ExplorerUrl,
    });
    const config: ExcelAddinPaneConfig = {
        ContractVersion: EXCEL_WORKBOOK_CONTRACT_VERSION,
        ServerName: options.Settings.ServerName,
        AddinUrl: options.AddinUrl,
        ExplorerConnectUrl: `${TrimTrailingSlashes(options.Settings.ExplorerUrl)}${EXCEL_CONNECT_ROUTE}`,
        MaxRows: options.Settings.MaxRows,
    };
    const router = express.Router();
    router.use((_req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        next();
    });
    router.get(EXCEL_ADDIN_PATHS.Manifest, (_req, res) => {
        res.type('application/xml').setHeader('Cache-Control', 'no-store');
        res.send(manifest);
    });
    router.get(EXCEL_ADDIN_PATHS.Config, (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json(config);
    });
    // Excel caches add-in pages hard; no-cache makes it revalidate, so a host's upgrade reaches people.
    router.use(express.static(options.WebRoot, { index: false, setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
    return router;
}

/** Serves the Excel add-in from this MJ host and turns on the `ExcelAddin.*` operations. */
@RegisterClass(BaseServerExtension, 'ExcelAddinServerExtension')
export class ExcelAddinServerExtension extends BaseServerExtension {
    private routes: string[] = [];

    public override get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    // Keep Function.length === 1 (via rest tuple) so ServerExtensionLoader passes ServerExtensionInitContext
    // instead of treating this class as a legacy 2-arg Initialize(app, config) extension.
    public async Initialize(
        contextOrApp: ServerExtensionInitContext | Application,
        ...legacyConfig: [ServerExtensionConfig?]
    ): Promise<ExtensionInitResult> {
        try {
            if (typeof contextOrApp === 'function') {
                return fail('the Excel add-in needs MJServer\'s extension context to know its public URL; this server called Initialize(app, config).');
            }
            const settings = ParseExcelAddinSettings((legacyConfig[0] ?? contextOrApp.config).Settings);
            if (!settings.Success || !settings.Settings) {
                return fail(settings.ErrorMessage ?? 'its settings are not valid.');
            }
            if (!contextOrApp.publicUrl) {
                return fail('MJAPI has no public URL (MJAPI_PUBLIC_URL), so Excel could not reach the add-in.');
            }
            return this.mount(contextOrApp, settings.Settings);
        } catch (e) {
            ExcelAddinRuntime.Instance.Reset();
            const message = e instanceof Error ? e.message : String(e);
            LogError(`Excel add-in not started: ${message}`);
            return fail(message);
        }
    }

    public async Shutdown(): Promise<void> {
        ExcelAddinRuntime.Instance.Reset();
        this.routes = [];
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        const runtime = ExcelAddinRuntime.Instance;
        return {
            Healthy: runtime.IsEnabled,
            Name: EXCEL_ADDIN_EXTENSION_DRIVER,
            Details: { AddinUrl: runtime.AddinUrl, ManifestUrl: runtime.ManifestUrl, Routes: [...this.routes] },
        };
    }

    /**
     * Where the built pane lives: `dist/web` of `@memberjunction/excel-addin`. Protected so a host or
     * a test can serve it from elsewhere. Throws when the pane hasn't been built.
     */
    protected ResolveWebRoot(): string {
        const require = createRequire(import.meta.url);
        const packageJson = require.resolve('@memberjunction/excel-addin/package.json');
        const webRoot = join(dirname(packageJson), 'dist', 'web');
        if (!existsSync(join(webRoot, 'taskpane.html'))) {
            throw new Error(`the add-in pane isn't built (no ${join(webRoot, 'taskpane.html')}). Build @memberjunction/excel-addin.`);
        }
        return webRoot;
    }

    private mount(context: ServerExtensionInitContext, settings: ExcelAddinSettings): ExtensionInitResult {
        const rootPath = normalizeRootPath(context.config.RootPath);
        const addinUrl = ComputeAddinPublicUrl(context.publicUrl ?? '', context.apiRootPath ?? '', rootPath);
        const router = CreateExcelAddinRouter({ Settings: settings, AddinUrl: addinUrl, WebRoot: this.ResolveWebRoot() });
        context.app.use(rootPath, router);
        ExcelAddinRuntime.Instance.Configure(settings, addinUrl);
        this.routes = [
            `GET ${rootPath}${EXCEL_ADDIN_PATHS.Manifest}`,
            `GET ${rootPath}${EXCEL_ADDIN_PATHS.Config}`,
            `GET ${rootPath}/* (add-in pane)`,
        ];
        return {
            Success: true,
            Message: `Excel add-in served at ${addinUrl}; manifest at ${addinUrl}${EXCEL_ADDIN_PATHS.Manifest}`,
            RegisteredRoutes: [...this.routes],
        };
    }
}

function normalizeRootPath(rootPath: string | undefined): string {
    const trimmed = TrimTrailingSlashes((rootPath ?? '').trim());
    if (!trimmed) {
        return '/office/excel';
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function fail(reason: string): ExtensionInitResult {
    return { Success: false, Message: `Excel add-in not started: ${reason}` };
}
