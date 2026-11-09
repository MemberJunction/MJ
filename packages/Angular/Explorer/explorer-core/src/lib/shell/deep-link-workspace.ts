import { WorkspaceConfiguration } from '@memberjunction/ng-base-application';

/**
 * Makes a deep link's query params win over the saved workspace on a full page load.
 *
 * On a full load the workspace is restored from `MJ: Workspaces`, and a tab the URL points at
 * may already be open there with its OWN saved query params (an older selection). Those saved
 * params used to reach the tab's component first; the URL's params arrived later, if at all,
 * so a pasted deep link into an already-open tab kept its old selection.
 *
 * Applied to the loaded configuration BEFORE it is published (see
 * `WorkspaceStateManager.Initialize`'s `PrepareConfiguration`), this writes the URL's params
 * into the matching tab and makes it the active tab, so the component's very first read of its
 * query params is the URL's.
 *
 * Only a URL that CARRIES params overrides: a bare deep link to an open tab keeps that tab's
 * saved state, as before.
 *
 * @param config the configuration loaded from the server (or the local journal).
 * @param tabId the restored tab the URL resolves to.
 * @param urlParams the URL's query params.
 * @param nowIso the activation stamp to give the tab (`new Date().toISOString()` in production).
 * @returns `config` itself when nothing changes, else a new configuration.
 */
export function ApplyDeepLinkToRestoredWorkspace(
    config: WorkspaceConfiguration,
    tabId: string,
    urlParams: Record<string, string>,
    nowIso: string
): WorkspaceConfiguration {
    if (Object.keys(urlParams).length === 0) {
        return config;
    }
    const tab = config.tabs.find(t => t.id === tabId);
    if (!tab) {
        return config;
    }
    const savedParams = (tab.configuration?.['queryParams'] ?? {}) as Record<string, string>;
    if (sameParams(savedParams, urlParams) && config.activeTabId === tabId) {
        return config;
    }
    return {
        ...config,
        activeTabId: tabId,
        tabs: config.tabs.map(t => t.id === tabId
            ? { ...t, lastAccessedAt: nowIso, configuration: { ...t.configuration, queryParams: { ...urlParams } } }
            : t)
    };
}

/** Order-independent equality of two query-param records. */
function sameParams(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every(k => Object.prototype.hasOwnProperty.call(b, k) && String(a[k]) === String(b[k]));
}
