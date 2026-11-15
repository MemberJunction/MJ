/**
 * @fileoverview Side Panel Bootstrap Controller (`sidepanel-bootstrap.ts`) for the
 * MemberJunction Browser Extension.
 *
 * Wires together:
 * - {@link RuntimeBrandKitHydrator} (hydrates `--mj-*` CSS design tokens for `mj-copilot`, `betty`, `sidecar`)
 * - {@link LocalBrowserChannel} (Channels v2 contract + `EnableVisualPerception`)
 * - {@link BrowserContextEngine} (2-stage batched `RunViews()` Multi-App Context Braiding)
 * - {@link GuidedPlaybookRunner} (cross-site playbooks + Model-Blind Secret Vault Pipe)
 */

import { RealtimeChannelExposure } from '@memberjunction/ai-core-plus';
import {
    BraidedPageContextPayload,
    BrowserContextEngine,
    BrowserControlBackendMode,
    BrowserPageStateSnapshot,
    ExtensionBrandProfile,
    HydratedExtensionBrandTheme,
    LocalBrowserChannel,
    RuntimeBrandKitHydrator,
} from '@memberjunction/browser-extension-core';

/**
 * Controller managing the Extension Side Panel runtime lifecycle.
 */
export class ExtensionSidePanelController {
    public readonly Channel: LocalBrowserChannel;
    public readonly Hydrator: RuntimeBrandKitHydrator;
    private activeBrand: ExtensionBrandProfile;
    private hydratedTheme: HydratedExtensionBrandTheme | null = null;
    private latestContext: BraidedPageContextPayload | null = null;
    private controlMode: BrowserControlBackendMode = 'content-script';

    public constructor(brandProfile: ExtensionBrandProfile) {
        this.activeBrand = brandProfile;
        this.controlMode = brandProfile.DefaultControlBackend;
        this.Channel = new LocalBrowserChannel();
        this.Hydrator = new RuntimeBrandKitHydrator();
    }

    /**
     * Hydrate the brand theme into `doc` and mount the Side Panel shell into `#mj-extension-sidepanel-root`.
     */
    public Mount(doc: Document = document): HydratedExtensionBrandTheme {
        this.hydratedTheme = this.Hydrator.HydrateFromBrandProfile(this.activeBrand);
        this.Hydrator.ApplyThemeToDocument(doc, this.hydratedTheme);

        const root = doc.getElementById('mj-extension-sidepanel-root');
        if (root) {
            root.setAttribute('data-brand-slug', this.activeBrand.BrandSlug);
            root.setAttribute('data-assistant-name', this.activeBrand.AssistantDisplayName);
            root.innerHTML = `
                <div class="mj-sidepanel-mounted-shell">
                    <header class="mj-sidepanel-brand-header">
                        <h1 class="mj-sidepanel-assistant-name">${this.escapeHtml(this.activeBrand.AssistantDisplayName)}</h1>
                        <p class="mj-sidepanel-tagline">${this.escapeHtml(this.activeBrand.Tagline)}</p>
                    </header>
                    <div class="mj-sidepanel-status" data-exposure="${this.Channel.Exposure}" data-control-mode="${this.controlMode}">
                        Perception: ${this.Channel.Exposure} | Mode: ${this.controlMode}
                    </div>
                </div>
            `;
        }
        return this.hydratedTheme;
    }

    /**
     * Resolve Multi-App Braided Context for a page state snapshot using `BrowserContextEngine.Instance`.
     */
    public async RefreshPageContext(
        snapshot: BrowserPageStateSnapshot
    ): Promise<BraidedPageContextPayload> {
        this.latestContext = await BrowserContextEngine.Instance.ResolveBraidedContext(snapshot);
        return this.latestContext;
    }

    /**
     * Update the user's Channels v2 exposure level (`'none' | 'state' | 'pixels'`).
     */
    public SetExposure(exposure: RealtimeChannelExposure): RealtimeChannelExposure {
        this.Channel.ApplyExposure({ User: exposure });
        return this.Channel.Exposure;
    }

    /**
     * Update the user's active browser control mode (`'content-script' | 'debugger-cdp' | 'auto'`).
     */
    public SetControlMode(mode: BrowserControlBackendMode): BrowserControlBackendMode {
        this.controlMode = mode;
        return this.controlMode;
    }

    /**
     * Get the latest resolved braided context.
     */
    public get LatestBraidedContext(): BraidedPageContextPayload | null {
        return this.latestContext;
    }

    /**
     * Get the currently hydrated brand theme.
     */
    public get HydratedTheme(): HydratedExtensionBrandTheme | null {
        return this.hydratedTheme;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
