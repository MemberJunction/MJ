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
    StripTrailingSlashes,
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
            const pathSegments = parsed.pathname.split('/').filter((s) => s.length > 0);
            if (
                pathSegments.length >= 2 &&
                (pathSegments[0].toLowerCase() === 'in' || pathSegments[0].toLowerCase() === 'company')
            ) {
                const section = pathSegments[0].toLowerCase();
                const slug = StripTrailingSlashes(decodeURIComponent(pathSegments[1]).toLowerCase());
                return `https://www.linkedin.com/${section}/${slug}`;
            }
            return `${parsed.origin}${StripTrailingSlashes(parsed.pathname)}`.toLowerCase();
        } catch {
            return StripTrailingSlashes(url.trim()).toLowerCase();
        }
    }

    /**
     * Parses a LinkedIn page title or `<meta property="og:title">` into structured person/company parts
     * using deterministic linear-time string parsing.
     */
    public ParseLinkedInTitle(rawTitle: string): {
        FullName: string;
        FirstName: string;
        LastName: string;
        HeadlineOrTitle?: string;
        Company?: string;
    } {
        const withoutPrefix = this.stripLeadingNotificationCount(rawTitle.trim());
        const withoutSuffix = this.stripLinkedInSuffix(withoutPrefix);

        const segments = withoutSuffix
            .split(' - ')
            .flatMap((part) => part.split(' – '))
            .map((s) => s.trim())
            .filter(Boolean);

        const fullName = segments[0] ?? withoutSuffix;
        const nameParts = fullName
            .split(' ')
            .map((s) => s.trim())
            .filter(Boolean);
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

    /**
     * Strips a leading notification prefix such as `"(3) "` in $O(n)$ linear time.
     */
    private stripLeadingNotificationCount(title: string): string {
        if (!title.startsWith('(')) {
            return title;
        }
        const closeParen = title.indexOf(')');
        if (closeParen <= 1 || closeParen > 10) {
            return title;
        }
        const inner = title.slice(1, closeParen);
        for (let i = 0; i < inner.length; i++) {
            const code = inner.charCodeAt(i);
            if (code < 48 || code > 57) {
                return title;
            }
        }
        return title.slice(closeParen + 1).trimStart();
    }

    /**
     * Strips a trailing `"| LinkedIn"` suffix in $O(n)$ linear time.
     */
    private stripLinkedInSuffix(title: string): string {
        const pipeIdx = title.lastIndexOf('|');
        if (pipeIdx === -1) {
            return title.trim();
        }
        const suffix = title.slice(pipeIdx + 1).toLowerCase();
        if (suffix.includes('linkedin')) {
            return title.slice(0, pipeIdx).trim();
        }
        return title.trim();
    }
}

/**
 * Prevents tree-shaking of {@link LinkedInPageExtractor}'s `@RegisterClass` decorator.
 */
export function LoadLinkedInPageExtractor(): void {
    // Static reference for ClassFactory
}
