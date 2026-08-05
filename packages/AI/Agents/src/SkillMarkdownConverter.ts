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
 * subAgents:
 *   - Report Formatter Agent
 * ---
 *
 * Instructions body — plain markdown, appended to an accepting agent's system
 * prompt when the skill is activated.
 * ```
 *
 * Deliberately NOT a general-purpose YAML parser — the frontmatter shape is fixed and small
 * (flat scalar keys + simple string-list keys), so a hand-rolled parser avoids taking on a new
 * dependency for a narrow, fully-controlled need.
 *
 * @module @memberjunction/ai-agents
 */

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
    subAgentNames?: string[];
    instructions: string;
}

const FRONTMATTER_DELIMITER = '---';

export class SkillMarkdownConverter {
    /**
     * Parses a SKILL.md document into its frontmatter + instructions body. Throws with a clear
     * message on malformed input (missing/unterminated frontmatter block, missing required `name`).
     */
    public static Parse(markdownText: string): ParsedSkillMarkdown {
        const normalized = markdownText.replace(/\r\n/g, '\n').trim();
        const lines = normalized.split('\n');

        if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
            throw new Error('Invalid SKILL.md: expected a frontmatter block starting with "---"');
        }

        const closingIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === FRONTMATTER_DELIMITER);
        if (closingIndex === -1) {
            throw new Error('Invalid SKILL.md: frontmatter block is not terminated with a closing "---"');
        }

        const frontmatterLines = lines.slice(1, closingIndex);
        const instructions = lines.slice(closingIndex + 1).join('\n').trim();

        const frontmatter = this.parseFrontmatterLines(frontmatterLines);
        if (!frontmatter.name || frontmatter.name.trim().length === 0) {
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
        const lines: string[] = [FRONTMATTER_DELIMITER];
        lines.push(`name: ${this.escapeScalar(params.name)}`);
        if (params.description) {
            lines.push(`description: ${this.escapeScalar(params.description)}`);
        }
        if (params.category) {
            lines.push(`category: ${this.escapeScalar(params.category)}`);
        }
        if (params.actionNames && params.actionNames.length > 0) {
            lines.push('actions:');
            for (const name of params.actionNames) {
                lines.push(`  - ${this.escapeScalar(name)}`);
            }
        }
        if (params.subAgentNames && params.subAgentNames.length > 0) {
            lines.push('subAgents:');
            for (const name of params.subAgentNames) {
                lines.push(`  - ${this.escapeScalar(name)}`);
            }
        }
        lines.push(FRONTMATTER_DELIMITER);
        lines.push('');
        lines.push(params.instructions.trim());
        lines.push('');

        return lines.join('\n');
    }

    /**
     * Parses the frontmatter line block into a {@link SkillMarkdownFrontmatter}. Supports flat
     * `key: value` scalars and `key:` followed by `  - item` list entries — nothing more complex
     * (no nested objects, no multiline scalars). Unknown keys are ignored rather than erroring, so
     * a future field addition doesn't break parsing of older SKILL.md files.
     */
    private static parseFrontmatterLines(lines: string[]): SkillMarkdownFrontmatter {
        const result: SkillMarkdownFrontmatter = { name: '' };
        let currentListKey: 'actions' | 'subAgents' | null = null;

        for (const rawLine of lines) {
            if (rawLine.trim().length === 0) {
                continue;
            }

            const listItemMatch = rawLine.match(/^\s*-\s+(.*)$/);
            if (listItemMatch && currentListKey) {
                const value = this.unescapeScalar(listItemMatch[1]);
                (result[currentListKey] ??= []).push(value);
                continue;
            }

            const keyValueMatch = rawLine.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
            if (!keyValueMatch) {
                throw new Error(`Invalid SKILL.md frontmatter line: "${rawLine}"`);
            }

            const [, key, rawValue] = keyValueMatch;
            const value = rawValue.trim();

            if (key === 'actions' || key === 'subAgents') {
                currentListKey = key;
                if (value.length > 0) {
                    // Inline list form, e.g. "actions: [Run Query, Generate PDF]" — split on commas.
                    const inline = value.replace(/^\[/, '').replace(/\]$/, '');
                    result[key] = inline.split(',').map(s => this.unescapeScalar(s.trim())).filter(s => s.length > 0);
                    currentListKey = null;
                }
                continue;
            }

            currentListKey = null;
            if (key === 'name' || key === 'description' || key === 'category') {
                result[key] = this.unescapeScalar(value);
            }
            // Unknown scalar keys are silently ignored (forward-compatibility).
        }

        return result;
    }

    /** Quotes a scalar value if it contains a colon or leading/trailing whitespace that would otherwise break the simple parser. */
    private static escapeScalar(value: string): string {
        if (/^\s|\s$|:/.test(value)) {
            return `"${value.replace(/"/g, '\\"')}"`;
        }
        return value;
    }

    /** Strips the quoting {@link escapeScalar} applies, if present. */
    private static unescapeScalar(value: string): string {
        const trimmed = value.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
            return trimmed.slice(1, -1).replace(/\\"/g, '"');
        }
        return trimmed;
    }
}
