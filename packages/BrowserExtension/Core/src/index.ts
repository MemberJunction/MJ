/**
 * @fileoverview Public API surface of `@memberjunction/browser-extension-core`.
 *
 * Exports only symbols defined within this package (per MemberJunction Rule 5: no cross-package re-exports).
 * For `IAgentSettings`, `BrowserContextRuleSpec`, `BrowserEntityFacetSpec`, and `RealtimeChannelDescriptor`,
 * import directly from `@memberjunction/ai-core-plus`.
 * For `InteractiveElement`, `INTERACTIVITYPROBE`, and `ReresolveTarget`, import directly from
 * `@memberjunction/computer-use/browser-probe`.
 *
 * @module @memberjunction/browser-extension-core
 */

export * from './types/extension-types.js';
export * from './security/SensitivePageGuard.js';
export * from './security/ControlModeCascade.js';
export * from './adapters/CoachMarkOverlayRenderer.js';
export * from './adapters/InPageContentScriptExecutor.js';
export * from './adapters/ContentScriptBrowserAdapter.js';
export * from './adapters/ChromeDebuggerBrowserAdapter.js';
export * from './adapters/ExtensionBrowserAdapter.js';
export * from './channel/LocalBrowserChannel.js';
export * from './braiding/BaseBrowserPageExtractor.js';
export * from './braiding/StandardPageExtractor.js';
export * from './braiding/LinkedInPageExtractor.js';
export * from './braiding/ReferenceOpenAppConfigs.js';
export * from './braiding/BrowserContextEngine.js';
export * from './handoff/ExtensionSessionHandoffCoordinator.js';
export * from './playbooks/ModelBlindSecretVaultPipe.js';
export * from './playbooks/ReferencePlaybooks.js';
export * from './playbooks/GuidedPlaybookRunner.js';
export * from './branding/RuntimeBrandKitHydrator.js';
