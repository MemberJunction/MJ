/**
 * Shared page-perception helpers.
 *
 * The perception surface — visible text, selection, title, load-state waiting,
 * accessibility snapshot, and single-element introspection — is identical for
 * any adapter that owns a Playwright `Page`. Extracting it here lets both
 * `PlaywrightBrowserAdapter` (owns a Page within its own Browser) and
 * `SharedContextBrowserAdapter` (owns a Page within a pooled BrowserContext)
 * delegate to ONE implementation.
 *
 * Before this, only PBA overrode these methods; SCBA — the adapter the
 * regression suite actually runs on — inherited the no-op base, so
 * `GetVisibleText` returned '', `QueryElement` returned `Exists:false`,
 * `GetAccessibilitySnapshot` returned null, and `WaitForLoadState` resolved
 * immediately. Any engine feature built on structured perception (settle
 * loops, element grounding, diagnostics) silently got nothing in suite mode.
 * Routing both adapters through these helpers closes that gap permanently and
 * ends the perception/action drift between the two.
 *
 * Every helper is null-safe on the page: a closed/absent page yields the
 * documented empty value rather than throwing.
 */

import type { Page } from 'playwright';
import { AccessibilityNode, ElementInfo, BoundingBox } from '../types/browser.js';

/**
 * Playwright's `accessibility` namespace remains at runtime but was dropped
 * from the public `.d.ts` in 1.58, so we declare a precise local view rather
 * than reach for `any`.
 */
interface PlaywrightAXNode {
    role: string;
    name: string;
    value?: string | number;
    children?: PlaywrightAXNode[];
}

interface PlaywrightAccessibilityNamespace {
    snapshot(): Promise<PlaywrightAXNode | null>;
}

/** Rendered text of `<body>`. '' when no page is open. */
export async function getVisibleText(page: Page | null): Promise<string> {
    if (!page) {
        return '';
    }
    return page.innerText('body');
}

/** Current text selection (`window.getSelection()`). '' when no page or nothing selected. */
export async function getSelectionText(page: Page | null): Promise<string> {
    if (!page) {
        return '';
    }
    return page.evaluate(() => window.getSelection()?.toString() ?? '');
}

/** Page title. '' when no page is open. */
export async function getTitle(page: Page | null): Promise<string> {
    if (!page) {
        return '';
    }
    return page.title();
}

/** Wait until the page reaches the given load state. No-op when no page is open. */
export async function waitForLoadState(
    page: Page | null,
    state: 'load' | 'domcontentloaded' | 'networkidle'
): Promise<void> {
    if (!page) {
        return;
    }
    await page.waitForLoadState(state);
}

/**
 * Recursively map a Playwright accessibility snapshot node into our own
 * {@link AccessibilityNode}. Null-safe on every field; omits empty children.
 */
function mapAccessibilityNode(node: PlaywrightAXNode): AccessibilityNode {
    const mapped = new AccessibilityNode();
    mapped.Role = node.role ?? '';
    mapped.Name = node.name ?? '';
    if (node.value !== undefined) {
        mapped.Value = String(node.value);
    }
    if (node.children && node.children.length > 0) {
        mapped.Children = node.children.map(child => mapAccessibilityNode(child));
    }
    return mapped;
}

/**
 * Capture the page's accessibility tree mapped into our {@link AccessibilityNode}.
 * `null` when no page is open or Playwright produces no snapshot (blank page).
 */
export async function getAccessibilitySnapshot(page: Page | null): Promise<AccessibilityNode | null> {
    if (!page) {
        return null;
    }
    // `page.accessibility` exists at runtime but was dropped from Playwright's
    // public types in 1.58; bridge to it through a precise typed view.
    const accessibility = (page as unknown as { accessibility: PlaywrightAccessibilityNamespace }).accessibility;
    const root = await accessibility.snapshot();
    return root ? mapAccessibilityNode(root) : null;
}

/**
 * Introspect a single element via `page.locator(selector)`. Reports existence
 * (`count() > 0`), visibility, inner text, and bounding box. Never throws on a
 * missing element or invalid selector — returns `Exists:false` instead.
 */
export async function queryElement(
    page: Page | null,
    selector: string,
    actionTimeoutMs: number
): Promise<ElementInfo> {
    const info = new ElementInfo();
    if (!page) {
        return info;
    }

    try {
        const locator = page.locator(selector);
        const count = await locator.count();
        if (count === 0) {
            return info; // Exists:false, Visible:false, Text:''
        }

        info.Exists = true;
        // Scope subsequent reads to the first match for stability.
        const first = locator.first();
        info.Visible = await first.isVisible();

        // innerText can throw on detached/hidden nodes — guard it.
        try {
            info.Text = await first.innerText({ timeout: actionTimeoutMs });
        } catch {
            info.Text = '';
        }

        const box = await first.boundingBox();
        if (box) {
            const bb = new BoundingBox();
            bb.XMin = box.x;
            bb.YMin = box.y;
            bb.XMax = box.x + box.width;
            bb.YMax = box.y + box.height;
            info.BoundingBox = bb;
        }
    } catch {
        // Any failure (invalid selector, navigation race) → treat as absent.
        return new ElementInfo();
    }

    return info;
}
