/**
 * @fileoverview Specialized `LinkedInPageExtractor` for the MemberJunction Browser Extension.
 *
 * Registered under `@RegisterClass(BaseBrowserPageExtractor, 'LinkedInPageExtractor')`.
 * Normalizes LinkedIn profile (`/in/<handle>`) and company (`/company/<slug>`) URLs, and extracts
 * structured candidate entity fields (`Name`, `FirstName`, `LastName`, `Title`, `Organization`,
 * `LinkedInURL`, `Location`) from page titles, OpenGraph metadata, Schema.org JSON-LD, and DOM signals.
 *
 * @module @memberjunction/browser-extension-core
 */

import { RegisterClass } from '@memberjunction/global';
import type {
    BrowserContextRuleSpec,
    BrowserPageStateSnapshot,
} from '../types/extension-types.js';
import {
    BaseBrowserPageExtractor,
    type ExtractedPageSignals,
} from './BaseBrowserPageExtractor.js';

/**
 * Specialized extractor for LinkedIn person profiles (`*://*.linkedin.com/in/*`)
 * and company pages (`*://*.linkedin.com/company/*`).
 */
@RegisterClass(BaseBrowserPageExtractor, 'LinkedInPageExtractor')
export class LinkedInPageExtractor extends BaseBrowserPageExtractor {
    public override Extract(
        snapshot: BrowserPageStateSnapshot,
        rule: BrowserContextRuleSpec
    ): ExtractedPageSignals {
        const signalsByKey: Record<string, string> = {};
        const candidateEntityFields: Record<string, string> = {};

        const canonicalLinkedInUrl = this.CanonicalizeLinkedInUrl(snapshot.Url);
        if (canonicalLinkedInUrl) {
            signalsByKey['FullUrl'] = canonicalLinkedInUrl;
            signalsByKey['signal_0'] = canonicalLinkedInUrl;
            candidateEntityFields['LinkedInURL'] = canonicalLinkedInUrl;
        }

        rule.Signals.forEach((sig, index) => {
            const val = this.ExtractSingleSignal(snapshot, sig);
            if (val !== null && val.length > 0) {
                signalsByKey[`signal_${index}`] = sig.Source === 'FullUrl' && canonicalLinkedInUrl
                    ? canonicalLinkedInUrl
                    : val;
                signalsByKey[sig.Source] = signalsByKey[`signal_${index}`];
            }
        });

        // Parse LinkedIn title format: "Jane Doe - VP of Engineering - Acme Corp | LinkedIn"
        const rawTitle =
            snapshot.CapturedSignals['h1'] ??
            snapshot.OpenGraph['og:title'] ??
            snapshot.OpenGraph['title'] ??
            snapshot.Title;

        if (rawTitle) {
            const parsed = this.ParseLinkedInTitle(rawTitle);
            if (parsed.FullName) {
                candidateEntityFields['Name'] = parsed.FullName;
                if (parsed.FirstName) {
                    candidateEntityFields['FirstName'] = parsed.FirstName;
                }
                if (parsed.LastName) {
                    candidateEntityFields['LastName'] = parsed.LastName;
                }
            }
            if (parsed.HeadlineOrTitle) {
                candidateEntityFields['Title'] = parsed.HeadlineOrTitle;
            }
            if (parsed.Company) {
                candidateEntityFields['Organization'] = parsed.Company;
            }
        }

        // Allow explicit DOM signal overrides when captured
        if (snapshot.CapturedSignals['headline']) {
            candidateEntityFields['Title'] = snapshot.CapturedSignals['headline'].trim();
        }
        if (snapshot.CapturedSignals['company']) {
            candidateEntityFields['Organization'] = snapshot.CapturedSignals['company'].trim();
        }
        if (snapshot.CapturedSignals['location']) {
            candidateEntityFields['Location'] = snapshot.CapturedSignals['location'].trim();
        }

        return {
            SignalsByKey: signalsByKey,
            CandidateEntityFields: candidateEntityFields,
        };
    }

    /**
     * Canonicalizes a LinkedIn `/in/<handle>` or `/company/<slug>` URL to `https://www.linkedin.com/in/<handle>`
     * (lowercase, stripped of query params, hashes, and trailing path segments).
     */
    public CanonicalizeLinkedInUrl(url: string): string {
        if (!url) {
            return '';
        }
        try {
            const parsed = new URL(url);
            const pathMatch = /^\/(in|company)\/([^/?#]+)/i.exec(parsed.pathname);
            if (pathMatch) {
                const section = pathMatch[1].toLowerCase();
                const slug = decodeURIComponent(pathMatch[2]).toLowerCase().replace(/\/+$/, '');
                return `https://www.linkedin.com/${section}/${slug}`;
            }
            return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase();
        } catch {
            return url.trim().replace(/\/+$/, '').toLowerCase();
        }
    }

    /**
     * Parses a LinkedIn page title or `<meta property="og:title">` into structured person/company parts.
     */
    public ParseLinkedInTitle(rawTitle: string): {
        FullName: string;
        FirstName: string;
        LastName: string;
        HeadlineOrTitle?: string;
        Company?: string;
    } {
        // Strip trailing "| LinkedIn" and leading notification counts like "(3) "
        const withoutSuffix = rawTitle
            .replace(/^\(\d+\)\s*/, '')
            .replace(/\s*\|\s*LinkedIn.*$/i, '')
            .trim();

        const segments = withoutSuffix.split(/\s+-\s+|\s+–\s+/).map((s) => s.trim()).filter(Boolean);
        const fullName = segments[0] ?? withoutSuffix;
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] ?? '';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        return {
            FullName: fullName,
            FirstName: firstName,
            LastName: lastName,
            HeadlineOrTitle: segments[1],
            Company: segments[2],
        };
    }
}

/**
 * Prevents tree-shaking of {@link LinkedInPageExtractor}'s `@RegisterClass` decorator.
 */
export function LoadLinkedInPageExtractor(): void {
    // Static reference for ClassFactory
}
