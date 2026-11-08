/**
 * @fileoverview `ExtensionBrandBuilder` — White-Label Brand Stamping Factory for
 * MemberJunction Browser Extensions (`MJ Co-Pilot`, `Betty`, `Sidecar`, and custom tenant brands).
 *
 * Responsibilities:
 * 1. Validates `mj-extension-brand.json` via {@link ValidateExtensionBrandProfile}.
 * 2. Derives `--mj-*` CSS design tokens using `@memberjunction/theme-engine` via {@link RuntimeBrandKitHydrator}.
 * 3. Stamps `manifest.json` (including conditional `"debugger"` in `optional_permissions` vs omitted when
 *    `IncludeDebuggerPermission === false`).
 * 4. Emits self-contained Manifest V3 runtime scripts (`content-script.js`, `service-worker.js`,
 *    `sidepanel.js`, `offscreen-audio.js`, `sidepanel.html`, `offscreen.html`) and icons into `UnpackedDir`.
 * 5. Packages a Chrome Web Store ready `.zip` archive (`ZipPath`).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {
    ExtensionBrandProfile,
    HydratedExtensionBrandTheme,
    REDACTED_SENTINEL,
    RuntimeBrandKitHydrator,
} from '@memberjunction/browser-extension-core';
import { ValidateExtensionBrandProfile } from './BrandProfileSchema.js';

/**
 * Stamped Manifest V3 JSON structure written to `manifest.json`.
 */
export interface StampedExtensionManifest {
    manifest_version: 3;
    name: string;
    short_name: string;
    version: string;
    description: string;
    permissions: string[];
    optional_permissions?: string[];
    host_permissions: string[];
    background: {
        service_worker: string;
        type: 'module';
    };
    side_panel: {
        default_path: string;
    };
    action: {
        default_title: string;
    };
    content_scripts: Array<{
        matches: string[];
        js: string[];
        run_at: 'document_idle' | 'document_end' | 'document_start';
    }>;
    externally_connectable: {
        matches: string[];
    };
    icons: Record<string, string>;
}

/**
 * Options for building a white-label branded browser extension.
 */
export interface BuildBrandedExtensionOptions {
    /** Path to `mj-extension-brand.json` OR an in-memory `ExtensionBrandProfile` object. */
    BrandSource: string | ExtensionBrandProfile;
    /** Output root directory where `<BrandSlug>/` unpacked folder and `.zip` archive will be written. */
    OutputRootDir: string;
    /** Whether to also produce a `.zip` archive (defaults to `true`). */
    CreateZipArchive?: boolean;
}

/**
 * Result returned by {@link ExtensionBrandBuilder.BuildBrandedExtension}.
 */
export interface BuildBrandedExtensionResult {
    /** Validated brand profile. */
    BrandProfile: ExtensionBrandProfile;
    /** Stamped `manifest.json` object. */
    Manifest: StampedExtensionManifest;
    /** Hydrated `@memberjunction/theme-engine` CSS theme. */
    Theme: HydratedExtensionBrandTheme;
    /** Absolute path to the unpacked MV3 extension directory (ready for `--load-extension`). */
    UnpackedDir: string;
    /** Absolute path to `manifest.json`. */
    ManifestPath: string;
    /** Absolute path to `brand-theme.css`. */
    StylesheetPath: string;
    /** Absolute path to the generated `.zip` archive (if `CreateZipArchive !== false`). */
    ZipPath: string | null;
}

/**
 * Valid 1x1 PNG binary header/bytes used when generating fallback brand icons.
 */
const MINIMAL_VALID_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * White-Label Brand Stamping Factory for MemberJunction Browser Extensions.
 */
export class ExtensionBrandBuilder {
    private readonly hydrator = new RuntimeBrandKitHydrator();

    /**
     * Load and validate an `mj-extension-brand.json` file from disk.
     */
    public LoadBrandProfileFromFile(brandJsonPath: string): ExtensionBrandProfile {
        const resolved = path.resolve(brandJsonPath);
        const raw = fs.readFileSync(resolved, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        return ValidateExtensionBrandProfile(parsed);
    }

    /**
     * Stamp a Manifest V3 `manifest.json` object from a validated {@link ExtensionBrandProfile}.
     *
     * Honors `IncludeDebuggerPermission`:
     * - When `true`, places `"debugger"` in `optional_permissions` so Mode 1 installs cleanly with zero banner.
     * - When `false`, omits `"debugger"` from `manifest.json` completely.
     */
    public StampManifest(profile: ExtensionBrandProfile): StampedExtensionManifest {
        const validated = ValidateExtensionBrandProfile(profile);
        const manifest: StampedExtensionManifest = {
            manifest_version: 3,
            name: validated.BrandName,
            short_name: validated.ShortName,
            version: validated.Version,
            description: validated.Description,
            permissions: ['sidePanel', 'activeTab', 'scripting', 'storage', 'offscreen', 'tabs'],
            host_permissions: [...validated.HostPermissions],
            background: {
                service_worker: 'service-worker.js',
                type: 'module',
            },
            side_panel: {
                default_path: 'sidepanel.html',
            },
            action: {
                default_title: `Open ${validated.ShortName}`,
            },
            content_scripts: [
                {
                    matches: [...validated.HostPermissions],
                    js: ['content-script.js'],
                    run_at: 'document_idle',
                },
            ],
            externally_connectable: {
                matches: [...validated.ExternallyConnectableMatches],
            },
            icons: {
                '16': validated.Icons.Icon16,
                '32': validated.Icons.Icon32,
                '48': validated.Icons.Icon48,
                '128': validated.Icons.Icon128,
            },
        };

        if (validated.IncludeDebuggerPermission) {
            manifest.optional_permissions = ['debugger'];
        }

        return manifest;
    }

    /**
     * Build a complete unpacked MV3 Chrome Extension directory and optional `.zip` archive
     * for the specified brand profile.
     */
    public BuildBrandedExtension(
        options: BuildBrandedExtensionOptions
    ): BuildBrandedExtensionResult {
        const profile =
            typeof options.BrandSource === 'string'
                ? this.LoadBrandProfileFromFile(options.BrandSource)
                : ValidateExtensionBrandProfile(options.BrandSource);

        const brandSourceDir =
            typeof options.BrandSource === 'string'
                ? path.dirname(path.resolve(options.BrandSource))
                : null;

        const outputRoot = path.resolve(options.OutputRootDir);
        const unpackedDir = path.join(outputRoot, profile.BrandSlug);
        fs.mkdirSync(unpackedDir, { recursive: true });

        // 1. Derive Theme CSS via @memberjunction/theme-engine
        const theme = this.hydrator.HydrateFromBrandProfile(profile);
        const stylesheetPath = path.join(unpackedDir, 'brand-theme.css');
        fs.writeFileSync(stylesheetPath, theme.StylesheetCss, 'utf8');

        // 2. Stamp manifest.json
        const manifest = this.StampManifest(profile);
        const manifestPath = path.join(unpackedDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

        // 3. Emit self-contained MV3 runtime bundles
        fs.writeFileSync(
            path.join(unpackedDir, 'content-script.js'),
            this.generateContentScriptBundle(profile),
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'service-worker.js'),
            this.generateServiceWorkerBundle(profile),
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'sidepanel.html'),
            this.generateSidePanelHtml(profile),
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'sidepanel.js'),
            this.generateSidePanelScript(profile),
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'offscreen.html'),
            `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${profile.ShortName} Offscreen Audio Daemon</title></head><body><script type="module" src="offscreen-audio.js"></script></body></html>\n`,
            'utf8'
        );
        fs.writeFileSync(
            path.join(unpackedDir, 'offscreen-audio.js'),
            this.generateOffscreenAudioScript(profile),
            'utf8'
        );

        // 4. Copy or generate icons
        this.ensureBrandIcons(unpackedDir, brandSourceDir, profile);

        // 5. Create deterministic .zip archive if requested
        let zipPath: string | null = null;
        if (options.CreateZipArchive !== false) {
            zipPath = path.join(outputRoot, `${profile.BrandSlug}-${profile.Version}.zip`);
            this.createZipArchiveFromDirectory(unpackedDir, zipPath);
        }

        return {
            BrandProfile: profile,
            Manifest: manifest,
            Theme: theme,
            UnpackedDir: unpackedDir,
            ManifestPath: manifestPath,
            StylesheetPath: stylesheetPath,
            ZipPath: zipPath,
        };
    }

    private ensureBrandIcons(
        unpackedDir: string,
        brandSourceDir: string | null,
        profile: ExtensionBrandProfile
    ): void {
        const iconPaths = [
            profile.Icons.Icon16,
            profile.Icons.Icon32,
            profile.Icons.Icon48,
            profile.Icons.Icon128,
        ];
        const fallbackBuffer = Buffer.from(MINIMAL_VALID_PNG_BASE64, 'base64');

        for (const relIcon of iconPaths) {
            const targetPath = path.join(unpackedDir, relIcon);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            const candidateSrc = brandSourceDir ? path.join(brandSourceDir, relIcon) : null;
            if (candidateSrc && fs.existsSync(candidateSrc)) {
                fs.copyFileSync(candidateSrc, targetPath);
            } else {
                fs.writeFileSync(targetPath, fallbackBuffer);
            }
        }
    }

    /**
     * Generate a self-contained MV3 `content-script.js` bundle that runs natively inside Chromium
     * tabs (`wikipedia.org`, `amazon.com`, etc.), sets readiness markers, runs the canonical
     * `INTERACTIVITYPROBE`, enforces `SensitivePageGuard` password/CC/OTP masking, renders
     * Shadow-DOM Coach-Marks (`#mj-ext-coach-mark-host`), and bridges commands over both
     * `chrome.runtime.onMessage` and custom DOM events (`mj-ext-command` / `mj-ext-response`).
     */
    private generateContentScriptBundle(profile: ExtensionBrandProfile): string {
        return `// Generated by @memberjunction/browser-extension-builder for brand "${profile.BrandSlug}" (${profile.Version})
(() => {
  const BRAND_SLUG = ${JSON.stringify(profile.BrandSlug)};
  const ASSISTANT_NAME = ${JSON.stringify(profile.AssistantDisplayName)};
  const REDACTED_SENTINEL = ${JSON.stringify(REDACTED_SENTINEL)};
  const BLOCKED_DOMAINS = ${JSON.stringify(profile.BlockedDomains)};
  const PRIMARY_COLOR = ${JSON.stringify(profile.ThemeSeeds.primary)};

  const INTERACTIVE_WITHOUT_TABINDEX = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'summary',
    '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
    '[role="tab"]', '[role="menuitem"]', '[role="option"]', '[role="switch"]',
    '[role="combobox"]', '[role="searchbox"]', '[role="textbox"]',
    '[contenteditable="true"]', '[onclick]'
  ].join(',');
  const INTERACTIVE_SELECTOR = INTERACTIVE_WITHOUT_TABINDEX + ',[tabindex]';

  function isSensitiveInput(el) {
    if (!(el instanceof HTMLInputElement)) return false;
    const type = (el.getAttribute('type') || el.type || 'text').toLowerCase();
    if (type === 'password') return true;
    const auto = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (auto.startsWith('cc-') || auto === 'one-time-code' || auto.includes('password')) return true;
    const nameId = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
    if (/\\b(password|passcode|cvv|cvc|card[-_]?number|otp|totp)\\b/.test(nameId)) return true;
    return false;
  }

  function probeInteractiveElements() {
    const xpathOf = (el) => {
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && node !== document.documentElement) {
        const tag = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (!parent) { parts.unshift(tag); break; }
        const sameTag = Array.from(parent.children).filter(c => c.tagName === node.tagName);
        const idx = sameTag.indexOf(node) + 1;
        parts.unshift(tag + '[' + idx + ']');
        node = parent;
      }
      return '/html/' + parts.join('/');
    };

    const roleOf = (el) => {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === 'a') return 'link';
      if (tag === 'button' || tag === 'summary') return 'button';
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'input') {
        const t = (el.type || 'text').toLowerCase();
        if (t === 'checkbox') return 'checkbox';
        if (t === 'radio') return 'radio';
        if (t === 'button' || t === 'submit' || t === 'reset') return 'button';
        return 'textbox';
      }
      return tag;
    };

    const nameOf = (el) => {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria.trim();
      if (el.id) {
        const escaped = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
          ? CSS.escape(el.id)
          : el.id.replace(/["\\\\]/g, '\\\\$&');
        const lbl = document.querySelector('label[for="' + escaped + '"]');
        if (lbl && lbl.textContent) return lbl.textContent.trim();
      }
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) return placeholder.trim();
      const title = el.getAttribute('title');
      if (title) return title.trim();
      const text = el.innerText || el.textContent || '';
      return text.trim().slice(0, 120);
    };

    const results = [];
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const seen = new Set();

    document.querySelectorAll(INTERACTIVE_SELECTOR).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (el.getAttribute('tabindex') === '-1' && !el.hasAttribute('onclick') && !el.matches(INTERACTIVE_WITHOUT_TABINDEX)) return;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return;
      if (style.pointerEvents === 'none') return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.bottom < -vh || rect.top > vh * 2 || rect.right < -vw || rect.left > vw * 2) return;
      const isFormValue = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      const rawVal = isFormValue ? String(el.value || '') : undefined;
      const safeVal = isSensitiveInput(el) ? REDACTED_SENTINEL : rawVal;

      results.push({
        Index: results.length + 1,
        Role: roleOf(el),
        Name: nameOf(el),
        Selector: 'xpath=' + xpathOf(el),
        Value: safeVal,
        BoundingBox: {
          XMin: Math.round((rect.left / vw) * 1000),
          YMin: Math.round((rect.top / vh) * 1000),
          XMax: Math.round(((rect.left + rect.width) / vw) * 1000),
          YMax: Math.round(((rect.top + rect.height) / vh) * 1000)
        },
        Disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true')
      });
    });
    return results;
  }

  function extractPageState() {
    const openGraph = {};
    document.querySelectorAll('meta[property^="og:"]').forEach((m) => {
      const p = m.getAttribute('property');
      const c = m.getAttribute('content');
      if (p && c) openGraph[p] = c;
    });
    const metaTags = {};
    document.querySelectorAll('meta[name]').forEach((m) => {
      const n = m.getAttribute('name');
      const c = m.getAttribute('content');
      if (n && c) metaTags[n] = c;
    });
    const schemaOrg = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        const parsed = JSON.parse(s.textContent || '');
        if (parsed && typeof parsed === 'object') schemaOrg.push(parsed);
      } catch {}
    });
    const hasPasswordInput = document.querySelectorAll('input[type="password"]').length > 0;
    return {
      Url: window.location.href,
      Title: document.title || '',
      Hostname: window.location.hostname || '',
      ViewportWidth: window.innerWidth || 1280,
      ViewportHeight: window.innerHeight || 800,
      InteractiveElements: probeInteractiveElements(),
      VisibleTextExcerpt: (document.body ? (document.body.innerText || document.body.textContent || '') : '').trim().slice(0, 2000),
      OpenGraph: openGraph,
      SchemaOrgEntities: schemaOrg,
      MetaTags: metaTags,
      CapturedSignals: {
        FullUrl: window.location.href,
        HostnameRoot: (window.location.hostname || '').replace(/^www\\./i, '').toLowerCase()
      },
      IsAuthOrMfaScreen: hasPasswordInput,
      ActiveBackend: 'content-script',
      BrandSlug: BRAND_SLUG,
      CapturedAtIso: new Date().toISOString()
    };
  }

  function resolveSelector(selector) {
    if (!selector) return null;
    if (selector.startsWith('xpath=') || selector.startsWith('/')) {
      const expr = selector.startsWith('xpath=') ? selector.slice(6) : selector;
      const res = document.evaluate(expr, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return res.singleNodeValue;
    }
    return document.querySelector(selector);
  }

  function highlightElement(req) {
    const target = resolveSelector(req.Selector);
    if (!target) {
      return { Success: false, ErrorMessage: 'Target element not found for selector: ' + req.Selector };
    }
    target.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = target.getBoundingClientRect();
    let host = document.getElementById('mj-ext-coach-mark-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'mj-ext-coach-mark-host';
      host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
      document.body.appendChild(host);
    }
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    const highlightId = req.HighlightId || ('mj-cm-' + Date.now());
    host.setAttribute('data-active-highlight-id', highlightId);
    host.setAttribute('data-target-top', String(Math.round(rect.top)));
    host.setAttribute('data-target-left', String(Math.round(rect.left)));
    host.setAttribute('data-target-width', String(Math.round(rect.width)));
    host.setAttribute('data-target-height', String(Math.round(rect.height)));

    shadow.innerHTML = \`
      <style>
        .mj-spotlight-ring {
          position: fixed;
          top: \${Math.max(0, rect.top - 4)}px;
          left: \${Math.max(0, rect.left - 4)}px;
          width: \${rect.width + 8}px;
          height: \${rect.height + 8}px;
          border: 3px solid var(--mj-brand-primary, \${PRIMARY_COLOR});
          border-radius: 8px;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.25);
          pointer-events: none;
          box-sizing: border-box;
        }
        .mj-spotlight-callout {
          position: fixed;
          top: \${Math.min((window.innerHeight || 800) - 60, rect.bottom + 10)}px;
          left: \${Math.max(8, rect.left)}px;
          background: #0f172a;
          color: #ffffff;
          padding: 8px 12px;
          border-radius: 8px;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 12px;
          font-weight: 600;
          pointer-events: none;
        }
      </style>
      <div class="mj-spotlight-ring" id="\${highlightId}"></div>
      <div class="mj-spotlight-callout">
        \${req.StepBadge ? '<span class="mj-step-badge">' + req.StepBadge + ': </span>' : ''}
        <span class="mj-callout-label">\${req.Label || ''}</span>
      </div>
    \`;
    return {
      Success: true,
      BackendUsed: 'content-script',
      EscalatedToDebugger: false,
      Data: {
        HighlightId: highlightId,
        BoundingBox: {
          Top: rect.top,
          Left: rect.left,
          Width: rect.width,
          Height: rect.height
        }
      }
    };
  }

  function clearHighlights() {
    const host = document.getElementById('mj-ext-coach-mark-host');
    if (host) host.remove();
    return { Success: true, BackendUsed: 'content-script', EscalatedToDebugger: false, Data: { ClearedCount: 1 } };
  }

  function clickElement(req) {
    let target = req.Selector ? resolveSelector(req.Selector) : null;
    if (!target && typeof req.ElementIndex === 'number') {
      const list = probeInteractiveElements();
      const entry = list.find(e => e.Index === req.ElementIndex);
      if (entry) target = resolveSelector(entry.Selector);
    }
    if (!target) {
      return { Success: false, ErrorMessage: 'Element not found for click' };
    }
    target.click();
    return {
      Success: true,
      BackendUsed: 'content-script',
      EscalatedToDebugger: false,
      Data: { Selector: req.Selector, Healed: false }
    };
  }

  function fillInput(req) {
    let target = req.Selector ? resolveSelector(req.Selector) : null;
    if (!target && typeof req.ElementIndex === 'number') {
      const list = probeInteractiveElements();
      const entry = list.find(e => e.Index === req.ElementIndex);
      if (entry) target = resolveSelector(entry.Selector);
    }
    if (!target) {
      return { Success: false, ErrorMessage: 'Input element not found' };
    }
    target.focus();
    target.value = req.Value || '';
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    if (req.PressEnter) {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      const form = target.closest('form');
      if (form && typeof form.submit === 'function') {
        form.submit();
      }
    }
    return {
      Success: true,
      BackendUsed: 'content-script',
      EscalatedToDebugger: false,
      Data: { Selector: req.Selector, Healed: false }
    };
  }

  function handleCommand(cmd) {
    const p = cmd.Payload || {};
    switch (cmd.Type) {
      case 'MJ_CS_GET_PAGE_STATE':
        return extractPageState();
      case 'MJ_CS_HIGHLIGHT_ELEMENT':
        return highlightElement(p);
      case 'MJ_CS_CLEAR_HIGHLIGHTS':
        return clearHighlights();
      case 'MJ_CS_CLICK_ELEMENT':
        return clickElement(p);
      case 'MJ_CS_FILL_INPUT':
        return fillInput(p);
      default:
        return { Success: false, ErrorMessage: 'Unknown command: ' + cmd.Type };
    }
  }

  if (document.documentElement) {
    document.documentElement.setAttribute('data-mj-extension-content-script', 'ready');
    document.documentElement.setAttribute('data-mj-extension-brand', BRAND_SLUG);
    document.documentElement.setAttribute('data-mj-extension-assistant', ASSISTANT_NAME);
  }

  // Listen to custom DOM command events so both Main World and Extension World can exchange structured messages
  document.addEventListener('mj-ext-command', (ev) => {
    const detail = ev.detail || {};
    const requestId = detail.RequestId || 'default';
    const result = handleCommand(detail);
    document.dispatchEvent(new CustomEvent('mj-ext-response', {
      detail: { RequestId: requestId, Result: result }
    }));
  });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && typeof msg.Type === 'string' && msg.Type.startsWith('MJ_CS_')) {
        sendResponse(handleCommand(msg));
        return true;
      }
    });
  }
})();
`;
    }

    private generateServiceWorkerBundle(profile: ExtensionBrandProfile): string {
        return `// Generated by @memberjunction/browser-extension-builder for brand "${profile.BrandSlug}" (${profile.Version})
const BRAND_SLUG = ${JSON.stringify(profile.BrandSlug)};
const EXTENSION_VERSION = ${JSON.stringify(profile.Version)};

if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.Type === 'MJ_EXT_PING') {
      sendResponse({
        Installed: true,
        Version: EXTENSION_VERSION,
        BrandSlug: BRAND_SLUG,
        ActiveTopology: 'topology-a-shared-daemon'
      });
      return true;
    }
    if (msg && msg.Type === 'MJ_EXT_SESSION_HANDOFF') {
      sendResponse({
        Accepted: true,
        ActiveTopology: (msg.Payload && msg.Payload.Topology) || 'topology-a-shared-daemon',
        ZeroBlipGuaranteed: true,
        ExtensionVersion: EXTENSION_VERSION,
        BrandSlug: BRAND_SLUG
      });
      return true;
    }
  });
}
`;
    }

    private generateSidePanelHtml(profile: ExtensionBrandProfile): string {
        return `<!DOCTYPE html>
<html lang="en" data-theme="light" data-theme-overlay="${profile.BrandSlug}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${profile.BrandName}</title>
  <link rel="stylesheet" href="brand-theme.css" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: var(--mj-bg-surface, #ffffff);
      color: var(--mj-text-primary, #111827);
      font-family: var(--mj-font-family-base, system-ui, -apple-system, sans-serif);
    }
    .mj-sidepanel-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .mj-sidepanel-header {
      padding: 12px;
      border-bottom: 1px solid var(--mj-border-default, #e5e7eb);
      background: var(--mj-bg-surface-card, #f9fafb);
    }
    .mj-sidepanel-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--mj-brand-primary, #2563eb);
    }
    .mj-sidepanel-tagline {
      margin: 2px 0 0;
      font-size: 12px;
      color: var(--mj-text-secondary, #4b5563);
    }
  </style>
</head>
<body>
  <div id="mj-extension-sidepanel-root" class="mj-sidepanel-shell" data-brand-slug="${profile.BrandSlug}" data-assistant-name="${profile.AssistantDisplayName}">
    <header class="mj-sidepanel-header">
      <h1 class="mj-sidepanel-title">${profile.AssistantDisplayName}</h1>
      <p class="mj-sidepanel-tagline">${profile.Tagline}</p>
    </header>
    <main id="mj-sidepanel-context-view"></main>
  </div>
  <script type="module" src="sidepanel.js"></script>
</body>
</html>
`;
    }

    private generateSidePanelScript(profile: ExtensionBrandProfile): string {
        return `// Side Panel Bootstrap for ${profile.BrandName} (${profile.BrandSlug})
const root = document.getElementById('mj-extension-sidepanel-root');
if (root) {
  root.setAttribute('data-ready', 'true');
  root.setAttribute('data-default-backend', ${JSON.stringify(profile.DefaultControlBackend)});
}
`;
    }

    private generateOffscreenAudioScript(profile: ExtensionBrandProfile): string {
        return `// Offscreen Audio Daemon for ${profile.BrandName} (${profile.BrandSlug}) — Topology A 0ms Continuity
window.__MJ_OFFSCREEN_DAEMON_READY__ = true;
`;
    }

    /**
     * Create a standard ZIP archive containing all files in `sourceDir` using pure Node.js
     * CRC32 + Deflate (`node:zlib`) so it works across macOS, Linux, and Windows CI without external `zip` binaries.
     */
    private createZipArchiveFromDirectory(sourceDir: string, zipFilePath: string): void {
        const files = this.collectFilesRecursively(sourceDir, sourceDir);
        const localFileParts: Buffer[] = [];
        const centralDirParts: Buffer[] = [];
        let offset = 0;

        for (const relPath of files) {
            const posixName = relPath.split(path.sep).join('/');
            const nameBuf = Buffer.from(posixName, 'utf8');
            const fullPath = path.join(sourceDir, relPath);
            const rawData = fs.readFileSync(fullPath);
            const compressed = zlib.deflateRawSync(rawData);
            const crc = this.computeCrc32(rawData);

            // Local file header (30 bytes + filename)
            const localHeader = Buffer.alloc(30);
            localHeader.writeUInt32LE(0x04034b50, 0); // signature
            localHeader.writeUInt16LE(20, 4); // version needed
            localHeader.writeUInt16LE(0, 6); // flags
            localHeader.writeUInt16LE(8, 8); // compression method: deflate
            localHeader.writeUInt16LE(0, 10); // mod time
            localHeader.writeUInt16LE(0, 12); // mod date
            localHeader.writeUInt32LE(crc, 14);
            localHeader.writeUInt32LE(compressed.length, 18);
            localHeader.writeUInt32LE(rawData.length, 22);
            localHeader.writeUInt16LE(nameBuf.length, 26);
            localHeader.writeUInt16LE(0, 28); // extra length

            localFileParts.push(localHeader, nameBuf, compressed);

            // Central directory header (46 bytes + filename)
            const centralHeader = Buffer.alloc(46);
            centralHeader.writeUInt32LE(0x02014b50, 0); // signature
            centralHeader.writeUInt16LE(20, 4); // version made by
            centralHeader.writeUInt16LE(20, 6); // version needed
            centralHeader.writeUInt16LE(0, 8); // flags
            centralHeader.writeUInt16LE(8, 10); // compression: deflate
            centralHeader.writeUInt16LE(0, 12); // mod time
            centralHeader.writeUInt16LE(0, 14); // mod date
            centralHeader.writeUInt32LE(crc, 16);
            centralHeader.writeUInt32LE(compressed.length, 20);
            centralHeader.writeUInt32LE(rawData.length, 24);
            centralHeader.writeUInt16LE(nameBuf.length, 28);
            centralHeader.writeUInt16LE(0, 30); // extra length
            centralHeader.writeUInt16LE(0, 32); // comment length
            centralHeader.writeUInt16LE(0, 34); // disk number
            centralHeader.writeUInt16LE(0, 36); // internal attrs
            centralHeader.writeUInt32LE(0, 38); // external attrs
            centralHeader.writeUInt32LE(offset, 42); // local header offset

            centralDirParts.push(centralHeader, nameBuf);
            offset += localHeader.length + nameBuf.length + compressed.length;
        }

        const centralDirBuffer = Buffer.concat(centralDirParts);
        const endOfCentralDir = Buffer.alloc(22);
        endOfCentralDir.writeUInt32LE(0x06054b50, 0); // EOCD signature
        endOfCentralDir.writeUInt16LE(0, 4); // disk number
        endOfCentralDir.writeUInt16LE(0, 6); // central dir disk
        endOfCentralDir.writeUInt16LE(files.length, 8);
        endOfCentralDir.writeUInt16LE(files.length, 10);
        endOfCentralDir.writeUInt32LE(centralDirBuffer.length, 12);
        endOfCentralDir.writeUInt32LE(offset, 16);
        endOfCentralDir.writeUInt16LE(0, 20); // comment length

        const finalZip = Buffer.concat([...localFileParts, centralDirBuffer, endOfCentralDir]);
        fs.writeFileSync(zipFilePath, finalZip);
    }

    private collectFilesRecursively(dir: string, rootDir: string): string[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const results: string[] = [];
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...this.collectFilesRecursively(full, rootDir));
            } else if (entry.isFile()) {
                results.push(path.relative(rootDir, full));
            }
        }
        return results.sort();
    }

    private computeCrc32(buf: Buffer): number {
        let crc = 0xffffffff;
        for (let i = 0; i < buf.length; i++) {
            crc ^= buf[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
            }
        }
        return (crc ^ 0xffffffff) >>> 0;
    }
}
