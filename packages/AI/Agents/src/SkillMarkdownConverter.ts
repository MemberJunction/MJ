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
 * The frontmatter is real YAML (the `yaml` package), so an Anthropic-style SKILL.md parses as
 * written. MJ models six keys; every other key (`license`, `metadata`, `allowed-tools`, a key a
 * newer MJ or another tool adds) is kept verbatim in {@link SkillMarkdownFrontmatter.extra} and
 * written back by {@link SkillMarkdownConverter.Serialize}, so a round trip loses nothing.
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
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
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
    /** The `license` key, when it is a scalar. Also kept verbatim in {@link extra}. */
    license?: string;
    /** `metadata.version` — the version the skill's author declares. Also kept verbatim in {@link extra}. */
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
/** The keys MJ models; everything else lands in `extra`. */
const MODELLED_KEYS: ReadonlySet<string> = new Set<string>(['name', 'description', 'category', ...LIST_KEYS]);

export class SkillMarkdownConverter {
    /**
     * Parses a SKILL.md document into its frontmatter + instructions body. Throws with a clear
     * message on malformed input (missing/unterminated frontmatter block, invalid YAML, a
     * frontmatter that is not a key/value mapping, missing required `name`, empty body).
     */
    public static Parse(markdownText: string): ParsedSkillMarkdown {
        const { yamlText, instructions } = this.splitDocument(markdownText);
        const frontmatter = this.toFrontmatter(this.parseMapping(yamlText));
        if (!frontmatter.name) {
            throw new Error('Invalid SKILL.md: frontmatter is missing the required "name" field');
        }
        if (!instructions) {
            throw new Error('Invalid SKILL.md: the Instructions body (after the frontmatter block) is empty');
        }
        return { frontmatter, instructions };
    }

    /**
     * Serializes skill data into a SKILL.md document. The inverse of {@link Parse}.
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
        const yamlText = stringifyYaml(doc, { lineWidth: 0 }).trimEnd();
        return [FRONTMATTER_DELIMITER, yamlText, FRONTMATTER_DELIMITER, '', params.instructions.trim(), ''].join('\n');
    }

    /** Splits a document into the text between the two `---` lines and the trimmed body after them. */
    private static splitDocument(markdownText: string): { yamlText: string; instructions: string } {
        const lines = markdownText.replace(/\r\n/g, '\n').trim().split('\n');
        if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
            throw new Error('Invalid SKILL.md: expected a frontmatter block starting with "---"');
        }
        const closingIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === FRONTMATTER_DELIMITER);
        if (closingIndex === -1) {
            throw new Error('Invalid SKILL.md: frontmatter block is not terminated with a closing "---"');
        }
        return {
            yamlText: lines.slice(1, closingIndex).join('\n'),
            instructions: lines.slice(closingIndex + 1).join('\n').trim()
        };
    }

    /** YAML-parses the frontmatter and insists on a key/value mapping (an empty block is an empty one). */
    private static parseMapping(yamlText: string): JSONObject {
        let parsed: JSONValue;
        try {
            parsed = parseYaml(yamlText) ?? {};
        } catch (e) {
            throw new Error(`Invalid SKILL.md frontmatter: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (!this.isMapping(parsed)) {
            throw new Error('Invalid SKILL.md frontmatter: expected "key: value" lines (a YAML mapping)');
        }
        return parsed;
    }

    /** Maps the parsed YAML onto the modelled fields and keeps the rest in `extra`. */
    private static toFrontmatter(data: JSONObject): SkillMarkdownFrontmatter {
        const result: SkillMarkdownFrontmatter = {
            name: this.scalar(data, 'name') ?? '',
            description: this.scalar(data, 'description'),
            category: this.scalar(data, 'category')
        };
        for (const key of LIST_KEYS) {
            // A present key is a list even with nothing under it: for `codeOnlyActions`, absent means
            // "no opinion, keep each row's flag" and empty means "nothing is code-only".
            if (key in data) result[key] = this.list(data, key);
        }
        const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !MODELLED_KEYS.has(key)));
        if (Object.keys(extra).length > 0) {
            result.extra = extra;
            result.license = this.scalar(extra, 'license');
            const metadata = extra.metadata;
            result.version = this.isMapping(metadata) ? this.scalar(metadata, 'version') : undefined;
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

    /** A list of names. `key:` with nothing under it is an empty list; a lone scalar is a one-item list. */
    private static list(data: JSONObject, key: string): string[] {
        const value = data[key];
        if (value === null || value === undefined) return [];
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
