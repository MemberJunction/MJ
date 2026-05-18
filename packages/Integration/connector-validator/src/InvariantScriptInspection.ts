/**
 * Invariant 1b — code-first script inspection.
 *
 * The classic Invariant 1 check asks "does every hard constraint have a
 * CODE_EVIDENCE entry?" — but that's existence, not integrity. The Run 1
 * loophole: an agent can write 852 CODE_EVIDENCE entries that all cite a
 * vendor URL while the underlying extractor script has the data hardcoded
 * as a literal array and never fetches anything.
 *
 * This check closes that loophole by inspecting the extractor script source:
 *
 *   1. Reject inline data arrays > N entries. The agent must not embed
 *      object catalogs, field lists, typeIds, descriptions, capability flags
 *      as literals in the script. Those have to come from a fetched source.
 *   2. Verify that every URL the CODE_EVIDENCE entries cite as SourceOfTruth
 *      actually appears in a fetch()/WebFetch call site in the script. A
 *      URL cited but never fetched is fraud-by-self-citation.
 *   3. Verify the script contains at least one network-fetch call (basic
 *      sanity: a code-first extractor must fetch something).
 *
 * Threshold for "inline data array": > 5 object-like literals counts as
 * embedded data. Configuration constants (regex, type maps, ALWAYS_SKIP
 * lists of test endpoints) are exempt below that threshold.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.17 + .claude/agents/ioiof-extractor.md
 */
import { readFileSync, existsSync } from 'node:fs';
import { Project, SyntaxKind, Node } from 'ts-morph';
import type { FailureDetail, CodeEvidenceFile } from './types.js';

export interface ScriptInspectionResult {
    Status: 'Pass' | 'Fail';
    Failures: FailureDetail[];
    Stats: {
        ScriptPath: string;
        FetchCallCount: number;
        InlineArrayLiteralCount: number;
        LargestInlineArraySize: number;
        UrlsCitedInEvidence: number;
        UrlsActuallyFetched: number;
        UrlsCitedButNeverFetched: string[];
    };
}

const INLINE_ARRAY_THRESHOLD = 5;

export function CheckScriptInspection(
    extractorScriptPath: string,
    codeEvidence: CodeEvidenceFile
): ScriptInspectionResult {
    const failures: FailureDetail[] = [];

    // If there are no CODE_EVIDENCE entries, there's nothing to verify — the
    // connector either uses runtime-only discovery or hasn't run extraction
    // yet. Either is fine; the inspector returns Pass with empty stats.
    const hasClaimedExtractions = codeEvidence.Entries.length > 0;

    if (!existsSync(extractorScriptPath)) {
        if (!hasClaimedExtractions) {
            // No script, no claims — nothing to fabricate, nothing to verify.
            return {
                Status: 'Pass',
                Failures: [],
                Stats: { ScriptPath: extractorScriptPath, FetchCallCount: 0, InlineArrayLiteralCount: 0, LargestInlineArraySize: 0, UrlsCitedInEvidence: 0, UrlsActuallyFetched: 0, UrlsCitedButNeverFetched: [] },
            };
        }
        // Script absent BUT entries claim it was run → fabrication.
        failures.push({
            InvariantNumber: 1,
            Severity: 'Error',
            Failure: `CODE_EVIDENCE.json has ${codeEvidence.Entries.length} entries claiming extraction, but the extractor script ${extractorScriptPath} does not exist. This is fabrication-by-self-citation.`,
            Location: extractorScriptPath,
            SuggestedFix: `Either (a) commit the extractor script that produced these entries, or (b) clear CODE_EVIDENCE.json and re-run extraction with a real script.`,
        });
        return {
            Status: 'Fail',
            Failures: failures,
            Stats: { ScriptPath: extractorScriptPath, FetchCallCount: 0, InlineArrayLiteralCount: 0, LargestInlineArraySize: 0, UrlsCitedInEvidence: codeEvidence.Entries.length, UrlsActuallyFetched: 0, UrlsCitedButNeverFetched: [] },
        };
    }

    const source = readFileSync(extractorScriptPath, 'utf-8');
    const project = new Project({ skipAddingFilesFromTsConfig: true, useInMemoryFileSystem: false });
    const sourceFile = project.addSourceFileAtPath(extractorScriptPath);

    // ── 1. Detect inline object-array literals over the threshold ────
    let inlineArrayCount = 0;
    let largestArray = 0;
    sourceFile.forEachDescendant((node) => {
        if (!Node.isArrayLiteralExpression(node)) return;
        const elements = node.getElements();
        if (elements.length <= INLINE_ARRAY_THRESHOLD) return;

        // Only flag arrays whose elements are object literals (vendor data shape).
        // A list of strings or numbers is structural, not embedded vendor data.
        const objectLiteralElements = elements.filter((e) => Node.isObjectLiteralExpression(e));
        if (objectLiteralElements.length <= INLINE_ARRAY_THRESHOLD) return;

        // Look up at the variable declaration this array is assigned to (if any).
        let varName = '<anonymous>';
        let varDecl: Node | undefined = node.getParent();
        while (varDecl && !Node.isVariableDeclaration(varDecl)) {
            varDecl = varDecl.getParent();
            if (!varDecl) break;
        }
        if (varDecl && Node.isVariableDeclaration(varDecl)) {
            varName = varDecl.getName();
        }

        inlineArrayCount++;
        largestArray = Math.max(largestArray, objectLiteralElements.length);
        failures.push({
            InvariantNumber: 1,
            Severity: 'Error',
            Failure: `Extractor script embeds an inline data array '${varName}' with ${objectLiteralElements.length} object literals (threshold: ${INLINE_ARRAY_THRESHOLD}). This is hardcoded vendor data masquerading as extraction.`,
            Location: `${extractorScriptPath}:${node.getStartLineNumber()}`,
            SuggestedFix: `Replace the literal '${varName}' with a fetch+parse step that retrieves this data from a vendor source at script run time. If the data is genuinely uncrawlable, write a provenance entry citing the vendor URL where you got it from (manual transcription is acknowledged) — but do not pretend it was extracted.`,
        });
    });

    // ── 2. Detect fetch() / WebFetch / http(s).get call sites ────────
    const fetchCallSites = new Set<string>();
    sourceFile.forEachDescendant((node) => {
        if (!Node.isCallExpression(node)) return;
        const expr = node.getExpression();
        const exprText = expr.getText();
        if (!/^(fetch|globalThis\.fetch|https?\.get|axios(\.|\b)|request|got)/.test(exprText)) return;

        // Grab the first argument; if it's a string literal or template literal, record the URL form.
        const args = node.getArguments();
        if (args.length === 0) return;
        const arg = args[0];
        if (Node.isStringLiteral(arg)) {
            fetchCallSites.add(arg.getLiteralValue());
        } else if (Node.isTemplateExpression(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) {
            fetchCallSites.add(arg.getText());
        } else {
            // Identifier or expression — record it as opaque so we still count it
            fetchCallSites.add(`<dynamic:${arg.getText().slice(0, 60)}>`);
        }
    });

    if (fetchCallSites.size === 0) {
        failures.push({
            InvariantNumber: 1,
            Severity: 'Error',
            Failure: `Extractor script contains zero network-fetch call sites. A code-first extractor must fetch something.`,
            Location: extractorScriptPath,
            SuggestedFix: `Add a fetch() / WebFetch / https.get to a vendor source (OpenAPI spec, properties endpoint, schema endpoint).`,
        });
    }

    // ── 3. Cross-check CODE_EVIDENCE URL claims against actual fetches ─
    // Read both shapes:
    //   • Top-level entry.SourceURL (current HubSpot/Stripe extractor emission shape)
    //   • Nested entry.StructuredOutput.SourceOfTruth (legacy shape, retained for back-compat)
    const citedUrls = new Set<string>();
    for (const entry of codeEvidence.Entries) {
        const topUrl = (entry as { SourceURL?: unknown }).SourceURL;
        if (typeof topUrl === 'string') {
            const urlMatch = topUrl.match(/https?:\/\/[^\s)]+/);
            if (urlMatch) citedUrls.add(urlMatch[0]);
        }
        const out = entry.StructuredOutput as { SourceOfTruth?: string | string[] } | undefined;
        if (out) {
            const sots = Array.isArray(out.SourceOfTruth) ? out.SourceOfTruth : out.SourceOfTruth ? [out.SourceOfTruth] : [];
            for (const sot of sots) {
                const urlMatch = sot.match(/https?:\/\/[^\s)]+/);
                if (urlMatch) citedUrls.add(urlMatch[0]);
            }
        }
    }

    const fetchedHosts = new Set<string>();
    for (const site of fetchCallSites) {
        try {
            // Extract hostnames from concrete URLs; dynamic sites get a wildcard
            const urlMatch = site.match(/https?:\/\/([^/\s]+)/);
            if (urlMatch) fetchedHosts.add(urlMatch[1]);
            else if (site.startsWith('<dynamic:')) fetchedHosts.add('*');
        } catch {
            /* ignore */
        }
    }

    const unfetchedCitations: string[] = [];
    for (const cited of citedUrls) {
        const urlMatch = cited.match(/https?:\/\/([^/\s]+)/);
        if (!urlMatch) continue;
        const host = urlMatch[1];
        // If the script fetches anything (even dynamic), grant the citation
        if (fetchedHosts.has('*')) continue;
        if (!fetchedHosts.has(host)) unfetchedCitations.push(cited);
    }

    if (unfetchedCitations.length > 0) {
        failures.push({
            InvariantNumber: 1,
            Severity: 'Error',
            Failure: `CODE_EVIDENCE cites ${unfetchedCitations.length} URL(s) as SourceOfTruth that the extractor script never fetches. Citation without fetch is fraud-by-self-citation.`,
            Location: extractorScriptPath,
            SuggestedFix: `Either (a) make the script fetch each cited URL during extraction, or (b) move those rows out of CODE_EVIDENCE and into PROVENANCE.json (manual transcription with explicit citation).`,
        });
    }

    return {
        Status: failures.length === 0 ? 'Pass' : 'Fail',
        Failures: failures,
        Stats: {
            ScriptPath: extractorScriptPath,
            FetchCallCount: fetchCallSites.size,
            InlineArrayLiteralCount: inlineArrayCount,
            LargestInlineArraySize: largestArray,
            UrlsCitedInEvidence: citedUrls.size,
            UrlsActuallyFetched: fetchedHosts.size,
            UrlsCitedButNeverFetched: unfetchedCitations,
        },
    };
}
