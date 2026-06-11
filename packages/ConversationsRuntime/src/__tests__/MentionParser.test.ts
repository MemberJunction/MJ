/**
 * @fileoverview Tests for MentionParser. Ported from the original
 * `mention-parser.service.test.ts` in `@memberjunction/ng-conversations`.
 *
 * The Angular-targeted mocks from the original are gone — the pure-TS port doesn't
 * import `@angular/core`. The `MJAIAgentEntityExtended` and `UserInfo` mocks remain.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIAgentEntityExtended: class {},
    ConversationUtility: {
        ToPlainText: vi.fn((text: string) => text.replace(/@\{[^}]+\}/g, '@MockName')),
    },
}));
vi.mock('@memberjunction/core', () => ({
    UserInfo: class {
        ID = '';
        Name = '';
        Email = '';
    },
}));

import { MentionParser } from '../mentions/MentionParser';

function createMockAgent(id: string, name: string): { ID: string; Name: string } {
    return { ID: id, Name: name };
}

function createMockUser(
    id: string,
    name: string,
    email?: string
): { ID: string; Name: string; Email?: string } {
    return { ID: id, Name: name, Email: email };
}

describe('MentionParser', () => {
    let parser: MentionParser;

    beforeEach(() => {
        parser = new MentionParser();
    });

    describe('parseMentions - JSON format', () => {
        it('parses JSON mention format', () => {
            const text = '@{"type":"agent","id":"123","name":"Sage"} help me';
            const agents = [createMockAgent('123', 'Sage')] as never[];
            const result = parser.parseMentions(text, agents);

            expect(result.mentions).toHaveLength(1);
            expect(result.mentions[0].type).toBe('agent');
            expect(result.mentions[0].id).toBe('123');
            expect(result.mentions[0].name).toBe('Sage');
            expect(result.agentMention).not.toBeNull();
        });

        it('parses JSON mention with config', () => {
            const text = '@{"type":"agent","id":"123","name":"Sage","configId":"cfg-1"} hello';
            const agents = [createMockAgent('123', 'Sage')] as never[];
            const result = parser.parseMentions(text, agents);

            expect(result.mentions[0].configurationId).toBe('cfg-1');
        });

        it('handles invalid JSON gracefully', () => {
            const text = '@{invalid json} hello';
            const agents: never[] = [];
            const result = parser.parseMentions(text, agents);
            expect(result.mentions).toHaveLength(0);
        });

        it('skips mentions missing required fields', () => {
            const text = '@{"type":"agent"} hello';
            const agents: never[] = [];
            const result = parser.parseMentions(text, agents);
            expect(result.mentions).toHaveLength(0);
        });
    });

    describe('parseMentions - legacy format', () => {
        it('matches agent by exact name', () => {
            const text = '@Sage help me';
            const agents = [createMockAgent('a1', 'Sage')] as never[];
            const result = parser.parseMentions(text, agents);

            expect(result.mentions).toHaveLength(1);
            expect(result.agentMention).not.toBeNull();
            expect(result.agentMention!.name).toBe('Sage');
        });

        it('matches quoted names with spaces', () => {
            const text = '@"Data Agent" help me';
            const agents = [createMockAgent('a2', 'Data Agent')] as never[];
            const result = parser.parseMentions(text, agents);

            expect(result.mentions).toHaveLength(1);
            expect(result.agentMention!.name).toBe('Data Agent');
        });

        it('matches agent by starts-with', () => {
            const text = '@Sag help me';
            const agents = [createMockAgent('a1', 'Sage')] as never[];
            const result = parser.parseMentions(text, agents);

            expect(result.mentions).toHaveLength(1);
        });

        it('matches users if no agent matches', () => {
            const text = '@John hello';
            const agents: never[] = [];
            const users = [createMockUser('u1', 'John Doe', 'john@test.com')] as never[];
            const result = parser.parseMentions(text, agents, users);

            expect(result.mentions).toHaveLength(1);
            expect(result.mentions[0].type).toBe('user');
            expect(result.userMentions).toHaveLength(1);
        });

        it('separates agent and user mentions', () => {
            const result = parser.parseMentions('hello', [] as never[]);
            expect(result.agentMention).toBeNull();
            expect(result.userMentions).toHaveLength(0);
        });
    });

    describe('extractMentionNames', () => {
        it('extracts names from JSON mentions', () => {
            const text =
                '@{"type":"agent","id":"1","name":"Sage"} and @{"type":"user","id":"2","name":"John"}';
            const names = parser.extractMentionNames(text);
            expect(names).toContain('Sage');
            expect(names).toContain('John');
        });

        it('extracts names from legacy mentions', () => {
            const text = '@Sage and @"John Doe" hello';
            const names = parser.extractMentionNames(text);
            expect(names).toContain('Sage');
            expect(names).toContain('John Doe');
        });

        it('returns empty for no mentions', () => {
            const names = parser.extractMentionNames('no mentions here');
            expect(names).toHaveLength(0);
        });
    });

    describe('validateMentions', () => {
        it('returns invalid JSON mentions', () => {
            const text = '@{"type":"agent","id":"1","name":"Unknown"}';
            const agents: never[] = [];
            const invalid = parser.validateMentions(text, agents);
            expect(invalid).toContain('Unknown');
        });

        it('returns empty for valid mentions', () => {
            const text = '@{"type":"agent","id":"1","name":"Sage"}';
            const agents = [createMockAgent('1', 'Sage')] as never[];
            const invalid = parser.validateMentions(text, agents);
            expect(invalid).toHaveLength(0);
        });

        it('validates legacy mentions against agents', () => {
            const text = '@Unknown hello';
            const agents: never[] = [];
            const invalid = parser.validateMentions(text, agents);
            expect(invalid).toContain('Unknown');
        });
    });

    describe('formatMentions', () => {
        it('formats mentions with proper names', () => {
            const text = '@"sage" hello';
            const mentions = [{ type: 'agent' as const, id: '1', name: 'Sage' }];
            const formatted = parser.formatMentions(text, mentions);
            expect(formatted).toContain('@Sage');
        });
    });

    describe('toPlainText', () => {
        it('returns empty string for empty input', () => {
            expect(parser.toPlainText('')).toBe('');
        });

        it('delegates to ConversationUtility.ToPlainText', () => {
            const result = parser.toPlainText('@{"type":"agent","id":"1","name":"Sage"} hello');
            expect(result).toBeDefined();
        });
    });
});
