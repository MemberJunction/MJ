/**
 * @fileoverview Default page signal extractor (`StandardPageExtractor`) for the
 * MemberJunction Browser Extension.
 *
 * Extracts URL, registrable hostname root, OpenGraph tags, Schema.org JSON-LD entities,
 * `<meta>` tags, and DOM CSS/XPath signals configured on a {@link BrowserContextRuleSpec}.
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
 * Default page extractor handling URL, HostnameRoot, OpenGraph, Schema.org JSON-LD, MetaTag,
 * and DOM CSS/XPath signals.
 */
@RegisterClass(BaseBrowserPageExtractor, 'StandardPageExtractor')
export class StandardPageExtractor extends BaseBrowserPageExtractor {
    public override Extract(
        snapshot: BrowserPageStateSnapshot,
        rule: BrowserContextRuleSpec
    ): ExtractedPageSignals {
        const signalsByKey: Record<string, string> = {};
        const candidateEntityFields: Record<string, string> = {};

        rule.Signals.forEach((sig, index) => {
            const val = this.ExtractSingleSignal(snapshot, sig);
            if (val !== null && val.length > 0) {
                signalsByKey[`signal_${index}`] = val;
                signalsByKey[sig.Source] = val;
            }
        });

        // Populate standard candidate entity fields from OpenGraph / Schema.org / URL / Title
        const ogTitle =
            snapshot.OpenGraph['og:site_name'] ??
            snapshot.OpenGraph['site_name'] ??
            snapshot.OpenGraph['og:title'] ??
            snapshot.OpenGraph['title'] ??
            snapshot.Title;
        if (ogTitle) {
            candidateEntityFields['Name'] = ogTitle.trim();
        }

        const rootDomain = this.extractRegistrableDomain(snapshot.Hostname || snapshot.Url);
        if (rootDomain) {
            candidateEntityFields['Domain'] = rootDomain;
            candidateEntityFields['Website'] = snapshot.Url.startsWith('http')
                ? new URL(snapshot.Url).origin
                : `https://${rootDomain}`;
        }

        const ogDesc =
            snapshot.OpenGraph['og:description'] ??
            snapshot.OpenGraph['description'] ??
            snapshot.MetaTags['description'];
        if (ogDesc) {
            candidateEntityFields['Description'] = ogDesc.trim();
        }

        return {
            SignalsByKey: signalsByKey,
            CandidateEntityFields: candidateEntityFields,
        };
    }
}

/**
 * Prevents tree-shaking of {@link StandardPageExtractor}'s `@RegisterClass` decorator.
 */
export function LoadStandardPageExtractor(): void {
    // Static reference for ClassFactory
}
