import * as path from 'node:path';
import {
    ExtractNumericLiteralTokens,
    type CheckIssue,
    type RenderCompositionFile,
    type RenderProjectBundle,
} from '@memberjunction/video-studio-core';

/** Issue code emitted when a relative asset reference is missing from `Bundle.Files` and `Bundle.Assets`. */
export const MJ_MISSING_ASSET_CODE = 'MJ_MISSING_ASSET';

/** Issue code emitted when a composition script calls a non-deterministic time or timer API. */
export const MJ_NONDETERMINISTIC_API_CODE = 'MJ_NONDETERMINISTIC_API';

/** Issue code emitted when authored HTML contains an unbound numeric literal outside `data-mj-bound`. */
export const MJ_UNBOUND_LITERAL_SOURCE_CODE = 'MJ_UNBOUND_LITERAL_SOURCE';

/**
 * `@hyperframes/lint` rule codes that already flag `Date.now(`, `new Date()`, `performance.now(`,
 * and `requestAnimationFrame(` inside HTML inline `<script>` blocks (verified in Step 1c).
 */
export const HYPERFRAMES_LINT_NONDETERMINISTIC_CODES = [
    'non_deterministic_code',
    'requestanimationframe_in_composition',
] as const;

/**
 * Options for `RunStaticChecks`.
 */
export interface StaticCheckOptions {
    /**
     * Explicit list of allowed numeric literal tokens (e.g. from `CheckRequest.AllowedDataLiterals`).
     * When omitted or empty, no unbound numeric literals are allowed (Decision 1).
     */
    AllowedDataLiterals?: readonly string[];
    /**
     * Existing issues returned by `RunLintGate` (`@hyperframes/lint`). Used to skip emitting
     * duplicate `MJ_NONDETERMINISTIC_API` findings on the same `(File, Line)` when HyperFrames
     * lint has already reported `non_deterministic_code` or `requestanimationframe_in_composition`.
     */
    ExistingLintIssues?: readonly CheckIssue[];
    /**
     * When true, skips the 4 non-deterministic APIs (`Date.now(`, `new Date()`, `performance.now(`,
     * `requestAnimationFrame(`) inside HTML inline `<script>` tags that `@hyperframes/lint` scans,
     * even if `ExistingLintIssues` is not passed.
     */
    SkipHyperFramesHtmlDuplicates?: boolean;
}

const HTML_ASSET_ATTR_REGEX =
    /\b(src|href|poster|data|xlink:href|background)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
const HTML_SRCSET_ATTR_REGEX = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
const HTML_STYLE_ATTR_REGEX = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

const CSS_URL_REGEX = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s"']+))\s*\)/gi;
const CSS_IMPORT_REGEX = /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^)\s"';]+))/gi;

const JS_IMPORT_FROM_REGEX = /\b(?:import|export)\b[\s\S]*?\bfrom\s*(?:"([^"]*)"|'([^']*)')/g;
const JS_SIDE_EFFECT_IMPORT_REGEX = /\bimport\s*(?:"([^"]*)"|'([^']*)')/g;
const JS_DYNAMIC_IMPORT_REGEX = /\bimport\s*\(\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)\s*\)/g;

interface NondeterministicPatternRule {
    Regex: RegExp;
    Label: string;
    CoveredByHyperFramesHtmlLint: boolean;
}

const NONDETERMINISTIC_API_RULES: readonly NondeterministicPatternRule[] = [
    { Regex: /\bDate\s*\.\s*now\s*\(/g, Label: 'Date.now()', CoveredByHyperFramesHtmlLint: true },
    { Regex: /\bnew\s+Date\s*\(\s*\)/g, Label: 'new Date()', CoveredByHyperFramesHtmlLint: true },
    { Regex: /\bperformance\s*\.\s*now\s*\(/g, Label: 'performance.now()', CoveredByHyperFramesHtmlLint: true },
    {
        Regex: /\brequestAnimationFrame\s*\(/g,
        Label: 'requestAnimationFrame()',
        CoveredByHyperFramesHtmlLint: true,
    },
    { Regex: /\bsetTimeout\s*\(/g, Label: 'setTimeout()', CoveredByHyperFramesHtmlLint: false },
    { Regex: /\bsetInterval\s*\(/g, Label: 'setInterval()', CoveredByHyperFramesHtmlLint: false },
];

const VOID_HTML_TAGS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);

/**
 * Runs pure static checks over authored files in `bundle`:
 * - `MJ_MISSING_ASSET` (`MissingAsset`, Error)
 * - `MJ_NONDETERMINISTIC_API` (`Lint`, Error)
 * - `MJ_UNBOUND_LITERAL_SOURCE` (`DataLiteral`, Error)
 */
export function RunStaticChecks(
    bundle: RenderProjectBundle,
    options?: StaticCheckOptions | readonly string[],
): CheckIssue[] {
    const resolvedOptions: StaticCheckOptions = Array.isArray(options)
        ? { AllowedDataLiterals: options }
        : ((options as StaticCheckOptions | undefined) ?? {});

    const knownPaths = buildKnownBundlePathSet(bundle);
    const allowedLiterals = buildAllowedLiteralSet(resolvedOptions.AllowedDataLiterals);
    const hfReportedLocations = buildHyperFramesReportedSet(resolvedOptions.ExistingLintIssues);
    const skipHfHtml = resolvedOptions.SkipHyperFramesHtmlDuplicates ?? true;

    const issues: CheckIssue[] = [];
    for (const file of bundle.Files) {
        const lower = file.Path.toLowerCase();
        if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.svg')) {
            issues.push(
                ...scanHtmlStaticIssues(
                    file,
                    knownPaths,
                    allowedLiterals,
                    hfReportedLocations,
                    skipHfHtml,
                ),
            );
        } else if (lower.endsWith('.css')) {
            issues.push(...scanCssMissingAssets(file.Content, file.Path, 1, knownPaths));
        } else if (lower.endsWith('.js') || lower.endsWith('.mjs')) {
            issues.push(...scanJsMissingAssets(file.Content, file.Path, 1, knownPaths));
            issues.push(
                ...scanJsNondeterministicApis(
                    file.Content,
                    file.Path,
                    1,
                    false,
                    hfReportedLocations,
                    false,
                ),
            );
        }
    }

    return issues;
}

function buildKnownBundlePathSet(bundle: RenderProjectBundle): Set<string> {
    const known = new Set<string>();
    for (const file of bundle.Files) {
        known.add(normalizeBundlePath(file.Path));
    }
    for (const asset of bundle.Assets) {
        known.add(normalizeBundlePath(asset.RelativePath));
    }
    return known;
}

function buildAllowedLiteralSet(allowed?: readonly string[]): Set<string> {
    const set = new Set<string>();
    if (!allowed) {
        return set;
    }
    for (const item of allowed) {
        if (typeof item === 'string' && item.trim().length > 0) {
            set.add(item.trim());
        }
    }
    return set;
}

function buildHyperFramesReportedSet(existing?: readonly CheckIssue[]): Set<string> {
    const set = new Set<string>();
    if (!existing) {
        return set;
    }
    const hfCodes = new Set<string>(HYPERFRAMES_LINT_NONDETERMINISTIC_CODES);
    for (const issue of existing) {
        if (hfCodes.has(issue.Code)) {
            set.add(`${issue.File ?? ''}:${issue.Line ?? 0}`);
        }
    }
    return set;
}

function scanHtmlStaticIssues(
    file: RenderCompositionFile,
    knownPaths: Set<string>,
    allowedLiterals: Set<string>,
    hfReportedLocations: Set<string>,
    skipHfHtml: boolean,
): CheckIssue[] {
    const issues: CheckIssue[] = [];
    const html = file.Content;
    const htmlWithoutScriptsOrStyles = blankOutHtmlTagBlocks(
        blankOutHtmlTagBlocks(html, 'script'),
        'style',
    );

    for (const match of htmlWithoutScriptsOrStyles.matchAll(HTML_ASSET_ATTR_REGEX)) {
        const attrName = (match[1] ?? '').toLowerCase();
        const rawUrl = (match[2] ?? match[3] ?? match[4] ?? '').trim();
        if (attrName === 'href' && isAnchorTagAt(htmlWithoutScriptsOrStyles, match.index ?? 0)) {
            continue;
        }
        const line = computeLineNumber(htmlWithoutScriptsOrStyles, match.index ?? 0);
        const missing = checkRelativeBundleAsset(rawUrl, file.Path, line, knownPaths);
        if (missing) {
            issues.push(missing);
        }
    }

    for (const match of htmlWithoutScriptsOrStyles.matchAll(HTML_SRCSET_ATTR_REGEX)) {
        const rawSrcset = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        const line = computeLineNumber(htmlWithoutScriptsOrStyles, match.index ?? 0);
        for (const candidate of rawSrcset.split(',')) {
            const urlPart = candidate.trim().split(/\s+/)[0] ?? '';
            const missing = checkRelativeBundleAsset(urlPart, file.Path, line, knownPaths);
            if (missing) {
                issues.push(missing);
            }
        }
    }

    for (const match of htmlWithoutScriptsOrStyles.matchAll(HTML_STYLE_ATTR_REGEX)) {
        const styleContent = match[1] ?? match[2] ?? '';
        const line = computeLineNumber(htmlWithoutScriptsOrStyles, match.index ?? 0);
        issues.push(...scanCssMissingAssets(styleContent, file.Path, line, knownPaths));
    }

    for (const styleBlock of findHtmlTagBlocks(html, 'style')) {
        const line = computeLineNumber(html, styleBlock.fullStart);
        issues.push(...scanCssMissingAssets(styleBlock.body, file.Path, line, knownPaths));
    }

    const isHfScannedHtml = isHyperFramesLintedHtmlPath(file.Path);
    for (const scriptBlock of findHtmlTagBlocks(html, 'script')) {
        const baseLine = computeLineNumber(html, scriptBlock.bodyStart);
        issues.push(...scanJsMissingAssets(scriptBlock.body, file.Path, baseLine, knownPaths));
        issues.push(
            ...scanJsNondeterministicApis(
                scriptBlock.body,
                file.Path,
                baseLine,
                isHfScannedHtml,
                hfReportedLocations,
                skipHfHtml,
            ),
        );
    }

    issues.push(...scanHtmlUnboundLiterals(html, file.Path, allowedLiterals));
    return issues;
}

function isAnchorTagAt(html: string, attrMatchIndex: number): boolean {
    const before = html.slice(0, attrMatchIndex);
    const lastOpenBracket = before.lastIndexOf('<');
    if (lastOpenBracket < 0) {
        return false;
    }
    const tagSlice = before.slice(lastOpenBracket);
    return /^<\s*a\b/i.test(tagSlice);
}

function scanCssMissingAssets(
    css: string,
    filePath: string,
    baseLine: number,
    knownPaths: Set<string>,
): CheckIssue[] {
    const issues: CheckIssue[] = [];
    for (const match of css.matchAll(CSS_IMPORT_REGEX)) {
        const rawUrl = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        const line = baseLine + computeLineNumber(css, match.index ?? 0) - 1;
        const missing = checkRelativeBundleAsset(rawUrl, filePath, line, knownPaths);
        if (missing) {
            issues.push(missing);
        }
    }
    for (const match of css.matchAll(CSS_URL_REGEX)) {
        const rawUrl = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        const line = baseLine + computeLineNumber(css, match.index ?? 0) - 1;
        const missing = checkRelativeBundleAsset(rawUrl, filePath, line, knownPaths);
        if (missing) {
            issues.push(missing);
        }
    }
    return issues;
}

function scanJsMissingAssets(
    js: string,
    filePath: string,
    baseLine: number,
    knownPaths: Set<string>,
): CheckIssue[] {
    const issues: CheckIssue[] = [];
    for (const regex of [JS_IMPORT_FROM_REGEX, JS_SIDE_EFFECT_IMPORT_REGEX, JS_DYNAMIC_IMPORT_REGEX]) {
        for (const match of js.matchAll(regex)) {
            const specifier = (match[1] ?? match[2] ?? match[3] ?? '').trim();
            const line = baseLine + computeLineNumber(js, match.index ?? 0) - 1;
            const missing = checkRelativeBundleAsset(specifier, filePath, line, knownPaths);
            if (missing) {
                issues.push(missing);
            }
        }
    }
    return issues;
}

function scanJsNondeterministicApis(
    js: string,
    filePath: string,
    baseLine: number,
    isHfScannedHtml: boolean,
    hfReportedLocations: Set<string>,
    skipHfHtml: boolean,
): CheckIssue[] {
    const issues: CheckIssue[] = [];
    const strippedJs = stripJsCommentsPreserveNewlines(js);

    for (const rule of NONDETERMINISTIC_API_RULES) {
        if (isHfScannedHtml && skipHfHtml && rule.CoveredByHyperFramesHtmlLint) {
            continue;
        }
        for (const match of strippedJs.matchAll(rule.Regex)) {
            const line = baseLine + computeLineNumber(strippedJs, match.index ?? 0) - 1;
            if (
                isHfScannedHtml &&
                rule.CoveredByHyperFramesHtmlLint &&
                hfReportedLocations.has(`${filePath}:${line}`)
            ) {
                continue;
            }
            issues.push({
                Code: MJ_NONDETERMINISTIC_API_CODE,
                Category: 'Lint',
                Severity: 'Error',
                Message: `Non-deterministic API "${rule.Label}" is forbidden in composition scripts; use MJVideo.OnFrame(t) and MJVideo.Random() / MJVideo.Noise().`,
                File: filePath,
                Line: line,
            });
        }
    }
    return issues;
}

function checkRelativeBundleAsset(
    rawUrl: string,
    fromFilePath: string,
    line: number,
    knownPaths: Set<string>,
): CheckIssue | null {
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('#')) {
        return null;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith('//')) {
        return null;
    }
    const cleanRef = (trimmed.split(/[?#]/)[0] ?? '').replace(/\\/g, '/').trim();
    if (!cleanRef) {
        return null;
    }

    const resolved = resolveBundleRelativeReference(fromFilePath, cleanRef);
    if (!resolved) {
        return null;
    }

    if (!knownPaths.has(normalizeBundlePath(resolved))) {
        return {
            Code: MJ_MISSING_ASSET_CODE,
            Category: 'MissingAsset',
            Severity: 'Error',
            Message: `Referenced bundle path "${resolved}" (from "${trimmed}") does not exist in Bundle.Files or Bundle.Assets.`,
            File: fromFilePath,
            Line: line,
        };
    }
    return null;
}

function resolveBundleRelativeReference(fromFilePath: string, cleanRef: string): string | null {
    const dirNormalized = path.posix.dirname(fromFilePath.replace(/\\/g, '/'));
    const stack =
        cleanRef.startsWith('/') || dirNormalized === '.' || dirNormalized === ''
            ? []
            : dirNormalized.split('/').filter((seg) => seg.length > 0 && seg !== '.');

    const segments = (cleanRef.startsWith('/') ? cleanRef.slice(1) : cleanRef).split('/');
    for (const seg of segments) {
        if (seg === '' || seg === '.') {
            continue;
        }
        if (seg === '..') {
            if (stack.length === 0) {
                return null;
            }
            stack.pop();
        } else {
            stack.push(seg);
        }
    }
    return stack.length > 0 ? stack.join('/') : null;
}

interface HtmlTokenSpan {
    matchStart: number;
    matchEnd: number;
    fullToken: string;
    tagName: string;
    attrText: string;
}

function isAsciiAlphaChar(ch: string | undefined): boolean {
    if (ch === undefined) {
        return false;
    }
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isTagNameContinuationChar(ch: string | undefined): boolean {
    if (ch === undefined) {
        return false;
    }
    return (
        isAsciiAlphaChar(ch) ||
        (ch >= '0' && ch <= '9') ||
        ch === ':' ||
        ch === '-'
    );
}

function isWordBoundaryChar(ch: string | undefined): boolean {
    if (ch === undefined) {
        return false;
    }
    return (
        isAsciiAlphaChar(ch) ||
        (ch >= '0' && ch <= '9') ||
        ch === '_'
    );
}

function toAsciiLowerCase(s: string): string {
    return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function isHtmlCloseTagDelimiter(ch: string | undefined): boolean {
    return (
        ch === ' ' ||
        ch === '\t' ||
        ch === '\n' ||
        ch === '\f' ||
        ch === '\r' ||
        ch === '/' ||
        ch === '>'
    );
}

function findClosingTagEnd(
    html: string,
    lowerHtml: string,
    tagLower: string,
    fromIndex: number,
): number {
    const needle = `</${tagLower}`;
    let pos = fromIndex;
    while (pos < html.length) {
        const idx = lowerHtml.indexOf(needle, pos);
        if (idx === -1) {
            return -1;
        }
        const afterName = idx + needle.length;
        if (afterName < html.length && isHtmlCloseTagDelimiter(html[afterName])) {
            const gtIdx = html.indexOf('>', afterName);
            if (gtIdx === -1) {
                return -1;
            }
            return gtIdx + 1;
        }
        pos = afterName;
    }
    return -1;
}

interface HtmlTagBlockSpan {
    fullStart: number;
    fullEnd: number;
    bodyStart: number;
    body: string;
}

function findHtmlTagBlocks(html: string, tagLower: 'script' | 'style'): HtmlTagBlockSpan[] {
    const blocks: HtmlTagBlockSpan[] = [];
    const lowerHtml = toAsciiLowerCase(html);
    const openNeedle = `<${tagLower}`;
    const closeNeedle = `</${tagLower}`;
    let pos = 0;

    while (pos < html.length) {
        const openIdx = lowerHtml.indexOf(openNeedle, pos);
        if (openIdx === -1) {
            break;
        }
        const afterOpenName = openIdx + openNeedle.length;
        if (afterOpenName >= html.length || isWordBoundaryChar(html[afterOpenName])) {
            pos = afterOpenName;
            continue;
        }
        const openGt = html.indexOf('>', afterOpenName);
        if (openGt === -1) {
            break;
        }
        const bodyStart = openGt + 1;
        let closeSearch = bodyStart;
        let matchedClose = false;
        while (closeSearch < html.length) {
            const closeIdx = lowerHtml.indexOf(closeNeedle, closeSearch);
            if (closeIdx === -1) {
                return blocks;
            }
            const afterCloseName = closeIdx + closeNeedle.length;
            if (afterCloseName >= html.length || !isHtmlCloseTagDelimiter(html[afterCloseName])) {
                closeSearch = afterCloseName;
                continue;
            }
            const closeGt = html.indexOf('>', afterCloseName);
            if (closeGt === -1) {
                return blocks;
            }
            blocks.push({
                fullStart: openIdx,
                fullEnd: closeGt + 1,
                bodyStart,
                body: html.slice(bodyStart, closeIdx),
            });
            pos = closeGt + 1;
            matchedClose = true;
            break;
        }
        if (!matchedClose) {
            break;
        }
    }
    return blocks;
}

function blankOutHtmlTagBlocks(html: string, tagLower: 'script' | 'style'): string {
    const blocks = findHtmlTagBlocks(html, tagLower);
    if (blocks.length === 0) {
        return html;
    }
    let out = '';
    let cursor = 0;
    for (const block of blocks) {
        out += html.slice(cursor, block.fullStart);
        for (let i = block.fullStart; i < block.fullEnd; i++) {
            out += html.charCodeAt(i) === 10 ? '\n' : ' ';
        }
        cursor = block.fullEnd;
    }
    out += html.slice(cursor);
    return out;
}

function scanHtmlTokens(html: string): HtmlTokenSpan[] {
    const tokens: HtmlTokenSpan[] = [];
    const lowerHtml = toAsciiLowerCase(html);
    let scanPos = 0;
    let noMoreCommentClose = false;
    let noMoreBangGt = false;
    let noMoreScriptClose = false;
    let noMoreStyleClose = false;

    while (scanPos < html.length) {
        const openIdx = html.indexOf('<', scanPos);
        if (openIdx === -1) {
            break;
        }

        if (html.startsWith('<!--', openIdx) && !noMoreCommentClose) {
            const commentClose = html.indexOf('-->', openIdx + 4);
            if (commentClose !== -1) {
                const matchEnd = commentClose + 3;
                tokens.push({
                    matchStart: openIdx,
                    matchEnd,
                    fullToken: html.slice(openIdx, matchEnd),
                    tagName: '',
                    attrText: '',
                });
                scanPos = matchEnd;
                continue;
            }
            noMoreCommentClose = true;
        }

        if (lowerHtml.startsWith('<script', openIdx) && !isWordBoundaryChar(html[openIdx + 7])) {
            const gtIdx = html.indexOf('>', openIdx + 7);
            if (gtIdx !== -1 && !noMoreScriptClose) {
                const closeEnd = findClosingTagEnd(html, lowerHtml, 'script', gtIdx + 1);
                if (closeEnd !== -1) {
                    tokens.push({
                        matchStart: openIdx,
                        matchEnd: closeEnd,
                        fullToken: html.slice(openIdx, closeEnd),
                        tagName: '',
                        attrText: '',
                    });
                    scanPos = closeEnd;
                    continue;
                }
                noMoreScriptClose = true;
            }
        }

        if (lowerHtml.startsWith('<style', openIdx) && !isWordBoundaryChar(html[openIdx + 6])) {
            const gtIdx = html.indexOf('>', openIdx + 6);
            if (gtIdx !== -1 && !noMoreStyleClose) {
                const closeEnd = findClosingTagEnd(html, lowerHtml, 'style', gtIdx + 1);
                if (closeEnd !== -1) {
                    tokens.push({
                        matchStart: openIdx,
                        matchEnd: closeEnd,
                        fullToken: html.slice(openIdx, closeEnd),
                        tagName: '',
                        attrText: '',
                    });
                    scanPos = closeEnd;
                    continue;
                }
                noMoreStyleClose = true;
            }
        }

        if (html.startsWith('<!', openIdx)) {
            if (!noMoreBangGt) {
                const gtIdx = html.indexOf('>', openIdx + 2);
                if (gtIdx !== -1) {
                    const matchEnd = gtIdx + 1;
                    tokens.push({
                        matchStart: openIdx,
                        matchEnd,
                        fullToken: html.slice(openIdx, matchEnd),
                        tagName: '',
                        attrText: '',
                    });
                    scanPos = matchEnd;
                    continue;
                }
                noMoreBangGt = true;
            }
            scanPos = openIdx + 1;
            continue;
        }

        const isClosing = html[openIdx + 1] === '/';
        const nameStart = isClosing ? openIdx + 2 : openIdx + 1;
        if (!isAsciiAlphaChar(html[nameStart])) {
            scanPos = openIdx + 1;
            continue;
        }

        let maxNameEnd = nameStart + 1;
        while (maxNameEnd < html.length && isTagNameContinuationChar(html[maxNameEnd])) {
            maxNameEnd++;
        }
        let nameEnd = maxNameEnd;
        while (
            nameEnd > nameStart &&
            isWordBoundaryChar(html[nameEnd - 1]) === isWordBoundaryChar(html[nameEnd])
        ) {
            nameEnd--;
        }
        if (nameEnd === nameStart) {
            scanPos = openIdx + 1;
            continue;
        }

        const gtIdx = html.indexOf('>', nameEnd);
        if (gtIdx === -1) {
            break;
        }

        const rawTagName = lowerHtml.slice(nameStart, nameEnd);
        const attrText = html.slice(nameEnd, gtIdx);
        const openTagEnd = gtIdx + 1;

        tokens.push({
            matchStart: openIdx,
            matchEnd: openTagEnd,
            fullToken: html.slice(openIdx, openTagEnd),
            tagName: rawTagName,
            attrText,
        });
        scanPos = openTagEnd;
    }

    return tokens;
}

function scanHtmlUnboundLiterals(
    html: string,
    filePath: string,
    allowedLiterals: Set<string>,
): CheckIssue[] {
    const issues: CheckIssue[] = [];
    const stack: Array<{ Tag: string; IsBound: boolean }> = [];
    let cursor = 0;

    for (const token of scanHtmlTokens(html)) {
        const { matchStart, matchEnd, fullToken, tagName, attrText } = token;
        if (matchStart > cursor) {
            const textChunk = html.slice(cursor, matchStart);
            const isCurrentlyBound = stack.length > 0 && stack[stack.length - 1]!.IsBound;
            if (!isCurrentlyBound) {
                collectTextLiteralIssues(textChunk, html, cursor, filePath, allowedLiterals, issues);
            }
        }

        if (tagName) {
            const isClosing = fullToken.startsWith('</');
            const isSelfClosing =
                /\/>\s*$/.test(fullToken) || VOID_HTML_TAGS.has(tagName);
            if (isClosing) {
                for (let i = stack.length - 1; i >= 0; i--) {
                    if (stack[i]!.Tag === tagName) {
                        stack.length = i;
                        break;
                    }
                }
            } else if (!isSelfClosing) {
                const parentBound = stack.length > 0 && stack[stack.length - 1]!.IsBound;
                const selfBound = hasDataMjBoundAttribute(attrText);
                stack.push({ Tag: tagName, IsBound: parentBound || selfBound });
            }
        }

        cursor = matchEnd;
    }

    if (cursor < html.length) {
        const trailing = html.slice(cursor);
        const isCurrentlyBound = stack.length > 0 && stack[stack.length - 1]!.IsBound;
        if (!isCurrentlyBound) {
            collectTextLiteralIssues(trailing, html, cursor, filePath, allowedLiterals, issues);
        }
    }

    return issues;
}

function collectTextLiteralIssues(
    rawText: string,
    fullHtml: string,
    textStartOffset: number,
    filePath: string,
    allowedLiterals: Set<string>,
    outIssues: CheckIssue[],
): void {
    const decoded = decodeHtmlEntities(rawText);
    if (!decoded.trim()) {
        return;
    }
    const tokens = ExtractNumericLiteralTokens(decoded);
    if (tokens.length === 0) {
        return;
    }
    const line = computeLineNumber(fullHtml, textStartOffset);
    for (const token of tokens) {
        if (isLiteralAllowed(token, allowedLiterals)) {
            continue;
        }
        outIssues.push({
            Code: MJ_UNBOUND_LITERAL_SOURCE_CODE,
            Category: 'DataLiteral',
            Severity: 'Error',
            Message: `Unbound numeric literal "${token}" in authored HTML text; bind via MJVideo.Data / data-mj-bound or add to AllowedDataLiterals.`,
            File: filePath,
            Line: line,
        });
    }
}

/**
 * Checks whether an extracted numeric literal token matches `allowedLiterals`.
 */
export function IsAllowedNumericLiteral(token: string, allowedLiterals: ReadonlySet<string>): boolean {
    return isLiteralAllowed(token, allowedLiterals);
}

const ALLOWED_LITERAL_PUNCTUATION = new Set(Array.from('(),.;:!?'));

function stripAllowedLiteralPunctuation(value: string): string {
    let start = 0;
    let end = value.length;
    while (start < end && ALLOWED_LITERAL_PUNCTUATION.has(value[start]!)) {
        start++;
    }
    while (end > start && ALLOWED_LITERAL_PUNCTUATION.has(value[end - 1]!)) {
        end--;
    }
    return value.slice(start, end);
}

function isLiteralAllowed(token: string, allowedLiterals: ReadonlySet<string>): boolean {
    const trimmed = token.trim();
    if (allowedLiterals.has(trimmed)) {
        return true;
    }
    const stripped = stripAllowedLiteralPunctuation(trimmed);
    if (stripped.length > 0 && allowedLiterals.has(stripped)) {
        return true;
    }
    const withoutLeadingPlus = stripped.replace(/^\+/, '');
    return withoutLeadingPlus.length > 0 && allowedLiterals.has(withoutLeadingPlus);
}

function hasDataMjBoundAttribute(attrText: string): boolean {
    const match = /\bdata-mj-bound(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/i.exec(attrText);
    if (!match) {
        return false;
    }
    const val = (match[1] ?? match[2] ?? match[3] ?? '').trim().toLowerCase();
    return val !== 'false' && val !== '0';
}

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&minus;|&#8722;|&#x2212;/gi, '−')
        .replace(/&amp;/gi, '&');
}

function isHyperFramesLintedHtmlPath(filePath: string): boolean {
    const norm = normalizeBundlePath(filePath);
    return norm === 'index.html' || /^compositions\/.+\.html$/.test(norm);
}

function normalizeBundlePath(relPath: string): string {
    return relPath.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function stripJsCommentsPreserveNewlines(js: string): string {
    let withoutBlockComments = '';
    let cursor = 0;
    while (cursor < js.length) {
        const startIdx = js.indexOf('/*', cursor);
        if (startIdx === -1) {
            withoutBlockComments += js.slice(cursor);
            break;
        }
        const endIdx = js.indexOf('*/', startIdx + 2);
        if (endIdx === -1) {
            withoutBlockComments += js.slice(cursor);
            break;
        }
        withoutBlockComments += js.slice(cursor, startIdx);
        const commentEnd = endIdx + 2;
        for (let i = startIdx; i < commentEnd; i++) {
            withoutBlockComments += js.charCodeAt(i) === 10 ? '\n' : ' ';
        }
        cursor = commentEnd;
    }
    return withoutBlockComments.replace(/\/\/[^\n]*/g, '');
}

function computeLineNumber(content: string, charIndex: number): number {
    let line = 1;
    for (let i = 0; i < charIndex && i < content.length; i++) {
        if (content.charCodeAt(i) === 10) {
            line++;
        }
    }
    return line;
}
