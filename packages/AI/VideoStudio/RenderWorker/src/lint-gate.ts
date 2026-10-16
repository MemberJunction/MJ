import * as path from 'node:path';
import type {
    CheckIssue,
    CheckResult,
    RenderCompositionFile,
    RenderProjectBundle,
} from '@memberjunction/video-studio-core';
import type { RenderBackend } from './backend.js';

/** Issue code emitted when a composition references a non-bundle URL or path escaping the bundle. */
export const MJ_NON_BUNDLE_URL_CODE = 'MJ_NON_BUNDLE_URL';

/** Issue code emitted when a composition invokes a forbidden browser network or navigation API. */
export const MJ_NETWORK_API_CODE = 'MJ_NETWORK_API';

const HTML_URL_ATTR_REGEX =
    /\b(src|href|poster|data|xlink:href|action|formaction|background|ping)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
const HTML_SRCSET_ATTR_REGEX = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
const HTML_STYLE_ATTR_REGEX = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const HTML_EVENT_HANDLER_ATTR_REGEX =
    /\bon[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;

const CSS_URL_REGEX = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s"']+))\s*\)/gi;
const CSS_IMPORT_REGEX = /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^)\s"';]+))/gi;

const JS_IMPORT_FROM_REGEX = /\b(?:import|export)\b[\s\S]*?\bfrom\s*(?:"([^"]*)"|'([^']*)')/g;
const JS_SIDE_EFFECT_IMPORT_REGEX = /\bimport\s*(?:"([^"]*)"|'([^']*)')/g;
const JS_DYNAMIC_IMPORT_REGEX = /\bimport\s*\(\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)\s*\)/g;
const JS_STRING_LITERAL_REGEX = /"((?:\\.|[^"\\\r\n])*)"|'((?:\\.|[^'\\\r\n])*)'|`((?:\\.|[^`\\])*)`/g;

interface NetworkPatternRule {
    Regex: RegExp;
    Label: string;
}

const HTML_NETWORK_TAG_RULES: readonly NetworkPatternRule[] = [
    {
        Regex: /<meta\b[^>]*\bhttp-equiv\s*=\s*(?:"\s*refresh\s*"|'\s*refresh\s*'|refresh\b)[^>]*>/gi,
        Label: '<meta http-equiv="refresh">',
    },
    {
        Regex: /<base\b[^>]*>/gi,
        Label: '<base>',
    },
    {
        Regex: /<link\b[^>]*\brel\s*=\s*(?:"[^"]*\b(?:prefetch|preconnect|dns-prefetch|prerender)\b[^"]*"|'[^']*\b(?:prefetch|preconnect|dns-prefetch|prerender)\b[^']*'|\b(?:prefetch|preconnect|dns-prefetch|prerender)\b)[^>]*>/gi,
        Label: '<link rel="prefetch|preconnect|dns-prefetch|prerender">',
    },
];

const JS_NETWORK_API_RULES: readonly NetworkPatternRule[] = [
    { Regex: /\bfetch\s*\(/g, Label: 'fetch(' },
    { Regex: /\bXMLHttpRequest\b/g, Label: 'XMLHttpRequest' },
    { Regex: /\bWebSocket\b/g, Label: 'WebSocket' },
    { Regex: /\bEventSource\b/g, Label: 'EventSource' },
    { Regex: /\bsendBeacon\b/g, Label: 'sendBeacon' },
    { Regex: /\b(?:webkit|moz)?RTCPeerConnection\b/g, Label: 'RTCPeerConnection' },
    { Regex: /\bimportScripts\b/g, Label: 'importScripts' },
    { Regex: /\bserviceWorker\b/g, Label: 'serviceWorker' },
    { Regex: /\bwindow\s*\.\s*open\s*\(/g, Label: 'window.open' },
    {
        Regex: /\b(?:(?:window|document|self|top|parent|frames)\s*\.\s*)*location\s*(?:=[^=]|\.\s*(?:assign|replace|reload)\s*\(|\.\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*=|\[\s*["'`][^"'`]+["'`]\s*\]\s*=)/g,
        Label: 'location navigation',
    },
];

/**
 * Runs the static authored-file lint gate (`MJ_NON_BUNDLE_URL`, `MJ_NETWORK_API`) plus `backend.Lint`,
 * returning a deterministically sorted `CheckResult`.
 */
export async function RunLintGate(
    bundle: RenderProjectBundle,
    stagedDir: string,
    backend: RenderBackend,
): Promise<CheckResult> {
    const authoredIssues = ScanAuthoredFilesForLintIssues(bundle);
    const backendLint = await backend.Lint(stagedDir, bundle.EntryFile);
    const merged = SortCheckIssues(deduplicateIssues([...authoredIssues, ...backendLint.Issues]));
    const hasError = merged.some((issue) => issue.Severity === 'Error');
    const blockRender = backendLint.Block || hasError;

    return {
        Passed: !blockRender,
        BlockRender: blockRender,
        Issues: merged,
    };
}

/**
 * Scans authored files in `bundle.Files` (prior to preamble injection) for `MJ_NON_BUNDLE_URL`
 * and `MJ_NETWORK_API` violations.
 */
export function ScanAuthoredFilesForLintIssues(bundle: RenderProjectBundle): CheckIssue[] {
    const authoredFilePaths = buildAuthoredFilePathSet(bundle);
    const issues: CheckIssue[] = [];
    for (const file of bundle.Files) {
        const lower = file.Path.toLowerCase();
        if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.svg')) {
            issues.push(...scanHtmlFile(file, authoredFilePaths));
        } else if (lower.endsWith('.css')) {
            issues.push(...scanCssBlock(file.Content, file.Path, 1));
        } else {
            issues.push(...scanJsBlock(file.Content, file.Path, 1, authoredFilePaths));
        }
    }
    return SortCheckIssues(deduplicateIssues(issues));
}

function buildAuthoredFilePathSet(bundle: RenderProjectBundle): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const file of bundle.Files) {
        const resolved = resolveBundleRelativePath('', file.Path);
        if (resolved) {
            paths.add(resolved);
        }
    }
    return paths;
}

/**
 * Deterministically sorts `CheckIssue` items by `Category`, `File`, `Line`, `Code`, then `Selector` / `TimestampSeconds`.
 */
export function SortCheckIssues(issues: readonly CheckIssue[]): CheckIssue[] {
    return [...issues].sort((a, b) => {
        const catCmp = a.Category.localeCompare(b.Category);
        if (catCmp !== 0) {
            return catCmp;
        }
        const fileCmp = (a.File ?? '').localeCompare(b.File ?? '');
        if (fileCmp !== 0) {
            return fileCmp;
        }
        const lineCmp = (a.Line ?? 0) - (b.Line ?? 0);
        if (lineCmp !== 0) {
            return lineCmp;
        }
        const codeCmp = a.Code.localeCompare(b.Code);
        if (codeCmp !== 0) {
            return codeCmp;
        }
        const selectorCmp = (a.Selector ?? '').localeCompare(b.Selector ?? '');
        if (selectorCmp !== 0) {
            return selectorCmp;
        }
        return (a.TimestampSeconds ?? 0) - (b.TimestampSeconds ?? 0);
    });
}

const HTML_SCRIPT_TAG_ATTR_REGEX = /\b(src|href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;

function scanHtmlFile(file: RenderCompositionFile, authoredFilePaths: ReadonlySet<string>): CheckIssue[] {
    const issues: CheckIssue[] = [];
    const html = file.Content;

    for (const rule of HTML_NETWORK_TAG_RULES) {
        for (const match of html.matchAll(rule.Regex)) {
            const line = computeLineNumber(html, match.index ?? 0);
            issues.push(buildNetworkApiIssue(file.Path, line, rule.Label));
        }
    }

    for (const match of html.matchAll(HTML_URL_ATTR_REGEX)) {
        const attrName = match[1] ?? 'attr';
        const rawUrl = decodeHtmlEntities((match[2] ?? match[3] ?? match[4] ?? '').trim());
        const line = computeLineNumber(html, match.index ?? 0);
        const issue = checkUrlReference(rawUrl, file.Path, line, `HTML attribute "${attrName}"`);
        if (issue) {
            issues.push(issue);
        }
    }

    for (const scriptTagMatch of html.matchAll(/<script\b([^>]*)>/gi)) {
        const attrs = scriptTagMatch[1] ?? '';
        const tagLine = computeLineNumber(html, scriptTagMatch.index ?? 0);
        for (const attrMatch of attrs.matchAll(HTML_SCRIPT_TAG_ATTR_REGEX)) {
            const attrName = attrMatch[1] ?? 'src';
            const rawUrl = decodeHtmlEntities((attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '').trim());
            if (!checkUrlReference(rawUrl, file.Path, tagLine, `HTML attribute "${attrName}"`)) {
                const targetIssue = checkScriptOrImportTarget(
                    rawUrl,
                    file.Path,
                    tagLine,
                    `HTML <script ${attrName}>`,
                    authoredFilePaths,
                );
                if (targetIssue) {
                    issues.push(targetIssue);
                }
            }
        }
    }

    for (const match of html.matchAll(HTML_SRCSET_ATTR_REGEX)) {
        const rawSrcset = decodeHtmlEntities((match[1] ?? match[2] ?? match[3] ?? '').trim());
        const line = computeLineNumber(html, match.index ?? 0);
        for (const candidate of rawSrcset.split(',')) {
            const urlPart = candidate.trim().split(/\s+/)[0] ?? '';
            const issue = checkUrlReference(urlPart, file.Path, line, 'HTML attribute "srcset"');
            if (issue) {
                issues.push(issue);
            }
        }
    }

    for (const match of html.matchAll(HTML_STYLE_ATTR_REGEX)) {
        const styleContent = decodeHtmlEntities(match[1] ?? match[2] ?? '');
        const line = computeLineNumber(html, match.index ?? 0);
        issues.push(...scanCssBlock(styleContent, file.Path, line));
    }

    for (const match of html.matchAll(HTML_EVENT_HANDLER_ATTR_REGEX)) {
        const handlerJs = decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '');
        const line = computeLineNumber(html, match.index ?? 0);
        issues.push(...scanJsBlock(handlerJs, file.Path, line, authoredFilePaths));
    }

    for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
        const block = match[1] ?? '';
        const line = computeLineNumber(html, match.index ?? 0);
        issues.push(...scanCssBlock(block, file.Path, line));
    }

    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        const block = match[1] ?? '';
        const line = computeLineNumber(html, match.index ?? 0);
        issues.push(...scanJsBlock(block, file.Path, line, authoredFilePaths));
    }

    return issues;
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex: string) => {
            const code = Number.parseInt(hex, 16);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
        })
        .replace(/&#([0-9]+);?/g, (_, dec: string) => {
            const code = Number.parseInt(dec, 10);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
        })
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&');
}

function scanCssBlock(css: string, filePath: string, baseLine: number): CheckIssue[] {
    const issues: CheckIssue[] = [];
    for (const match of css.matchAll(CSS_IMPORT_REGEX)) {
        const rawUrl = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        const line = baseLine + computeLineNumber(css, match.index ?? 0) - 1;
        const issue = checkUrlReference(rawUrl, filePath, line, 'CSS @import');
        if (issue) {
            issues.push(issue);
        }
    }
    for (const match of css.matchAll(CSS_URL_REGEX)) {
        const rawUrl = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        const line = baseLine + computeLineNumber(css, match.index ?? 0) - 1;
        const issue = checkUrlReference(rawUrl, filePath, line, 'CSS url()');
        if (issue) {
            issues.push(issue);
        }
    }
    return issues;
}

function scanJsBlock(
    js: string,
    filePath: string,
    baseLine: number,
    authoredFilePaths: ReadonlySet<string>,
): CheckIssue[] {
    const issues: CheckIssue[] = [];

    for (const rule of JS_NETWORK_API_RULES) {
        for (const match of js.matchAll(rule.Regex)) {
            const line = baseLine + computeLineNumber(js, match.index ?? 0) - 1;
            issues.push(buildNetworkApiIssue(filePath, line, rule.Label));
        }
    }

    for (const regex of [JS_IMPORT_FROM_REGEX, JS_SIDE_EFFECT_IMPORT_REGEX, JS_DYNAMIC_IMPORT_REGEX]) {
        for (const match of js.matchAll(regex)) {
            const specifier = (match[1] ?? match[2] ?? match[3] ?? '').trim();
            const line = baseLine + computeLineNumber(js, match.index ?? 0) - 1;
            const issue = checkScriptOrImportTarget(
                specifier,
                filePath,
                line,
                'JS import specifier',
                authoredFilePaths,
            );
            if (issue) {
                issues.push(issue);
            }
        }
    }

    for (const match of js.matchAll(JS_STRING_LITERAL_REGEX)) {
        const literal = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        if (!looksLikeUrlOrTraversalInLiteral(literal)) {
            continue;
        }
        const line = baseLine + computeLineNumber(js, match.index ?? 0) - 1;
        const issue = checkUrlReference(literal, filePath, line, 'JS string literal');
        if (issue) {
            issues.push(issue);
        }
    }

    return issues;
}

function checkScriptOrImportTarget(
    rawUrl: string,
    filePath: string,
    line: number,
    contextLabel: string,
    authoredFilePaths: ReadonlySet<string>,
): CheckIssue | null {
    const urlIssue = checkUrlReference(rawUrl, filePath, line, contextLabel);
    if (urlIssue) {
        return urlIssue;
    }
    const trimmed = rawUrl.trim();
    const resolved = resolveBundleRelativePath(filePath, trimmed);
    if (!resolved || !authoredFilePaths.has(resolved)) {
        return {
            Code: MJ_NON_BUNDLE_URL_CODE,
            Category: 'RemoteUrl',
            Severity: 'Error',
            Message: `Script or module reference "${trimmed}" in ${contextLabel} must resolve to an entry in bundle.Files.`,
            File: filePath,
            Line: line,
        };
    }
    return null;
}

function looksLikeUrlOrTraversalInLiteral(literal: string): boolean {
    if (!literal || literal.includes(' ') || literal.includes('\n')) {
        return false;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(literal)) {
        return true;
    }
    if (/^\/\/[a-zA-Z0-9._-]+/.test(literal)) {
        return true;
    }
    if (/(?:^|\/)\.\.(?:\/|$)/.test(literal)) {
        return true;
    }
    return false;
}

function checkUrlReference(
    rawUrl: string,
    filePath: string,
    line: number,
    contextLabel: string,
): CheckIssue | null {
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('#')) {
        return null;
    }
    if (/^(?:data|blob):/i.test(trimmed)) {
        return null;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith('//')) {
        return {
            Code: MJ_NON_BUNDLE_URL_CODE,
            Category: 'RemoteUrl',
            Severity: 'Error',
            Message: `Forbidden non-bundle URL "${trimmed}" in ${contextLabel}; only bundle-relative paths, data:, and blob: are allowed.`,
            File: filePath,
            Line: line,
        };
    }
    if (escapesBundleRoot(filePath, trimmed)) {
        return {
            Code: MJ_NON_BUNDLE_URL_CODE,
            Category: 'RemoteUrl',
            Severity: 'Error',
            Message: `Relative path "${trimmed}" in ${contextLabel} resolves outside the bundle root.`,
            File: filePath,
            Line: line,
        };
    }
    return null;
}

function escapesBundleRoot(fromFilePath: string, referenceUrl: string): boolean {
    const cleanRef = (referenceUrl.split(/[?#]/)[0] ?? '').replace(/\\/g, '/');
    if (!cleanRef) {
        return false;
    }
    return resolveBundleRelativePath(fromFilePath, referenceUrl) === null;
}

function resolveBundleRelativePath(fromFilePath: string, referenceUrl: string): string | null {
    const trimmed = referenceUrl.trim();
    if (
        !trimmed ||
        trimmed.startsWith('#') ||
        /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ||
        trimmed.startsWith('//')
    ) {
        return null;
    }
    const cleanRef = (trimmed.split(/[?#]/)[0] ?? '').replace(/\\/g, '/');
    if (!cleanRef) {
        return null;
    }
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

function buildNetworkApiIssue(filePath: string, line: number, label: string): CheckIssue {
    return {
        Code: MJ_NETWORK_API_CODE,
        Category: 'RemoteUrl',
        Severity: 'Error',
        Message: `Forbidden network or navigation API (${label}) detected in "${filePath}".`,
        File: filePath,
        Line: line,
    };
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

function deduplicateIssues(issues: readonly CheckIssue[]): CheckIssue[] {
    const seen = new Set<string>();
    const result: CheckIssue[] = [];
    for (const issue of issues) {
        const key = `${issue.Code}|${issue.Category}|${issue.File ?? ''}|${issue.Line ?? 0}|${issue.Message}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(issue);
        }
    }
    return result;
}
