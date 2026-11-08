---
"@memberjunction/computer-use": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/browser-extension-core": minor
"@memberjunction/ng-browser-extension": minor
"@memberjunction/browser-extension-host": minor
"@memberjunction/browser-extension-builder": minor
---

Implement the MemberJunction Browser Extension architecture across four phases:

- **`@memberjunction/computer-use`**: Extract Playwright-free DOM grounding (`INTERACTIVITYPROBE`, `ProbeDomInteractiveElements`, `ResolveDomSelector`) and target-healing (`ReresolveTarget`, `ShouldAcceptHeal`) into `@memberjunction/computer-use/browser-probe` for shared use across `PlaywrightBrowserAdapter` and MV3 Content Scripts.
- **`@memberjunction/ai-core-plus` & metadata**: Extend `IAgentSettings` in lockstep with `BrowserExtension` settings (`ContextRules`, `EntityFacets`, `DefaultControlBackend`, `AllowDebuggerCDP`, `BrandKitID`) and register the `LocalBrowser` AI Agent Channel.
- **`@memberjunction/browser-extension-core`**: Implement Dual-Mode Browser Control (`ContentScriptBrowserAdapter`, `ChromeDebuggerBrowserAdapter`, `ExtensionBrowserAdapter`, 4-Layer `ControlModeCascade`, `SensitivePageGuard`, `CoachMarkOverlayRenderer`), `LocalBrowserChannel` (Channels v2 `BaseRealtimeChannelClient`), Multi-App Context Braiding (`BrowserContextEngine`, `StandardPageExtractor`, `LinkedInPageExtractor`), Session Handoff (`ExtensionSessionHandoffCoordinator`), Guided Playbooks & Model-Blind Secret Vault Pipe (`GuidedPlaybookRunner`, `ModelBlindSecretVaultPipe`), and Runtime Brand Kit Hydration (`RuntimeBrandKitHydrator`).
- **`@memberjunction/ng-browser-extension`**: Add Angular 21 Side Panel components (`<mj-extension-side-panel>`, `<mj-trust-perception-bar>`, `<mj-braided-context-drawer>`, `<mj-playbook-stepper>`) and `MJExtensionBridgeService`.
- **`@memberjunction/browser-extension-host`**: Add Manifest V3 `service-worker.ts`, `content-script.ts`, `offscreen-audio.ts`, and `sidepanel.html`.
- **`@memberjunction/browser-extension-builder` & `Brands/`**: Add the White-Label Brand Stamping Factory (`ExtensionBrandBuilder`, `mj-ext-build` CLI) and reference brand profiles for `mj-copilot`, `betty`, and `sidecar`.
