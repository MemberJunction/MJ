/**
 * The sign-in dialog's first page. Office requires a dialog to open on the add-in's own host, so
 * this page only checks the request and moves on to Explorer's connect page, where the person signs
 * in the way they always do.
 */
import { IsHandoffToken } from '../handoff';
import { LoadPaneConfig } from './pane-config';

async function start(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const publicKey = params.get('pk');
    const state = params.get('state');
    if (!IsHandoffToken(publicKey) || !IsHandoffToken(state)) {
        show('This sign-in request is malformed. Close this window and choose Sign in again in Excel.');
        return;
    }
    try {
        const config = await LoadPaneConfig();
        const target = new URL(config.ExplorerConnectUrl);
        target.searchParams.set('pk', publicKey);
        target.searchParams.set('state', state);
        window.location.replace(target.toString());
    } catch (e) {
        show(e instanceof Error ? e.message : String(e));
    }
}

function show(message: string): void {
    const element = document.getElementById('message');
    if (element) {
        element.textContent = message;
    }
}

void start();
