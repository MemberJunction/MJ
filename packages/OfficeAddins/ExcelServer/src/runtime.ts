/**
 * @fileoverview The Excel add-in's process-wide state: whether this host serves it, with which
 * settings, and at which public URL.
 *
 * The Server Extension configures it when it mounts; the Remote Operations read it. An operation
 * running on a host that never configured the extension sees `IsEnabled === false` and reports the
 * add-in as off, which is how a host with the package installed but not configured behaves.
 *
 * @module @memberjunction/excel-addin-server
 */
import { BaseSingleton, TrimTrailingSlashes } from '@memberjunction/global';
import type { ExcelAddinSettings } from './settings';

/** The Explorer route that runs the add-in's sign-in. */
export const EXCEL_CONNECT_ROUTE = '/office/connect';

/** The add-in's pages and files, relative to its base URL. */
export const EXCEL_ADDIN_PATHS = {
    Manifest: '/manifest.xml',
    Config: '/config.json',
    Taskpane: '/taskpane.html',
    ConnectStart: '/connect.html',
    Connected: '/connected.html',
    Assets: '/assets',
} as const;

/** Holds the add-in's settings and public URL once the Server Extension has mounted. */
export class ExcelAddinRuntime extends BaseSingleton<ExcelAddinRuntime> {
    private settings: ExcelAddinSettings | null = null;
    private addinUrl = '';

    // Public: BaseSingleton.getInstance is typed `this: new () => T`, which a protected constructor can't satisfy.
    public constructor() {
        super();
    }

    public static get Instance(): ExcelAddinRuntime {
        return ExcelAddinRuntime.getInstance<ExcelAddinRuntime>();
    }

    /** Turns the add-in on with these settings, served at `addinUrl`. */
    public Configure(settings: ExcelAddinSettings, addinUrl: string): void {
        this.settings = settings;
        this.addinUrl = TrimTrailingSlashes(addinUrl);
    }

    /** Turns the add-in off. */
    public Reset(): void {
        this.settings = null;
        this.addinUrl = '';
    }

    /** True once the Server Extension has mounted. */
    public get IsEnabled(): boolean {
        return this.settings !== null && this.addinUrl !== '';
    }

    /** The settings, or null when the add-in is off. */
    public get Settings(): ExcelAddinSettings | null {
        return this.settings;
    }

    /** The add-in's public base URL, or `''` when off. */
    public get AddinUrl(): string {
        return this.addinUrl;
    }

    public get ManifestUrl(): string {
        return this.urlFor(EXCEL_ADDIN_PATHS.Manifest);
    }

    public get ConfigUrl(): string {
        return this.urlFor(EXCEL_ADDIN_PATHS.Config);
    }

    public get TaskpaneUrl(): string {
        return this.urlFor(EXCEL_ADDIN_PATHS.Taskpane);
    }

    /** The add-in page the sign-in window opens first. */
    public get ConnectStartUrl(): string {
        return this.urlFor(EXCEL_ADDIN_PATHS.ConnectStart);
    }

    /** The add-in page Explorer's connect page returns to. */
    public get ConnectedPageUrl(): string {
        return this.urlFor(EXCEL_ADDIN_PATHS.Connected);
    }

    /** Explorer's connect page, or `''` when off. */
    public get ExplorerConnectUrl(): string {
        return this.settings ? `${TrimTrailingSlashes(this.settings.ExplorerUrl)}${EXCEL_CONNECT_ROUTE}` : '';
    }

    /** The settings; throws when the add-in is off. */
    public RequireSettings(): ExcelAddinSettings {
        if (!this.settings || !this.IsEnabled) {
            throw new Error('The Excel add-in is not enabled on this server.');
        }
        return this.settings;
    }

    private urlFor(path: string): string {
        return this.IsEnabled ? `${this.addinUrl}${path}` : '';
    }
}
