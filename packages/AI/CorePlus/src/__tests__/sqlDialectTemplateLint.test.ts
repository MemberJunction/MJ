/**
 * A LINT, not a list.
 *
 * The prompt half of the dialect fix is only durable if it is expressed as a
 * predicate. A prior sweep enumerated TemplateIDs and under-applied, which is
 * exactly how some shipped templates stayed T-SQL-only.
 *
 * So this test states the predicate and enforces it over the whole shipped
 * prompt tree: any prompt template that teaches a construct which is a HARD
 * ERROR on a non-SQL-Server tenant must also be parameterised by dialect (it
 * must reference the `_SQL_DIALECT*` system placeholders this package provides).
 *
 * A template added tomorrow that teaches `DATEADD` without a dialect token fails
 * here — nobody has to remember to add it to anything.
 *
 * Lives in ai-core-plus because this package owns the mechanism the templates are
 * required to use. It is skipped when the monorepo's `metadata/` tree is absent
 * (e.g. a published-package-only checkout).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const TEMPLATE_ROOT = join(REPO_ROOT, 'metadata', 'prompts', 'templates');

/**
 * Constructs that do not exist (or mean something else) outside T-SQL, plus the
 * two persona strings that told the model to write T-SQL outright. Every one of
 * these was present, unconditionally, in a shipped MemberJunction prompt.
 */
const TSQL_TEACHING = /Microsoft SQL Server|T-SQL|ISNULL\(|DATEADD\(|GETDATE\(/;

/** The mechanism a template must use to be dialect-parameterised. */
const DIALECT_TOKEN = /_SQL_DIALECT/;

/** Naming a platform outright, where `_SQL_DIALECT_NAME` belongs. */
const FIXED_PLATFORM_PERSONA = /Microsoft SQL Server|T-SQL|SQL Server|PostgreSQL/;

/**
 * The templates whose output MemberJunction executes as SQL. This is a spot-check
 * WITH the repo-wide lint above, not instead of it: the lint is what catches a
 * template nobody thought to add here.
 */
const SQL_WRITING_TEMPLATES = [
    'query-gen/sql-query-writer.template.md',
    'query-gen/sql-query-fixer.template.md',
    'query-gen/query-refiner.template.md',
    'query-builder/query-strategist-prompt.md',
    'views/smart-filter-generation.template.md',
    'research-agent/database-research-agent.md',
];

/**
 * Shared fragments pulled into the templates above. They must not name a platform
 * either, but they do NOT repeat the rules block — their host already renders it,
 * and briefing the model twice is noise.
 */
const SQL_WRITING_INCLUDES = [
    'query-gen/_includes/entity-metadata.md',
];

function markdownFilesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...markdownFilesUnder(full));
        } else if (entry.endsWith('.md')) {
            out.push(full);
        }
    }
    return out;
}

const available = existsSync(TEMPLATE_ROOT);

describe.skipIf(!available)('shipped prompt templates are parameterised by SQL dialect', () => {
    const templates = available ? markdownFilesUnder(TEMPLATE_ROOT) : [];

    it('finds the shipped prompt templates', () => {
        expect(templates.length).toBeGreaterThan(0);
    });

    it('no template teaches T-SQL without also being parameterised by dialect', () => {
        const offenders: string[] = [];

        for (const file of templates) {
            const content = readFileSync(file, 'utf8');
            if (TSQL_TEACHING.test(content) && !DIALECT_TOKEN.test(content)) {
                offenders.push(relative(REPO_ROOT, file));
            }
        }

        expect(
            offenders,
            'These templates teach T-SQL-only syntax unconditionally. Reference ' +
            '{{ _SQL_DIALECT_RULES | safe }} (and {{ _SQL_DIALECT_NAME }} for the persona) ' +
            'so the tenant\'s real platform decides, or remove the platform-specific construct.',
        ).toEqual([]);
    });

    it('the templates that DO carry the token reference placeholders this package resolves', () => {
        const known = new Set(['_SQL_DIALECT', '_SQL_DIALECT_NAME', '_SQL_DIALECT_RULES']);
        const unknown = new Set<string>();

        for (const file of templates) {
            const content = readFileSync(file, 'utf8');
            for (const match of content.matchAll(/_SQL_DIALECT[A-Z_]*/g)) {
                if (!known.has(match[0])) {
                    unknown.add(`${relative(REPO_ROOT, file)}: ${match[0]}`);
                }
            }
        }

        expect([...unknown], 'Template references a _SQL_DIALECT* placeholder that is not registered').toEqual([]);
    });

    it('every SQL-writing template carries the dialect RULES block', () => {
        // The repo-wide lint above is necessary but not sufficient: a template can
        // satisfy it by mentioning `_SQL_DIALECT_NAME` in a footnote while its
        // persona goes back to "expert in Microsoft SQL Server and T-SQL". These
        // are the templates whose output MemberJunction actually executes, so each
        // must carry the full briefing, not just a token.
        for (const relPath of SQL_WRITING_TEMPLATES) {
            const full = join(TEMPLATE_ROOT, relPath);
            expect(existsSync(full), `${relPath} not found`).toBe(true);
            expect(
                readFileSync(full, 'utf8'),
                `${relPath} must render {{ _SQL_DIALECT_RULES | safe }}`,
            ).toContain('_SQL_DIALECT_RULES');
        }
    });

    it('the shared SQL includes are dialect-parameterised too', () => {
        for (const relPath of SQL_WRITING_INCLUDES) {
            const full = join(TEMPLATE_ROOT, relPath);
            expect(existsSync(full), `${relPath} not found`).toBe(true);
            expect(readFileSync(full, 'utf8'), `${relPath} is not dialect-parameterised`).toMatch(DIALECT_TOKEN);
        }
    });

    it('no SQL-writing template declares a fixed platform persona', () => {
        // "You are the world's greatest expert in Microsoft SQL Server and T-SQL"
        // is the exact sentence that made a PostgreSQL tenant's agent write
        // bracketed identifiers and GETDATE(). The persona must come from
        // `_SQL_DIALECT_NAME`, so these strings must not reappear.
        const offenders: string[] = [];

        for (const relPath of [...SQL_WRITING_TEMPLATES, ...SQL_WRITING_INCLUDES]) {
            const content = readFileSync(join(TEMPLATE_ROOT, relPath), 'utf8');
            const hit = content.match(FIXED_PLATFORM_PERSONA);
            if (hit) {
                offenders.push(`${relPath}: "${hit[0]}"`);
            }
        }

        expect(offenders, 'Use {{ _SQL_DIALECT_NAME }} instead of naming a platform').toEqual([]);
    });
});
