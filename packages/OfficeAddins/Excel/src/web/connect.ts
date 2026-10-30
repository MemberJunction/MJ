/**
 * The sign-in dialog's first page. Office requires a dialog to open on the add-in's own host and
 * initialize Office.js before redirecting to an `<AppDomain>` origin, so this page validates the
 * request, awaits `Office.onReady()` (with a short fallback outside Office), and moves on to
 * Explorer's `/office/connect` page.
 */
import { IsHandoffToken } from '../handoff';
import { LoadPaneConfig } from './pane-config';

function waitForOfficeReady(timeoutMs = 1200): Promise<void> {
    return new Promise(resolve => {
        let settled = false;
        const finish = (): void => {
            if (!settled) {
                settled = true;
                resolve();
            }
        };
        const timer = window.setTimeout(finish, timeoutMs);
        try {
            if (typeof Office !== 'undefined' && typeof Office.onReady === 'function') {
                void Office.onReady(() => {
                    window.clearTimeout(timer);
                    finish();
                });
                return;
            }
        } catch {
            // Fall through to immediate resolution when running outside an Office host.
        }
        window.clearTimeout(timer);
        finish();
    });
}

async function start(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const publicKey = params.get('pk');
    const state = params.get('state');
    if (!IsHandoffToken(publicKey) || !IsHandoffToken(state)) {
        show('This sign-in request is malformed. Close this window and choose Sign in again in Excel.');
        return;
    }
    try {
        const [config] = await Promise.all([LoadPaneConfig(), waitForOfficeReady()]);
        const target = new URL(config.ExplorerConnectUrl);
        target.searchParams.set('pk', publicKey);
        target.searchParams.set('state', state);
        const destination = target.toString();
        revealFallbackLink(destination);
        window.location.replace(destination);
    } catch (e) {
        show(e instanceof Error ? e.message : String(e));
    }
}

function revealFallbackLink(url: string): void {
    const wrap = document.getElementById('fallback-wrap');
    const link = document.getElementById('fallback-link') as HTMLAnchorElement | null;
    if (!wrap || !link) {
        return;
    }
    link.href = url;
    window.setTimeout(() => {
        wrap.hidden = false;
    }, 1500);
}

function show(message: string): void {
    const element = document.getElementById('message');
    if (element) {
        element.textContent = message;
    }
}

void start();
