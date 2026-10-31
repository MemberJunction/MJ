/**
 * The MemberJunction task pane in Excel.
 *
 * Supports both workflows seamlessly:
 * 1. Opening a connected `.xlsx` downloaded from MemberJunction Explorer ("Open in Excel"), signing
 *    in once, and refreshing every sheet under the viewer's permissions.
 * 2. Starting from any workbook in Excel, connecting to the default MemberJunction server (or any
 *    custom MemberJunction server URL), and browsing Applications -> Entities -> Saved Views as well
 *    as Query Categories -> Saved Queries to load live tables into new or active worksheets.
 */
import type {
    ExcelAddinCatalogOutput,
    ExcelCatalogEntity,
    ExcelCatalogQuery,
    ExcelCatalogQueryParameter,
    ExcelCatalogView,
    ExcelWorkbookSourceRequest,
} from '../catalog-types';
import {
    ExcelWorkbookManifest,
    ExcelWorkbookSource,
    MakeUniqueSheetName,
    ParseWorkbookManifest,
    RemoveWorkbookSource,
    UpsertWorkbookSource,
} from '../contract';
import {
    CreateHandoffKeyPair,
    CreateHandoffState,
    ExportHandoffPublicKey,
    IsHandoffToken,
    OpenConnectionPayload,
} from '../handoff';
import { ForgetConnection, LoadConnection, SaveConnection, StoredConnection } from './connection-store';
import {
    ConnectionRefusedError,
    FetchCatalog,
    FetchEntityViews,
    FetchSourceRows,
    ResolveWorkbookSourceOnServer,
} from './mj-data-client';
import {
    LoadPaneConfig,
    LoadSavedServerUrl,
    PaneConfig,
    ResolveCustomPaneConfig,
    SameAddinUrl,
    SaveServerUrl,
} from './pane-config';
import {
    DescribeSourceKind,
    FilterCatalogEntities,
    FilterCatalogQueries,
    IdsEqual,
    ParseQueryFormParameters,
} from './picker-logic';
import {
    ActivateSheet,
    GetWorkbookSheetInfo,
    ReadSourceCells,
    WorkbookSheetInfo,
    WriteManifestCells,
    WriteSourceRows,
} from './workbook-io';

type SourceState = { Status: 'idle' | 'busy' | 'done' | 'error'; Message: string };
type WorkspaceTab = 'browse' | 'workbook';
type BrowseMode = 'entities' | 'queries';

interface DialogMessage {
    Kind: 'Sealed' | 'Cancelled';
    Value?: string;
}

interface PendingExternalHandoff {
    Keys: CryptoKeyPair;
    State: string;
}

class TaskPane {
    private hostConfig: PaneConfig | null = null;
    private config: PaneConfig | null = null;
    private connection: StoredConnection | null = null;
    private manifest: ExcelWorkbookManifest | null = null;
    private foreignManifest: ExcelWorkbookManifest | null = null;
    private manifestError = '';
    private sourceStates = new Map<string, SourceState>();
    private notice = '';
    private noticeIsError = false;
    private busy = false;

    // Server switcher & external-browser sign-in state
    private serverSwitcherOpen = false;
    private pendingHandoff: PendingExternalHandoff | null = null;

    // Workspace & catalog browser state
    private activeTab: WorkspaceTab = 'browse';
    private browseMode: BrowseMode = 'entities';
    private catalog: ExcelAddinCatalogOutput | null = null;
    private catalogLoading = false;
    private selectedAppId = '';
    private entitySearch = '';
    private selectedEntity: ExcelCatalogEntity | null = null;
    private entityViews: ExcelCatalogView[] = [];
    private entityViewsLoading = false;
    private selectedCategoryId = '';
    private querySearch = '';
    private selectedQuery: ExcelCatalogQuery | null = null;
    private queryFormError = '';
    private sheetInfo: WorkbookSheetInfo = { ActiveSheetName: null, AllSheetNames: [] };

    public async Start(): Promise<void> {
        try {
            this.hostConfig = await LoadPaneConfig();
            this.config = this.hostConfig;
            const savedServerUrl = LoadSavedServerUrl();
            if (savedServerUrl && !SameAddinUrl(savedServerUrl, this.hostConfig.AddinUrl)) {
                try {
                    this.config = await ResolveCustomPaneConfig(savedServerUrl);
                } catch (e) {
                    this.setNotice(`Saved server unavailable (${messageOf(e)}). Using ${this.hostConfig.ServerName}.`, true);
                    SaveServerUrl(null);
                }
            }
            this.connection = LoadConnection(this.config.AddinUrl);
            await this.loadManifest();
            await this.refreshSheetInfoSafe();
            this.activeTab = this.manifest || this.manifestError || this.foreignManifest ? 'workbook' : 'browse';
        } catch (e) {
            this.setNotice(messageOf(e), true);
        }
        this.render();
        if (this.connection) {
            if (this.manifest) {
                await this.RefreshAll();
                void this.EnsureCatalog(false);
            } else {
                await this.EnsureCatalog(false);
            }
        }
    }

    public ToggleServerSwitcher(forceOpen?: boolean): void {
        this.serverSwitcherOpen = forceOpen ?? !this.serverSwitcherOpen;
        if (this.serverSwitcherOpen && this.config) {
            (byId('server-url-input') as HTMLInputElement).value = this.config.AddinUrl;
        }
        this.render();
        if (this.serverSwitcherOpen) {
            (byId('server-url-input') as HTMLInputElement).focus();
        }
    }

    public async SwitchServer(inputUrl: string): Promise<void> {
        if (this.busy || !this.hostConfig) {
            return;
        }
        this.busy = true;
        this.clearNotice();
        this.render();
        try {
            const resolved = await ResolveCustomPaneConfig(inputUrl);
            const isDefault = SameAddinUrl(resolved.AddinUrl, this.hostConfig.AddinUrl);
            SaveServerUrl(isDefault ? null : resolved.AddinUrl);
            this.applyActiveServer(isDefault ? this.hostConfig : resolved);
            await this.loadManifest();
            this.serverSwitcherOpen = false;
            this.setNotice(`Connected to server "${this.config?.ServerName ?? resolved.ServerName}".`, false);
        } catch (e) {
            this.setNotice(messageOf(e), true);
        } finally {
            this.busy = false;
            this.render();
        }
        if (this.connection) {
            await this.EnsureCatalog(true);
            if (this.manifest) {
                await this.RefreshAll();
            }
        }
    }

    public async ResetServerToDefault(): Promise<void> {
        if (!this.hostConfig || this.busy) {
            return;
        }
        SaveServerUrl(null);
        this.applyActiveServer(this.hostConfig);
        this.serverSwitcherOpen = false;
        await this.loadManifest();
        this.setNotice(`Switched back to default server "${this.hostConfig.ServerName}".`, false);
        this.render();
        if (this.connection) {
            await this.EnsureCatalog(true);
            if (this.manifest) {
                await this.RefreshAll();
            }
        }
    }

    public async AdoptWorkbookServer(): Promise<void> {
        if (!this.foreignManifest) {
            return;
        }
        await this.SwitchServer(this.foreignManifest.AddinUrl);
    }

    public async SignIn(): Promise<void> {
        if (!this.config || this.busy) {
            return;
        }
        this.clearNotice();
        try {
            const keys = await CreateHandoffKeyPair();
            const state = CreateHandoffState();
            const publicKey = await ExportHandoffPublicKey(keys.publicKey);
            if (this.isUsingDefaultHost()) {
                const sealed = await openSignInDialog(`connect.html?pk=${publicKey}&state=${state}`);
                if (sealed === null) {
                    this.render();
                    return;
                }
                await this.finishSignInWithSealed(keys.privateKey, sealed, state);
            } else {
                this.pendingHandoff = { Keys: keys, State: state };
                const target = new URL(this.config.ExplorerConnectUrl);
                target.searchParams.set('pk', publicKey);
                target.searchParams.set('state', state);
                openExternalBrowser(target.toString());
                this.render();
                (byId('connection-code-input') as HTMLInputElement).focus();
            }
        } catch (e) {
            this.setNotice(messageOf(e), true);
            this.render();
        }
    }

    public async CompleteExternalHandoff(rawInput: string): Promise<void> {
        if (!this.pendingHandoff || !this.config || this.busy) {
            return;
        }
        const token = extractSealedToken(rawInput);
        if (!token) {
            this.setNotice('Paste the one-time connection code shown after signing in.', true);
            this.render();
            return;
        }
        this.clearNotice();
        try {
            const { Keys, State } = this.pendingHandoff;
            await this.finishSignInWithSealed(Keys.privateKey, token, State);
        } catch (e) {
            this.setNotice(messageOf(e), true);
            this.render();
        }
    }

    public CancelExternalHandoff(): void {
        this.pendingHandoff = null;
        (byId('connection-code-input') as HTMLInputElement).value = '';
        this.render();
    }

    public SignOut(): void {
        if (this.config) {
            ForgetConnection(this.config.AddinUrl);
        } else {
            ForgetConnection();
        }
        this.connection = null;
        this.pendingHandoff = null;
        this.catalog = null;
        this.selectedEntity = null;
        this.selectedQuery = null;
        this.setNotice(
            'Signed out on this computer. To stop the connection everywhere, revoke the Excel add-in key on MemberJunction\'s API Keys page.',
            false,
        );
        this.render();
    }

    public SetTab(tab: WorkspaceTab): void {
        this.activeTab = tab;
        this.render();
        if (tab === 'browse' && this.connection && !this.catalog && !this.catalogLoading) {
            void this.EnsureCatalog(false);
        }
    }

    public SetBrowseMode(mode: BrowseMode): void {
        this.browseMode = mode;
        this.render();
    }

    public SetApplicationFilter(applicationId: string): void {
        this.selectedAppId = applicationId;
        this.renderEntityList();
    }

    public SetEntitySearch(searchText: string): void {
        this.entitySearch = searchText;
        this.renderEntityList();
    }

    public SetQueryCategoryFilter(categoryId: string): void {
        this.selectedCategoryId = categoryId;
        this.renderQueryList();
    }

    public SetQuerySearch(searchText: string): void {
        this.querySearch = searchText;
        this.renderQueryList();
    }

    public async EnsureCatalog(forceReload: boolean): Promise<void> {
        if (!this.connection || this.catalogLoading) {
            return;
        }
        if (this.catalog && !forceReload) {
            return;
        }
        this.catalogLoading = true;
        this.render();
        try {
            this.catalog = await FetchCatalog(this.connection);
            this.populateFilterSelects();
        } catch (e) {
            if (e instanceof ConnectionRefusedError) {
                this.handleConnectionRefused(e);
            } else {
                this.setNotice(messageOf(e), true);
            }
        } finally {
            this.catalogLoading = false;
            this.render();
        }
    }

    public async SelectEntity(entity: ExcelCatalogEntity): Promise<void> {
        this.selectedEntity = entity;
        this.entityViews = [];
        this.entityViewsLoading = true;
        await this.refreshSheetInfoSafe();
        this.render();
        if (!this.connection) {
            this.entityViewsLoading = false;
            this.render();
            return;
        }
        try {
            const response = await FetchEntityViews(this.connection, entity.ID);
            if (IdsEqual(this.selectedEntity?.ID, entity.ID)) {
                this.entityViews = response.Views;
            }
        } catch (e) {
            if (e instanceof ConnectionRefusedError) {
                this.handleConnectionRefused(e);
            } else {
                this.setNotice(messageOf(e), true);
            }
        } finally {
            this.entityViewsLoading = false;
            this.render();
        }
    }

    public BackToEntities(): void {
        this.selectedEntity = null;
        this.entityViews = [];
        this.render();
        byId('entity-search').focus();
    }

    public async SelectQuery(query: ExcelCatalogQuery): Promise<void> {
        this.selectedQuery = query;
        this.queryFormError = '';
        await this.refreshSheetInfoSafe();
        this.render();
        this.populateQueryParameterFields(query);
    }

    public BackToQueries(): void {
        this.selectedQuery = null;
        this.queryFormError = '';
        this.render();
        byId('query-search').focus();
    }

    public async SubmitEntitySelection(): Promise<void> {
        if (!this.selectedEntity || this.busy) {
            return;
        }
        const form = byId('entity-load-form') as HTMLFormElement;
        const data = new FormData(form);
        const choice = String(data.get('entitySourceChoice') ?? `entity:${this.selectedEntity.ID}`);
        const targetMode = data.get('entityTargetSheet') === 'current' ? 'current' : 'new';
        const request: ExcelWorkbookSourceRequest = choice.startsWith('view:')
            ? { Kind: 'View', ID: choice.slice('view:'.length) }
            : { Kind: 'Entity', ID: this.selectedEntity.ID };
        await this.resolveAndLoadSource(request, targetMode);
    }

    public async SubmitQuerySelection(): Promise<void> {
        if (!this.selectedQuery || this.busy) {
            return;
        }
        this.queryFormError = '';
        const form = byId('query-load-form') as HTMLFormElement;
        const data = new FormData(form);
        const rawParams: Record<string, string> = {};
        for (const param of this.selectedQuery.Parameters) {
            rawParams[param.Name] = String(data.get(`qparam_${param.Name}`) ?? '');
        }
        let parameters: ExcelWorkbookSourceRequest['Parameters'];
        try {
            parameters = ParseQueryFormParameters(this.selectedQuery.Parameters, rawParams);
        } catch (e) {
            this.queryFormError = messageOf(e);
            this.renderQueryFormError();
            return;
        }
        this.renderQueryFormError();
        const targetMode = data.get('queryTargetSheet') === 'current' ? 'current' : 'new';
        await this.resolveAndLoadSource(
            { Kind: 'Query', ID: this.selectedQuery.ID, Parameters: parameters },
            targetMode,
        );
    }

    public async RefreshAll(): Promise<void> {
        if (!this.manifest) {
            return;
        }
        for (const source of this.manifest.Sources) {
            const keepGoing = await this.Refresh(source.Key);
            if (!keepGoing) {
                break;
            }
        }
    }

    /** Refreshes one source. Returns false when the connection was refused, so the caller stops. */
    public async Refresh(sourceKey: string): Promise<boolean> {
        const source = this.manifest?.Sources.find(s => s.Key === sourceKey);
        if (!source || !this.connection || !this.config) {
            return false;
        }
        this.setSourceState(source, 'busy', 'Loading...');
        try {
            const result = await FetchSourceRows(this.connection, source, this.config.MaxRows);
            const written = await WriteSourceRows(source, result.Rows);
            const more = result.TotalRowCount > written
                ? ` of ${result.TotalRowCount.toLocaleString()} (the first ${written.toLocaleString()} are shown)`
                : '';
            this.setSourceState(source, 'done', `${written.toLocaleString()} rows${more}, ${new Date().toLocaleTimeString()}`);
            return true;
        } catch (e) {
            if (e instanceof ConnectionRefusedError) {
                this.handleConnectionRefused(e);
                this.setSourceState(source, 'error', 'Not loaded.');
                return false;
            }
            this.setSourceState(source, 'error', messageOf(e));
            return true;
        }
    }

    public async OpenSheet(sheetName: string): Promise<void> {
        try {
            await ActivateSheet(sheetName);
        } catch (e) {
            this.setNotice(messageOf(e), true);
            this.render();
        }
    }

    public async UnlinkSource(sourceKey: string): Promise<void> {
        if (!this.manifest || this.busy) {
            return;
        }
        const target = this.manifest.Sources.find(s => s.Key === sourceKey);
        if (!target) {
            return;
        }
        this.busy = true;
        this.render();
        try {
            const nextManifest = RemoveWorkbookSource(this.manifest, sourceKey);
            await WriteManifestCells(nextManifest);
            this.manifest = nextManifest;
            this.sourceStates.delete(sourceKey);
            this.setNotice(
                `Unlinked "${target.Name}" from refreshes. Existing data on sheet "${target.SheetName}" was preserved.`,
                false,
            );
        } catch (e) {
            this.setNotice(messageOf(e), true);
        } finally {
            this.busy = false;
            this.render();
        }
    }

    private async finishSignInWithSealed(privateKey: CryptoKey, sealed: string, state: string): Promise<void> {
        if (!this.config) {
            return;
        }
        const payload = await OpenConnectionPayload(privateKey, sealed, state);
        this.connection = SaveConnection(payload, this.config.AddinUrl);
        this.pendingHandoff = null;
        (byId('connection-code-input') as HTMLInputElement).value = '';
        this.activeTab = this.manifest ? 'workbook' : 'browse';
        this.render();
        if (this.manifest) {
            await this.RefreshAll();
            void this.EnsureCatalog(true);
        } else {
            await this.EnsureCatalog(true);
        }
    }

    private async resolveAndLoadSource(
        request: ExcelWorkbookSourceRequest,
        targetMode: 'new' | 'current',
    ): Promise<void> {
        if (!this.connection || !this.config) {
            return;
        }
        if (this.foreignManifest) {
            this.setNotice(
                `This workbook already holds sheets from ${this.foreignManifest.ServerName}. Switch to that server or open a new workbook first.`,
                true,
            );
            this.render();
            return;
        }
        this.busy = true;
        this.clearNotice();
        this.render();
        try {
            const resolved = await ResolveWorkbookSourceOnServer(this.connection, request);
            await this.refreshSheetInfoSafe();
            const targetSheetName = this.pickTargetSheetName(resolved.Name, targetMode);
            const upserted = UpsertWorkbookSource(
                this.manifest,
                { ServerName: this.config.ServerName, AddinUrl: this.config.AddinUrl },
                resolved,
                targetSheetName,
            );
            const rowsResult = await FetchSourceRows(this.connection, upserted.Source, this.config.MaxRows);
            const written = await WriteSourceRows(upserted.Source, rowsResult.Rows);
            await WriteManifestCells(upserted.Manifest);
            this.manifest = upserted.Manifest;
            this.manifestError = '';
            const more = rowsResult.TotalRowCount > written
                ? ` of ${rowsResult.TotalRowCount.toLocaleString()} (first ${written.toLocaleString()} shown)`
                : '';
            this.sourceStates.set(upserted.Source.Key, {
                Status: 'done',
                Message: `${written.toLocaleString()} rows${more}, ${new Date().toLocaleTimeString()}`,
            });
            await this.refreshSheetInfoSafe();
            this.setNotice(
                `Loaded ${written.toLocaleString()} rows from "${upserted.Source.Name}" into sheet "${upserted.Source.SheetName}".`,
                false,
            );
        } catch (e) {
            if (e instanceof ConnectionRefusedError) {
                this.handleConnectionRefused(e);
            } else {
                this.setNotice(messageOf(e), true);
            }
        } finally {
            this.busy = false;
            this.render();
        }
    }

    private pickTargetSheetName(preferredName: string, targetMode: 'new' | 'current'): string {
        if (targetMode === 'current' && this.sheetInfo.ActiveSheetName) {
            return this.sheetInfo.ActiveSheetName;
        }
        const used = new Set<string>(this.sheetInfo.AllSheetNames.map(n => n.toLowerCase()));
        for (const existing of this.manifest?.Sources ?? []) {
            used.add(existing.SheetName.toLowerCase());
        }
        return MakeUniqueSheetName(preferredName, used);
    }

    private applyActiveServer(nextConfig: PaneConfig): void {
        this.config = nextConfig;
        this.pendingHandoff = null;
        this.catalog = null;
        this.selectedAppId = '';
        this.entitySearch = '';
        this.selectedEntity = null;
        this.entityViews = [];
        this.selectedCategoryId = '';
        this.querySearch = '';
        this.selectedQuery = null;
        this.queryFormError = '';
        this.connection = LoadConnection(nextConfig.AddinUrl);
    }

    private isUsingDefaultHost(): boolean {
        if (!this.config || !this.hostConfig) {
            return true;
        }
        return SameAddinUrl(this.config.AddinUrl, this.hostConfig.AddinUrl);
    }

    private handleConnectionRefused(error: ConnectionRefusedError): void {
        if (this.config) {
            ForgetConnection(this.config.AddinUrl);
        } else {
            ForgetConnection();
        }
        this.connection = null;
        this.catalog = null;
        this.setNotice(error.message, true);
    }

    private async loadManifest(): Promise<void> {
        this.manifest = null;
        this.foreignManifest = null;
        this.manifestError = '';
        const cells = await ReadSourceCells();
        if (cells === null) {
            return;
        }
        const parsed = ParseWorkbookManifest(cells);
        if (!parsed.Success || !parsed.Manifest) {
            this.manifestError = parsed.ErrorMessage ?? 'The workbook\'s source list can\'t be read.';
            return;
        }
        if (this.config && !SameAddinUrl(parsed.Manifest.AddinUrl, this.config.AddinUrl)) {
            this.foreignManifest = parsed.Manifest;
            this.manifestError = `This workbook came from ${parsed.Manifest.ServerName}, not ${this.config.ServerName}.`;
            return;
        }
        this.manifest = parsed.Manifest;
    }

    private async refreshSheetInfoSafe(): Promise<void> {
        try {
            this.sheetInfo = await GetWorkbookSheetInfo();
        } catch {
            this.sheetInfo = { ActiveSheetName: null, AllSheetNames: [] };
        }
    }

    private setNotice(text: string, isError: boolean): void {
        this.notice = text;
        this.noticeIsError = isError;
    }

    private clearNotice(): void {
        this.notice = '';
        this.noticeIsError = false;
    }

    private setSourceState(source: ExcelWorkbookSource, status: SourceState['Status'], message: string): void {
        this.sourceStates.set(source.Key, { Status: status, Message: message });
        this.busy = status === 'busy';
        this.render();
    }

    private populateFilterSelects(): void {
        if (!this.catalog) {
            return;
        }
        const appSelect = byId('app-filter') as HTMLSelectElement;
        const allAppsOption = document.createElement('option');
        allAppsOption.value = '';
        allAppsOption.textContent = `All Applications (${this.catalog.Entities.length})`;
        const appOptions = this.catalog.Applications.map(app => {
            const opt = document.createElement('option');
            opt.value = app.ID;
            opt.textContent = `${app.Name} (${app.EntityIDs.length})`;
            return opt;
        });
        appSelect.replaceChildren(allAppsOption, ...appOptions);
        appSelect.value = this.selectedAppId;

        const catSelect = byId('query-category') as HTMLSelectElement;
        const allCatsOption = document.createElement('option');
        allCatsOption.value = '';
        allCatsOption.textContent = `All Categories (${this.catalog.Queries.length})`;
        const catOptions = this.catalog.QueryCategories.map(cat => {
            const opt = document.createElement('option');
            opt.value = cat.ID;
            opt.textContent = cat.Path;
            return opt;
        });
        catSelect.replaceChildren(allCatsOption, ...catOptions);
        catSelect.value = this.selectedCategoryId;
    }

    private populateQueryParameterFields(query: ExcelCatalogQuery): void {
        const fieldset = byId('query-params-fieldset');
        const container = byId('query-params-container');
        if (query.Parameters.length === 0) {
            fieldset.hidden = true;
            container.replaceChildren();
            return;
        }
        fieldset.hidden = false;
        container.replaceChildren(...query.Parameters.map((param, idx) => buildQueryParamField(param, idx)));
    }

    private render(): void {
        setText('server-name', this.config?.ServerName ?? 'MemberJunction');
        const isCustomServer = !this.isUsingDefaultHost();
        byId('server-custom-badge').hidden = !isCustomServer;

        const toggleBtn = byId('toggle-server-switcher') as HTMLButtonElement;
        toggleBtn.setAttribute('aria-expanded', String(this.serverSwitcherOpen));
        byId('server-switcher').hidden = !this.serverSwitcherOpen;
        byId('reset-server-btn').hidden = !isCustomServer;
        (byId('connect-server-btn') as HTMLButtonElement).disabled = this.busy;

        this.renderNoticeBanner();
        this.renderForeignWorkbookBanner();
        this.renderConnection();
        this.renderTabs();
        this.renderBrowsePanel();
        this.renderSources();
    }

    private renderNoticeBanner(): void {
        const element = byId('notice');
        element.textContent = this.notice;
        element.classList.toggle('is-error', this.noticeIsError);
        element.hidden = this.notice.length === 0;
    }

    private renderForeignWorkbookBanner(): void {
        const box = byId('workbook-host-mismatch');
        if (!this.foreignManifest || !this.config) {
            box.hidden = true;
            return;
        }
        setText(
            'workbook-host-mismatch-text',
            `This workbook's sheets belong to "${this.foreignManifest.ServerName}" (${this.foreignManifest.AddinUrl}). Switch servers to refresh them here.`,
        );
        box.hidden = false;
    }

    private renderConnection(): void {
        byId('signed-out').hidden = this.connection !== null;
        byId('signed-in').hidden = this.connection === null;
        (byId('sign-in') as HTMLButtonElement).disabled = this.busy;
        byId('external-handoff-box').hidden = this.pendingHandoff === null;
        (byId('reload-catalog') as HTMLButtonElement).disabled = this.busy || this.catalogLoading;
        if (this.connection) {
            const who = this.connection.UserEmail
                ? `${this.connection.UserName} (${this.connection.UserEmail})`
                : this.connection.UserName;
            setText('signed-in-as', who || 'your MemberJunction account');
            const expires = this.connection.ExpiresAt ? new Date(this.connection.ExpiresAt).toLocaleDateString() : '';
            setText('expires', expires ? `Connection expires ${expires}.` : '');
        }
    }

    private renderTabs(): void {
        const count = this.manifest?.Sources.length ?? 0;
        setText('workbook-count', String(count));
        const browseTab = byId('tab-browse');
        const workbookTab = byId('tab-workbook');
        const isBrowse = this.activeTab === 'browse';
        browseTab.setAttribute('aria-selected', String(isBrowse));
        browseTab.setAttribute('tabindex', isBrowse ? '0' : '-1');
        workbookTab.setAttribute('aria-selected', String(!isBrowse));
        workbookTab.setAttribute('tabindex', !isBrowse ? '0' : '-1');
        byId('panel-browse').hidden = !isBrowse;
        byId('panel-workbook').hidden = isBrowse;
    }

    private renderBrowsePanel(): void {
        const signedIn = this.connection !== null;
        byId('browse-signed-out-hint').hidden = signedIn;
        byId('browse-workspace').hidden = !signedIn;
        if (!signedIn) {
            return;
        }
        (byId('mode-entities') as HTMLInputElement).checked = this.browseMode === 'entities';
        (byId('mode-queries') as HTMLInputElement).checked = this.browseMode === 'queries';
        byId('catalog-loading').hidden = !this.catalogLoading;
        byId('entities-browser').hidden = this.browseMode !== 'entities';
        byId('queries-browser').hidden = this.browseMode !== 'queries';

        this.updateTargetSheetRadios('entity-target-current', 'entity-target-new', 'entity-current-sheet-label');
        this.updateTargetSheetRadios('query-target-current', 'query-target-new', 'query-current-sheet-label');

        if (this.selectedEntity) {
            byId('entities-list-view').hidden = true;
            byId('entity-detail-view').hidden = false;
            this.renderEntityDetail(this.selectedEntity);
        } else {
            byId('entities-list-view').hidden = false;
            byId('entity-detail-view').hidden = true;
            this.renderEntityList();
        }

        if (this.selectedQuery) {
            byId('queries-list-view').hidden = true;
            byId('query-detail-view').hidden = false;
            this.renderQueryDetail(this.selectedQuery);
        } else {
            byId('queries-list-view').hidden = false;
            byId('query-detail-view').hidden = true;
            this.renderQueryList();
        }
    }

    private updateTargetSheetRadios(currentInputId: string, newInputId: string, labelId: string): void {
        const currentRadio = byId(currentInputId) as HTMLInputElement;
        const newRadio = byId(newInputId) as HTMLInputElement;
        const activeSheet = this.sheetInfo.ActiveSheetName;
        if (activeSheet) {
            currentRadio.disabled = false;
            currentRadio.closest('.choice-row')?.classList.remove('is-disabled');
            setText(labelId, `Replaces sheet "${activeSheet}"`);
        } else {
            currentRadio.disabled = true;
            currentRadio.closest('.choice-row')?.classList.add('is-disabled');
            if (currentRadio.checked) {
                newRadio.checked = true;
            }
            setText(labelId, 'No active worksheet available');
        }
    }

    private renderEntityList(): void {
        const list = byId('entity-list');
        if (!this.catalog) {
            setText('entity-count', '');
            list.replaceChildren();
            return;
        }
        const filtered = FilterCatalogEntities(this.catalog, this.selectedAppId, this.entitySearch);
        setText(
            'entity-count',
            `${filtered.length.toLocaleString()} ${filtered.length === 1 ? 'entity' : 'entities'}`,
        );
        if (filtered.length === 0) {
            list.replaceChildren(emptyItem('No matching entities found.'));
            return;
        }
        list.replaceChildren(...filtered.map(entity => buildEntityCatalogItem(entity, () => void this.SelectEntity(entity))));
    }

    private renderEntityDetail(entity: ExcelCatalogEntity): void {
        setText('selected-entity-title', entity.DisplayName);
        const descEl = byId('selected-entity-desc');
        descEl.textContent = entity.Description || `Entity: ${entity.Name}`;
        (byId('load-entity-btn') as HTMLButtonElement).disabled = this.busy;

        const choicesContainer = byId('entity-view-choices');
        const defaultSavedView = this.entityViews.find(v => v.IsDefault);
        const rows: HTMLElement[] = [
            buildSourceChoiceRadio(
                'entitySourceChoice',
                `choice-entity-${entity.ID}`,
                `entity:${entity.ID}`,
                'All Records (Default Columns)',
                'Loads every readable record using this entity\'s default columns',
                defaultSavedView === undefined,
                'Entity',
            ),
        ];
        if (this.entityViewsLoading) {
            const loading = document.createElement('p');
            loading.className = 'muted status-line';
            loading.textContent = 'Checking saved views...';
            rows.push(loading);
        } else {
            for (const view of this.entityViews) {
                const badge = view.IsDefault ? 'Default view' : view.IsOwned ? 'My view' : 'Shared view';
                rows.push(
                    buildSourceChoiceRadio(
                        'entitySourceChoice',
                        `choice-view-${view.ID}`,
                        `view:${view.ID}`,
                        view.Name,
                        view.Description || 'Saved view columns, filters, and sort order',
                        IdsEqual(defaultSavedView?.ID, view.ID),
                        badge,
                    ),
                );
            }
        }
        choicesContainer.replaceChildren(...rows);
    }

    private renderQueryList(): void {
        const list = byId('query-list');
        if (!this.catalog) {
            setText('query-count', '');
            list.replaceChildren();
            return;
        }
        const filtered = FilterCatalogQueries(this.catalog, this.selectedCategoryId, this.querySearch);
        setText(
            'query-count',
            `${filtered.length.toLocaleString()} ${filtered.length === 1 ? 'query' : 'queries'}`,
        );
        if (filtered.length === 0) {
            list.replaceChildren(emptyItem('No matching saved queries found.'));
            return;
        }
        list.replaceChildren(...filtered.map(query => buildQueryCatalogItem(query, () => void this.SelectQuery(query))));
    }

    private renderQueryDetail(query: ExcelCatalogQuery): void {
        setText('selected-query-title', query.Name);
        const catBadge = byId('selected-query-category');
        catBadge.textContent = query.CategoryPath;
        catBadge.hidden = query.CategoryPath.length === 0;
        const descEl = byId('selected-query-desc');
        descEl.textContent = query.Description;
        descEl.hidden = query.Description.length === 0;
        (byId('load-query-btn') as HTMLButtonElement).disabled = this.busy;
        this.renderQueryFormError();
    }

    private renderQueryFormError(): void {
        const errorBox = byId('query-form-error');
        errorBox.textContent = this.queryFormError;
        errorBox.hidden = this.queryFormError.length === 0;
    }

    private renderSources(): void {
        const signedIn = this.connection !== null;
        byId('no-sources').hidden = this.manifest !== null || this.manifestError.length > 0;
        const error = byId('sources-error');
        error.textContent = this.manifestError;
        error.hidden = this.manifestError.length === 0;
        byId('sources').hidden = this.manifest === null;
        (byId('refresh-all') as HTMLButtonElement).disabled = !signedIn || this.busy;
        const list = byId('source-list');
        list.replaceChildren(
            ...(this.manifest?.Sources ?? []).map(s =>
                this.buildSourceCard(s, this.sourceStates.get(s.Key), signedIn, this.busy),
            ),
        );
    }

    private buildSourceCard(
        source: ExcelWorkbookSource,
        state: SourceState | undefined,
        signedIn: boolean,
        busy: boolean,
    ): HTMLLIElement {
        const item = document.createElement('li');
        item.className = 'source';

        const top = document.createElement('div');
        top.className = 'source-top';

        const title = document.createElement('div');
        title.className = 'source-title';
        title.textContent = source.Name;

        const kindBadge = document.createElement('span');
        kindBadge.className = 'badge badge-subtle';
        kindBadge.textContent = DescribeSourceKind(source.Kind);
        top.append(title, kindBadge);

        const detail = document.createElement('div');
        detail.className = `source-detail ${state?.Status === 'error' ? 'is-error' : ''}`;
        const statusPart = state?.Message ? ` ${state.Message}` : '';
        detail.textContent = `${DescribeSourceKind(source.Kind)} on sheet "${source.SheetName}".${statusPart}`;

        const actions = document.createElement('div');
        actions.className = 'action-row';

        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'button button-secondary button-small';
        refreshBtn.textContent = 'Refresh';
        refreshBtn.disabled = !signedIn || busy;
        refreshBtn.addEventListener('click', () => void this.Refresh(source.Key));

        const openSheetBtn = document.createElement('button');
        openSheetBtn.type = 'button';
        openSheetBtn.className = 'button button-secondary button-small';
        openSheetBtn.textContent = 'Open sheet';
        openSheetBtn.disabled = busy;
        openSheetBtn.addEventListener('click', () => void this.OpenSheet(source.SheetName));

        const unlinkBtn = document.createElement('button');
        unlinkBtn.type = 'button';
        unlinkBtn.className = 'button button-danger-ghost button-small';
        unlinkBtn.textContent = 'Unlink';
        unlinkBtn.disabled = busy;
        unlinkBtn.addEventListener('click', () => void this.UnlinkSource(source.Key));

        actions.append(refreshBtn, openSheetBtn, unlinkBtn);
        item.append(top, detail, actions);
        return item;
    }
}

function buildEntityCatalogItem(entity: ExcelCatalogEntity, onPick: () => void): HTMLLIElement {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog-item-btn';
    button.addEventListener('click', onPick);

    const main = document.createElement('div');
    main.className = 'catalog-item-main';

    const title = document.createElement('div');
    title.className = 'catalog-item-title';
    title.textContent = entity.DisplayName;
    main.append(title);

    const subText = entity.Description || (entity.Name !== entity.DisplayName ? entity.Name : '');
    if (subText) {
        const sub = document.createElement('div');
        sub.className = 'catalog-item-sub';
        sub.textContent = subText;
        main.append(sub);
    }

    const chevron = document.createElement('span');
    chevron.className = 'catalog-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '\u203A';

    button.append(main, chevron);
    li.append(button);
    return li;
}

function buildQueryCatalogItem(query: ExcelCatalogQuery, onPick: () => void): HTMLLIElement {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog-item-btn';
    button.addEventListener('click', onPick);

    const main = document.createElement('div');
    main.className = 'catalog-item-main';

    const title = document.createElement('div');
    title.className = 'catalog-item-title';
    title.textContent = query.Name;
    main.append(title);

    if (query.Description) {
        const sub = document.createElement('div');
        sub.className = 'catalog-item-sub';
        sub.textContent = query.Description;
        main.append(sub);
    }

    const meta = document.createElement('div');
    meta.className = 'catalog-item-meta';
    if (query.CategoryPath) {
        const catBadge = document.createElement('span');
        catBadge.className = 'badge badge-subtle';
        catBadge.textContent = query.CategoryPath;
        meta.append(catBadge);
    }
    if (query.Parameters.length > 0) {
        const paramBadge = document.createElement('span');
        paramBadge.className = 'badge';
        paramBadge.textContent = `${query.Parameters.length} ${query.Parameters.length === 1 ? 'param' : 'params'}`;
        meta.append(paramBadge);
    }
    if (meta.childElementCount > 0) {
        main.append(meta);
    }

    const chevron = document.createElement('span');
    chevron.className = 'catalog-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '\u203A';

    button.append(main, chevron);
    li.append(button);
    return li;
}

function buildSourceChoiceRadio(
    name: string,
    id: string,
    value: string,
    titleText: string,
    subText: string,
    checked: boolean,
    badgeText: string,
): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'choice-row';
    label.htmlFor = id;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = name;
    radio.id = id;
    radio.value = value;
    radio.checked = checked;

    const body = document.createElement('span');
    body.className = 'choice-body';

    const titleRow = document.createElement('span');
    titleRow.className = 'choice-title-row';

    const title = document.createElement('span');
    title.className = 'choice-title';
    title.textContent = titleText;

    const badge = document.createElement('span');
    badge.className = 'badge badge-subtle';
    badge.textContent = badgeText;

    titleRow.append(title, badge);

    const sub = document.createElement('span');
    sub.className = 'choice-sub';
    sub.textContent = subText;

    body.append(titleRow, sub);
    label.append(radio, body);
    return label;
}

function buildQueryParamField(param: ExcelCatalogQueryParameter, index: number): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'field-group';
    const inputId = `query-param-${index}`;
    const hintId = `query-param-hint-${index}`;

    const label = document.createElement('label');
    label.className = 'field-label';
    label.htmlFor = inputId;
    label.textContent = param.Name;
    if (param.IsRequired) {
        const req = document.createElement('span');
        req.className = 'field-required';
        req.setAttribute('aria-hidden', 'true');
        req.textContent = '*';
        label.append(req);
    }

    const hintParts: string[] = [];
    if (param.Description) {
        hintParts.push(param.Description);
    }
    if (param.Type === 'array') {
        hintParts.push('Comma-separated values.');
    }
    if (param.SampleValue) {
        hintParts.push(`Example: ${param.SampleValue}`);
    }

    let control: HTMLInputElement | HTMLSelectElement;
    if (param.Type === 'boolean') {
        const select = document.createElement('select');
        select.id = inputId;
        select.name = `qparam_${param.Name}`;
        select.className = 'select-input';
        if (!param.IsRequired) {
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = 'Default / Not set';
            select.append(emptyOpt);
        }
        const trueOpt = document.createElement('option');
        trueOpt.value = 'true';
        trueOpt.textContent = 'True';
        const falseOpt = document.createElement('option');
        falseOpt.value = 'false';
        falseOpt.textContent = 'False';
        select.append(trueOpt, falseOpt);
        if (param.DefaultValue !== null) {
            const norm = param.DefaultValue.trim().toLowerCase();
            if (norm === 'true' || norm === '1') {
                select.value = 'true';
            } else if (norm === 'false' || norm === '0') {
                select.value = 'false';
            }
        }
        control = select;
    } else {
        const input = document.createElement('input');
        input.id = inputId;
        input.name = `qparam_${param.Name}`;
        input.className = 'text-input';
        input.type = param.Type === 'number' ? 'number' : param.Type === 'date' ? 'date' : 'text';
        if (param.Type === 'number') {
            input.step = 'any';
        }
        input.autocomplete = 'off';
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.spellcheck = false;
        if (param.IsRequired) {
            input.required = true;
        }
        if (param.DefaultValue !== null) {
            input.value = param.DefaultValue;
        }
        if (param.SampleValue) {
            input.placeholder = param.SampleValue;
        }
        control = input;
    }

    wrapper.append(label, control);
    if (hintParts.length > 0) {
        const hint = document.createElement('p');
        hint.className = 'field-hint';
        hint.id = hintId;
        hint.textContent = hintParts.join(' ');
        control.setAttribute('aria-describedby', hintId);
        wrapper.append(hint);
    }
    return wrapper;
}

function emptyItem(text: string): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'catalog-empty';
    li.textContent = text;
    return li;
}

/** Extracts either a raw base64url handoff token or the `#h=<token>` fragment of a pasted return URL. */
function extractSealedToken(rawInput: string): string | null {
    const trimmed = rawInput.trim();
    if (IsHandoffToken(trimmed)) {
        return trimmed;
    }
    try {
        const url = new URL(trimmed);
        const fromHash = new URLSearchParams(url.hash.replace(/^#/, '')).get('h');
        return IsHandoffToken(fromHash) ? fromHash : null;
    } catch {
        return null;
    }
}

/** Opens an external browser window for signing in to a custom MemberJunction host. */
function openExternalBrowser(url: string): void {
    try {
        if (typeof Office !== 'undefined' && Office.context?.ui?.openBrowserWindow) {
            Office.context.ui.openBrowserWindow(url);
            return;
        }
    } catch {
        // Fall through to window.open.
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

/** Opens the Office sign-in dialog; resolves with the sealed answer, or null when cancelled. */
function openSignInDialog(relativeUrl: string): Promise<string | null> {
    const url = new URL(relativeUrl, window.location.href).toString();
    return new Promise((resolve, reject) => {
        Office.context.ui.displayDialogAsync(url, { height: 70, width: 40, displayInIframe: false }, result => {
            if (result.status !== Office.AsyncResultStatus.Succeeded) {
                reject(new Error(`The sign-in window couldn't open: ${result.error.message}`));
                return;
            }
            const dialog = result.value;
            dialog.addEventHandler(Office.EventType.DialogMessageReceived, arg => {
                dialog.close();
                const message = parseDialogMessage('message' in arg ? arg.message : '');
                resolve(message?.Kind === 'Sealed' && message.Value ? message.Value : null);
            });
            dialog.addEventHandler(Office.EventType.DialogEventReceived, () => resolve(null));
        });
    });
}

function parseDialogMessage(text: string): DialogMessage | null {
    try {
        const parsed = JSON.parse(text) as Partial<DialogMessage>;
        return parsed.Kind === 'Sealed' || parsed.Kind === 'Cancelled' ? { Kind: parsed.Kind, Value: parsed.Value } : null;
    } catch {
        return null;
    }
}

function wireTabKeyboardNavigation(paneInstance: TaskPane): void {
    const tabs: { Id: string; Tab: WorkspaceTab }[] = [
        { Id: 'tab-browse', Tab: 'browse' },
        { Id: 'tab-workbook', Tab: 'workbook' },
    ];
    byId('workspace-tabs').addEventListener('keydown', (event: KeyboardEvent) => {
        const activeId = document.activeElement?.id;
        const currentIndex = tabs.findIndex(t => t.Id === activeId);
        if (currentIndex < 0) {
            return;
        }
        let nextIndex = -1;
        if (event.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % tabs.length;
        } else if (event.key === 'ArrowLeft') {
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = tabs.length - 1;
        }
        if (nextIndex >= 0) {
            event.preventDefault();
            const next = tabs[nextIndex];
            paneInstance.SetTab(next.Tab);
            byId(next.Id).focus();
        }
    });
}

function byId(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`The pane is missing element #${id}.`);
    }
    return element;
}

function setText(id: string, text: string): void {
    byId(id).textContent = text;
}

function messageOf(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

const pane = new TaskPane();

Office.onReady(info => {
    if (info.host !== Office.HostType.Excel) {
        setText('notice', 'This add-in works in Excel only.');
        byId('notice').hidden = false;
        return;
    }
    byId('toggle-server-switcher').addEventListener('click', () => pane.ToggleServerSwitcher());
    byId('cancel-server-btn').addEventListener('click', () => pane.ToggleServerSwitcher(false));
    byId('reset-server-btn').addEventListener('click', () => void pane.ResetServerToDefault());
    byId('adopt-workbook-server').addEventListener('click', () => void pane.AdoptWorkbookServer());
    byId('server-form').addEventListener('submit', e => {
        e.preventDefault();
        void pane.SwitchServer((byId('server-url-input') as HTMLInputElement).value);
    });

    byId('sign-in').addEventListener('click', () => void pane.SignIn());
    byId('sign-out').addEventListener('click', () => pane.SignOut());
    byId('reload-catalog').addEventListener('click', () => void pane.EnsureCatalog(true));
    byId('cancel-handoff-btn').addEventListener('click', () => pane.CancelExternalHandoff());
    byId('handoff-code-form').addEventListener('submit', e => {
        e.preventDefault();
        void pane.CompleteExternalHandoff((byId('connection-code-input') as HTMLInputElement).value);
    });

    byId('tab-browse').addEventListener('click', () => pane.SetTab('browse'));
    byId('tab-workbook').addEventListener('click', () => pane.SetTab('workbook'));
    byId('go-to-browse-btn').addEventListener('click', () => pane.SetTab('browse'));
    byId('add-more-data-btn').addEventListener('click', () => pane.SetTab('browse'));
    wireTabKeyboardNavigation(pane);

    byId('mode-entities').addEventListener('change', () => pane.SetBrowseMode('entities'));
    byId('mode-queries').addEventListener('change', () => pane.SetBrowseMode('queries'));

    byId('app-filter').addEventListener('change', e => pane.SetApplicationFilter((e.target as HTMLSelectElement).value));
    byId('entity-search').addEventListener('input', e => pane.SetEntitySearch((e.target as HTMLInputElement).value));
    byId('back-to-entities').addEventListener('click', () => pane.BackToEntities());
    byId('entity-load-form').addEventListener('submit', e => {
        e.preventDefault();
        void pane.SubmitEntitySelection();
    });

    byId('query-category').addEventListener('change', e => pane.SetQueryCategoryFilter((e.target as HTMLSelectElement).value));
    byId('query-search').addEventListener('input', e => pane.SetQuerySearch((e.target as HTMLInputElement).value));
    byId('back-to-queries').addEventListener('click', () => pane.BackToQueries());
    byId('query-load-form').addEventListener('submit', e => {
        e.preventDefault();
        void pane.SubmitQuerySelection();
    });

    byId('refresh-all').addEventListener('click', () => void pane.RefreshAll());

    void pane.Start();
});
