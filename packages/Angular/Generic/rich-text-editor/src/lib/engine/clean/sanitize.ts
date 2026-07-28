import DOMPurify from 'dompurify';
import { RichTextSanitizeProfile } from '../../rich-text-editor.types';

/**
 * The sanitize boundary.
 *
 * Two profiles, and the difference between them is entirely about **trust**, not about
 * taste. `SetHTML` receives content the host chose to load — a stored draft, an AI-composed
 * reply, a quoted thread — and fidelity is the priority. Paste receives whatever was on the
 * clipboard, and containment is the priority.
 *
 * ## What is NOT configurable
 *
 * `IS_ALLOWED_URI` is never disabled and `ALLOWED_URI_REGEXP` is never widened. Verified
 * against DOMPurify 3.x: `cid:` — the inline-image scheme that quoted mail relies on — is
 * **already permitted by the default regexp**, while `javascript:` is blocked. There is
 * therefore no reason to relax URI checking for the email use case, and doing so would
 * trade a real XSS guarantee for nothing.
 */

/** Which boundary the content is arriving through. */
export type CleanSource = 'load' | 'paste';

/** Inputs to {@link sanitizeToFragment}. */
export interface SanitizeOptions {
    Profile: RichTextSanitizeProfile;
    Source: CleanSource;
    /** Escape hatch for hosts with their own audited sanitizer. */
    Override?: ((html: string) => DocumentFragment) | null;
}

/**
 * Namespace prefixes whose elements the `'email'` load path preserves.
 *
 * These are the Office/Word namespaces that appear throughout Outlook-generated mail
 * (`<o:p>`, `<w:sdt>`, `<v:shape>`). They are inert unknown elements — they carry no script
 * semantics, and DOMPurify still strips `on*` handlers and unsafe URIs from them — but
 * DOMPurify drops unknown tags by default, which would silently rewrite every quoted
 * Outlook thread that passes through the editor.
 */
const PRESERVED_NAMESPACE_PREFIXES: ReadonlySet<string> = new Set(['o', 'w', 'v', 'm', 'x', 'st1']);

/** Finds namespaced opening tags in raw HTML so they can be allow-listed individually. */
const NAMESPACED_TAG_PATTERN = /<([a-z][a-z0-9]*):([a-z0-9-]+)/gi;

/** Never allow-list a tag whose name hints at script semantics, whatever its namespace. */
const FORBIDDEN_TAG_FRAGMENT = /script|iframe|object|embed|link|base|form/i;

/**
 * Sanitize raw HTML into a fragment.
 *
 * Always returns a fragment rather than a string: the rest of the pipeline works on nodes,
 * and re-parsing a sanitized string is both wasted work and an extra chance for a parser
 * discrepancy to reintroduce something the sanitizer removed.
 */
export function sanitizeToFragment(
    html: string | null | undefined,
    options: SanitizeOptions,
): DocumentFragment {
    const source = html ?? '';
    if (options.Override) {
        return options.Override(source);
    }
    return DOMPurify.sanitize(source, buildConfig(source, options)) as unknown as DocumentFragment;
}

/** Assemble the DOMPurify config for a profile/source pair. */
function buildConfig(html: string, options: SanitizeOptions): Record<string, unknown> {
    const preserveEverything = options.Profile === 'email' && options.Source === 'load';

    const addTags: string[] = [];
    const forbidTags: string[] = [];

    if (preserveEverything) {
        // Comments carry Outlook conditionals (`<!--[if mso]>`). Retained ONLY here:
        // DOMPurify comment retention is a documented mXSS vector (cure53/DOMPurify #528,
        // #932), so untrusted paste never gets it regardless of profile.
        addTags.push('#comment');
        addTags.push(...collectNamespacedTags(html));
    } else {
        // `<style>` is in DOMPurify's default allow-list. It normally disappears only
        // because the parser hoists it into `<head>`, which then gets dropped — and
        // FORCE_BODY below defeats exactly that. So forbidding it has to be explicit,
        // or the strict profile would leak author stylesheets into the editing surface.
        forbidTags.push('style');
    }

    return {
        RETURN_DOM_FRAGMENT: true,
        // Parse in body context, so a `<style>` block inside a quoted region stays where
        // its author put it instead of being hoisted out of the content.
        FORCE_BODY: true,
        USE_PROFILES: { html: true, svg: true, svgFilters: true },
        ADD_TAGS: addTags,
        FORBID_TAGS: forbidTags,
    };
}

/**
 * Scan raw HTML for namespaced tags belonging to the preserved Office prefixes.
 *
 * Allow-listing only the tags actually present keeps the surface as small as the document
 * requires, rather than opening the whole namespace up front.
 */
function collectNamespacedTags(html: string): string[] {
    const found = new Set<string>();
    for (const match of html.matchAll(NAMESPACED_TAG_PATTERN)) {
        const [, prefix, name] = match;
        if (!PRESERVED_NAMESPACE_PREFIXES.has(prefix.toLowerCase())) {
            continue;
        }
        const tag = `${prefix}:${name}`.toLowerCase();
        if (FORBIDDEN_TAG_FRAGMENT.test(tag)) {
            continue;
        }
        found.add(tag);
    }
    return [...found];
}
