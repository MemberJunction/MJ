import { describe, it, expect } from 'vitest';
import { ParseMessageCitations } from '../conversation-citations';
import { ConversationUtility } from '../conversation-utility';

describe('ParseMessageCitations', () => {
    it('returns empty results for empty or citation-free text', () => {
        expect(ParseMessageCitations('')).toEqual({ Citations: [], Occurrences: [] });
        expect(ParseMessageCitations('Just a regular paragraph with [a link](https://example.com).')).toEqual({
            Citations: [],
            Occurrences: [],
        });
    });

    it('parses 3-part [[EntityName|RecordID|DisplayName]] wiki citations', () => {
        const text = 'See [[MJ: Users|11111111-0000-4000-8000-000000000001|Alice Smith]] for details.';
        const parsed = ParseMessageCitations(text);

        expect(parsed.Citations).toHaveLength(1);
        expect(parsed.Citations[0]).toEqual({
            Index: 1,
            Kind: 'record',
            EntityName: 'MJ: Users',
            RecordID: '11111111-0000-4000-8000-000000000001',
            Keys: { ID: '11111111-0000-4000-8000-000000000001' },
            DisplayName: 'Alice Smith',
            Url: undefined,
            ArtifactID: undefined,
            RawToken: '[[MJ: Users|11111111-0000-4000-8000-000000000001|Alice Smith]]',
        });

        expect(parsed.Occurrences).toHaveLength(1);
        expect(parsed.Occurrences[0].Syntax).toBe('wiki');
        expect(text.slice(parsed.Occurrences[0].StartIndex, parsed.Occurrences[0].EndIndex)).toBe(
            '[[MJ: Users|11111111-0000-4000-8000-000000000001|Alice Smith]]'
        );
    });

    it('parses 2-part [[EntityName|RecordID]] citations and falls back DisplayName to EntityName', () => {
        const text = 'Linked record: [[MJ: AI Agents|agent-42]].';
        const parsed = ParseMessageCitations(text);

        expect(parsed.Citations).toHaveLength(1);
        expect(parsed.Citations[0]).toMatchObject({
            Index: 1,
            Kind: 'record',
            EntityName: 'MJ: AI Agents',
            RecordID: 'agent-42',
            Keys: { ID: 'agent-42' },
            DisplayName: 'MJ: AI Agents',
        });
    });

    it('parses composite keys (Key1=Val1;Key2=Val2) in wiki citations', () => {
        const text = 'Membership: [[Space Members|SpaceID=sp-1;UserID=usr-2|Alice in Core Space]].';
        const parsed = ParseMessageCitations(text);

        expect(parsed.Citations).toHaveLength(1);
        expect(parsed.Citations[0]).toMatchObject({
            Index: 1,
            Kind: 'record',
            EntityName: 'Space Members',
            RecordID: 'SpaceID=sp-1;UserID=usr-2',
            Keys: { SpaceID: 'sp-1', UserID: 'usr-2' },
            DisplayName: 'Alice in Core Space',
        });
    });

    it('parses existing @{type:"record",...} tokens alongside wiki citations in order of appearance', () => {
        const recordToken = ConversationUtility.CreateRecordLink('MJ: Tasks', 'Fix Auth Race', { ID: 'task-1' });
        const text = `First ${recordToken}, then [[MJ: Users|usr-9|Bob Jones]].`;
        const parsed = ParseMessageCitations(text);

        expect(parsed.Citations).toHaveLength(2);
        expect(parsed.Citations[0]).toMatchObject({
            Index: 1,
            Kind: 'record',
            EntityName: 'MJ: Tasks',
            RecordID: 'task-1',
            Keys: { ID: 'task-1' },
            DisplayName: 'Fix Auth Race',
        });
        expect(parsed.Citations[1]).toMatchObject({
            Index: 2,
            Kind: 'record',
            EntityName: 'MJ: Users',
            RecordID: 'usr-9',
            Keys: { ID: 'usr-9' },
            DisplayName: 'Bob Jones',
        });
        expect(parsed.Occurrences.map((o) => o.Syntax)).toEqual(['mention', 'wiki']);
    });

    it('deduplicates repeated citations (case-insensitive UUIDs & mixed wiki/mention syntax) preserving 1-based first appearance index', () => {
        const idUpper = 'AAAAAAAA-0000-4000-8000-000000000001';
        const idLower = idUpper.toLowerCase();
        const recordToken = ConversationUtility.CreateRecordLink('MJ: Tasks', 'Deploy v2', { ID: idLower });
        const text = [
            `Check [[MJ: Tasks|${idUpper}]] first,`,
            'then [[MJ: Users|usr-2|Dana]],',
            `and revisit ${recordToken} and [[MJ: Tasks|${idLower}|Deploy v2]].`,
        ].join(' ');

        const parsed = ParseMessageCitations(text);

        expect(parsed.Citations).toHaveLength(2);
        // First citation started as 2-part fallback ("MJ: Tasks"), then upgraded to explicit "Deploy v2"
        expect(parsed.Citations[0]).toMatchObject({
            Index: 1,
            EntityName: 'MJ: Tasks',
            DisplayName: 'Deploy v2',
        });
        expect(parsed.Citations[1]).toMatchObject({
            Index: 2,
            EntityName: 'MJ: Users',
            DisplayName: 'Dana',
        });
        expect(parsed.Occurrences).toHaveLength(4);
        expect(parsed.Occurrences.map((o) => o.Citation.Index)).toEqual([1, 2, 1, 1]);
    });

    it('skips citations inside fenced code blocks (backticks and tildes) and inline code spans', () => {
        const recordToken = ConversationUtility.CreateRecordLink('MJ: Tasks', 'Hidden', { ID: 't-hidden' });
        const text = [
            'Inline code `[[MJ: Users|u-1|Ignored Inline]]` and ``[[MJ: Users|u-2|Double Tick]]``.',
            '```markdown',
            '[[MJ: Users|u-3|Ignored Backtick Fence]]',
            recordToken,
            '```',
            '~~~text',
            '[[MJ: Users|u-4|Ignored Tilde Fence]]',
            '~~~',
            'Visible citation: [[MJ: Users|u-5|Real User]].',
        ].join('\n');

        const parsed = ParseMessageCitations(text);

        expect(parsed.Citations).toHaveLength(1);
        expect(parsed.Citations[0]).toMatchObject({
            Index: 1,
            EntityName: 'MJ: Users',
            RecordID: 'u-5',
            DisplayName: 'Real User',
        });
    });

    it('ignores malformed wiki brackets (missing pipe, empty entity or id, multiline)', () => {
        const text = [
            '[[OnlyOnePart]]',
            '[[|id-only|Name]]',
            '[[EntityOnly||Name]]',
            '[[Entity|id\nmultiline|Name]]',
            'Valid: [[Contacts|c-1|Jane Doe]]',
        ].join(' ');

        const parsed = ParseMessageCitations(text);

        expect(parsed.Citations).toHaveLength(1);
        expect(parsed.Citations[0]).toMatchObject({
            Index: 1,
            EntityName: 'Contacts',
            RecordID: 'c-1',
            DisplayName: 'Jane Doe',
        });
    });

    it('ignores non-record @{...} mention tokens (agent, user, entity, query)', () => {
        const agentMention = ConversationUtility.CreateMention('agent', 'a-1', 'Sage');
        const userMention = ConversationUtility.CreateMention('user', 'u-1', 'Alice');
        const text = `Hey ${agentMention} and ${userMention}, check [[Contacts|c-7|Acme Corp]].`;

        const parsed = ParseMessageCitations(text);
        expect(parsed.Citations).toHaveLength(1);
        expect(parsed.Citations[0].DisplayName).toBe('Acme Corp');
    });
});

describe('ConversationUtility.ToPlainText with wiki citations', () => {
    it('converts [[EntityName|RecordID|DisplayName]] and [[EntityName|RecordID]] to plain text while preserving code spans', () => {
        const agentMention = ConversationUtility.CreateMention('agent', 'a-1', 'Sage');
        const input =
            `Ask ${agentMention} about [[Contacts|c-1|Acme Corp]] and [[Orders|o-9]], ` +
            'using syntax `[[Entity|ID|Label]]`.';

        const plain = ConversationUtility.ToPlainText(input);

        expect(plain).toBe(
            'Ask @Sage about Acme Corp and Orders, using syntax `[[Entity|ID|Label]]`.'
        );
    });
});
