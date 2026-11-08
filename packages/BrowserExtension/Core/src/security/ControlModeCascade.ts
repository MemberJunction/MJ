/**
 * @fileoverview 4-Layer Configuration Cascade for Browser Control Mode & Per-Domain Policy Persistence.
 *
 * Implements the cascade defined in `plans/browser-extension-architecture.md` §3.3:
 * ```
 * 1. Code Default ('content-script')
 *    ↓ overridden by
 * 2. Brand / Application Default (mj-extension-brand.json / Application.AgentSettings.BrowserExtension)
 *    ↓ overridden by
 * 3. Agent / Playbook / Domain Rule (BrowserContextRule.PreferredControlBackend / Playbook step)
 *    ↓ overridden by (within policy ceiling)
 * 4. User Runtime Toggle in the Side Panel Trust Bar (persisted per-domain via UserInfoEngine)
 * ```
 *
 * Per MJ Critical Rule 9, user preferences are persisted exclusively through `UserInfoEngine.Instance`
 * (`MJ: User Settings` key `mj.browserExtension.domainPolicy.v1`) — **never** `window.localStorage`.
 *
 * @module @memberjunction/browser-extension-core
 */

import { BaseSingleton } from '@memberjunction/global';
import { UserInfoEngine } from '@memberjunction/core-entities';
import type { RealtimeChannelExposure } from '@memberjunction/ai-core-plus';
import type {
    BrowserControlBackendMode,
    BrowserControlCascadeInput,
    BrowserControlCascadeResolution,
    BrowserExtensionDomainPolicyEntry,
    ConcreteBrowserControlBackend,
    ExtensionBrowserControlMode,
} from '../types/extension-types.js';

/**
 * `MJ: User Settings` key storing per-domain control backend, collaboration mode, and exposure preferences.
 */
export const BROWSER_EXTENSION_DOMAIN_POLICY_SETTING_KEY = 'mj.browserExtension.domainPolicy.v1';

/**
 * 4-Layer Configuration Cascade resolver for Browser Control Mode (`content-script`, `debugger-cdp`, `auto`).
 */
export class ControlModeCascade {
    /**
     * Evaluates the 4-layer configuration cascade and enterprise safety ceiling (`AllowDebuggerCDP`).
     */
    public Resolve(input: BrowserControlCascadeInput): BrowserControlCascadeResolution {
        const debuggerPermitted = input.AgentAllowDebuggerCDP !== false;

        let configuredMode: BrowserControlBackendMode = 'content-script';
        let winningLayer: BrowserControlCascadeResolution['WinningLayer'] = 'code-default';

        // Layer 2a: Brand Default
        if (input.BrandDefaultBackend) {
            configuredMode = input.BrandDefaultBackend;
            winningLayer = 'brand-default';
        }

        // Layer 2b: Agent / Application Default
        if (input.AgentDefaultBackend) {
            configuredMode = input.AgentDefaultBackend;
            winningLayer = 'agent-default';
        }

        // Layer 3: Domain or Playbook Rule
        if (input.DomainRuleBackend) {
            configuredMode = input.DomainRuleBackend;
            winningLayer = 'domain-or-playbook-rule';
        }

        // Layer 4: User Runtime Override in Trust Bar
        if (input.UserRuntimeOverride) {
            configuredMode = input.UserRuntimeOverride;
            winningLayer = 'user-runtime-override';
        }

        // Enterprise Safety Ceiling: AllowDebuggerCDP === false clamps to 'content-script'
        if (!debuggerPermitted && (configuredMode === 'debugger-cdp' || configuredMode === 'auto')) {
            configuredMode = 'content-script';
            winningLayer = 'enterprise-safety-ceiling';
        }

        // Resolve Concrete Active Backend ('content-script' vs 'debugger-cdp')
        let activeBackend: ConcreteBrowserControlBackend = 'content-script';
        let escalatedFromAuto = false;

        if (configuredMode === 'debugger-cdp') {
            activeBackend = 'debugger-cdp';
        } else if (configuredMode === 'auto') {
            const shouldEscalate =
                debuggerPermitted &&
                (input.PlaybookRequireTrustedInput === true ||
                    input.LastActionRequiresTrustedInput === true);
            if (shouldEscalate) {
                activeBackend = 'debugger-cdp';
                escalatedFromAuto = true;
            } else {
                activeBackend = 'content-script';
            }
        }

        return {
            ConfiguredMode: configuredMode,
            ActiveBackend: activeBackend,
            WinningLayer: winningLayer,
            DebuggerPermitted: debuggerPermitted,
            EscalatedFromAuto: escalatedFromAuto,
        };
    }
}

/**
 * Singleton store managing per-domain user preferences via `UserInfoEngine.Instance` (`MJ: User Settings`).
 */
export class DomainPolicyPreferencesStore extends BaseSingleton<DomainPolicyPreferencesStore> {
    private readonly inMemoryCache = new Map<string, BrowserExtensionDomainPolicyEntry>();

    protected constructor() {
        super();
    }

    /**
     * Global singleton instance of `DomainPolicyPreferencesStore`.
     */
    public static get Instance(): DomainPolicyPreferencesStore {
        return super.getInstance<DomainPolicyPreferencesStore>();
    }

    /**
     * Reads the saved domain policy entry for a hostname.
     */
    public GetDomainPolicy(hostname: string): BrowserExtensionDomainPolicyEntry | null {
        const key = this.normalizeHostname(hostname);
        if (!key) {
            return null;
        }
        this.hydrateFromUserInfoEngine();
        return this.inMemoryCache.get(key) ?? null;
    }

    /**
     * Updates and persists the user's domain policy via `UserInfoEngine.Instance.SetSettingDebounced()`.
     */
    public SetDomainPolicy(
        hostname: string,
        update: {
            ControlBackend?: BrowserControlBackendMode;
            ControlMode?: ExtensionBrowserControlMode;
            Exposure?: RealtimeChannelExposure;
        }
    ): BrowserExtensionDomainPolicyEntry {
        const key = this.normalizeHostname(hostname);
        this.hydrateFromUserInfoEngine();
        const existing = this.inMemoryCache.get(key);
        const merged: BrowserExtensionDomainPolicyEntry = {
            Hostname: key,
            ControlBackend: update.ControlBackend ?? existing?.ControlBackend,
            ControlMode: update.ControlMode ?? existing?.ControlMode,
            Exposure: update.Exposure ?? existing?.Exposure,
            UpdatedAtIso: new Date().toISOString(),
        };
        this.inMemoryCache.set(key, merged);
        this.persistToUserInfoEngine();
        return merged;
    }

    /**
     * Clears the in-memory cache (for unit tests).
     */
    public ClearCache(): void {
        this.inMemoryCache.clear();
    }

    private hydrateFromUserInfoEngine(): void {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(BROWSER_EXTENSION_DOMAIN_POLICY_SETTING_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as Record<string, BrowserExtensionDomainPolicyEntry>;
            if (parsed && typeof parsed === 'object') {
                for (const [k, v] of Object.entries(parsed)) {
                    if (v && typeof v === 'object') {
                        this.inMemoryCache.set(k.toLowerCase(), v);
                    }
                }
            }
        } catch {
            // UserInfoEngine may not be initialized in standalone unit tests
        }
    }

    private persistToUserInfoEngine(): void {
        try {
            const obj: Record<string, BrowserExtensionDomainPolicyEntry> = {};
            for (const [k, v] of this.inMemoryCache.entries()) {
                obj[k] = v;
            }
            UserInfoEngine.Instance.SetSettingDebounced(
                BROWSER_EXTENSION_DOMAIN_POLICY_SETTING_KEY,
                JSON.stringify(obj)
            );
        } catch {
            // Ignore when UserInfoEngine is not connected to a server
        }
    }

    private normalizeHostname(hostnameOrUrl: string): string {
        const trimmed = (hostnameOrUrl ?? '').trim().toLowerCase();
        if (!trimmed) {
            return '';
        }
        if (trimmed.includes('://')) {
            try {
                return new URL(trimmed).hostname.toLowerCase();
            } catch {
                return trimmed;
            }
        }
        return trimmed.split('/')[0];
    }
}
