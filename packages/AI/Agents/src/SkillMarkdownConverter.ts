/**
 * @fileoverview Pure parse/serialize for the portable SKILL.md format — no database or engine
 * dependency, so this is fully unit-testable in isolation. `SkillImportExportService` builds on
 * top of this to do the actual name<->ID resolution and entity persistence.
 *
 * ## Format
 * ```markdown
 * ---
 * name: Report Builder
 * description: Generates formatted business reports from query results
 * category: Reporting
 * actions:
 *   - Run Query
 *   - Generate PDF
 * codeOnlyActions:
 *   - Generate PDF
 * subAgents:
 *   - Report Formatter Agent
 * license: MIT
 * metadata:
 *   version: 1.2.0
 * ---
 *
 * Instructions body — plain markdown, appended to an accepting agent's system
 * prompt when the skill is activated.
 * ```
 *
 * ## How the frontmatter is read
 *
 * MJ models six keys: `name`, `description`, `category`, `actions`, `subAgents`, `codeOnlyActions`.
 * Written the way MJ has always written them, they are read **literally**, exactly as MJ's parser
 * read them before it used YAML:
 * - a value on the key's own line is its text, verbatim. Surrounding quotes are removed, unescaping
 *   only `\"` inside double quotes and `''` inside single quotes. So `Triage issues #123`, `1.10`,
 *   `null`, `[Draft] report`, `@team` and `C:\temp` all mean what they say;
 * - a list is `- item` lines, each read the same way, or a single comma-separated line
 *   (`codeOnlyActions: Generate PDF, Send Email`, optionally in `[...]`).
 *
 * Everything else is YAML (the `yaml` package): every other key (`license`, `metadata`, `allowed-tools`,
 * a key a newer MJ or another tool adds), and one of MJ's keys written in a multi-line form (a
 * `description: >-` block, an indented continuation line). That keeps an Anthropic-style SKILL.md
 * parsing as written, while a file MJ exported before it used YAML, or that someone wrote to the old
 * rules, still means what it meant. If YAML rejects the other keys and each of them is a flat
 * `key: value` or `- item` list, they are read literally too (the old parser's semantics).
 *
 * Unmodelled keys are kept verbatim in {@link SkillMarkdownFrontmatter.extra} and written back by
 * {@link SkillMarkdownConverter.Serialize}, so a round trip loses nothing. Serialize quotes with single
 * quotes, which both readers agree on. (A C0 control character in one of MJ's values can only be written
 * as a YAML double-quoted escape, which the literal reading keeps as text.)
 *
 * `codeOnlyActions` (optional) names the subset of `actions` bundled with `AISkillAction.ExposeToModel = 0`:
 * kept with the skill for export and tooling, but left out of the agent's run — not described to the
 * model, not executable by the agent; application code invokes them. Written on export only when the
 * skill has such rows, so files exported before the key existed are unchanged. A file without the
 * key expresses no opinion about the flag (the importer keeps surviving rows' flags as they were); a
 * file with the key but no names under it says "nothing is code-only", which is how an author puts the
 * last code-only action back into the run — delete its line, keep the key.
 *
 * @module @memberjunction/ai-agents
 */
import { isScalar, parseDocument, stringify as stringifyYaml } from 'yaml';
import type { JSONObject, JSONValue } from '@memberjunction/ai';

/**
 * The frontmatter fields of a SKILL.md file. `actions`/`subAgents` are Action/Agent NAMES (not
 * IDs) — portability across MJ instances means names are the only stable cross-instance
 * reference; ID resolution happens at import time via {@link SkillImportExportService}.
 */
export interface SkillMarkdownFrontmatter {
    name: string;
    description?: string;
    category?: string;
    actions?: string[];
    subAgents?: string[];
    /** Names within `actions` whose `AISkillAction.ExposeToModel` is 0. Absent = the file expresses no opinion. */
    codeOnlyActions?: string[];
    /** The `license` key, when it is a string. Kept verbatim in {@link extra} whatever its shape. */
    license?: string;
    /** `metadata.version` as written — the version the skill's author declares. Also kept verbatim in {@link extra}. */
    version?: string;
    /** Every key MJ does not model, verbatim, so {@link SkillMarkdownConverter.Serialize} can write it back. */
    extra?: JSONObject;
}

/**
 * Result of parsing a SKILL.md file: the frontmatter fields plus the Instructions body.
 */
export interface ParsedSkillMarkdown {
    frontmatter: SkillMarkdownFrontmatter;
    instructions: string;
}

/**
 * Inputs to {@link SkillMarkdownConverter.Serialize} — the export-side counterpart of
 * {@link ParsedSkillMarkdown}, using resolved names (not IDs) for portability.
 */
export interface SerializeSkillMarkdownParams {
    name: string;
    description?: string;
    category?: string;
    actionNames?: string[];
    /** Subset of `actionNames` bundled with `ExposeToModel = 0`; emitted as `codeOnlyActions` when non-empty. */
    codeOnlyActionNames?: string[];
    subAgentNames?: string[];
    /** Keys MJ does not model (from a parse, or `AISkill.Frontmatter`), written after the modelled ones. */
    extraFrontmatter?: JSONObject;
    instructions: string;
}

const FRONTMATTER_DELIMITER = '---';

/** The frontmatter keys whose value is a list of names. */
type SkillListKey = 'actions' | 'subAgents' | 'codeOnlyActions';
const LIST_KEYS: readonly SkillListKey[] = ['actions', 'subAgents', 'codeOnlyActions'];
const LIST_KEY_SET: ReadonlySet<string> = new Set<string>(LIST_KEYS);
/** The keys MJ models; everything else lands in `extra`. */
const MODELLED_KEYS: ReadonlySet<string> = new Set<string>(['name', 'description', 'category', ...LIST_KEYS]);

/** A top-level `key: value` line. Column 0 only: the key must start the line. */
const KEY_LINE_RE = /^([A-Za-z_][\w-]*)\s*:(.*)$/;

/** One top-level key and the lines under it (indented, `- item` and blank lines). */
interface FrontmatterEntry {
    /** The key, or null for a top-level line that is not `key: ...` (left to YAML). */
    Key: string | null;
    /** The text after the colon, trimmed. */
    Inline: string;
    /** The lines below the key line that belong to it. */
    Under: string[];
    /** Every source line of the entry, in order, for YAML. */
    Lines: string[];
}

/** The frontmatter as plain data, plus `metadata.version` exactly as written. */
interface FrontmatterData {
    data: JSONObject;
    version?: string;
}

export class SkillMarkdownConverter {
    /**
     * Parses a SKILL.md document into its frontmatter + instructions body. Throws with a clear
     * message on malformed input (missing/unterminated frontmatter block, invalid YAML, a
     * frontmatter that is not a key/value mapping, missing required `name`, empty body).
     */
    public static Parse(markdownText: string): ParsedSkillMarkdown {
        const { yamlText, instructions } = this.splitDocument(markdownText);
        const { data, version } = this.readFrontmatter(yamlText);
        const frontmatter = this.toFrontmatter(data, version);
        if (!frontmatter.name) {
            throw new Error('Invalid SKILL.md: frontmatter is missing the required "name" field');
        }
        if (!instructions) {
            throw new Error('Invalid SKILL.md: the Instructions body (after the frontmatter block) is empty');
        }
        return { frontmatter, instructions };
    }

    /**
     * Serializes skill data into a SKILL.md document. The inverse of {@link Parse}. Values are written
     * with the `yaml` library, quoting with single quotes where a value needs quoting, so any YAML
     * reader and {@link Parse}'s literal reading of MJ's keys agree on every value.
     */
    public static Serialize(params: SerializeSkillMarkdownParams): string {
        const doc: JSONObject = { name: params.name };
        if (params.description) doc.description = params.description;
        if (params.category) doc.category = params.category;
        if (params.actionNames?.length) doc.actions = params.actionNames;
        if (params.codeOnlyActionNames?.length) doc.codeOnlyActions = params.codeOnlyActionNames;
        if (params.subAgentNames?.length) doc.subAgents = params.subAgentNames;
        for (const [key, value] of Object.entries(params.extraFrontmatter ?? {})) {
            if (!MODELLED_KEYS.has(key)) doc[key] = value; // a modelled key always comes from its column
        }
        // lineWidth 0: never fold a long description across lines.
        const yamlText = stringifyYaml(doc, { lineWidth: 0, singleQuote: true }).trimEnd();
        return [FRONTMATTER_DELIMITER, yamlText, FRONTMATTER_DELIMITER, '', params.instructions.trim(), ''].join('\n');
    }

    /**
     * Splits a document into the text between the two `---` lines and the trimmed body after them. Only
     * a `---` at column 0 closes the frontmatter; an indented one is content (inside a block scalar).
     */
    private static splitDocument(markdownText: string): { yamlText: string; instructions: string } {
        const lines = markdownText.replace(/\r\n/g, '\n').trim().split('\n');
        if (lines[0]?.trimEnd() !== FRONTMATTER_DELIMITER) {
            throw new Error('Invalid SKILL.md: expected a frontmatter block starting with "---"');
        }
        const closingIndex = lines.findIndex((line, idx) => idx > 0 && line.trimEnd() === FRONTMATTER_DELIMITER);
        if (closingIndex === -1) {
            throw new Error('Invalid SKILL.md: frontmatter block is not terminated with a closing "---"');
        }
        return {
            yamlText: lines.slice(1, closingIndex).join('\n'),
            instructions: lines.slice(closingIndex + 1).join('\n').trim()
        };
    }

    /** MJ's keys from the literal reading where it applies, everything else from YAML (see the file overview). */
    private static readFrontmatter(yamlText: string): FrontmatterData {
        const literal: JSONObject = {};
        const rest: FrontmatterEntry[] = [];
        for (const entry of this.groupEntries(yamlText.split('\n'))) {
            const value = entry.Key !== null && MODELLED_KEYS.has(entry.Key)
                ? this.readLiteral(entry, LIST_KEY_SET.has(entry.Key))
                : undefined;
            if (entry.Key !== null && value !== undefined) {
                literal[entry.Key] = value;
            } else {
                rest.push(entry);
            }
        }
        const parsed = this.parseYamlEntries(rest);
        return { data: { ...parsed.data, ...literal }, version: parsed.version };
    }

    /** Groups lines into top-level entries. A column-0 `#` line is a comment and carries no data. */
    private static groupEntries(lines: string[]): FrontmatterEntry[] {
        const entries: FrontmatterEntry[] = [];
        for (const line of lines) {
            if (line.startsWith('#')) continue;
            const key = KEY_LINE_RE.exec(line);
            const last = entries[entries.length - 1];
            if (key) {
                entries.push({ Key: key[1], Inline: key[2].trim(), Under: [], Lines: [line] });
            } else if (last && (line.trim() === '' || /^\s/.test(line) || listItemText(line) !== null)) {
                last.Under.push(line);
                last.Lines.push(line);
            } else {
                entries.push({ Key: null, Inline: '', Under: [], Lines: [line] });
            }
        }
        return entries;
    }

    /**
     * The literal reading of an entry: its inline value, or its `- item` lines when `isList`. Undefined
     * when the entry uses a form only YAML reads (a block scalar, continuation lines, nested content, or
     * a scalar key with nothing on its line).
     */
    private static readLiteral(entry: FrontmatterEntry, isList: boolean): string | string[] | undefined {
        const under = entry.Under.filter(line => line.trim() !== '');
        if (entry.Inline !== '') {
            if (under.length > 0) return undefined;
            return isList ? splitInlineList(entry.Inline) : unquote(entry.Inline);
        }
        if (!isList) return undefined;
        const items: string[] = [];
        for (const line of under) {
            const item = listItemText(line);
            if (item === null) return undefined;
            items.push(unquote(item));
        }
        return items.filter(item => item.length > 0);
    }

    /** YAML for the entries the literal reading left; if YAML rejects them, their literal reading when every one has one. */
    private static parseYamlEntries(entries: FrontmatterEntry[]): FrontmatterData {
        const doc = parseDocument(entries.flatMap(entry => entry.Lines).join('\n'));
        if (doc.errors.length > 0) {
            const fallback = this.readLiteralExtras(entries);
            if (fallback) return { data: fallback };
            throw new Error(`Invalid SKILL.md frontmatter: ${doc.errors[0].message}`);
        }
        const data: JSONValue = doc.toJS() ?? {};
        if (!this.isMapping(data)) {
            throw new Error('Invalid SKILL.md frontmatter: expected "key: value" lines (a YAML mapping)');
        }
        // As written, so `version: 1.10` stays `1.10` rather than YAML's number 1.1.
        const node = doc.getIn(['metadata', 'version'], true);
        let version: string | undefined;
        if (isScalar(node) && node.value !== null) {
            version = (node.type === 'PLAIN' && node.source ? node.source : String(node.value)).trim() || undefined;
        }
        return { data, version };
    }

    /** The literal reading of every entry, or null when one has none. A key with nothing under it is absent. */
    private static readLiteralExtras(entries: FrontmatterEntry[]): JSONObject | null {
        const data: JSONObject = {};
        for (const entry of entries) {
            const blank = entry.Inline === '' && entry.Under.every(line => line.trim() === '');
            if (entry.Key === null) {
                if (entry.Lines.every(line => line.trim() === '')) continue;
                return null;
            }
            if (blank) continue;
            const value = this.readLiteral(entry, entry.Inline === '');
            if (value === undefined) return null;
            data[entry.Key] = value;
        }
        return data;
    }

    /** Maps the frontmatter data onto the modelled fields and keeps the rest in `extra`. */
    private static toFrontmatter(data: JSONObject, version: string | undefined): SkillMarkdownFrontmatter {
        const result: SkillMarkdownFrontmatter = {
            name: this.scalar(data, 'name') ?? '',
            description: this.scalar(data, 'description'),
            category: this.scalar(data, 'category'),
            version
        };
        for (const key of LIST_KEYS) {
            // A present key is a list even with nothing under it: for `codeOnlyActions`, absent means
            // "no opinion, keep each row's flag" and empty means "nothing is code-only".
            if (key in data) result[key] = this.list(data, key);
        }
        const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !MODELLED_KEYS.has(key)));
        if (Object.keys(extra).length > 0) {
            result.extra = extra;
            // A list- or mapping-valued license (SPDX expressions are sometimes written as a list) stays in `extra` only.
            result.license = typeof extra.license === 'string' ? extra.license.trim() || undefined : undefined;
        }
        return this.dropUndefined(result);
    }

    /** A scalar value as a trimmed string; undefined when absent, null or empty. Throws on a list or mapping. */
    private static scalar(data: JSONObject, key: string): string | undefined {
        const value = data[key];
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'object') {
            throw new Error(`Invalid SKILL.md frontmatter: "${key}" must be a single value, not a list or mapping`);
        }
        const text = String(value).trim();
        return text.length > 0 ? text : undefined;
    }

    /**
     * A list of names. `key:` with nothing under it is an empty list. A string is one comma-separated
     * list — `codeOnlyActions: Generate PDF, Send Email` names two actions, as it always has.
     */
    private static list(data: JSONObject, key: string): string[] {
        const value = data[key];
        if (value === null || value === undefined) return [];
        if (typeof value === 'string') return splitInlineList(value);
        const items = Array.isArray(value) ? value : [value];
        if (items.some(item => typeof item === 'object' && item !== null)) {
            throw new Error(`Invalid SKILL.md frontmatter: "${key}" must be a list of names`);
        }
        return items.filter(item => item !== null).map(item => String(item).trim()).filter(item => item.length > 0);
    }

    private static isMapping(value: JSONValue | undefined): value is JSONObject {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    /** Removes undefined-valued optional fields so an absent key stays absent (`toEqual`/`in` checks). */
    private static dropUndefined(fm: SkillMarkdownFrontmatter): SkillMarkdownFrontmatter {
        for (const key of Object.keys(fm) as (keyof SkillMarkdownFrontmatter)[]) {
            if (fm[key] === undefined) delete fm[key];
        }
        return fm;
    }
}

/**
 * The text of a `- item` line at any indentation, or null when the line is not one. Not a regex:
 * `/^\s*-\s+(.*)$/` backtracks quadratically on a long whitespace run that `.` cannot finish.
 */
function listItemText(line: string): string | null {
    const trimmed = line.trimStart();
    return trimmed.startsWith('-') && /\s/.test(trimmed[1] ?? '') ? trimmed.slice(1).trimStart() : null;
}

/**
 * One pair of surrounding quotes removed: `\"` is unescaped inside double quotes (what MJ's writer
 * produced before YAML), `''` inside single quotes (what it produces now). Nothing else is unescaped.
 */
function unquote(raw: string): string {
    const text = raw.trim();
    if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1).replace(/\\"/g, '"');
    if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
    return text;
}

/**
 * A one-line list: optional `[...]`, comma-separated, each item unquoted. Commas inside a quoted item
 * belong to it (`["Get, Set Var", Other]` is two names). A value quoted as a whole (`"A, B"`) is unwrapped
 * first and then split, which is how MJ's earlier parser read it.
 */
function splitInlineList(text: string): string[] {
    const trimmed = text.trim();
    const bracketed = trimmed.startsWith('[') && trimmed.endsWith(']');
    if (!bracketed && isWhollyQuoted(trimmed)) {
        return unquote(trimmed).split(',').map(item => item.trim()).filter(item => item.length > 0);
    }
    return splitOutsideQuotes(bracketed ? trimmed.slice(1, -1) : trimmed).map(unquote).filter(item => item.length > 0);
}

/** One quoted string with no unescaped matching quote inside it. */
function isWhollyQuoted(text: string): boolean {
    const quote = text[0];
    if (text.length < 2 || (quote !== '"' && quote !== "'") || text[text.length - 1] !== quote) {
        return false;
    }
    return splitOutsideQuotes(text).length === 1 && closingQuoteIndex(text, 0) === text.length - 1;
}

/**
 * Splits on commas that are not inside a quoted item; quotes are kept for `unquote`. A quote opens a quoted
 * item only at the item's start (after optional spaces), as in YAML: a mid-word apostrophe or inch mark
 * (`Get Today's Date`, `Send 5" Label`) is ordinary text and must not swallow the commas after it.
 */
function splitOutsideQuotes(text: string): string[] {
    const items: string[] = [];
    let start = 0;
    let index = 0;
    let atItemStart = true;
    while (index < text.length) {
        const ch = text[index];
        if (atItemStart && (ch === ' ' || ch === '\t')) {
            index++;
        } else if (atItemStart && (ch === '"' || ch === "'")) {
            index = closingQuoteIndex(text, index) + 1;
            atItemStart = false;
        } else if (ch === ',') {
            items.push(text.slice(start, index));
            start = ++index;
            atItemStart = true;
        } else {
            index++;
            atItemStart = false;
        }
    }
    items.push(text.slice(start));
    return items;
}

/** Index of the quote closing the one at `open` (`\"` escapes in double quotes, `''` in single); end of text if none. */
function closingQuoteIndex(text: string, open: number): number {
    const quote = text[open];
    let index = open + 1;
    while (index < text.length) {
        if (quote === '"' && text[index] === '\\') {
            index += 2;
        } else if (text[index] === quote) {
            if (quote === "'" && text[index + 1] === "'") {
                index += 2;
            } else {
                return index;
            }
        } else {
            index++;
        }
    }
    return text.length - 1;
}
