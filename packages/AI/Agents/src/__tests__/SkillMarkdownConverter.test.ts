import { describe, it, expect } from 'vitest';
import { SkillMarkdownConverter } from '../SkillMarkdownConverter';

describe('SkillMarkdownConverter', () => {
    describe('Parse', () => {
        it('parses a full SKILL.md with actions and subAgents', () => {
            const md = `---
name: Report Builder
description: Generates formatted business reports from query results
category: Reporting
actions:
  - Run Query
  - Generate PDF
subAgents:
  - Report Formatter Agent
---

Instructions body text.
Second line.
`;
            const result = SkillMarkdownConverter.Parse(md);

            expect(result.frontmatter.name).toBe('Report Builder');
            expect(result.frontmatter.description).toBe('Generates formatted business reports from query results');
            expect(result.frontmatter.category).toBe('Reporting');
            expect(result.frontmatter.actions).toEqual(['Run Query', 'Generate PDF']);
            expect(result.frontmatter.subAgents).toEqual(['Report Formatter Agent']);
            expect(result.instructions).toBe('Instructions body text.\nSecond line.');
        });

        it('parses minimal SKILL.md with only name and instructions', () => {
            const md = `---\nname: Minimal Skill\n---\n\nJust do the thing.\n`;
            const result = SkillMarkdownConverter.Parse(md);

            expect(result.frontmatter.name).toBe('Minimal Skill');
            expect(result.frontmatter.description).toBeUndefined();
            expect(result.frontmatter.actions).toBeUndefined();
            expect(result.instructions).toBe('Just do the thing.');
        });

        it('handles inline list syntax for actions', () => {
            const md = `---\nname: Inline Skill\nactions: [Run Query, Generate PDF]\n---\n\nBody.\n`;
            const result = SkillMarkdownConverter.Parse(md);

            expect(result.frontmatter.actions).toEqual(['Run Query', 'Generate PDF']);
        });

        it('unescapes quoted scalars containing a colon', () => {
            const md = `---\nname: "Skill: With Colon"\n---\n\nBody.\n`;
            const result = SkillMarkdownConverter.Parse(md);

            expect(result.frontmatter.name).toBe('Skill: With Colon');
        });

        it('ignores unknown frontmatter keys for forward compatibility', () => {
            const md = `---\nname: Future Skill\nfutureField: some value\n---\n\nBody.\n`;
            const result = SkillMarkdownConverter.Parse(md);

            expect(result.frontmatter.name).toBe('Future Skill');
            expect(result.instructions).toBe('Body.');
        });

        it('throws when the frontmatter block is missing', () => {
            expect(() => SkillMarkdownConverter.Parse('Just some text, no frontmatter.')).toThrow(/frontmatter block/);
        });

        it('throws when the frontmatter block is unterminated', () => {
            const md = `---\nname: Broken\n\nNo closing delimiter.`;
            expect(() => SkillMarkdownConverter.Parse(md)).toThrow(/not terminated/);
        });

        it('throws when name is missing', () => {
            const md = `---\ndescription: No name here\n---\n\nBody.\n`;
            expect(() => SkillMarkdownConverter.Parse(md)).toThrow(/required "name"/);
        });

        it('throws when the instructions body is empty', () => {
            const md = `---\nname: Empty Body\n---\n\n`;
            expect(() => SkillMarkdownConverter.Parse(md)).toThrow(/Instructions body/);
        });

        it('throws on a malformed frontmatter line', () => {
            const md = `---\nthis is not valid yaml at all\n---\n\nBody.\n`;
            expect(() => SkillMarkdownConverter.Parse(md)).toThrow(/Invalid SKILL\.md frontmatter line/);
        });
    });

    describe('Serialize', () => {
        it('serializes full skill data', () => {
            const result = SkillMarkdownConverter.Serialize({
                name: 'Report Builder',
                description: 'Generates reports',
                category: 'Reporting',
                actionNames: ['Run Query', 'Generate PDF'],
                subAgentNames: ['Report Formatter Agent'],
                instructions: 'Do the thing.'
            });

            expect(result).toContain('name: Report Builder');
            expect(result).toContain('description: Generates reports');
            expect(result).toContain('category: Reporting');
            expect(result).toContain('actions:\n  - Run Query\n  - Generate PDF');
            expect(result).toContain('subAgents:\n  - Report Formatter Agent');
            expect(result).toContain('Do the thing.');
        });

        it('omits optional fields when not provided', () => {
            const result = SkillMarkdownConverter.Serialize({
                name: 'Minimal',
                instructions: 'Body.'
            });

            expect(result).not.toContain('description:');
            expect(result).not.toContain('category:');
            expect(result).not.toContain('actions:');
            expect(result).not.toContain('subAgents:');
        });

        it('quotes scalars containing a colon', () => {
            const result = SkillMarkdownConverter.Serialize({
                name: 'Skill: With Colon',
                instructions: 'Body.'
            });

            expect(result).toContain('name: "Skill: With Colon"');
        });

        it('round-trips through Parse after Serialize', () => {
            const original = {
                name: 'Round Trip Skill',
                description: 'A description',
                category: 'Testing',
                actionNames: ['Action One', 'Action Two'],
                subAgentNames: ['Sub Agent One'],
                instructions: 'Line one.\nLine two.'
            };

            const serialized = SkillMarkdownConverter.Serialize(original);
            const parsed = SkillMarkdownConverter.Parse(serialized);

            expect(parsed.frontmatter.name).toBe(original.name);
            expect(parsed.frontmatter.description).toBe(original.description);
            expect(parsed.frontmatter.category).toBe(original.category);
            expect(parsed.frontmatter.actions).toEqual(original.actionNames);
            expect(parsed.frontmatter.subAgents).toEqual(original.subAgentNames);
            expect(parsed.instructions).toBe(original.instructions);
        });
    });
});
