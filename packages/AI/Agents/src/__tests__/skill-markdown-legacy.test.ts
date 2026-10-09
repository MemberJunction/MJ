/**
 * SkillMarkdownConverter — how the frontmatter is read now that it uses a YAML parser.
 *
 * MJ's own keys are read literally when they are written the way MJ always wrote them, so a SKILL.md
 * exported before the YAML parser (whose writer quoted only values with a colon or edge whitespace,
 * and escaped only `"`) still means what it meant. Everything else, and an MJ key in a multi-line
 * YAML form, is YAML. Each `it` below is one regression the YAML-only parser had.
 */
import { describe, it, expect } from 'vitest';
import { SkillMarkdownConverter } from '../SkillMarkdownConverter';

/** MJ's Serialize before it used YAML: a value with a colon or edge whitespace in double quotes, only `"` escaped. */
function legacyScalar(value: string): string {
    return /^\s|\s$|:/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/** A SKILL.md the way the pre-YAML MJ exported it. */
function legacyFile(p: { name: string; description?: string; category?: string; actions?: string[]; codeOnlyActions?: string[] }): string {
    const lines = ['---', `name: ${legacyScalar(p.name)}`];
    if (p.description) lines.push(`description: ${legacyScalar(p.description)}`);
    if (p.category) lines.push(`category: ${legacyScalar(p.category)}`);
    for (const key of ['actions', 'codeOnlyActions'] as const) {
        if (p[key]?.length) lines.push(`${key}:`, ...p[key].map(n => `  - ${legacyScalar(n)}`));
    }
    return [...lines, '---', '', 'Body.', ''].join('\n');
}

const parse = (lines: string[]) => SkillMarkdownConverter.Parse(['---', ...lines, '---', '', 'Body.'].join('\n')).frontmatter;

/** Values the old writer emitted unquoted or double-quoted that a YAML parser reads differently, or rejects. */
const AWKWARD = [
    'Triage issues #123',
    '[Draft] report',
    '@team handbook',
    '*starred',
    '&anchor value',
    '!important note',
    '%done',
    '> quoted',
    '| piped',
    '{braced}',
    '"Quoted" lead',
    '`ticked`',
    'C:\\temp: paths',
    'Paths: C:\\new\\folder\\bin',
    'Share: \\\\server\\share',
    'He said "go": now',
    '1.10',
    'null',
    '~',
    'true',
    '0x1F',
];

describe('a SKILL.md exported before the YAML parser still means what it meant', () => {
    it.each(AWKWARD)('name, description, category and action names: %s', value => {
        const fm = SkillMarkdownConverter.Parse(legacyFile({
            name: value, description: value, category: value, actions: [value, 'Run Query'], codeOnlyActions: [value],
        })).frontmatter;
        expect(fm.name).toBe(value);
        expect(fm.description).toBe(value);
        expect(fm.category).toBe(value);
        expect(fm.actions).toEqual([value, 'Run Query']);
        expect(fm.codeOnlyActions).toEqual([value]);
    });

    it('keeps the text after a " #" (YAML would drop it as a comment)', () => {
        expect(parse(['name: X', 'description: Triage issues #123']).description).toBe('Triage issues #123');
    });

    it('reads a backslash inside the old double-quoted form literally (YAML would reject \\p or turn \\n into a newline)', () => {
        expect(parse(['name: X', 'description: "C:\\path: x"']).description).toBe('C:\\path: x');
        expect(parse(['name: X', 'description: "C:\\new: x"']).description).toBe('C:\\new: x');
    });

    it('keeps 1.10, null and ~ as text (YAML would give 1.1, or no name at all)', () => {
        expect(parse(['name: 1.10']).name).toBe('1.10');
        expect(parse(['name: null']).name).toBe('null');
        expect(parse(['name: ~']).name).toBe('~');
    });
});

describe('codeOnlyActions written on one line', () => {
    it('is a comma-separated list, not one name', () => {
        expect(parse(['name: X', 'codeOnlyActions: Generate PDF, Send Email']).codeOnlyActions).toEqual(['Generate PDF', 'Send Email']);
        expect(parse(['name: X', 'actions: Run Query, Generate PDF']).actions).toEqual(['Run Query', 'Generate PDF']);
    });

    it('is still a comma-separated list in a file whose other keys are YAML', () => {
        const fm = parse(['name: X', 'license: MIT', 'metadata:', '  version: 1.0.0', 'codeOnlyActions: Generate PDF, Send Email']);
        expect(fm.codeOnlyActions).toEqual(['Generate PDF', 'Send Email']);
        expect(fm.license).toBe('MIT');
    });

    it('is split when YAML reads it as a string (a multi-line form)', () => {
        expect(parse(['name: X', 'codeOnlyActions: >-', '  Generate PDF,', '  Send Email']).codeOnlyActions).toEqual(['Generate PDF', 'Send Email']);
    });
});

describe('YAML is still used for what MJ does not model, and for multi-line forms', () => {
    it('reads license, a metadata map and unknown keys as YAML', () => {
        const fm = parse(['name: pdf', 'license: Apache-2.0', 'allowed-tools: [Read, Grep]', 'metadata:', '  version: 1.4.0', '  tags: [a, b]', 'futureKey: 42']);
        expect(fm.extra).toEqual({ license: 'Apache-2.0', 'allowed-tools': ['Read', 'Grep'], metadata: { version: '1.4.0', tags: ['a', 'b'] }, futureKey: 42 });
        expect(fm.version).toBe('1.4.0');
    });

    it('keeps metadata.version as written (1.10, not 1.1)', () => {
        expect(parse(['name: X', 'metadata:', '  version: 1.10']).version).toBe('1.10');
        expect(parse(['name: X', 'metadata:', '  version: "2.0"']).version).toBe('2.0');
    });

    it('reads a folded or literal block for an MJ key as YAML', () => {
        expect(parse(['name: X', 'description: >-', '  Use this skill', '  for PDFs.']).description).toBe('Use this skill for PDFs.');
        expect(parse(['name: X', 'description: |', '  Line one', '  Line two']).description).toBe('Line one\nLine two');
        expect(parse(['name: X', 'description: Use this skill', '  for PDFs.']).description).toBe('Use this skill for PDFs.');
    });

    it('removes single quotes the YAML way', () => {
        expect(parse(["name: 'It''s: done'"]).name).toBe("It's: done");
    });

    it('ignores comment lines, wherever they sit', () => {
        expect(parse(['# a comment', 'name: X', 'actions:', '# between the key and its items', '  - Run Query']).actions).toEqual(['Run Query']);
    });

    it('accepts a list- or mapping-valued license without throwing, and keeps it', () => {
        const list = parse(['name: X', 'license:', '  - MIT', '  - Apache-2.0']);
        expect(list.license).toBeUndefined();
        expect(list.extra).toEqual({ license: ['MIT', 'Apache-2.0'] });
        const map = parse(['name: X', 'license:', '  spdx: MIT', '  file: LICENSE.txt']);
        expect(map.license).toBeUndefined();
        expect(map.extra?.license).toEqual({ spdx: 'MIT', file: 'LICENSE.txt' });
    });

    it('falls back to the literal reading when YAML rejects flat keys MJ does not model', () => {
        const fm = parse(['name: X', 'owner: @team', 'tags:', '  - [draft']);
        expect(fm.name).toBe('X');
        expect(fm.extra).toEqual({ owner: '@team', tags: ['[draft'] });
    });
});

describe('the frontmatter block', () => {
    it('is closed only by a --- at column 0, not by an indented one inside a block scalar', () => {
        const md = ['---', 'name: X', 'description: |', '  Before', '  ---', '  After', '---', '', 'Body.'].join('\n');
        const { frontmatter, instructions } = SkillMarkdownConverter.Parse(md);
        expect(frontmatter.description).toBe('Before\n---\nAfter');
        expect(instructions).toBe('Body.');
    });
});

describe('Serialize -> Parse is exact for awkward values', () => {
    const values = [
        ...AWKWARD,
        'plain', 'a: b', "It's: done", 'a\\b: c', 'C:\\temp', '"quoted"', "'single'", 'x # y', '- dash', '? q',
        'dq "in" side: z', 'back\\slash "q": z', 'é ü 中文: x', 'tab\there: x', 'a, b',
    ];

    it.each(values)('%s', value => {
        const md = SkillMarkdownConverter.Serialize({
            name: value, description: value, category: value, actionNames: [value, 'Run Query'], codeOnlyActionNames: [value], subAgentNames: [value], instructions: 'Body.',
        });
        const fm = SkillMarkdownConverter.Parse(md).frontmatter;
        expect(fm).toMatchObject({ name: value, description: value, category: value, actions: [value, 'Run Query'], codeOnlyActions: [value], subAgents: [value] });
    });

    it('a multi-line description', () => {
        const description = 'First line: with a colon\n  indented # not a comment\nlast';
        const md = SkillMarkdownConverter.Serialize({ name: 'X', description, instructions: 'Body.' });
        expect(SkillMarkdownConverter.Parse(md).frontmatter.description).toBe(description);
    });
});

describe('inline lists with quoted items', () => {
    it.each([
        ['actions: ["Get, Set Var", Other]', 'actions', ['Get, Set Var', 'Other']],
        ["actions: ['It''s, fine', Next]", 'actions', ["It's, fine", 'Next']],
        ['codeOnlyActions: "Send Email, Fast"', 'codeOnlyActions', ['Send Email', 'Fast']],
        ['codeOnlyActions: Generate PDF, Send Email', 'codeOnlyActions', ['Generate PDF', 'Send Email']],
        ["actions: Get Today's Date, Send Email", 'actions', ["Get Today's Date", 'Send Email']],
        ["actions: [Bob's Report, Today's Date, X]", 'actions', ["Bob's Report", "Today's Date", 'X']],
        ['actions: Send 5" Label, Other', 'actions', ['Send 5" Label', 'Other']],
    ])('%s', (line, key, expected) => {
        const md = `---\nname: S\ndescription: D\n${line}\n---\nBody`;
        const parsed = SkillMarkdownConverter.Parse(md);
        expect((parsed.frontmatter as unknown as Record<string, unknown>)[key]).toEqual(expected);
    });
});
