/**
 * Pure, DOM-free syntax highlighter for React Native.
 *
 * Uses `prismjs`'s tokenizer (no DOM, no CSS classes) to turn source code into
 * a flat list of colored text runs that callers render as `<Text>` spans. The
 * color map is keyed off the app design tokens so highlighting stays on-brand
 * and keeps reasonable contrast on the light code background (`Colors.surface2`).
 *
 * Only a curated set of common languages is registered (imported for their
 * side effect of attaching a grammar to the shared `Prism` object). Any
 * unknown/unregistered language falls back to a single plain-text run.
 */
import * as Prism from 'prismjs';
// Grammar registrations (side-effect imports). Order matters: dependents such
// as `typescript` (needs `javascript`) must come after their base grammar.
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-yaml';
import { Colors } from '@/theme/tokens';

/** A contiguous run of source text rendered in a single color. */
export type HighlightRun = { text: string; color: string };

/** Base color for plain, un-tokenized source text. */
const PLAIN_COLOR = Colors.ink;

/**
 * Token-type → color map. Prism token types (and aliases) map to a small,
 * high-contrast syntax palette drawn from the design tokens.
 */
const TOKEN_COLORS: Record<string, string> = {
    comment: Colors.ink3,
    prolog: Colors.ink3,
    doctype: Colors.ink3,
    cdata: Colors.ink3,
    punctuation: Colors.ink2,
    property: Colors.brand,
    tag: Colors.brand,
    boolean: Colors.warn,
    number: Colors.agentAnalyst,
    constant: Colors.warn,
    symbol: Colors.warn,
    deleted: Colors.danger,
    selector: Colors.agentForecaster,
    'attr-name': Colors.agentAnalyst,
    string: Colors.agentForecaster,
    char: Colors.agentForecaster,
    builtin: Colors.agentResearch,
    inserted: Colors.positive,
    operator: Colors.ink2,
    entity: Colors.brand,
    url: Colors.brand,
    'attr-value': Colors.agentForecaster,
    atrule: Colors.agentResearch,
    keyword: Colors.agentResearch,
    function: Colors.brand,
    'class-name': Colors.agentEmailDrafter,
    regex: Colors.agentAnalyst,
    important: Colors.danger,
    variable: Colors.agentAnalyst,
    parameter: Colors.ink,
};

/**
 * Map a caller-supplied language hint to a registered Prism grammar id.
 * Handles the common short aliases (`ts`, `js`, `sh`, `yml`, `html`, …).
 */
function resolveLanguageId(language: string | undefined): string | undefined {
    if (!language) return undefined;
    const key = language.trim().toLowerCase();
    const aliases: Record<string, string> = {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        node: 'javascript',
        sh: 'bash',
        shell: 'bash',
        zsh: 'bash',
        py: 'python',
        yml: 'yaml',
        html: 'markup',
        xml: 'markup',
        svg: 'markup',
    };
    return aliases[key] ?? key;
}

/** Color for a token type, considering its aliases; falls back to `inherited`. */
function colorForToken(type: string, alias: string | string[], inherited: string): string {
    if (TOKEN_COLORS[type]) return TOKEN_COLORS[type];
    const aliases = Array.isArray(alias) ? alias : alias ? [alias] : [];
    for (const a of aliases) {
        if (TOKEN_COLORS[a]) return TOKEN_COLORS[a];
    }
    return inherited;
}

/**
 * Walk Prism's (possibly nested) token stream, emitting flat colored runs.
 * Nested content inherits its parent token's color unless it has its own type.
 */
function flattenTokens(stream: Prism.TokenStream, inherited: string, out: HighlightRun[]): void {
    if (typeof stream === 'string') {
        if (stream.length > 0) out.push({ text: stream, color: inherited });
        return;
    }
    if (Array.isArray(stream)) {
        for (const item of stream) flattenTokens(item, inherited, out);
        return;
    }
    const color = colorForToken(stream.type, stream.alias, inherited);
    flattenTokens(stream.content, color, out);
}

/**
 * Highlight `code` for `language`, returning an ordered list of colored runs.
 * Falls back to a single plain run when the language is unknown or tokenization
 * fails for any reason.
 *
 * @param code     The raw source text.
 * @param language A language hint (e.g. `ts`, `python`, `json`); may be empty.
 * @returns        Ordered colored runs whose concatenated text equals `code`.
 */
export function highlightCode(code: string, language: string | undefined): HighlightRun[] {
    const grammarId = resolveLanguageId(language);
    const grammar = grammarId ? Prism.languages[grammarId] : undefined;
    if (!grammar) return [{ text: code, color: PLAIN_COLOR }];
    try {
        const tokens = Prism.tokenize(code, grammar);
        const runs: HighlightRun[] = [];
        flattenTokens(tokens, PLAIN_COLOR, runs);
        return runs.length > 0 ? runs : [{ text: code, color: PLAIN_COLOR }];
    } catch {
        return [{ text: code, color: PLAIN_COLOR }];
    }
}
