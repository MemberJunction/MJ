/**
 * The MemberJunction pane in Excel.
 *
 * Opens with a workbook from MJ's Open in Excel: reads the workbook's source list, asks the person
 * to sign in once (through Explorer, in an Office dialog), then fills each sheet as that person.
 */
import { ExcelWorkbookManifest, ExcelWorkbookSource, ParseWorkbookManifest } from '../contract';
import { CreateHandoffKeyPair, CreateHandoffState, ExportHandoffPublicKey, OpenConnectionPayload } from '../handoff';
import { ForgetConnection, LoadConnection, SaveConnection, StoredConnection } from './connection-store';
import { ConnectionRefusedError, FetchSourceRows } from './mj-data-client';
import { LoadPaneConfig, PaneConfig, SameAddinUrl } from './pane-config';
import { ReadSourceCells, WriteSourceRows } from './workbook-io';

type SourceState = { Status: 'idle' | 'busy' | 'done' | 'error'; Message: string };

interface DialogMessage {
    Kind: 'Sealed' | 'Cancelled';
    Value?: string;
}

class TaskPane {
    private config: PaneConfig | null = null;
    private connection: StoredConnection | null = null;
    private manifest: ExcelWorkbookManifest | null = null;
    private manifestError = '';
    private sourceStates = new Map<string, SourceState>();
    private notice = '';
    private busy = false;

    public async Start(): Promise<void> {
        try {
            this.config = await LoadPaneConfig();
            this.connection = LoadConnection(this.config.AddinUrl);
            await this.loadManifest();
        } catch (e) {
            this.notice = messageOf(e);
        }
        this.render();
        if (this.connection && this.manifest) {
            await this.RefreshAll();
        }
    }

    public async SignIn(): Promise<void> {
        if (!this.config || this.busy) {
            return;
        }
        this.notice = '';
        try {
            const keys = await CreateHandoffKeyPair();
            const state = CreateHandoffState();
            const publicKey = await ExportHandoffPublicKey(keys.publicKey);
            const sealed = await openSignInDialog(`connect.html?pk=${publicKey}&state=${state}`);
            if (sealed === null) {
                this.render();
                return;
            }
            const payload = await OpenConnectionPayload(keys.privateKey, sealed, state);
            this.connection = SaveConnection(payload, this.config.AddinUrl);
            this.render();
            if (this.manifest) {
                await this.RefreshAll();
            }
        } catch (e) {
            this.notice = messageOf(e);
            this.render();
        }
    }

    public SignOut(): void {
        ForgetConnection();
        this.connection = null;
        this.notice = 'Signed out on this computer. To stop the connection everywhere, revoke the Excel add-in key on MemberJunction\'s API Keys page.';
        this.render();
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
            const more = result.TotalRowCount > written ? ` of ${result.TotalRowCount.toLocaleString()} (the first ${written.toLocaleString()} are shown)` : '';
            this.setSourceState(source, 'done', `${written.toLocaleString()} rows${more}, ${new Date().toLocaleTimeString()}`);
            return true;
        } catch (e) {
            if (e instanceof ConnectionRefusedError) {
                ForgetConnection();
                this.connection = null;
                this.notice = e.message;
                this.setSourceState(source, 'error', 'Not loaded.');
                return false;
            }
            this.setSourceState(source, 'error', messageOf(e));
            return true;
        }
    }

    private async loadManifest(): Promise<void> {
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
            this.manifestError = `This workbook came from ${parsed.Manifest.ServerName}, not ${this.config.ServerName}. Open it with that organization's MemberJunction add-in.`;
            return;
        }
        this.manifest = parsed.Manifest;
    }

    private setSourceState(source: ExcelWorkbookSource, status: SourceState['Status'], message: string): void {
        this.sourceStates.set(source.Key, { Status: status, Message: message });
        this.busy = status === 'busy';
        this.render();
    }

    private render(): void {
        setText('server-name', this.config?.ServerName ?? 'MemberJunction');
        renderNotice(this.notice);
        renderConnection(this.connection, this.busy);
        renderSources(this.manifest, this.manifestError, this.sourceStates, this.connection !== null, this.busy);
    }
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

function renderNotice(notice: string): void {
    const element = byId('notice');
    element.textContent = notice;
    element.hidden = notice.length === 0;
}

function renderConnection(connection: StoredConnection | null, busy: boolean): void {
    byId('signed-out').hidden = connection !== null;
    byId('signed-in').hidden = connection === null;
    (byId('sign-in') as HTMLButtonElement).disabled = busy;
    if (connection) {
        const who = connection.UserEmail ? `${connection.UserName} (${connection.UserEmail})` : connection.UserName;
        setText('signed-in-as', who || 'your MemberJunction account');
        const expires = connection.ExpiresAt ? new Date(connection.ExpiresAt).toLocaleDateString() : '';
        setText('expires', expires ? `Connection expires ${expires}.` : '');
    }
}

function renderSources(
    manifest: ExcelWorkbookManifest | null,
    manifestError: string,
    states: Map<string, SourceState>,
    signedIn: boolean,
    busy: boolean,
): void {
    byId('no-sources').hidden = manifest !== null || manifestError.length > 0;
    const error = byId('sources-error');
    error.textContent = manifestError;
    error.hidden = manifestError.length === 0;
    byId('sources').hidden = manifest === null;
    (byId('refresh-all') as HTMLButtonElement).disabled = !signedIn || busy;
    const list = byId('source-list');
    list.replaceChildren(...(manifest?.Sources ?? []).map(s => sourceItem(s, states.get(s.Key), signedIn, busy)));
}

function sourceItem(source: ExcelWorkbookSource, state: SourceState | undefined, signedIn: boolean, busy: boolean): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'source';
    const title = document.createElement('div');
    title.className = 'source-title';
    title.textContent = source.Name;
    const detail = document.createElement('div');
    detail.className = `source-detail ${state?.Status === 'error' ? 'is-error' : ''}`;
    detail.textContent = `${source.Kind === 'View' ? 'Saved view' : 'Saved query'} on sheet "${source.SheetName}". ${state?.Message ?? ''}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-secondary';
    button.textContent = 'Refresh';
    button.disabled = !signedIn || busy;
    button.addEventListener('click', () => void pane.Refresh(source.Key));
    item.append(title, detail, button);
    return item;
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
    byId('sign-in').addEventListener('click', () => void pane.SignIn());
    byId('sign-out').addEventListener('click', () => pane.SignOut());
    byId('refresh-all').addEventListener('click', () => void pane.RefreshAll());
    void pane.Start();
});
